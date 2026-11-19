"""No overlapping bookings, even when two requests arrive at the same moment.

GAP-02: the overlap check ran as the customer, so row-level security hid other
customers' bookings, and it took no lock, so two simultaneous requests both passed.
Now the check runs as the owner after locking the vehicle (or driver) row, and an
EXCLUDE constraint makes the database itself refuse any overlap that slips past.
Also GAP-03 (new requests always start pending), GAP-10 (no block over a booking),
GAP-18 (no past dates or paused vehicles), one cleaner per wash slot, and the
account-deletion check from 0016 that compared statuses with values the enums lack.
"""

from django.db import migrations

SQL = r"""
-- Own schema, so its ~190 functions stay out of public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- Rentals -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text;
BEGIN
  -- Customer requests (not the owner or an admin) always start as a pending request.
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    SELECT status::text INTO v_status FROM public.vehicles WHERE id = NEW.vehicle_id;
    IF v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'This vehicle is not available for booking';
    END IF;
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Pickup date cannot be in the past';
    END IF;
  END IF;
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  -- One writer per vehicle at a time, so the checks below see every committed booking.
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

-- trg_bookings_conflict already runs it on INSERT OR UPDATE.
DROP TRIGGER IF EXISTS prevent_booking_conflict_ins ON public.bookings;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

-- Host blocks ---------------------------------------------------------------------
CREATE FUNCTION public.prevent_block_over_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.vehicle_id = NEW.vehicle_id
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'These dates already have a booking. Decline or cancel it first';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_block_over_booking() FROM PUBLIC;
CREATE TRIGGER trg_prevent_block_over_booking BEFORE INSERT OR UPDATE ON public.availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_block_over_booking();

-- Driver hires --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_driver_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d RECORD;
BEGIN
  SELECT verification_status, status INTO d FROM public.drivers WHERE id = NEW.driver_id FOR NO KEY UPDATE;
  IF d IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;
  IF d.verification_status IS DISTINCT FROM 'approved' OR d.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This driver is not available for hire';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Start date cannot be in the past';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.driver_bookings b
    WHERE b.driver_id = NEW.driver_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Driver is already booked for the selected dates';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.driver_bookings ADD CONSTRAINT driver_bookings_no_overlap
  EXCLUDE USING gist (driver_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

-- Washes: one doorstep cleaner can't hold two active jobs in the same slot.
-- (Wash centers have several bays, so they are not limited per slot.)
CREATE UNIQUE INDEX wash_bookings_cleaner_slot_uniq
  ON public.wash_bookings (assigned_cleaner_id, slot_date, slot_time)
  WHERE assigned_cleaner_id IS NOT NULL AND status IN ('pending', 'confirmed');

-- Account deletion: 0016 compared booking_status with 'ongoing', wash status with
-- progress values, and cleared columns that don't exist, so every deletion failed.
-- Same function, valid statuses and columns only.
CREATE OR REPLACE FUNCTION public.delete_my_account_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings
             WHERE (customer_id = uid OR vendor_id = uid) AND status IN ('pending', 'confirmed')) THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming vehicle rentals';
  END IF;
  IF EXISTS (SELECT 1 FROM public.driver_bookings
             WHERE (customer_id = uid OR driver_id = uid) AND status IN ('pending', 'confirmed')) THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming driver bookings';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wash_bookings
             WHERE (customer_id = uid OR assigned_cleaner_id = uid OR assigned_vendor_id = uid)
               AND status IN ('pending', 'confirmed')) THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming wash bookings';
  END IF;

  UPDATE public.profiles SET
    full_name = 'Deleted user',
    phone = NULL,
    avatar_url = NULL,
    dl_number = NULL,
    dl_expiry = NULL,
    dl_front_url = NULL,
    dl_back_url = NULL,
    dl_status = 'pending',
    city = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vendors SET
    business_name = 'Closed vendor',
    bio = NULL,
    payout_email = NULL,
    id_document_url = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vehicles SET status = 'paused', updated_at = now() WHERE vendor_id = uid;

  UPDATE public.drivers SET
    full_name = 'Deleted driver',
    phone = NULL,
    bio = NULL,
    photo_url = NULL,
    dl_number = NULL,
    dl_expiry = NULL,
    dl_front_url = NULL,
    dl_back_url = NULL,
    id_document_url = NULL,
    status = 'paused',
    updated_at = now()
  WHERE id = uid;

  UPDATE public.pool_trips SET status = 'cancelled', updated_at = now()
  WHERE driver_id = uid AND depart_at > now() AND status <> 'cancelled';

  -- Deactivate login in accounts_user so deleted users cannot sign back in
  UPDATE accounts_user SET is_active = false WHERE id = uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;
"""

REVERSE_SQL = r"""
DROP INDEX IF EXISTS public.wash_bookings_cleaner_slot_uniq;
ALTER TABLE public.driver_bookings DROP CONSTRAINT IF EXISTS driver_bookings_no_overlap;
DROP TRIGGER IF EXISTS trg_prevent_block_over_booking ON public.availability_blocks;
DROP FUNCTION IF EXISTS public.prevent_block_over_booking();
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
CREATE TRIGGER prevent_booking_conflict_ins BEFORE INSERT ON public.bookings FOR EACH ROW
  WHEN (new.status = ANY (ARRAY['pending'::public.booking_status, 'confirmed'::public.booking_status]))
  EXECUTE FUNCTION public.prevent_booking_conflict();
DROP EXTENSION IF EXISTS btree_gist;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0019_remediate_components_09_to_12_gaps")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
