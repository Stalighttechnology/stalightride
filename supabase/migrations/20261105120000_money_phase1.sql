-- Money phase 1: server-side pricing, platform fees, GST, coupons at checkout,
-- earnings released on completion, rental cancellation refunds, provider
-- withdrawals (admin-approved) and promo credits.
--
-- Fixes:
--  * booking / driver hire / wash prices were taken from the client as-is;
--  * rentals paid with Razorpay never credited the host;
--  * cancelling a paid rental refunded nothing;
--  * earnings were credited at payment time, so refunds had to claw them back.

-- =====================================================================
-- 1. Platform settings (single row)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct numeric NOT NULL DEFAULT 10 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  service_fee_pct numeric NOT NULL DEFAULT 5 CHECK (service_fee_pct >= 0 AND service_fee_pct <= 100),
  gst_pct numeric NOT NULL DEFAULT 18 CHECK (gst_pct >= 0 AND gst_pct <= 100),
  min_withdrawal numeric NOT NULL DEFAULT 500 CHECK (min_withdrawal >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
CREATE POLICY "Anyone reads platform settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins update platform settings" ON public.platform_settings;
CREATE POLICY "Admins update platform settings" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- 2. Money columns
-- =====================================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_gst numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_earning numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earning_credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS base_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_gst numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_earning numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earning_credited_at timestamptz;

ALTER TABLE public.wash_bookings
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS base_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_gst numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_earning numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earning_credited_at timestamptz;

-- Backfill existing rows: old money had no fees/commission.
UPDATE public.bookings
   SET provider_earning = GREATEST(total_price - security_deposit, 0)
 WHERE provider_earning = 0;
UPDATE public.driver_bookings
   SET base_price = total_price, provider_earning = total_price
 WHERE provider_earning = 0;
UPDATE public.wash_bookings
   SET base_price = price, provider_earning = price
 WHERE provider_earning = 0;

-- Rows whose earning was already credited by the old pay-time logic.
UPDATE public.bookings b
   SET earning_credited_at = now()
 WHERE b.earning_credited_at IS NULL
   AND EXISTS (SELECT 1 FROM public.wallet_transactions t
                WHERE t.kind = 'booking_earning' AND t.booking_id = b.id);
UPDATE public.driver_bookings d
   SET earning_credited_at = now()
 WHERE d.earning_credited_at IS NULL
   AND EXISTS (SELECT 1 FROM public.wallet_transactions t
                WHERE t.kind = 'driver_earning' AND t.reference = d.id::text);

-- =====================================================================
-- 3. Wallet ledger kinds
-- =====================================================================
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind = ANY (ARRAY[
    'topup','booking_payment','booking_earning','refund','payout','adjustment',
    'driver_payment','driver_earning','driver_refund','driver_refund_reversal',
    'wash_payment','wash_refund','payout_reversal','promo_credit'
  ]));

-- =====================================================================
-- 4. Pricing functions (mirror src/lib/format.ts, src/lib/driver-pricing.ts,
--    src/lib/charges.ts — keep them in sync)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rental_base_price(
  _vehicle_id uuid, _start_date date, _end_date date, _pickup time, _dropoff time)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD; hours numeric; rem numeric; weeks numeric := 0; days numeric; subtotal numeric := 0;
BEGIN
  SELECT price_hourly, price_daily, price_weekly INTO v FROM public.vehicles WHERE id = _vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;
  hours := EXTRACT(EPOCH FROM ((_end_date + _dropoff) - (_start_date + _pickup))) / 3600.0;
  IF hours IS NULL OR hours <= 0 THEN RAISE EXCEPTION 'Drop-off must be after pickup'; END IF;

  IF hours < 24 AND COALESCE(v.price_hourly, 0) > 0 THEN
    RETURN ceil(hours) * v.price_hourly;
  END IF;

  rem := ceil(hours);
  IF COALESCE(v.price_weekly, 0) > 0 AND rem >= 168 THEN
    weeks := floor(rem / 168);
    subtotal := weeks * v.price_weekly;
    rem := rem - weeks * 168;
  END IF;
  days := ceil(rem / 24.0);
  IF days > 0 THEN subtotal := subtotal + days * COALESCE(v.price_daily, 0); END IF;
  RETURN subtotal;
END; $$;

