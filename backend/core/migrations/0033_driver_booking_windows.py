"""Driver booking windows: deadlines, auto-expiry, halfway reminders, similar drivers, and linked rental cascade.

- Adds respond_by, pay_by, confirmed_at, respond_reminded_at, pay_reminded_at to public.driver_bookings
- Updates prevent_driver_booking_conflict() to enforce 2h minimum notice, set respond_by, and lazily cancel expired bookings
- Adds trg_zz_driver_booking_windows to prevent late approvals and calculate confirmed_at and pay_by (1h buffer)
- Protects new window columns in enforce_driver_booking_update_scope()
- Enforces pay_by deadline in wallet_pay_driver_booking()
- Extends public.expire_booking_windows() for driver bookings
- Adds public.similar_drivers(_driver_booking_id) RPC
- Adds trg_cancel_linked_driver_hire to cancel and refund linked driver hire when a rental is cancelled/rejected
"""

from django.db import migrations

SQL = r"""
-- 1. Add window columns to public.driver_bookings
ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS respond_by timestamptz,
  ADD COLUMN IF NOT EXISTS pay_by timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS respond_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pay_reminded_at timestamptz;

-- Backfill pending rows: respond_by from now()
UPDATE public.driver_bookings
SET respond_by = public.booking_deadline(
    now(),
    (start_date + COALESCE(start_time, '09:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
    interval '1 hour'
)
WHERE status = 'pending' AND respond_by IS NULL;

-- Backfill confirmed unpaid rows: pay_by from now()
UPDATE public.driver_bookings
SET pay_by = public.booking_deadline(
    now(),
    (start_date + COALESCE(start_time, '09:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
    interval '1 hour'
)
WHERE status = 'confirmed' AND payment_status <> 'paid' AND pay_by IS NULL;

-- 2. Time-aware driver booking conflict check with 2h notice, respond_by, and lazy cancellation
CREATE OR REPLACE FUNCTION public.prevent_driver_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  d RECORD;
  v_start_tz timestamptz;
BEGIN
  SELECT verification_status, status INTO d FROM public.drivers WHERE id = NEW.driver_id;
  IF d IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;
  IF d.verification_status IS DISTINCT FROM 'approved' OR d.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This driver is not available for hire';
  END IF;

  -- Customer branch
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    IF NEW.start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Start date cannot be in the past';
    END IF;

    -- a. 2h minimum notice
    v_start_tz := (NEW.start_date + COALESCE(NEW.start_time, '09:00:00'::time)) AT TIME ZONE 'Asia/Kolkata';
    IF v_start_tz < now() + interval '2 hours' THEN
      RAISE EXCEPTION 'Pickup must be at least 2 hours from now';
    END IF;

    -- b. set respond_by
    NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), v_start_tz, interval '1 hour');
  END IF;

  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending' AND NEW.respond_by IS NULL THEN
    v_start_tz := (NEW.start_date + COALESCE(NEW.start_time, '09:00:00'::time)) AT TIME ZONE 'Asia/Kolkata';
    NEW.respond_by := public.booking_deadline(COALESCE(NEW.created_at, now()), v_start_tz, interval '1 hour');
  END IF;

  -- One writer per driver at a time (drivers row lock)
  PERFORM 1 FROM public.drivers WHERE id = NEW.driver_id FOR NO KEY UPDATE;

  -- After row lock: cancel this driver's expired pending/unpaid bookings before overlap check
  IF TG_OP = 'INSERT' THEN
    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'driver_no_response',
        cancelled_at = now()
    WHERE driver_id = NEW.driver_id
      AND status = 'pending'
      AND respond_by < now();

    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE driver_id = NEW.driver_id
      AND status = 'confirmed'
      AND payment_status <> 'paid'
      AND pay_by < now();
  END IF;

  -- Check conflict with existing active bookings
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
REVOKE ALL ON FUNCTION public.prevent_driver_booking_conflict() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_driver_booking_conflict() TO service_role;

-- 3. BEFORE UPDATE trigger trg_zz_driver_booking_windows
CREATE OR REPLACE FUNCTION public.tg_driver_booking_windows() RETURNS trigger
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
      (NEW.start_date + COALESCE(NEW.start_time, '09:00:00'::time)) AT TIME ZONE 'Asia/Kolkata',
      interval '1 hour'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_driver_booking_windows ON public.driver_bookings;
CREATE TRIGGER trg_zz_driver_booking_windows
  BEFORE UPDATE ON public.driver_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_driver_booking_windows();

-- 4. Scope enforcement for driver booking updates
CREATE OR REPLACE FUNCTION public.enforce_driver_booking_update_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.driver_id := OLD.driver_id;
  NEW.customer_id := OLD.customer_id;
  NEW.booking_id := OLD.booking_id;
  NEW.rate_type := OLD.rate_type;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.start_time := OLD.start_time;
  NEW.end_time := OLD.end_time;
  NEW.hours := OLD.hours;
  NEW.days := OLD.days;
  NEW.total_price := OLD.total_price;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.razorpay_order_id := OLD.razorpay_order_id;
  NEW.razorpay_payment_id := OLD.razorpay_payment_id;
  NEW.paid_at := OLD.paid_at;
  NEW.refund_amount := OLD.refund_amount;
  NEW.created_at := OLD.created_at;

  -- Window columns
  NEW.respond_by := OLD.respond_by;
  NEW.pay_by := OLD.pay_by;
  NEW.confirmed_at := OLD.confirmed_at;
  NEW.respond_reminded_at := OLD.respond_reminded_at;
  NEW.pay_reminded_at := OLD.pay_reminded_at;

  RETURN NEW;
END; $$;

-- 5. Wallet pay driver booking with pay_by deadline check
CREATE OR REPLACE FUNCTION public.wallet_pay_driver_booking(_driver_booking_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Driver has not accepted this request yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;
  IF b.pay_by IS NOT NULL AND now() > b.pay_by THEN RAISE EXCEPTION 'Payment window has closed'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.total_price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.total_price, 'driver_payment', NULL, b.id::text, 'Payment for driver hire');
  UPDATE public.driver_bookings
     SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
   WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;

-- 6. Extend public.expire_booking_windows() with driver bookings
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
  r RECORD;
  _v RECORD;
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

  RETURN jsonb_build_object(
    'bookings_expired_pending', v_expired_pending,
    'bookings_expired_unpaid', v_expired_unpaid,
    'bookings_reminded_respond', v_reminded_respond,
    'bookings_reminded_pay', v_reminded_pay,
    'vendors_listings_paused', v_listings_paused,
    'driver_cancelled_pending', v_driver_expired_pending,
    'driver_cancelled_unpaid', v_driver_expired_unpaid,
    'driver_reminded_respond', v_driver_reminded_respond,
    'driver_reminded_pay', v_driver_reminded_pay
  );
END;
$$;

-- 7. Function public.similar_drivers(_driver_booking_id uuid)
CREATE OR REPLACE FUNCTION public.similar_drivers(_driver_booking_id uuid)
RETURNS SETOF public.public_drivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  orig RECORD;
BEGIN
  SELECT b.id, b.customer_id, b.driver_id, b.start_date, b.end_date, d.city
  INTO orig
  FROM public.driver_bookings b
  JOIN public.drivers d ON d.id = b.driver_id
  WHERE b.id = _driver_booking_id;

  IF orig IS NULL THEN
    RAISE EXCEPTION 'Driver booking not found';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> orig.customer_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'You are not the customer for this booking';
  END IF;

  RETURN QUERY
  SELECT pd.*
  FROM public.public_drivers pd
  JOIN public.drivers d ON d.id = pd.id
  WHERE d.verification_status = 'approved'
    AND d.status = 'active'
    AND LOWER(pd.city) = LOWER(orig.city)
    AND pd.id <> orig.driver_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.driver_bookings db
      WHERE db.driver_id = pd.id
        AND db.status IN ('pending', 'confirmed')
        AND db.start_date <= orig.end_date
        AND db.end_date >= orig.start_date
    )
  ORDER BY pd.avg_rating DESC, pd.review_count DESC
  LIMIT 5;
END;
$$;
REVOKE ALL ON FUNCTION public.similar_drivers(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.similar_drivers(uuid) TO authenticated, service_role;

-- 8. Cancel linked driver hire when a rental booking is cancelled or rejected
CREATE OR REPLACE FUNCTION public.tg_cancel_linked_driver_hire() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  refund numeric;
  new_pay_status text;
BEGIN
  IF OLD.status IN ('pending', 'confirmed') AND NEW.status IN ('cancelled', 'rejected') THEN
    FOR r IN
      SELECT * FROM public.driver_bookings
      WHERE booking_id = NEW.id
        AND status IN ('pending', 'confirmed')
      FOR UPDATE
    LOOP
      IF r.payment_status = 'paid' THEN
        refund := round(COALESCE(r.total_price, 0), 2);
        IF refund > 0 THEN
          PERFORM public.wallet_apply(r.customer_id, refund, 'driver_refund', NULL, r.id::text,
            'Full refund for cancelled driver hire (linked vehicle rental cancelled)');
        END IF;
        new_pay_status := 'refunded';
      ELSE
        refund := 0;
        new_pay_status := r.payment_status;
      END IF;

      UPDATE public.driver_bookings
      SET status = 'cancelled',
          payment_status = new_pay_status,
          refund_amount = refund,
          cancelled_at = now(),
          cancellation_reason = 'linked_rental_cancelled'
      WHERE id = r.id;

      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES
        (r.driver_id, 'Driver hire cancelled', 'The linked vehicle rental was cancelled, so this hire was cancelled.', '/driver-dashboard'),
        (r.customer_id, 'Driver hire cancelled', 'Your driver hire was cancelled because the linked vehicle rental was cancelled.', '/hires');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_linked_driver_hire ON public.bookings;
CREATE TRIGGER trg_cancel_linked_driver_hire
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cancel_linked_driver_hire();
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS trg_cancel_linked_driver_hire ON public.bookings;
DROP FUNCTION IF EXISTS public.tg_cancel_linked_driver_hire();
DROP FUNCTION IF EXISTS public.similar_drivers(uuid);
DROP TRIGGER IF EXISTS trg_zz_driver_booking_windows ON public.driver_bookings;
DROP FUNCTION IF EXISTS public.tg_driver_booking_windows();

ALTER TABLE public.driver_bookings
  DROP COLUMN IF EXISTS respond_by,
  DROP COLUMN IF EXISTS pay_by,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS respond_reminded_at,
  DROP COLUMN IF EXISTS pay_reminded_at;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0032_instant_book_and_host_accountability"),
    ]

    operations = [
        migrations.RunSQL(sql=SQL, reverse_sql=REVERSE_SQL),
    ]
