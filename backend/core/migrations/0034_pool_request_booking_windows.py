"""Pool request booking windows: respond_by, 1h cutoff, expiry, driver halfway reminder, and driver response stats.

- Adds respond_by and respond_reminded_at to public.pool_requests
- Backfills pending pool requests with respond_by
- Updates enforce_pool_request_guard:
    - 1h before departure cutoff on insert
    - sets respond_by via booking_deadline(created_at, depart_at, 30m)
    - refuses confirmation after respond_by
    - skips driver-only reject check when is_end_user_request() is false
    - protects respond_by and respond_reminded_at from end user changes
- Updates tg_notify_pool_request to send distinct expiry/departure notification messages to passengers
- Extends expire_booking_windows with pool section (expiry, trip departure closure, halfway driver reminder)
- Adds public.pool_driver_response_stats(_driver_id uuid) RETURNS jsonb
"""

from django.db import migrations

SQL = r"""
-- 1. Add window columns to public.pool_requests
ALTER TABLE public.pool_requests
  ADD COLUMN IF NOT EXISTS respond_by timestamptz,
  ADD COLUMN IF NOT EXISTS respond_reminded_at timestamptz;

-- Backfill pending pool requests
UPDATE public.pool_requests pr
SET respond_by = public.booking_deadline(
    pr.created_at,
    pt.depart_at,
    interval '30 minutes'
)
FROM public.pool_trips pt
WHERE pt.id = pr.trip_id
  AND pr.status = 'pending'
  AND pr.respond_by IS NULL;

-- 2. Update enforce_pool_request_guard()
CREATE OR REPLACE FUNCTION public.enforce_pool_request_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.pool_trips;
BEGIN
  SELECT * INTO t FROM public.pool_trips WHERE id = NEW.trip_id FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'Pool trip not found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF t.driver_id = NEW.passenger_id THEN
      RAISE EXCEPTION 'You cannot join your own pool trip';
    END IF;
    IF t.status <> 'scheduled' OR t.depart_at <= now() THEN
      RAISE EXCEPTION 'This pool trip has already started or is closed';
    END IF;
    IF t.depart_at - now() < interval '1 hour' THEN
      RAISE EXCEPTION 'Requests close 1 hour before departure';
    END IF;
    IF NEW.seats > t.seats_available THEN
      RAISE EXCEPTION 'Only % seat(s) left on this trip', t.seats_available;
    END IF;
    NEW.status := 'pending';
    NEW.fare_total := t.fare_per_seat * NEW.seats;
    NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), t.depart_at, interval '30 minutes');
    NEW.respond_reminded_at := NULL;
    RETURN NEW;
  END IF;

  NEW.trip_id := OLD.trip_id;
  NEW.passenger_id := OLD.passenger_id;
  NEW.seats := OLD.seats;
  NEW.fare_total := OLD.fare_total;
  NEW.match_score := OLD.match_score;

  IF public.is_end_user_request() THEN
    NEW.respond_by := OLD.respond_by;
    NEW.respond_reminded_at := OLD.respond_reminded_at;
  END IF;

  IF NEW.status <> OLD.status THEN
    IF OLD.status IN ('rejected','cancelled','completed') THEN
      RAISE EXCEPTION 'This request is already closed';
    END IF;
    IF NEW.status = 'confirmed' THEN
      IF OLD.respond_by IS NOT NULL AND now() > OLD.respond_by THEN
        RAISE EXCEPTION 'This request has expired';
      END IF;
      IF auth.uid() <> t.driver_id AND NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only the trip driver can accept passengers';
      END IF;
      IF t.seats_available < OLD.seats THEN
        RAISE EXCEPTION 'Not enough seats left to accept this request';
      END IF;
      PERFORM set_config('app.pool_seat_sync', '1', true);
      UPDATE public.pool_trips SET seats_available = seats_available - OLD.seats WHERE id = t.id;
      PERFORM set_config('app.pool_seat_sync', '0', true);
    ELSIF NEW.status = 'rejected' THEN
      IF public.is_end_user_request() THEN
        IF auth.uid() <> t.driver_id AND NOT public.has_role(auth.uid(), 'admin') THEN
          RAISE EXCEPTION 'Only the trip driver can reject passengers';
        END IF;
      END IF;
    ELSIF NEW.status = 'cancelled' THEN
      IF OLD.status = 'confirmed' AND t.status <> 'cancelled' THEN
        PERFORM set_config('app.pool_seat_sync', '1', true);
        UPDATE public.pool_trips SET seats_available = LEAST(t.seats_total, t.seats_available + OLD.seats) WHERE id = t.id;
        PERFORM set_config('app.pool_seat_sync', '0', true);
      END IF;
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Update tg_notify_pool_request()
CREATE OR REPLACE FUNCTION public.tg_notify_pool_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.pool_trips;
BEGIN
  SELECT * INTO t FROM public.pool_trips WHERE id = NEW.trip_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(t.driver_id, 'New pooling request', 'A passenger wants to join your ride.', '/pooling/driver');
  ELSIF NEW.status <> OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.passenger_id, 'Pooling request accepted', 'Your seat is confirmed.', '/pooling/mine');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(
        NEW.passenger_id,
        CASE
          WHEN NEW.cancellation_reason = 'Trip departed' THEN 'Trip departed'
          WHEN NEW.cancellation_reason = 'Driver didn''t respond' THEN 'Request expired'
          ELSE 'Pooling request declined'
        END,
        CASE
          WHEN NEW.cancellation_reason = 'Trip departed' THEN 'The trip has already departed.'
          WHEN NEW.cancellation_reason = 'Driver didn''t respond' THEN 'The driver did not respond in time.'
          ELSE 'The driver could not take you along.'
        END,
        '/pooling/mine'
      );
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(
        CASE WHEN auth.uid() = NEW.passenger_id THEN t.driver_id ELSE NEW.passenger_id END,
        'Pooling booking cancelled', 'A pooling booking was cancelled.', '/pooling/mine');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Extend public.expire_booking_windows() with pool section
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
  v_pool_expired_pending integer := 0;
  v_pool_reminded_respond integer := 0;
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
  pool_rec RECORD;
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

  -- 4a. Expire pending pool requests past respond_by or whose trip has departed or cancelled
  FOR pool_rec IN
    SELECT
      pr.id,
      pr.passenger_id,
      t.driver_id,
      t.depart_at,
      t.status AS trip_status,
      pr.respond_by,
      CASE
        WHEN t.status = 'cancelled' OR t.depart_at <= now() THEN 'Trip departed'
        ELSE 'Driver didn''t respond'
      END AS cancel_reason
    FROM public.pool_requests pr
    JOIN public.pool_trips t ON t.id = pr.trip_id
    WHERE pr.status = 'pending'
      AND (
        (pr.respond_by IS NOT NULL AND pr.respond_by < now())
        OR t.status = 'cancelled'
        OR t.depart_at <= now()
      )
  LOOP
    UPDATE public.pool_requests
    SET status = 'rejected',
        cancellation_reason = pool_rec.cancel_reason,
        updated_at = now()
    WHERE id = pool_rec.id;

    v_pool_expired_pending := v_pool_expired_pending + 1;
  END LOOP;

  -- 4b. Halfway reminder to pool trip driver
  FOR pool_rec IN
    SELECT
      pr.id,
      pr.trip_id,
      t.driver_id,
      pr.respond_by,
      pr.pickup_label,
      pr.drop_label
    FROM public.pool_requests pr
    JOIN public.pool_trips t ON t.id = pr.trip_id
    WHERE pr.status = 'pending'
      AND pr.respond_reminded_at IS NULL
      AND pr.respond_by IS NOT NULL
      AND now() >= (pr.created_at + ((pr.respond_by - pr.created_at) / 2))
      AND now() < pr.respond_by
  LOOP
    UPDATE public.pool_requests
    SET respond_reminded_at = now()
    WHERE id = pool_rec.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      pool_rec.driver_id,
      'Pending pool request',
      format('A passenger is waiting for your response for trip %s to %s before %s.',
             COALESCE(pool_rec.pickup_label, ''),
             COALESCE(pool_rec.drop_label, ''),
             to_char(pool_rec.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/pooling/driver'
    );

    v_pool_reminded_respond := v_pool_reminded_respond + 1;
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
    'wash_admin_alerted', v_wash_admin_alerted,
    'pool_expired_pending', v_pool_expired_pending,
    'pool_reminded_respond', v_pool_reminded_respond
  );
END;
$$;

-- 5. New public.pool_driver_response_stats(_driver_id uuid) RETURNS jsonb
CREATE OR REPLACE FUNCTION public.pool_driver_response_stats(_driver_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request_count integer := 0;
  v_response_rate numeric := NULL;
BEGIN
  WITH eligible AS (
    SELECT
      pr.id,
      pr.status,
      pr.created_at,
      pr.respond_by,
      pr.updated_at,
      CASE
        WHEN pr.status = 'confirmed' AND (pr.respond_by IS NULL OR pr.updated_at <= pr.respond_by) THEN true
        WHEN pr.status = 'rejected' AND (pr.respond_by IS NULL OR pr.updated_at <= pr.respond_by) AND COALESCE(pr.cancellation_reason, '') NOT IN ('Driver didn''t respond', 'Trip departed') THEN true
        ELSE false
      END AS answered_in_time
    FROM public.pool_requests pr
    JOIN public.pool_trips pt ON pt.id = pr.trip_id
    WHERE pt.driver_id = _driver_id
      AND pr.respond_by IS NOT NULL
      AND pr.created_at >= now() - interval '90 days'
  )
  SELECT
    count(*),
    CASE WHEN count(*) > 0 THEN
      round(count(*) FILTER (WHERE answered_in_time)::numeric / count(*)::numeric, 4)
    ELSE NULL END
  INTO
    v_request_count,
    v_response_rate
  FROM eligible;

  RETURN jsonb_build_object(
    'response_rate', v_response_rate,
    'request_count', v_request_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pool_driver_response_stats(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pool_driver_response_stats(uuid) TO anon, authenticated, service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.pool_driver_response_stats(uuid);
ALTER TABLE public.pool_requests
  DROP COLUMN IF EXISTS respond_by,
  DROP COLUMN IF EXISTS respond_reminded_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0033_wash_booking_dispatch'),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE_SQL),
    ]