CREATE OR REPLACE FUNCTION public.driver_base_price(
  _driver_id uuid, _rate_type text, _start_date date, _end_date date, _start time, _end time,
  OUT base numeric, OUT billed_hours integer, OUT billed_days integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d RECORD; raw_hours numeric;
BEGIN
  SELECT hourly_rate, daily_rate INTO d FROM public.drivers WHERE id = _driver_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver not found'; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date THEN
    RAISE EXCEPTION 'Pick valid dates';
  END IF;
  billed_days := (_end_date - _start_date) + 1;
  raw_hours := GREATEST(0, EXTRACT(EPOCH FROM ((_end_date + _end) - (_start_date + _start))) / 3600.0);

  IF _rate_type = 'hourly' THEN
    IF COALESCE(d.hourly_rate, 0) <= 0 THEN RAISE EXCEPTION 'This driver does not offer hourly hire'; END IF;
    IF billed_days > 1 THEN RAISE EXCEPTION 'Hourly hire must start and end on the same day'; END IF;
    billed_hours := ceil(raw_hours);
    IF billed_hours <= 0 THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
    base := billed_hours * d.hourly_rate;
    RETURN;
  END IF;

  IF COALESCE(d.daily_rate, 0) <= 0 THEN RAISE EXCEPTION 'Daily rate unavailable'; END IF;
  billed_hours := ceil(raw_hours);
  base := billed_days * d.daily_rate;
END; $$;

-- Fees for a base amount. Platform absorbs the discount; GST applies to the
-- platform's fees (service fee charged to the customer, commission charged
-- to the provider).
CREATE OR REPLACE FUNCTION public.compute_charges(_base numeric, _coupon text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD; c RECORD; disc numeric := 0; fee numeric; gst numeric; comm numeric; comm_gst numeric;
  coupon_norm text := NULLIF(upper(btrim(COALESCE(_coupon, ''))), '');
BEGIN
  IF _base IS NULL OR _base < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;

  IF coupon_norm IS NOT NULL THEN
    SELECT * INTO c FROM public.coupons
     WHERE upper(btrim(coupons.code)) = coupon_norm AND active
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at IS NULL OR ends_at >= now())
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired coupon'; END IF;
    disc := CASE WHEN c.percent_off IS NOT NULL THEN _base * c.percent_off / 100.0
                 ELSE COALESCE(c.amount_off, 0) END;
    disc := round(LEAST(_base, GREATEST(disc, 0)), 2);
  END IF;

  fee := round((_base - disc) * COALESCE(s.service_fee_pct, 0) / 100.0, 2);
  gst := round(fee * COALESCE(s.gst_pct, 0) / 100.0, 2);
  comm := round(_base * COALESCE(s.commission_pct, 0) / 100.0, 2);
  comm_gst := round(comm * COALESCE(s.gst_pct, 0) / 100.0, 2);

  RETURN jsonb_build_object(
    'base', _base,
    'coupon_code', coupon_norm,
    'discount', disc,
    'service_fee', fee,
    'gst', gst,
    'commission', comm,
    'commission_gst', comm_gst,
    'provider_earning', _base - comm - comm_gst,
    'customer_total', _base - disc + fee + gst
  );
END; $$;

-- =====================================================================
-- 5. BEFORE INSERT pricing triggers — client-sent money is ignored
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_price_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch jsonb; base numeric; dep numeric;
BEGIN
  base := public.rental_base_price(NEW.vehicle_id, NEW.start_date, NEW.end_date, NEW.pickup_time, NEW.dropoff_time);
  SELECT COALESCE(security_deposit, 0) INTO dep FROM public.vehicles WHERE id = NEW.vehicle_id;
  ch := public.compute_charges(base, NEW.coupon_code);
  NEW.base_price := base;
  NEW.security_deposit := dep;
  NEW.coupon_code := ch->>'coupon_code';
  NEW.discount := (ch->>'discount')::numeric;
  NEW.service_fee := (ch->>'service_fee')::numeric;
  NEW.gst_amount := (ch->>'gst')::numeric;
  NEW.commission_amount := (ch->>'commission')::numeric;
  NEW.commission_gst := (ch->>'commission_gst')::numeric;
  NEW.provider_earning := (ch->>'provider_earning')::numeric;
  NEW.total_price := (ch->>'customer_total')::numeric + dep;
  NEW.payment_status := 'unpaid';
  NEW.paid_at := NULL;
  NEW.earning_credited_at := NULL;
  NEW.refund_amount := 0;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_price_booking ON public.bookings;
CREATE TRIGGER trg_price_booking BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_price_booking();

