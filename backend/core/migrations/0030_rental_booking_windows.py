"""Rental booking windows: deadlines, auto-expiry, halfway reminders, and late payment handling.

- Implements public.booking_deadline(from, start, buffer, cap)
- Adds respond_by, pay_by, confirmed_at, respond_reminded_at, pay_reminded_at to public.bookings
- Updates prevent_booking_conflict() to enforce 2h minimum notice, set respond_by, and lazily cancel expired bookings
- Adds trg_zz_booking_windows to prevent late approvals and calculate confirmed_at and pay_by
- Protects new window columns in enforce_booking_update_scope()
- Enforces pay_by deadline in wallet_pay_booking()
- Adds public.expire_booking_windows() to cancel expired rentals and send halfway reminders
"""

from django.db import migrations

SQL = r"""
-- 1. Booking deadline formula
CREATE OR REPLACE FUNCTION public.booking_deadline(
    _from timestamptz,
    _start timestamptz,
    _buffer interval,
    _cap interval DEFAULT '12 hours'::interval
) RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT LEAST(_from + _cap, _from + ((_start - _from) / 2), _start - _buffer);
$$;
REVOKE ALL ON FUNCTION public.booking_deadline(timestamptz, timestamptz, interval, interval) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_deadline(timestamptz, timestamptz, interval, interval) TO anon, authenticated, service_role;

-- 2. Add window columns to public.bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS respond_by timestamptz,
  ADD COLUMN IF NOT EXISTS pay_by timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS respond_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pay_reminded_at timestamptz;

-- Backfill pending rows: respond_by from now()
UPDATE public.bookings
SET respond_by = public.booking_deadline(
    now(),
    (start_date + COALESCE(pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
    interval '1 hour'
)
WHERE status = 'pending' AND respond_by IS NULL;

-- Backfill confirmed unpaid rows: pay_by from now()
UPDATE public.bookings
SET pay_by = public.booking_deadline(
    now(),
    (start_date + COALESCE(pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
    interval '30 minutes'
)
WHERE status = 'confirmed' AND payment_status <> 'paid' AND pay_by IS NULL;

-- 3. Time-aware booking conflict check with 2h notice, respond_by, and lazy cancellation
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_deleted boolean;
  v_new_start timestamp without time zone;
  v_new_end timestamp without time zone;
  v_start_tz timestamptz;
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

    -- a. Refuse when the start is less than 2h from now(): 'Pickup must be at least 2 hours from now'.
    v_start_tz := (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata';
    IF v_start_tz < now() + interval '2 hours' THEN
      RAISE EXCEPTION 'Pickup must be at least 2 hours from now';
    END IF;

    -- b. Set NEW.respond_by.
    NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), v_start_tz, interval '1 hour');
  END IF;

  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending' AND NEW.respond_by IS NULL THEN
    v_start_tz := (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata';
    NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), v_start_tz, interval '1 hour');
  END IF;

  v_new_start := (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time));
  v_new_end := (NEW.end_date + COALESCE(NEW.dropoff_time, '10:00:00'::time));

  IF v_new_end <= v_new_start THEN
    RAISE EXCEPTION 'Drop-off must be after pickup';
  END IF;

  -- One writer per vehicle at a time, so the checks below see every committed booking.
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;

  -- c. On insert, mark expired bookings for the same vehicle as cancelled before overlap check
  IF TG_OP = 'INSERT' THEN
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'host_no_response',
        cancelled_at = now()
    WHERE vehicle_id = NEW.vehicle_id
      AND status = 'pending'
      AND respond_by < now();

    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE vehicle_id = NEW.vehicle_id
      AND status = 'confirmed'
      AND payment_status <> 'paid'
      AND pay_by < now();
  END IF;

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

-- 4. BEFORE UPDATE trigger trg_zz_booking_windows
CREATE OR REPLACE FUNCTION public.tg_booking_windows() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    IF OLD.respond_by IS NOT NULL AND now() > OLD.respond_by THEN
      RAISE EXCEPTION 'This request has expired';
    END IF;
    NEW.confirmed_at := now();
    NEW.pay_by := public.booking_deadline(
      NEW.confirmed_at,
      (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
      interval '30 minutes'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_booking_windows ON public.bookings;
CREATE TRIGGER trg_zz_booking_windows
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_windows();

-- 5. Scope enforcement for end users
CREATE OR REPLACE FUNCTION public.enforce_booking_update_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  -- Immutable identity / schedule / money / payment / handover columns
  NEW.id := OLD.id;
  NEW.vehicle_id := OLD.vehicle_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.customer_id := OLD.customer_id;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.pickup_time := OLD.pickup_time;
  NEW.dropoff_time := OLD.dropoff_time;
  NEW.base_price := OLD.base_price;
  NEW.security_deposit := OLD.security_deposit;
  NEW.discount := OLD.discount;
  NEW.total_price := OLD.total_price;
  NEW.coupon_code := OLD.coupon_code;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.razorpay_order_id := OLD.razorpay_order_id;
  NEW.razorpay_payment_id := OLD.razorpay_payment_id;
  NEW.paid_at := OLD.paid_at;
  NEW.qr_code := OLD.qr_code;
  NEW.pickup_checked_at := OLD.pickup_checked_at;
  NEW.return_checked_at := OLD.return_checked_at;
  NEW.created_at := OLD.created_at;

  -- Booking window columns
  NEW.respond_by := OLD.respond_by;
  NEW.pay_by := OLD.pay_by;
  NEW.confirmed_at := OLD.confirmed_at;
  NEW.respond_reminded_at := OLD.respond_reminded_at;
  NEW.pay_reminded_at := OLD.pay_reminded_at;

  RETURN NEW;
END; $$;

-- 6. Refuse wallet payment after pay_by
CREATE OR REPLACE FUNCTION public.wallet_pay_booking(_booking_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Host has not accepted this booking yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;
  IF b.pay_by IS NOT NULL AND now() > b.pay_by THEN RAISE EXCEPTION 'Payment window has closed'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.total_price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.total_price, 'booking_payment', b.id, NULL, 'Payment for booking');
  UPDATE public.bookings
     SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
   WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;
REVOKE ALL ON FUNCTION public.wallet_pay_booking(_booking_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wallet_pay_booking(_booking_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.wallet_pay_booking(_booking_id uuid) TO authenticated;

-- 7. Expiration job for booking windows
CREATE OR REPLACE FUNCTION public.expire_booking_windows() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expired_pending integer := 0;
  v_expired_unpaid integer := 0;
  v_reminded_respond integer := 0;
  v_reminded_pay integer := 0;
  r RECORD;
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
      'Payment reminder',
      format('Please complete payment for %s before %s.', COALESCE(r.vehicle_title, 'the vehicle'), to_char(r.pay_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/bookings'
    );

    v_reminded_pay := v_reminded_pay + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'bookings_expired_pending', v_expired_pending,
    'bookings_expired_unpaid', v_expired_unpaid,
    'bookings_reminded_respond', v_reminded_respond,
    'bookings_reminded_pay', v_reminded_pay
  );
END; $$;
REVOKE ALL ON FUNCTION public.expire_booking_windows() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_booking_windows() TO service_role;

-- Do not send duplicate generic cancellation notification if cancellation reason is host_no_response or payment_timeout
CREATE OR REPLACE FUNCTION public.tg_notify_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
      COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date, '/vendor?tab=bookings');
    PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
      'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Booking approved',
        COALESCE(v_title,'Your vehicle') || ' is confirmed. Complete the payment to lock it in.', '/bookings');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Booking declined',
        'The host could not accept your request for ' || COALESCE(v_title,'this vehicle') || '.', '/bookings');
    ELSIF NEW.status = 'cancelled' THEN
      IF COALESCE(NEW.cancellation_reason, '') NOT IN ('host_no_response', 'payment_timeout') THEN
        PERFORM public.notify_user(NEW.customer_id, 'Booking cancelled', 'Your trip was cancelled.', '/bookings');
        PERFORM public.notify_user(NEW.vendor_id, 'Booking cancelled', 'A trip on ' || COALESCE(v_title,'your vehicle') || ' was cancelled.', '/vendor?tab=bookings');
      END IF;
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Trip completed', 'Rate your ride and view your invoice.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Trip completed', COALESCE(v_title,'Your vehicle') || ' is back. Earnings updated.', '/vendor?tab=bookings');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'Payment received',
      'Payment of Rs ' || NEW.total_price || ' received for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=payouts');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful',
      'Your booking is confirmed. Show your QR at pickup.', '/bookings');
  END IF;

  IF NEW.pickup_checked_at IS NOT NULL AND OLD.pickup_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Pickup confirmed', 'Handover verified by QR. Drive safe!', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Pickup confirmed', 'QR check-in completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=bookings');
  END IF;

  IF NEW.return_checked_at IS NOT NULL AND OLD.return_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Return confirmed', 'Vehicle return verified by QR.', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Return confirmed', 'Return verified for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=bookings');
  END IF;

  RETURN NEW;
END; $$;
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS trg_zz_booking_windows ON public.bookings;
DROP FUNCTION IF EXISTS public.tg_booking_windows();
DROP FUNCTION IF EXISTS public.expire_booking_windows();
DROP FUNCTION IF EXISTS public.booking_deadline(timestamptz, timestamptz, interval, interval);

ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS respond_by,
  DROP COLUMN IF EXISTS pay_by,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS respond_reminded_at,
  DROP COLUMN IF EXISTS pay_reminded_at;

-- Restore 0025 prevent_booking_conflict
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

  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;

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

-- Restore previous enforce_booking_update_scope
CREATE OR REPLACE FUNCTION public.enforce_booking_update_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.vehicle_id := OLD.vehicle_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.customer_id := OLD.customer_id;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.pickup_time := OLD.pickup_time;
  NEW.dropoff_time := OLD.dropoff_time;
  NEW.base_price := OLD.base_price;
  NEW.security_deposit := OLD.security_deposit;
  NEW.discount := OLD.discount;
  NEW.total_price := OLD.total_price;
  NEW.coupon_code := OLD.coupon_code;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.razorpay_order_id := OLD.razorpay_order_id;
  NEW.razorpay_payment_id := OLD.razorpay_payment_id;
  NEW.paid_at := OLD.paid_at;
  NEW.qr_code := OLD.qr_code;
  NEW.pickup_checked_at := OLD.pickup_checked_at;
  NEW.return_checked_at := OLD.return_checked_at;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END; $$;

-- Restore previous wallet_pay_booking
CREATE OR REPLACE FUNCTION public.wallet_pay_booking(_booking_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Host has not accepted this booking yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.total_price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.total_price, 'booking_payment', b.id, NULL, 'Payment for booking');
  UPDATE public.bookings
     SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
   WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0029_route_service_fee_to_admin")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
