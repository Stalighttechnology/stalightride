"""Instant Book and host accountability: instant booking, response stats, and auto-pausing listings.

- Adds instant_book boolean NOT NULL DEFAULT false to public.vehicles
- Adds listings_paused_at and listings_reactivated_at to public.vendors
- Updates prevent_booking_conflict() to confirm instant_book bookings immediately with pay_by
- Updates tg_notify_booking() to notify both sides on INSERT of confirmed instant booking
- Implements host_response_stats(_vendor_id uuid) RETURNS jsonb
- Extends expire_booking_windows() to pause listings when 3 requests expire without response
- Implements reactivate_vendor_listings(_vendor_id uuid) RETURNS boolean
"""

from django.db import migrations

SQL = r"""
-- 1. Add instant_book to public.vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS instant_book boolean NOT NULL DEFAULT false;

-- 2. Add listings_paused_at and listings_reactivated_at to public.vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS listings_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS listings_reactivated_at timestamptz;

-- 3. Update prevent_booking_conflict() to handle instant_book
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_deleted boolean;
  v_instant_book boolean;
  v_new_start timestamp without time zone;
  v_new_end timestamp without time zone;
  v_start_tz timestamptz;
BEGIN
  -- Customer requests (not the owner or an admin)
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    SELECT status::text, COALESCE(is_deleted, false), COALESCE(instant_book, false)
      INTO v_status, v_deleted, v_instant_book
      FROM public.vehicles
     WHERE id = NEW.vehicle_id;

    IF v_deleted OR v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'This vehicle is not available for booking';
    END IF;
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Pickup date cannot be in the past';
    END IF;

    -- Refuse when the start is less than 2h from now: 'Pickup must be at least 2 hours from now'.
    v_start_tz := (NEW.start_date + COALESCE(NEW.pickup_time, '10:00:00'::time)) AT TIME ZONE 'Asia/Kolkata';
    IF v_start_tz < now() + interval '2 hours' THEN
      RAISE EXCEPTION 'Pickup must be at least 2 hours from now';
    END IF;

    -- Instant Book vs Standard Request
    IF v_instant_book THEN
      NEW.status := 'confirmed';
      NEW.confirmed_at := now();
      NEW.pay_by := public.booking_deadline(now(), v_start_tz, interval '30 minutes');
      NEW.respond_by := NULL;
    ELSE
      NEW.status := 'pending';
      NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), v_start_tz, interval '1 hour');
    END IF;
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

  -- On insert, mark expired bookings for the same vehicle as cancelled before overlap check
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

-- 4. Update tg_notify_booking() to handle confirmed booking on INSERT
CREATE OR REPLACE FUNCTION public.tg_notify_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.vendor_id, 'Instant booking confirmed',
        COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date || ' confirmed immediately via Instant Book.', '/vendor?tab=bookings');
      PERFORM public.notify_user(NEW.customer_id, 'Booking confirmed',
        COALESCE(v_title,'Your vehicle') || ' is confirmed via Instant Book. Complete the payment to lock it in.', '/bookings');
    ELSE
      PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
        COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date, '/vendor?tab=bookings');
      PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
        'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
    END IF;
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

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_notify_booking() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tg_notify_booking() TO service_role;

-- 5. New public.host_response_stats(_vendor_id uuid) RETURNS jsonb
CREATE OR REPLACE FUNCTION public.host_response_stats(_vendor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request_count integer := 0;
  v_responded_count integer := 0;
  v_response_rate numeric := NULL;
  v_median_minutes numeric := NULL;
BEGIN
  -- Over the vendor's bookings created in the last 90 days that needed a response
  WITH eligible AS (
    SELECT
      b.id,
      b.status,
      b.created_at,
      b.respond_by,
      b.confirmed_at,
      b.updated_at,
      CASE
        WHEN b.confirmed_at IS NOT NULL AND (b.respond_by IS NULL OR b.confirmed_at <= b.respond_by) THEN true
        WHEN b.status IN ('confirmed', 'completed') AND (b.confirmed_at IS NULL OR b.confirmed_at <= b.respond_by) THEN true
        WHEN b.status = 'rejected' AND b.updated_at <= b.respond_by THEN true
        ELSE false
      END AS answered_in_time,
      CASE
        WHEN b.confirmed_at IS NOT NULL THEN
          GREATEST(0, EXTRACT(EPOCH FROM (b.confirmed_at - b.created_at)) / 60.0)
        WHEN b.status IN ('confirmed', 'completed') THEN
          GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(b.confirmed_at, b.updated_at) - b.created_at)) / 60.0)
        WHEN b.status = 'rejected' THEN
          GREATEST(0, EXTRACT(EPOCH FROM (b.updated_at - b.created_at)) / 60.0)
        ELSE NULL
      END AS response_minutes
    FROM public.bookings b
    WHERE b.vendor_id = _vendor_id
      AND b.respond_by IS NOT NULL
      AND b.created_at >= now() - interval '90 days'
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE answered_in_time),
    CASE WHEN count(*) > 0 THEN
      round(count(*) FILTER (WHERE answered_in_time)::numeric / count(*)::numeric, 4)
    ELSE NULL END,
    round((percentile_cont(0.5) WITHIN GROUP (ORDER BY response_minutes))::numeric)
  INTO
    v_request_count,
    v_responded_count,
    v_response_rate,
    v_median_minutes
  FROM eligible;

  RETURN jsonb_build_object(
    'response_rate', v_response_rate,
    'median_response_minutes', v_median_minutes,
    'request_count', v_request_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.host_response_stats(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.host_response_stats(uuid) TO anon, authenticated, service_role;

-- 6. Extend public.expire_booking_windows() to pause listings on 3 host_no_response in 30 days
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
  r RECORD;
  v_rec RECORD;
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

  -- 1e. Auto-pause host listings on 3 or more host_no_response expiries in the last 30 days
  FOR v_rec IN
    SELECT v.id AS vendor_id, count(b.id) AS expiry_count
    FROM public.vendors v
    JOIN public.bookings b ON b.vendor_id = v.id
    WHERE b.status = 'cancelled'
      AND b.cancellation_reason = 'host_no_response'
      AND b.cancelled_at >= now() - interval '30 days'
      AND (v.listings_reactivated_at IS NULL OR b.cancelled_at > v.listings_reactivated_at)
      AND (v.listings_paused_at IS NULL OR (v.listings_reactivated_at IS NOT NULL AND v.listings_reactivated_at > v.listings_paused_at))
    GROUP BY v.id
    HAVING count(b.id) >= 3
  LOOP
    -- Pause all active vehicles for this vendor
    UPDATE public.vehicles
    SET status = 'paused'
    WHERE vendor_id = v_rec.vendor_id AND status = 'active';

    -- Record listings_paused_at on the vendor
    UPDATE public.vendors
    SET listings_paused_at = now()
    WHERE id = v_rec.vendor_id;

    -- Notify the vendor
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      v_rec.vendor_id,
      'Listings paused',
      'Your listings are paused because 3 requests expired without a response. Turn them back on from your dashboard.',
      '/vendor'
    );

    v_listings_paused := v_listings_paused + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'bookings_expired_pending', v_expired_pending,
    'bookings_expired_unpaid', v_expired_unpaid,
    'bookings_reminded_respond', v_reminded_respond,
    'bookings_reminded_pay', v_reminded_pay,
    'vendors_listings_paused', v_listings_paused
  );
END; $$;
REVOKE ALL ON FUNCTION public.expire_booking_windows() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_booking_windows() TO service_role;

-- 7. New public.reactivate_vendor_listings(_vendor_id uuid) RETURNS boolean
CREATE OR REPLACE FUNCTION public.reactivate_vendor_listings(_vendor_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF auth.uid() <> _vendor_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  UPDATE public.vehicles
  SET status = 'active'
  WHERE vendor_id = _vendor_id
    AND status = 'paused'
    AND verification_status = 'approved'
    AND NOT COALESCE(is_deleted, false);

  UPDATE public.vendors
  SET listings_paused_at = NULL,
      listings_reactivated_at = now()
  WHERE id = _vendor_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reactivate_vendor_listings(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reactivate_vendor_listings(uuid) TO authenticated, service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.reactivate_vendor_listings(uuid);
DROP FUNCTION IF EXISTS public.host_response_stats(uuid);
ALTER TABLE public.vendors DROP COLUMN IF EXISTS listings_reactivated_at;
ALTER TABLE public.vendors DROP COLUMN IF EXISTS listings_paused_at;
ALTER TABLE public.vehicles DROP COLUMN IF EXISTS instant_book;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_rental_booking_windows'),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE_SQL),
    ]