CREATE OR REPLACE FUNCTION public.tg_price_driver_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch jsonb; p RECORD;
BEGIN
  SELECT * INTO p FROM public.driver_base_price(NEW.driver_id, NEW.rate_type::text, NEW.start_date, NEW.end_date, NEW.start_time, NEW.end_time);
  ch := public.compute_charges(p.base, NEW.coupon_code);
  NEW.hours := p.billed_hours;
  NEW.days := p.billed_days;
  NEW.base_price := p.base;
  NEW.coupon_code := ch->>'coupon_code';
  NEW.discount := (ch->>'discount')::numeric;
  NEW.service_fee := (ch->>'service_fee')::numeric;
  NEW.gst_amount := (ch->>'gst')::numeric;
  NEW.commission_amount := (ch->>'commission')::numeric;
  NEW.commission_gst := (ch->>'commission_gst')::numeric;
  NEW.provider_earning := (ch->>'provider_earning')::numeric;
  NEW.total_price := (ch->>'customer_total')::numeric;
  NEW.payment_status := 'unpaid';
  NEW.paid_at := NULL;
  NEW.earning_credited_at := NULL;
  NEW.refund_amount := 0;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_price_driver_booking ON public.driver_bookings;
CREATE TRIGGER trg_price_driver_booking BEFORE INSERT ON public.driver_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_price_driver_booking();

CREATE OR REPLACE FUNCTION public.tg_price_wash_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch jsonb; base numeric;
BEGIN
  SELECT price INTO base FROM public.wash_services WHERE id = NEW.service_id AND active;
  IF base IS NULL THEN RAISE EXCEPTION 'Wash service not available'; END IF;
  ch := public.compute_charges(base, NEW.coupon_code);
  NEW.base_price := base;
  NEW.coupon_code := ch->>'coupon_code';
  NEW.discount := (ch->>'discount')::numeric;
  NEW.service_fee := (ch->>'service_fee')::numeric;
  NEW.gst_amount := (ch->>'gst')::numeric;
  NEW.commission_amount := (ch->>'commission')::numeric;
  NEW.commission_gst := (ch->>'commission_gst')::numeric;
  NEW.provider_earning := (ch->>'provider_earning')::numeric;
  NEW.price := (ch->>'customer_total')::numeric;
  NEW.payment_status := 'unpaid';
  NEW.paid_at := NULL;
  NEW.earning_credited_at := NULL;
  NEW.refund_amount := 0;
  RETURN NEW;
END; $$;
-- Must fire after the existing "wash_bookings_guard" (which resets price to the
-- service price); triggers fire in name order.
DROP TRIGGER IF EXISTS wash_bookings_price ON public.wash_bookings;
CREATE TRIGGER wash_bookings_price BEFORE INSERT ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_price_wash_booking();

-- =====================================================================
-- 6. Money guard on direct client UPDATEs.
--    Deliberately NOT security definer: current_user is then the caller's
--    role, so direct PostgREST updates ('authenticated') are guarded while
--    SECURITY DEFINER RPCs and service-role server functions pass through.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_money_guard_booking()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Two IFs on purpose: OR does not short-circuit reliably, and service-role
  -- callers must never reach has_role().
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.base_price := OLD.base_price;
  NEW.security_deposit := OLD.security_deposit;
  NEW.discount := OLD.discount;
  NEW.coupon_code := OLD.coupon_code;
  NEW.service_fee := OLD.service_fee;
  NEW.gst_amount := OLD.gst_amount;
  NEW.commission_amount := OLD.commission_amount;
  NEW.commission_gst := OLD.commission_gst;
  NEW.provider_earning := OLD.provider_earning;
  NEW.total_price := OLD.total_price;
  NEW.payment_status := OLD.payment_status;
  NEW.paid_at := OLD.paid_at;
  NEW.earning_credited_at := OLD.earning_credited_at;
  NEW.refund_amount := OLD.refund_amount;
  NEW.cancelled_at := OLD.cancelled_at;
  NEW.cancelled_by := OLD.cancelled_by;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'Use the cancel action so refunds are applied';
    END IF;
    IF NEW.status = 'completed' THEN
      IF auth.uid() <> OLD.vendor_id THEN RAISE EXCEPTION 'Only the host can complete a trip'; END IF;
      IF OLD.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed bookings can be completed'; END IF;
      IF OLD.payment_status = 'paid' AND OLD.return_checked_at IS NULL THEN
        RAISE EXCEPTION 'Record the return check-out before completing the trip';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_money_guard ON public.bookings;
CREATE TRIGGER trg_money_guard BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_money_guard_booking();

