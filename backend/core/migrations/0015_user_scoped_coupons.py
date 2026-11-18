from django.db import migrations

SQL = r"""
-- 1. Alter public.coupons to support user ownership, specific service scoping, and single-use tracking
ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS used_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_coupons_user_id ON public.coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_service ON public.coupons(service);
CREATE INDEX IF NOT EXISTS idx_coupons_code_upper ON public.coupons((upper(btrim(code))));

-- 2. Drop existing functions to prevent signature ambiguities
DROP FUNCTION IF EXISTS public.validate_coupon(text);
DROP FUNCTION IF EXISTS public.validate_coupon(text, text);
DROP FUNCTION IF EXISTS public.compute_charges(numeric, text);
DROP FUNCTION IF EXISTS public.compute_charges(numeric, text, text);

-- 3. Replace validate_coupon with user scoping, usage checking, and service validation
CREATE OR REPLACE FUNCTION public.validate_coupon(
    _code text,
    _service text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c RECORD;
  coupon_norm text := NULLIF(upper(btrim(COALESCE(_code, ''))), '');
  cur_uid uuid := auth.uid();
BEGIN
  IF coupon_norm IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon code is required');
  END IF;

  SELECT * INTO c FROM public.coupons
   WHERE upper(btrim(code)) = coupon_norm
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not found');
  END IF;

  IF NOT c.active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is inactive');
  END IF;

  IF c.starts_at IS NOT NULL AND c.starts_at > (now() + interval '1 minute') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not active yet');
  END IF;

  IF c.ends_at IS NOT NULL AND c.ends_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon has expired');
  END IF;

  IF c.used IS TRUE THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon has already been used');
  END IF;

  IF c.user_id IS NOT NULL AND (cur_uid IS NULL OR c.user_id <> cur_uid) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is exclusive to another account');
  END IF;

  IF _service IS NOT NULL AND c.service IS NOT NULL AND c.service <> 'all' AND lower(c.service) <> lower(_service) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'Coupon is only valid for ' || c.service || ' bookings',
      'service', c.service
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code', c.code,
    'percent_off', c.percent_off,
    'amount_off', c.amount_off,
    'service', c.service,
    'user_id', c.user_id
  );
END; $$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_coupon(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.validate_coupon(text, text) TO service_role;

-- 4. Replace compute_charges with user authorization and service matching
CREATE OR REPLACE FUNCTION public.compute_charges(
    _base numeric,
    _coupon text DEFAULT NULL::text,
    _service text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s RECORD; c RECORD; disc numeric := 0; fee numeric; gst numeric; comm numeric; comm_gst numeric;
  coupon_norm text := NULLIF(upper(btrim(COALESCE(_coupon, ''))), '');
  cur_uid uuid := auth.uid();
BEGIN
  IF _base IS NULL OR _base < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;

  IF coupon_norm IS NOT NULL THEN
    SELECT * INTO c FROM public.coupons
     WHERE upper(btrim(coupons.code)) = coupon_norm
     LIMIT 1;

    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found'; END IF;
    IF NOT c.active THEN RAISE EXCEPTION 'Coupon is inactive'; END IF;
    IF c.starts_at IS NOT NULL AND c.starts_at > (now() + interval '1 minute') THEN
      RAISE EXCEPTION 'Coupon is not active yet';
    END IF;
    IF c.ends_at IS NOT NULL AND c.ends_at < now() THEN
      RAISE EXCEPTION 'Coupon has expired';
    END IF;
    IF c.used IS TRUE THEN
      RAISE EXCEPTION 'Coupon has already been used';
    END IF;
    IF c.user_id IS NOT NULL AND cur_uid IS NOT NULL AND c.user_id <> cur_uid THEN
      RAISE EXCEPTION 'Coupon belongs to another account';
    END IF;
    IF _service IS NOT NULL AND c.service IS NOT NULL AND c.service <> 'all' AND lower(c.service) <> lower(_service) THEN
      RAISE EXCEPTION 'Coupon % is only valid for % bookings', c.code, c.service;
    END IF;

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

REVOKE ALL ON FUNCTION public.compute_charges(numeric, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.compute_charges(numeric, text, text) TO anon;
GRANT ALL ON FUNCTION public.compute_charges(numeric, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.compute_charges(numeric, text, text) TO service_role;

-- 5. Update triggers for rental, driver, and wash bookings to pass the exact service
CREATE OR REPLACE FUNCTION public.tg_price_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ch jsonb; base numeric; dep numeric;
BEGIN
  base := public.rental_base_price(NEW.vehicle_id, NEW.start_date, NEW.end_date, NEW.pickup_time, NEW.dropoff_time);
  SELECT COALESCE(security_deposit, 0) INTO dep FROM public.vehicles WHERE id = NEW.vehicle_id;
  ch := public.compute_charges(base, NEW.coupon_code, 'rental');
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

CREATE OR REPLACE FUNCTION public.tg_price_driver_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ch jsonb; p RECORD;
BEGIN
  SELECT * INTO p FROM public.driver_base_price(NEW.driver_id, NEW.rate_type::text, NEW.start_date, NEW.end_date, NEW.start_time, NEW.end_time);
  ch := public.compute_charges(p.base, NEW.coupon_code, 'driver');
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

CREATE OR REPLACE FUNCTION public.tg_price_wash_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ch jsonb; base numeric;
BEGIN
  SELECT price INTO base FROM public.wash_services WHERE id = NEW.service_id AND active;
  IF base IS NULL THEN RAISE EXCEPTION 'Wash service not available'; END IF;
  ch := public.compute_charges(base, NEW.coupon_code, 'wash');
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
  RETURN NEW;
END; $$;

-- 6. Trigger to mark single-use account coupons as used upon booking creation
CREATE OR REPLACE FUNCTION public.tg_mark_coupon_used() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.coupon_code IS NOT NULL AND length(btrim(NEW.coupon_code)) > 0 THEN
    UPDATE public.coupons
       SET used = true, used_at = now()
     WHERE upper(btrim(code)) = upper(btrim(NEW.coupon_code))
       AND user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mark_coupon_used_rental ON public.bookings;
CREATE TRIGGER trg_mark_coupon_used_rental
    AFTER INSERT ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.tg_mark_coupon_used();

DROP TRIGGER IF EXISTS trg_mark_coupon_used_driver ON public.driver_bookings;
CREATE TRIGGER trg_mark_coupon_used_driver
    AFTER INSERT ON public.driver_bookings
    FOR EACH ROW EXECUTE FUNCTION public.tg_mark_coupon_used();

DROP TRIGGER IF EXISTS trg_mark_coupon_used_wash ON public.wash_bookings;
CREATE TRIGGER trg_mark_coupon_used_wash
    AFTER INSERT ON public.wash_bookings
    FOR EACH ROW EXECUTE FUNCTION public.tg_mark_coupon_used();

-- 7. RLS on coupons: users can only see coupons if public (user_id IS NULL) or owned by themselves
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read public or own coupons" ON public.coupons;
CREATE POLICY "Users read public or own coupons" ON public.coupons
    FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());

GRANT SELECT ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;

-- 8. Seed the user's initial ₹500 self-drive rental coupon
INSERT INTO public.coupons (code, amount_off, user_id, service, active, used, starts_at, ends_at)
SELECT 'STAR-RENT500-VIP', 500, p.id, 'rental', true, false, now(), now() + interval '60 days'
FROM public.profiles p
WHERE p.id = '300f6cdf-9483-4c53-accc-f6141126c96f'
ON CONFLICT DO NOTHING;

-- Also seed into claimed_vouchers if not already present
INSERT INTO public.claimed_vouchers (user_id, voucher_id, title, code, category, points_cost, terms, expires_at, status)
SELECT p.id, 'rw-1', 'Flat ₹500 OFF on Self-Drive Car Rental', 'STAR-RENT500-VIP', 'Rides', 500,
       'Min. booking value ₹2,000. Valid on all self-drive cars.', now() + interval '60 days', 'active'
FROM public.profiles p
WHERE p.id = '300f6cdf-9483-4c53-accc-f6141126c96f'
  AND NOT EXISTS (SELECT 1 FROM public.claimed_vouchers WHERE code = 'STAR-RENT500-VIP');
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS trg_mark_coupon_used_wash ON public.wash_bookings;
DROP TRIGGER IF EXISTS trg_mark_coupon_used_driver ON public.driver_bookings;
DROP TRIGGER IF EXISTS trg_mark_coupon_used_rental ON public.bookings;
DROP FUNCTION IF EXISTS public.tg_mark_coupon_used();
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0014_loyalty_and_rewards")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
