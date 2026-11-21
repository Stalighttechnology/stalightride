"""Wash booking dispatch: tiered job board, haversine distance, releases, and auto-dispatch windows.

- Adds haversine_km() immutable function
- Adds base_lat, base_lng, radius_km to public.cleaners
- Adds pay_by, tier_notified, admin_alerted_at to public.wash_bookings
- Creates public.wash_job_releases table with RLS
- Updates enforce_wash_booking_guard to require lat/lng, slot at least 2h ahead, and set pay_by = now() + 15m
- Updates enforce_wash_booking_forward_progress to allow assigned -> confirmed during release_wash_job
- Updates wallet_pay_wash_booking to accept pending/confirmed before pay_by and set status/progress to confirmed
- Adds can_cleaner_see_wash_job() and wash_job_board()
- Updates claim_wash_job() to check visibility, radius, clash, row lock, and 'Another partner just claimed this job'
- Adds release_wash_job() to unassign, record release strike, reset tier_notified to 3, and alert admins
- Adds admin_assign_wash_cleaner() for manual assignment
- Extends expire_booking_windows() with wash expiry, tier summary notifications, admin alerts, and auto-cancel refund
"""

from django.db import migrations

SQL = r"""
-- 1. public.haversine_km(lat1, lng1, lat2, lng2)
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT 6371.0 * 2.0 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2.0) ^ 2.0 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      (sin(radians(lng2 - lng1) / 2.0) ^ 2.0)
    )
  );
$$;

-- 2. Add columns to public.cleaners
ALTER TABLE public.cleaners
  ADD COLUMN IF NOT EXISTS base_lat double precision,
  ADD COLUMN IF NOT EXISTS base_lng double precision,
  ADD COLUMN IF NOT EXISTS radius_km numeric NOT NULL DEFAULT 8;

-- 3. Add columns to public.wash_bookings
ALTER TABLE public.wash_bookings
  ADD COLUMN IF NOT EXISTS pay_by timestamptz,
  ADD COLUMN IF NOT EXISTS tier_notified smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_alerted_at timestamptz;

-- Backfill pending rows: pay_by = now() + 15m
UPDATE public.wash_bookings
SET pay_by = now() + INTERVAL '15 minutes'
WHERE status = 'pending' AND payment_status <> 'paid' AND pay_by IS NULL;

-- 4. Table public.wash_job_releases
CREATE TABLE IF NOT EXISTS public.wash_job_releases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cleaner_id uuid NOT NULL REFERENCES public.cleaners(id) ON DELETE CASCADE,
    wash_booking_id uuid NOT NULL REFERENCES public.wash_bookings(id) ON DELETE CASCADE,
    released_at timestamp with time zone DEFAULT now() NOT NULL,
    late boolean DEFAULT false NOT NULL
);

ALTER TABLE public.wash_job_releases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wash_job_releases' AND policyname = 'wash_job_releases_select'
  ) THEN
    CREATE POLICY wash_job_releases_select ON public.wash_job_releases
      FOR SELECT TO authenticated
      USING (cleaner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wash_job_releases' AND policyname = 'wash_job_releases_admin_all'
  ) THEN
    CREATE POLICY wash_job_releases_admin_all ON public.wash_job_releases
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

GRANT ALL ON TABLE public.wash_job_releases TO service_role;
GRANT SELECT ON TABLE public.wash_job_releases TO authenticated;

-- 5. Insert guard public.enforce_wash_booking_guard()
CREATE OR REPLACE FUNCTION public.enforce_wash_booking_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE s RECORD;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  SELECT * INTO s FROM public.wash_services WHERE id = NEW.service_id;
  IF s IS NULL OR NOT s.active THEN
    RAISE EXCEPTION 'This wash package is not available';
  END IF;

  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    RAISE EXCEPTION 'Latitude and longitude are required';
  END IF;

  IF ((NEW.slot_date + NEW.slot_time) AT TIME ZONE 'Asia/Kolkata') < (now() + INTERVAL '2 hours') THEN
    RAISE EXCEPTION 'Slot must be at least 2 hours in the future';
  END IF;

  NEW.price := s.price;
  NEW.status := 'pending';
  NEW.payment_status := 'unpaid';
  NEW.payment_method := NULL;
  NEW.paid_at := NULL;
  NEW.pay_by := now() + INTERVAL '15 minutes';
  NEW.razorpay_order_id := NULL;
  NEW.razorpay_payment_id := NULL;
  NEW.assigned_vendor_id := NULL;
  NEW.admin_note := NULL;
  NEW.rejection_reason := NULL;
  NEW.refund_amount := 0;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  NEW.completed_at := NULL;
  RETURN NEW;
END; $$;

-- 6. Forward progress check with exception for release_wash_job
CREATE OR REPLACE FUNCTION public.enforce_wash_booking_forward_progress() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  curr_step integer;
  next_step integer;
  norm_curr text;
  norm_next text;
BEGIN
  IF (NEW.progress IS DISTINCT FROM OLD.progress OR NEW.status IS DISTINCT FROM OLD.status) THEN
    norm_curr := lower(btrim(COALESCE(OLD.progress::text, OLD.status::text, 'requested')));
    IF norm_curr = 'pending' THEN norm_curr := 'requested'; END IF;
    
    norm_next := lower(btrim(COALESCE(NEW.progress::text, NEW.status::text, norm_curr)));
    IF norm_next = 'pending' THEN norm_next := 'requested'; END IF;

    IF norm_next IN ('cancelled', 'rejected') THEN
      RETURN NEW;
    END IF;

    curr_step := CASE norm_curr
      WHEN 'requested' THEN 1
      WHEN 'confirmed' THEN 2
      WHEN 'assigned' THEN 3
      WHEN 'on_the_way' THEN 4
      WHEN 'started' THEN 5
      WHEN 'completed' THEN 6
      ELSE 0
    END;

    next_step := CASE norm_next
      WHEN 'requested' THEN 1
      WHEN 'confirmed' THEN 2
      WHEN 'assigned' THEN 3
      WHEN 'on_the_way' THEN 4
      WHEN 'started' THEN 5
      WHEN 'completed' THEN 6
      ELSE 0
    END;

    IF next_step > 0 AND curr_step > 0 AND next_step < curr_step THEN
      IF norm_curr = 'assigned' AND norm_next = 'confirmed' AND coalesce(current_setting('app.wash_job_release', true), '') = '1' THEN
        -- allowed release
      ELSE
        RAISE EXCEPTION 'Wash status cannot be moved backwards (current: %, requested: %)', norm_curr, norm_next;
      END IF;
    END IF;

    IF norm_next = 'completed' AND COALESCE(array_length(NEW.after_photos, 1), 0) = 0 THEN
      RAISE EXCEPTION 'After photos are required to complete the wash';
    END IF;

    -- Sync status and progress
    IF NEW.progress IS NOT DISTINCT FROM OLD.progress AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF norm_next IN ('requested', 'confirmed', 'assigned', 'on_the_way', 'started', 'completed', 'cancelled', 'rejected') THEN
        NEW.progress := norm_next::public.wash_status;
      END IF;
    ELSIF NEW.progress IS DISTINCT FROM OLD.progress AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      IF norm_next IN ('confirmed', 'completed', 'cancelled', 'rejected') THEN
        NEW.status := norm_next::public.booking_status;
      ELSIF norm_next = 'requested' THEN
        NEW.status := 'pending'::public.booking_status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Payment: public.wallet_pay_wash_booking
CREATE OR REPLACE FUNCTION public.wallet_pay_wash_booking(_wash_booking_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'This wash booking cannot be paid'; END IF;
  IF b.pay_by IS NOT NULL AND now() > b.pay_by THEN RAISE EXCEPTION 'Payment window has closed'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.price, 'wash_payment', NULL, b.id::text, 'Payment for vehicle wash');

  UPDATE public.wash_bookings
     SET payment_status = 'paid',
         paid_at = now(),
         payment_method = 'wallet',
         status = 'confirmed',
         progress = 'confirmed',
         updated_at = now()
   WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;

-- 8. Visibility rule helper: public.can_cleaner_see_wash_job
CREATE OR REPLACE FUNCTION public.can_cleaner_see_wash_job(
  _cleaner_id uuid,
  _wash_booking_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c RECORD;
  _b RECORD;
  _slot_start timestamptz;
  _duration_mins integer := 45;
  _lead_time interval;
  _elapsed interval;
  _dist double precision;
  _current_tier smallint;
  _late_releases_count integer;
  _rank integer;
  _clash_exists boolean;
BEGIN
  -- 1. Fetch cleaner
  SELECT * INTO _c FROM public.cleaners WHERE cleaners.id = _cleaner_id;
  IF _c IS NULL OR _c.verification_status <> 'approved' OR NOT _c.available THEN
    RETURN false;
  END IF;

  -- 2. Fetch booking
  SELECT wb.*, COALESCE(ws.duration_minutes, 45) AS duration_mins
  INTO _b
  FROM public.wash_bookings wb
  LEFT JOIN public.wash_services ws ON ws.id = wb.service_id
  WHERE wb.id = _wash_booking_id;

  IF _b IS NULL OR _b.status <> 'confirmed' OR _b.progress <> 'confirmed'
     OR _b.payment_status <> 'paid' OR _b.assigned_cleaner_id IS NOT NULL THEN
    RETURN false;
  END IF;

  -- City match (case-insensitive)
  IF lower(trim(_c.city)) <> lower(trim(_b.city)) THEN
    RETURN false;
  END IF;

  -- Slot start in Asia/Kolkata
  _slot_start := (_b.slot_date + _b.slot_time) AT TIME ZONE 'Asia/Kolkata';
  _duration_mins := _b.duration_mins;

  -- Clash check: cleaner has another assigned/on_the_way/started wash job overlapping [slot, slot + duration + 30m]
  SELECT EXISTS (
    SELECT 1
    FROM public.wash_bookings o
    LEFT JOIN public.wash_services ows ON ows.id = o.service_id
    WHERE o.assigned_cleaner_id = _cleaner_id
      AND o.status = 'confirmed'
      AND o.progress IN ('assigned', 'on_the_way', 'started')
      AND (
        _slot_start < ((o.slot_date + o.slot_time) AT TIME ZONE 'Asia/Kolkata') + ((COALESCE(ows.duration_minutes, 45) + 30) * INTERVAL '1 minute')
        AND
        ((o.slot_date + o.slot_time) AT TIME ZONE 'Asia/Kolkata') < _slot_start + ((_duration_mins + 30) * INTERVAL '1 minute')
      )
  ) INTO _clash_exists;

  IF _clash_exists THEN
    RETURN false;
  END IF;

  -- Distance
  IF _c.base_lat IS NOT NULL AND _c.base_lng IS NOT NULL AND _b.lat IS NOT NULL AND _b.lng IS NOT NULL THEN
    _dist := public.haversine_km(_c.base_lat, _c.base_lng, _b.lat::double precision, _b.lng::double precision);
  ELSE
    _dist := NULL;
  END IF;

  -- Determine current tier of booking
  IF _b.paid_at IS NULL THEN
    RETURN false;
  END IF;

  _lead_time := _slot_start - _b.paid_at;
  _elapsed := now() - _b.paid_at;

  IF _b.tier_notified >= 3 THEN
    _current_tier := 3;
  ELSIF _lead_time > INTERVAL '24 hours' THEN
    IF _elapsed >= INTERVAL '8 hours' THEN
      _current_tier := 3;
    ELSIF _elapsed >= INTERVAL '4 hours' THEN
      _current_tier := 2;
    ELSE
      _current_tier := 1;
    END IF;
  ELSIF _lead_time >= INTERVAL '6 hours' THEN
    IF _elapsed >= INTERVAL '2 hours' THEN
      _current_tier := 3;
    ELSIF _elapsed >= INTERVAL '1 hour' THEN
      _current_tier := 2;
    ELSE
      _current_tier := 1;
    END IF;
  ELSE -- < 6 hours
    IF _elapsed >= INTERVAL '30 minutes' THEN
      _current_tier := 3;
    ELSIF _elapsed >= INTERVAL '15 minutes' THEN
      _current_tier := 2;
    ELSE
      _current_tier := 1;
    END IF;
  END IF;

  -- Check Tier 1 eligibility:
  -- Top 3 eligible within 5 km, < 2 late releases in last 30 days
  IF _dist IS NOT NULL AND _dist <= 5.0 AND (_c.radius_km IS NULL OR _dist <= _c.radius_km) THEN
    SELECT count(*) INTO _late_releases_count
    FROM public.wash_job_releases
    WHERE cleaner_id = _cleaner_id AND late = true AND released_at >= now() - INTERVAL '30 days';

    IF _late_releases_count < 2 THEN
      WITH eligible_cleaners AS (
        SELECT cl.id,
               ROW_NUMBER() OVER (
                 ORDER BY cl.avg_rating DESC,
                          (SELECT count(*) FROM public.wash_bookings wb
                           WHERE wb.assigned_cleaner_id = cl.id
                             AND wb.slot_date = _b.slot_date
                             AND wb.status NOT IN ('cancelled', 'rejected')) ASC,
                          cl.id ASC
               ) AS rnk
        FROM public.cleaners cl
        WHERE cl.verification_status = 'approved'
          AND cl.available = true
          AND lower(trim(cl.city)) = lower(trim(_b.city))
          AND cl.base_lat IS NOT NULL AND cl.base_lng IS NOT NULL
          AND public.haversine_km(cl.base_lat, cl.base_lng, _b.lat::double precision, _b.lng::double precision) <= 5.0
          AND (cl.radius_km IS NULL OR public.haversine_km(cl.base_lat, cl.base_lng, _b.lat::double precision, _b.lng::double precision) <= cl.radius_km)
          AND (SELECT count(*) FROM public.wash_job_releases r WHERE r.cleaner_id = cl.id AND r.late = true AND r.released_at >= now() - INTERVAL '30 days') < 2
          AND NOT EXISTS (
            SELECT 1 FROM public.wash_bookings o
            LEFT JOIN public.wash_services ows ON ows.id = o.service_id
            WHERE o.assigned_cleaner_id = cl.id
              AND o.status = 'confirmed'
              AND o.progress IN ('assigned', 'on_the_way', 'started')
              AND (
                _slot_start < ((o.slot_date + o.slot_time) AT TIME ZONE 'Asia/Kolkata') + ((COALESCE(ows.duration_minutes, 45) + 30) * INTERVAL '1 minute')
                AND
                ((o.slot_date + o.slot_time) AT TIME ZONE 'Asia/Kolkata') < _slot_start + ((_duration_mins + 30) * INTERVAL '1 minute')
              )
          )
      )
      SELECT rnk INTO _rank FROM eligible_cleaners WHERE id = _cleaner_id;

      IF _rank IS NOT NULL AND _rank <= 3 THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  -- Tier 2 eligibility (within own radius):
  IF _current_tier >= 2 THEN
    IF _dist IS NOT NULL AND _dist <= _c.radius_km THEN
      RETURN true;
    END IF;
  END IF;

  -- Tier 3 eligibility (whole city):
  IF _current_tier >= 3 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 9. Job board: public.wash_job_board()
CREATE OR REPLACE FUNCTION public.wash_job_board()
RETURNS TABLE (
  id uuid,
  service_name text,
  duration_minutes integer,
  slot_date date,
  slot_time time without time zone,
  area text,
  distance_km double precision,
  payout numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _c FROM public.cleaners WHERE cleaners.id = auth.uid();
  IF _c IS NULL OR _c.verification_status <> 'approved' THEN
    RAISE EXCEPTION 'Only verified cleaners can view the job board';
  END IF;

  RETURN QUERY
  SELECT
    wb.id,
    COALESCE(ws.name, 'Doorstep Vehicle Wash') AS service_name,
    COALESCE(ws.duration_minutes, 45) AS duration_minutes,
    wb.slot_date,
    wb.slot_time,
    COALESCE(NULLIF(trim(split_part(wb.address, ',', 2)), ''), NULLIF(trim(split_part(wb.address, ',', 1)), ''), wb.city) AS area,
    CASE
      WHEN _c.base_lat IS NOT NULL AND _c.base_lng IS NOT NULL AND wb.lat IS NOT NULL AND wb.lng IS NOT NULL THEN
        ROUND(public.haversine_km(_c.base_lat, _c.base_lng, wb.lat::double precision, wb.lng::double precision)::numeric, 1)::double precision
      ELSE NULL
    END AS distance_km,
    COALESCE(wb.provider_earning, wb.price) AS payout
  FROM public.wash_bookings wb
  LEFT JOIN public.wash_services ws ON ws.id = wb.service_id
  WHERE wb.status = 'confirmed'
    AND wb.progress = 'confirmed'
    AND wb.payment_status = 'paid'
    AND wb.assigned_cleaner_id IS NULL
    AND public.can_cleaner_see_wash_job(_c.id, wb.id)
  ORDER BY wb.slot_date ASC, wb.slot_time ASC, wb.created_at ASC;
END;
$$;

GRANT ALL ON FUNCTION public.can_cleaner_see_wash_job(uuid, uuid) TO authenticated, service_role;
GRANT ALL ON FUNCTION public.wash_job_board() TO authenticated, service_role;

-- 10. Claim job: public.claim_wash_job
CREATE OR REPLACE FUNCTION public.claim_wash_job(_wash_booking_id uuid DEFAULT NULL::uuid, id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  _target_id uuid;
  _cleaner record;
  _booking record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _target_id := COALESCE(_wash_booking_id, id);
  IF _target_id IS NULL THEN
    RAISE EXCEPTION 'Wash booking ID is required';
  END IF;

  -- 1. Lock the wash booking row atomically
  SELECT * INTO _booking
    FROM public.wash_bookings
   WHERE wash_bookings.id = _target_id
     FOR UPDATE;

  IF _booking IS NULL THEN
    RAISE EXCEPTION 'Wash booking not found';
  END IF;

  -- 2. Check if already claimed or assigned
  IF _booking.assigned_cleaner_id IS NOT NULL OR _booking.assigned_vendor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Another partner just claimed this job';
  END IF;

  -- 3. Check visibility rule
  IF NOT public.can_cleaner_see_wash_job(auth.uid(), _target_id) THEN
    RAISE EXCEPTION 'You are not eligible to claim this job';
  END IF;

  -- 4. Atomically assign job to cleaner
  UPDATE public.wash_bookings
     SET assigned_cleaner_id = auth.uid(),
         progress = 'assigned',
         status = 'confirmed',
         updated_at = now()
   WHERE wash_bookings.id = _target_id;

  -- 5. Notify customer
  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (
    _booking.customer_id,
    'Washer partner assigned',
    'A washer partner has accepted your booking and is assigned to your slot.',
    '/washes'
  );

  RETURN jsonb_build_object(
    'id', _booking.id,
    'status', 'confirmed',
    'progress', 'assigned',
    'assigned_cleaner_id', auth.uid()
  );
END;
$$;

-- 11. Release job: public.release_wash_job
CREATE OR REPLACE FUNCTION public.release_wash_job(_wash_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b RECORD;
  slot_start timestamptz;
  is_late boolean;
  admin_rec RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN
    RAISE EXCEPTION 'Wash booking not found';
  END IF;

  IF b.assigned_cleaner_id IS NULL OR b.assigned_cleaner_id <> auth.uid() THEN
    RAISE EXCEPTION 'You are not the assigned cleaner for this job';
  END IF;

  IF b.status <> 'confirmed' OR b.progress <> 'assigned' THEN
    RAISE EXCEPTION 'Only assigned jobs can be released';
  END IF;

  slot_start := (b.slot_date + b.slot_time) AT TIME ZONE 'Asia/Kolkata';
  is_late := (slot_start - now() < INTERVAL '12 hours');

  INSERT INTO public.wash_job_releases (cleaner_id, wash_booking_id, released_at, late)
  VALUES (auth.uid(), b.id, now(), is_late);

  PERFORM set_config('app.wash_job_release', '1', true);
  UPDATE public.wash_bookings
     SET assigned_cleaner_id = NULL,
         progress = 'confirmed',
         tier_notified = 3,
         updated_at = now()
   WHERE id = b.id;
  PERFORM set_config('app.wash_job_release', '0', true);

  -- Alert admins
  FOR admin_rec IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      admin_rec.user_id,
      'Wash job released',
      format('Cleaner released wash job for %s on %s (late: %s).', b.city, b.slot_date, is_late),
      '/admin'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', b.id,
    'status', 'confirmed',
    'progress', 'confirmed',
    'late', is_late
  );
END;
$$;

GRANT ALL ON FUNCTION public.release_wash_job(uuid) TO authenticated, service_role;

-- 12. Manual admin assignment for at-risk jobs
CREATE OR REPLACE FUNCTION public.admin_assign_wash_cleaner(_wash_booking_id uuid, _cleaner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b RECORD;
  c RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;

  SELECT * INTO c FROM public.cleaners WHERE id = _cleaner_id;
  IF c IS NULL OR c.verification_status <> 'approved' THEN
    RAISE EXCEPTION 'Cleaner not found or not approved';
  END IF;

  UPDATE public.wash_bookings
     SET assigned_cleaner_id = _cleaner_id,
         progress = 'assigned',
         status = 'confirmed',
         updated_at = now()
   WHERE id = _wash_booking_id;

  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (
    b.customer_id,
    'Washer partner assigned',
    'A washer partner has been assigned to your booking.',
    '/washes'
  );

  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (
    _cleaner_id,
    'New wash job assigned',
    format('You have been assigned a wash job on %s in %s.', b.slot_date, b.city),
    '/cleaner-dashboard'
  );
END;
$$;

GRANT ALL ON FUNCTION public.admin_assign_wash_cleaner(uuid, uuid) TO authenticated, service_role;

-- 13. Extend public.expire_booking_windows() with wash dispatch & expiry
CREATE OR REPLACE FUNCTION public.expire_booking_windows() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expired_pending integer := 0;
  v_expired_unpaid integer := 0;
  v_reminded_respond integer := 0;
  v_reminded_pay integer := 0;
  v_listings_paused integer := 0;
  v_driver_expired_pending integer := 0;
  v_driver_expired_unpaid integer := 0;
  v_driver_reminded_respond integer := 0;
  v_driver_reminded_pay integer := 0;
  v_wash_expired_unpaid integer := 0;
  v_wash_auto_cancelled integer := 0;
  v_wash_admin_alerted integer := 0;
  r RECORD;
  _v RECORD;
  _slot_start timestamptz;
  _lead_time interval;
  _elapsed interval;
  _alert_time timestamptz;
  _cancel_time timestamptz;
  _target_tier smallint;
  admin_rec RECORD;
  cleaner_rec RECORD;
BEGIN
  -- 1a. Cancel expired pending rental requests (host_no_response)
  FOR r IN
    SELECT b.id, b.customer_id, b.vendor_id, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'pending' AND b.respond_by < now()
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'host_no_response',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Request expired', format('Host did not respond in time for %s.', COALESCE(r.vehicle_title, 'the vehicle')), '/bookings'),
      (r.vendor_id, 'Request expired', format('Booking request for %s expired without response.', COALESCE(r.vehicle_title, 'your vehicle')), '/vendor');

    v_expired_pending := v_expired_pending + 1;
  END LOOP;

  -- 1b. Cancel expired confirmed unpaid rentals (payment_timeout)
  FOR r IN
    SELECT b.id, b.customer_id, b.vendor_id, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'confirmed' AND b.payment_status <> 'paid' AND b.pay_by < now()
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Payment window expired', format('Payment was not completed in time for %s.', COALESCE(r.vehicle_title, 'the vehicle')), '/bookings'),
      (r.vendor_id, 'Payment window expired', format('Customer did not pay in time for %s.', COALESCE(r.vehicle_title, 'your vehicle')), '/vendor');

    v_expired_unpaid := v_expired_unpaid + 1;
  END LOOP;

  -- 1c. Halfway reminder for pending rental requests (to vendor)
  FOR r IN
    SELECT b.id, b.vendor_id, b.respond_by, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'pending'
      AND b.respond_reminded_at IS NULL
      AND b.respond_by IS NOT NULL
      AND now() >= (b.created_at + ((b.respond_by - b.created_at) / 2))
      AND now() < b.respond_by
  LOOP
    UPDATE public.bookings
    SET respond_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.vendor_id,
      'Pending booking request',
      format('Please respond to the booking request for %s before %s.', COALESCE(r.vehicle_title, 'your vehicle'), to_char(r.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/vendor'
    );

    v_reminded_respond := v_reminded_respond + 1;
  END LOOP;

  -- 1d. Halfway reminder for confirmed unpaid rentals (to customer)
  FOR r IN
    SELECT b.id, b.customer_id, b.pay_by, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'confirmed'
      AND b.payment_status <> 'paid'
      AND b.pay_reminded_at IS NULL
      AND b.pay_by IS NOT NULL
      AND now() >= (COALESCE(b.confirmed_at, b.created_at) + ((b.pay_by - COALESCE(b.confirmed_at, b.created_at)) / 2))
      AND now() < b.pay_by
  LOOP
    UPDATE public.bookings
    SET pay_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Payment required',
      format('Please complete payment for %s before %s.', COALESCE(r.vehicle_title, 'your booking'), to_char(r.pay_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/bookings'
    );

    v_reminded_pay := v_reminded_pay + 1;
  END LOOP;

  -- 1e. Host accountability: pause listings when a vendor reaches 3+ host_no_response in last 30 days
  FOR _v IN
    SELECT v.id AS vendor_id
    FROM public.vendors v
    WHERE EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.vendor_id = v.id
        AND b.status = 'cancelled'
        AND b.cancellation_reason = 'host_no_response'
        AND b.cancelled_at >= (now() - interval '30 days')
        AND (v.listings_reactivated_at IS NULL OR b.cancelled_at > v.listings_reactivated_at)
      GROUP BY b.vendor_id
      HAVING count(*) >= 3
    )
    AND (
      v.listings_paused_at IS NULL
      OR (v.listings_reactivated_at IS NOT NULL AND v.listings_reactivated_at > v.listings_paused_at)
    )
  LOOP
    UPDATE public.vehicles
    SET status = 'paused'
    WHERE vendor_id = _v.vendor_id
      AND status = 'active';

    UPDATE public.vendors
    SET listings_paused_at = now()
    WHERE id = _v.vendor_id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      _v.vendor_id,
      'Listings paused',
      'Your listings are paused because 3 requests expired without a response. Turn them back on from your dashboard.',
      '/vendor'
    );

    v_listings_paused := v_listings_paused + 1;
  END LOOP;

  -- 2a. Cancel expired pending driver requests (driver_no_response)
  FOR r IN
    SELECT db.id, db.customer_id, db.driver_id, d.full_name AS driver_name
    FROM public.driver_bookings db
    LEFT JOIN public.drivers d ON d.id = db.driver_id
    WHERE db.status = 'pending' AND db.respond_by < now()
  LOOP
    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'driver_no_response',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Request expired', format('Driver %s did not respond in time for your hire.', COALESCE(r.driver_name, 'the driver')), '/hires'),
      (r.driver_id, 'Request expired', 'Driver hire request expired without response.', '/driver-dashboard');

    v_driver_expired_pending := v_driver_expired_pending + 1;
  END LOOP;

  -- 2b. Cancel expired confirmed unpaid driver hires (payment_timeout)
  FOR r IN
    SELECT db.id, db.customer_id, db.driver_id, d.full_name AS driver_name
    FROM public.driver_bookings db
    LEFT JOIN public.drivers d ON d.id = db.driver_id
    WHERE db.status = 'confirmed' AND db.payment_status <> 'paid' AND db.pay_by < now()
  LOOP
    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Payment window expired', format('Payment was not completed in time for driver hire with %s.', COALESCE(r.driver_name, 'the driver')), '/hires'),
      (r.driver_id, 'Payment window expired', 'Customer did not pay in time for driver hire.', '/driver-dashboard');

    v_driver_expired_unpaid := v_driver_expired_unpaid + 1;
  END LOOP;

  -- 2c. Halfway reminder for pending driver requests (to driver)
  FOR r IN
    SELECT db.id, db.driver_id, db.respond_by
    FROM public.driver_bookings db
    WHERE db.status = 'pending'
      AND db.respond_reminded_at IS NULL
      AND db.respond_by IS NOT NULL
      AND now() >= (db.created_at + ((db.respond_by - db.created_at) / 2))
      AND now() < db.respond_by
  LOOP
    UPDATE public.driver_bookings
    SET respond_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.driver_id,
      'Pending hire request',
      format('Please respond to the driver hire request before %s.', to_char(r.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/driver-dashboard'
    );

    v_driver_reminded_respond := v_driver_reminded_respond + 1;
  END LOOP;

  -- 2d. Halfway reminder for confirmed unpaid driver hires (to customer)
  FOR r IN
    SELECT db.id, db.customer_id, db.pay_by, d.full_name AS driver_name
    FROM public.driver_bookings db
    LEFT JOIN public.drivers d ON d.id = db.driver_id
    WHERE db.status = 'confirmed'
      AND db.payment_status <> 'paid'
      AND db.pay_reminded_at IS NULL
      AND db.pay_by IS NOT NULL
      AND now() >= (COALESCE(db.confirmed_at, db.created_at) + ((db.pay_by - COALESCE(db.confirmed_at, db.created_at)) / 2))
      AND now() < db.pay_by
  LOOP
    UPDATE public.driver_bookings
    SET pay_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Payment required',
      format('Please complete payment for driver hire with %s before %s.', COALESCE(r.driver_name, 'the driver'), to_char(r.pay_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/hires'
    );

    v_driver_reminded_pay := v_driver_reminded_pay + 1;
  END LOOP;

  -- 3a. Cancel pending, unpaid wash bookings past pay_by
  FOR r IN
    SELECT wb.id, wb.customer_id, wb.slot_date, ws.name AS service_name
    FROM public.wash_bookings wb
    LEFT JOIN public.wash_services ws ON ws.id = wb.service_id
    WHERE wb.status = 'pending'
      AND wb.payment_status <> 'paid'
      AND wb.pay_by IS NOT NULL
      AND wb.pay_by < now()
  LOOP
    UPDATE public.wash_bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Payment window expired',
      'Your wash booking was cancelled because payment was not completed in time.',
      '/washes'
    );

    v_wash_expired_unpaid := v_wash_expired_unpaid + 1;
  END LOOP;

  -- 3b. Tier notifications: summary notification per newly eligible cleaner
  -- Temporary table to collect newly eligible cleaner-job pairs
  CREATE TEMP TABLE IF NOT EXISTS tmp_tier_alerts (
    cleaner_id uuid,
    wash_id uuid,
    target_tier smallint
  ) ON COMMIT DROP;
  DELETE FROM tmp_tier_alerts;

  FOR r IN
    SELECT wb.id, wb.tier_notified, wb.paid_at, wb.slot_date, wb.slot_time
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    _elapsed := now() - r.paid_at;

    IF r.tier_notified >= 3 THEN
      _target_tier := 3;
    ELSIF _lead_time > INTERVAL '24 hours' THEN
      IF _elapsed >= INTERVAL '8 hours' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '4 hours' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      IF _elapsed >= INTERVAL '2 hours' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '1 hour' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    ELSE -- < 6 hours
      IF _elapsed >= INTERVAL '30 minutes' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '15 minutes' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    END IF;

    IF _target_tier > r.tier_notified THEN
      -- Find newly eligible cleaners
      INSERT INTO tmp_tier_alerts (cleaner_id, wash_id, target_tier)
      SELECT c.id, r.id, _target_tier
      FROM public.cleaners c
      WHERE public.can_cleaner_see_wash_job(c.id, r.id);

      UPDATE public.wash_bookings
      SET tier_notified = _target_tier
      WHERE id = r.id;
    END IF;
  END LOOP;

  -- Send ONE summary notification per cleaner
  FOR cleaner_rec IN
    SELECT cleaner_id, count(DISTINCT wash_id) AS job_count
    FROM tmp_tier_alerts
    GROUP BY cleaner_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      cleaner_rec.cleaner_id,
      'New wash jobs near you',
      format('%s new wash job%s near you', cleaner_rec.job_count, CASE WHEN cleaner_rec.job_count > 1 THEN 's' ELSE '' END),
      '/cleaner-dashboard'
    );
  END LOOP;

  -- 3c. Admin alerts for at-risk wash jobs
  FOR r IN
    SELECT wb.id, wb.city, wb.slot_date, wb.slot_time, wb.paid_at
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
      AND wb.admin_alerted_at IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    IF _lead_time > INTERVAL '24 hours' THEN
      _alert_time := _slot_start - INTERVAL '12 hours';
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      _alert_time := _slot_start - INTERVAL '3 hours';
    ELSE
      _alert_time := _slot_start - INTERVAL '1 hour';
    END IF;

    IF now() >= _alert_time THEN
      UPDATE public.wash_bookings SET admin_alerted_at = now() WHERE id = r.id;
      FOR admin_rec IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        INSERT INTO public.notifications (user_id, title, body, link)
        VALUES (
          admin_rec.user_id,
          'Wash job at risk',
          format('Doorstep wash in %s on %s has no washer assigned yet.', r.city, r.slot_date),
          '/admin'
        );
      END LOOP;
      v_wash_admin_alerted := v_wash_admin_alerted + 1;
    END IF;
  END LOOP;

  -- 3d. Auto-cancel and refund at auto-cancel time
  FOR r IN
    SELECT wb.id, wb.customer_id, wb.price, wb.slot_date, wb.slot_time, wb.paid_at
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    IF _lead_time > INTERVAL '24 hours' THEN
      _cancel_time := _slot_start - INTERVAL '2 hours';
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      _cancel_time := _slot_start - INTERVAL '1 hour';
    ELSE
      _cancel_time := _slot_start - INTERVAL '30 minutes';
    END IF;

    IF now() >= _cancel_time THEN
      UPDATE public.wash_bookings
      SET status = 'cancelled',
          cancellation_reason = 'no_washer',
          cancelled_at = now(),
          payment_status = 'refunded',
          refund_amount = r.price
      WHERE id = r.id;

      PERFORM public.wallet_apply(
        r.customer_id,
        r.price,
        'wash_refund',
        NULL,
        r.id::text,
        'Full refund: no washer partner available'
      );

      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        r.customer_id,
        'Wash cancelled & refunded',
        'No washer was available in time for your slot. A full refund has been credited to your wallet.',
        '/washes'
      );

      v_wash_auto_cancelled := v_wash_auto_cancelled + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'bookings_expired_pending', v_expired_pending,
    'bookings_expired_unpaid', v_expired_unpaid,
    'bookings_reminded_respond', v_reminded_respond,
    'bookings_reminded_pay', v_reminded_pay,
    'vendors_listings_paused', v_listings_paused,
    'driver_cancelled_pending', v_driver_expired_pending,
    'driver_cancelled_unpaid', v_driver_expired_unpaid,
    'driver_reminded_respond', v_driver_reminded_respond,
    'driver_reminded_pay', v_driver_reminded_pay,
    'wash_expired_unpaid', v_wash_expired_unpaid,
    'wash_auto_cancelled', v_wash_auto_cancelled,
    'wash_admin_alerted', v_wash_admin_alerted
  );
END;
$$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0033_driver_booking_windows"),
    ]

    operations = [
        migrations.RunSQL(SQL),
    ]