CREATE OR REPLACE FUNCTION public.tg_money_guard_driver_booking()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Two IFs on purpose: OR does not short-circuit reliably, and service-role
  -- callers must never reach has_role().
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.base_price := OLD.base_price;
  NEW.discount := OLD.discount;
  NEW.coupon_code := OLD.coupon_code;
  NEW.service_fee := OLD.service_fee;
  NEW.gst_amount := OLD.gst_amount;
  NEW.commission_amount := OLD.commission_amount;
  NEW.commission_gst := OLD.commission_gst;
  NEW.provider_earning := OLD.provider_earning;
  NEW.total_price := OLD.total_price;
  NEW.payment_status := OLD.payment_status;
  NEW.paid_at := OLD.paid_at;
  NEW.earning_credited_at := OLD.earning_credited_at;
  NEW.refund_amount := OLD.refund_amount;
  NEW.cancelled_at := OLD.cancelled_at;
  NEW.cancelled_by := OLD.cancelled_by;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'Use the cancel action so refunds are applied';
    END IF;
    IF NEW.status = 'completed' THEN
      IF auth.uid() <> OLD.driver_id THEN RAISE EXCEPTION 'Only the driver can complete a hire'; END IF;
      IF OLD.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed hires can be completed'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_money_guard ON public.driver_bookings;
CREATE TRIGGER trg_money_guard BEFORE UPDATE ON public.driver_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_money_guard_driver_booking();

-- =====================================================================
-- 7. Release earnings when a paid booking completes.
--    Named so it fires after trg_money_guard (triggers fire alphabetically).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_money_settle_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    IF NEW.vendor_id <> NEW.customer_id AND NEW.provider_earning > 0 THEN
      PERFORM public.wallet_apply(NEW.vendor_id, NEW.provider_earning, 'booking_earning', NEW.id, NULL,
        'Earning from completed trip (after commission)');
    END IF;
    IF NEW.security_deposit > 0 THEN
      PERFORM public.wallet_apply(NEW.customer_id, NEW.security_deposit, 'refund', NEW.id, NULL,
        'Security deposit returned');
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_money_settle ON public.bookings;
CREATE TRIGGER trg_money_settle BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_money_settle_booking();

CREATE OR REPLACE FUNCTION public.tg_money_settle_driver_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    IF NEW.driver_id <> NEW.customer_id AND NEW.provider_earning > 0 THEN
      PERFORM public.wallet_apply(NEW.driver_id, NEW.provider_earning, 'driver_earning', NULL, NEW.id::text,
        'Earning from completed hire (after commission)');
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_money_settle ON public.driver_bookings;
CREATE TRIGGER trg_money_settle BEFORE UPDATE ON public.driver_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_money_settle_driver_booking();

