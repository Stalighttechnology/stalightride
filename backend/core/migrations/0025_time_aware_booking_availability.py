"""Time-aware vehicle availability and booking conflict prevention.

- Updates prevent_booking_conflict() to compare exact timestamps (start_date + pickup_time
  and end_date + dropoff_time) so that when a vehicle is returned on a given date (e.g. 10:00 AM),
  a subsequent reservation starting after that return time (e.g. 11:00 AM) can proceed, while
  disallowing pickups at or before the return time.
- Updates the bookings_no_overlap exclusion constraint to use tsrange over exact timestamps.
- Adds public.vehicle_booked_ranges(_vehicle_id) RPC returning active booking and block ranges
  for public vehicle pages.
"""

from django.db import migrations

SQL = r"""
-- 1. Time-aware booking conflict check
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_deleted boolean;
  v_new_start timestamp without time zone;
  v_new_end timestamp without time zone;
BEGIN
  -- Customer requests (not the owner or an admin) always start as a pending request.
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    SELECT status::text, COALESCE(is_deleted, false) INTO v_status, v_deleted FROM public.vehicles WHERE id = NEW.vehicle_id;
    IF v_deleted OR v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'This vehicle is not available for booking';
    END IF;
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Pickup date cannot be in the past';
    END IF;
  END IF;
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  v_new_start := (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time));
  v_new_end := (NEW.end_date + COALESCE(NEW.dropoff_time, '10:00:00'::time));

  IF v_new_end <= v_new_start THEN
    RAISE EXCEPTION 'Drop-off must be after pickup';
  END IF;

  -- One writer per vehicle at a time, so the checks below see every committed booking.
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;

  -- Check conflict with existing active bookings using exact timestamps
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.vehicle_id = NEW.vehicle_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND v_new_start <= (b.end_date + COALESCE(b.dropoff_time, '10:00:00'::time))
      AND v_new_end >= (b.start_date + COALESCE(b.pickup_time, '10:00:00'::time))
  ) THEN
    RAISE EXCEPTION 'Vehicle not available for selected dates';
  END IF;

  -- Check conflict with availability blocks (full-day coverage)
  IF EXISTS (
    SELECT 1 FROM public.availability_blocks a
    WHERE a.vehicle_id = NEW.vehicle_id
      AND v_new_start <= (a.end_date + '23:59:59'::time)
      AND v_new_end >= (a.start_date + '00:00:00'::time)
  ) THEN
    RAISE EXCEPTION 'Vehicle is blocked on selected dates';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_booking_conflict() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_booking_conflict() TO service_role;

-- 2. Exclusion constraint with timestamps
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tsrange(
      (start_date + pickup_time),
      (end_date + dropoff_time),
      '[]'
    ) WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

-- 3. Prevent availability block over existing booking
CREATE OR REPLACE FUNCTION public.prevent_block_over_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.vehicle_id = NEW.vehicle_id
      AND b.status IN ('pending','confirmed')
      AND (NEW.start_date + '00:00:00'::time) <= (b.end_date + COALESCE(b.dropoff_time, '10:00:00'::time))
      AND (NEW.end_date + '23:59:59'::time) >= (b.start_date + COALESCE(b.pickup_time, '10:00:00'::time))
  ) THEN
    RAISE EXCEPTION 'These dates already have a booking. Decline or cancel it first';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_block_over_booking() FROM PUBLIC;

-- 4. Public function to read booked date/time ranges for a vehicle (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.vehicle_booked_ranges(_vehicle_id uuid)
RETURNS TABLE (
  start_date date,
  end_date date,
  pickup_time time without time zone,
  dropoff_time time without time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.start_date, b.end_date, b.pickup_time, b.dropoff_time
  FROM public.bookings b
  WHERE b.vehicle_id = _vehicle_id
    AND b.status IN ('pending', 'confirmed')
    AND b.end_date >= CURRENT_DATE
  UNION ALL
  SELECT a.start_date, a.end_date, '00:00:00'::time, '23:59:59'::time
  FROM public.availability_blocks a
  WHERE a.vehicle_id = _vehicle_id
    AND a.end_date >= CURRENT_DATE;
$$;
REVOKE ALL ON FUNCTION public.vehicle_booked_ranges(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vehicle_booked_ranges(uuid) TO anon, authenticated, service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.vehicle_booked_ranges(uuid);

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_deleted boolean;
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    SELECT status::text, COALESCE(is_deleted, false) INTO v_status, v_deleted FROM public.vehicles WHERE id = NEW.vehicle_id;
    IF v_deleted OR v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'This vehicle is not available for booking';
    END IF;
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Pickup date cannot be in the past';
    END IF;
  END IF;
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.vehicle_id = NEW.vehicle_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Vehicle not available for selected dates';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.availability_blocks a
    WHERE a.vehicle_id = NEW.vehicle_id
      AND a.start_date <= NEW.end_date
      AND a.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Vehicle is blocked on selected dates';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_booking_conflict() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_booking_conflict() TO service_role;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0024_hot_path_indexes")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