-- =====================================================================
-- 8. Wallet payments no longer credit the provider (done on completion)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.wallet_pay_booking(_booking_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.wallet_pay_driver_booking(_driver_booking_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Driver has not accepted this request yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

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

-- =====================================================================
-- 9. Cancellation with refunds.
--    Tiers: >=24h before start 100%, >=2h 50%, else 0%. Provider/admin
--    cancelling = 100%. The provider keeps (1 - pct) of their earning.
--    Rental deposits are always returned in full.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; by_provider boolean; is_admin boolean; new_pay text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  by_provider := (b.vendor_id = auth.uid());
  IF NOT is_admin AND NOT by_provider AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;
  IF b.status IN ('cancelled','rejected','completed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;
  IF b.pickup_checked_at IS NOT NULL AND NOT is_admin THEN
    RAISE EXCEPTION 'The trip has started — raise a dispute instead';
  END IF;

  starts_at := (b.start_date::timestamp + b.pickup_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR by_provider OR hours_left >= 24 THEN pct := 1;
    ELSIF hours_left >= 2 THEN pct := 0.5;
    ELSE pct := 0; END IF;
    refund := b.security_deposit + round((b.total_price - b.security_deposit) * pct, 2);
    share := round(b.provider_earning * (1 - pct), 2);

    IF refund > 0 THEN
      PERFORM public.wallet_apply(b.customer_id, refund, 'refund', b.id, NULL,
        CASE WHEN pct = 1 THEN 'Full refund for cancelled booking' ELSE 'Partial refund for cancelled booking' END);
    END IF;
    IF share > 0 AND b.vendor_id <> b.customer_id AND b.earning_credited_at IS NULL THEN
      PERFORM public.wallet_apply(b.vendor_id, share, 'booking_earning', b.id, NULL,
        'Late-cancellation share (after commission)');
    END IF;
    new_pay := CASE WHEN pct = 1 THEN 'refunded' ELSE 'partially_refunded' END;
  ELSE
    new_pay := b.payment_status;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled', payment_status = new_pay, refund_amount = refund,
         earning_credited_at = CASE WHEN b.payment_status = 'paid' THEN now() ELSE earning_credited_at END,
         cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = b.id;

  RETURN jsonb_build_object('refund', refund, 'percent', pct * 100, 'provider_share', share,
                            'payment_status', new_pay, 'cancelled_by_provider', by_provider);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_driver_booking(_driver_booking_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; is_driver boolean; is_admin boolean; new_pay_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Hire not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  is_driver := (b.driver_id = auth.uid());
  IF NOT is_admin AND NOT is_driver AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;
  IF b.status IN ('cancelled','rejected','completed') THEN
    RAISE EXCEPTION 'This hire can no longer be cancelled';
  END IF;

  starts_at := (b.start_date::timestamp + b.start_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR is_driver OR hours_left >= 24 THEN pct := 1;
    ELSIF hours_left >= 2 THEN pct := 0.5;
    ELSE pct := 0; END IF;
    refund := round(COALESCE(b.total_price, 0) * pct, 2);
    share := round(b.provider_earning * (1 - pct), 2);

    IF refund > 0 THEN
      PERFORM public.wallet_apply(b.customer_id, refund, 'driver_refund', NULL, b.id::text,
        CASE WHEN pct = 1 THEN 'Full refund for cancelled driver hire' ELSE 'Partial refund for cancelled driver hire' END);
    END IF;
    IF share > 0 AND b.driver_id <> b.customer_id AND b.earning_credited_at IS NULL THEN
      PERFORM public.wallet_apply(b.driver_id, share, 'driver_earning', NULL, b.id::text,
        'Late-cancellation share (after commission)');
    END IF;
    new_pay_status := CASE WHEN pct = 1 THEN 'refunded' ELSE 'partially_refunded' END;
  ELSE
    new_pay_status := b.payment_status;
  END IF;

  UPDATE public.driver_bookings
     SET status = 'cancelled', payment_status = new_pay_status, refund_amount = refund,
         earning_credited_at = CASE WHEN b.payment_status = 'paid' THEN now() ELSE earning_credited_at END,
         cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = b.id;

  RETURN jsonb_build_object('refund', refund, 'percent', pct * 100, 'provider_share', share,
                            'payment_status', new_pay_status, 'cancelled_by_driver', is_driver);
END; $$;

-- =====================================================================
-- 10. Withdrawals (admin-approved, paid manually outside the app)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('upi','bank')),
  upi_id text,
  account_name text,
  account_number text,
  ifsc text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
  reference text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);
CREATE INDEX IF NOT EXISTS withdrawals_user_idx ON public.withdrawals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.withdrawals (status, created_at);

GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners and admins view withdrawals" ON public.withdrawals;
CREATE POLICY "Owners and admins view withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Only provider earnings can be withdrawn — never top-ups, refunds or promo credit.
CREATE OR REPLACE FUNCTION public.withdrawable_balance(_user uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := COALESCE(_user, auth.uid()); bal numeric; earned numeric; withdrawn numeric;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  IF uid <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(balance, 0) INTO bal FROM public.wallets WHERE user_id = uid;
  SELECT COALESCE(sum(amount), 0) INTO earned FROM public.wallet_transactions
   WHERE user_id = uid AND kind IN ('booking_earning','driver_earning','driver_refund_reversal');
  SELECT COALESCE(sum(amount), 0) INTO withdrawn FROM public.withdrawals
   WHERE user_id = uid AND status <> 'rejected';
  RETURN GREATEST(0, LEAST(COALESCE(bal, 0), earned - withdrawn));
END; $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric, _method text, _upi_id text DEFAULT NULL, _account_name text DEFAULT NULL,
  _account_number text DEFAULT NULL, _ifsc text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s RECORD; avail numeric; wid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = uid) THEN
    RAISE EXCEPTION 'Only hosts and drivers can withdraw earnings';
  END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;
  _amount := round(COALESCE(_amount, 0), 2);
  IF _amount < COALESCE(s.min_withdrawal, 0) OR _amount <= 0 THEN
    RAISE EXCEPTION 'Minimum withdrawal is Rs %', s.min_withdrawal;
  END IF;

  -- Serialise concurrent requests from the same user.
  PERFORM 1 FROM public.wallets WHERE user_id = uid FOR UPDATE;
  avail := public.withdrawable_balance(uid);
  IF _amount > avail THEN RAISE EXCEPTION 'You can withdraw at most Rs %', avail; END IF;

  IF _method = 'upi' THEN
    IF COALESCE(btrim(_upi_id), '') !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID';
    END IF;
  ELSIF _method = 'bank' THEN
    IF COALESCE(btrim(_account_name), '') = '' THEN RAISE EXCEPTION 'Enter the account holder name'; END IF;
    IF COALESCE(btrim(_account_number), '') !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid account number'; END IF;
    IF upper(COALESCE(btrim(_ifsc), '')) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid IFSC code'; END IF;
  ELSE
    RAISE EXCEPTION 'Choose UPI or bank transfer';
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, upi_id, account_name, account_number, ifsc)
  VALUES (uid, _amount, _method,
          CASE WHEN _method = 'upi' THEN btrim(_upi_id) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_name) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_number) END,
          CASE WHEN _method = 'bank' THEN upper(btrim(_ifsc)) END)
  RETURNING id INTO wid;

  PERFORM public.wallet_apply(uid, -_amount, 'payout', NULL, wid::text, 'Withdrawal requested');
  PERFORM public.notify_admins('New withdrawal request', 'Rs ' || _amount || ' via ' || _method || ' — review in Payouts.', '/admin');
  RETURN wid;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_decide_withdrawal(
  _withdrawal_id uuid, _decision text, _reference text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'This withdrawal was already processed'; END IF;

  IF _decision = 'paid' THEN
    IF COALESCE(btrim(_reference), '') = '' THEN RAISE EXCEPTION 'Enter the payment reference (UTR)'; END IF;
    UPDATE public.withdrawals
       SET status = 'paid', reference = btrim(_reference), admin_note = NULLIF(btrim(COALESCE(_note, '')), ''),
           processed_at = now(), processed_by = auth.uid()
     WHERE id = w.id;
    PERFORM public.notify_user(w.user_id, 'Payout sent',
      'Rs ' || w.amount || ' has been paid out. Reference ' || btrim(_reference) || '.', '/wallet');
  ELSIF _decision = 'rejected' THEN
    UPDATE public.withdrawals
       SET status = 'rejected', admin_note = NULLIF(btrim(COALESCE(_note, '')), ''),
           processed_at = now(), processed_by = auth.uid()
     WHERE id = w.id;
    PERFORM public.wallet_apply(w.user_id, w.amount, 'payout_reversal', NULL, w.id::text, 'Withdrawal rejected — amount returned');
    PERFORM public.notify_user(w.user_id, 'Withdrawal rejected',
      COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''), 'The amount is back in your wallet.'), '/wallet');
  ELSE
    RAISE EXCEPTION 'Decision must be paid or rejected';
  END IF;
END; $$;

-- =====================================================================
-- 11. Promo credits (admin)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_grant_credit(_email text, _amount numeric, _note text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; bal numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF COALESCE(_amount, 0) <= 0 OR _amount > 100000 THEN RAISE EXCEPTION 'Amount must be between 1 and 100000'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'No user with that email'; END IF;
  bal := public.wallet_apply(uid, round(_amount, 2), 'promo_credit', NULL, NULL,
           COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''), 'Promotional credit'));
  RETURN bal;
END; $$;

-- =====================================================================
-- 12. Coupons: admin manages through the existing "Admins manage coupons"
--     policy; table grants were revoked earlier, restore them (RLS still
--     limits rows to admins because the public read policy was dropped).
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;

-- =====================================================================
-- 13. Function privileges
-- =====================================================================
REVOKE ALL ON FUNCTION public.rental_base_price(uuid, date, date, time, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_base_price(uuid, text, date, date, time, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_charges(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_charges(numeric, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.tg_price_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_price_driver_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_price_wash_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_money_settle_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_money_settle_driver_booking() FROM PUBLIC, anon, authenticated;
-- Guard triggers run as the caller, so the caller must be able to execute them.
GRANT EXECUTE ON FUNCTION public.tg_money_guard_booking() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tg_money_guard_driver_booking() TO authenticated, anon;

REVOKE ALL ON FUNCTION public.wallet_pay_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_pay_booking(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wallet_pay_driver_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_pay_driver_booking(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_driver_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_driver_booking(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.withdrawable_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdrawable_balance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_withdrawal(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_withdrawal(uuid, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_grant_credit(text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_credit(text, numeric, text) TO authenticated;
