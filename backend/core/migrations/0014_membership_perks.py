from django.db import migrations

SQL = r"""
DROP FUNCTION IF EXISTS public.compute_charges(numeric, text);

CREATE OR REPLACE FUNCTION public.compute_charges(
  _base numeric,
  _coupon text DEFAULT NULL::text,
  _membership_plan text DEFAULT 'free'::text
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s RECORD; c RECORD; disc numeric := 0; fee numeric := 0; gst numeric := 0; comm numeric; comm_gst numeric;
  coupon_norm text := NULLIF(upper(btrim(COALESCE(_coupon, ''))), '');
  plan_norm text := lower(COALESCE(_membership_plan, 'free'));
  m_disc numeric := 0;
BEGIN
  IF _base IS NULL OR _base < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;

  -- 10% discount on self-drive and driver hires for Plus; 15% for Black VIP
  IF plan_norm = 'plus' THEN
    m_disc := round(_base * 0.10, 2);
  ELSIF plan_norm = 'black' THEN
    m_disc := round(_base * 0.15, 2);
  END IF;

  IF coupon_norm IS NOT NULL AND coupon_norm <> 'MEMBERSHIP_FREE_WASH' THEN
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

  disc := LEAST(_base, disc + m_disc);

  -- 0% platform convenience fees for Plus and Black VIP members
  IF plan_norm IN ('plus', 'black') THEN
    fee := 0;
    gst := 0;
  ELSE
    fee := round((_base - disc) * COALESCE(s.service_fee_pct, 0) / 100.0, 2);
    gst := round(fee * COALESCE(s.gst_pct, 0) / 100.0, 2);
  END IF;

  comm := round(_base * COALESCE(s.commission_pct, 0) / 100.0, 2);
  comm_gst := round(comm * COALESCE(s.gst_pct, 0) / 100.0, 2);

  RETURN jsonb_build_object(
    'base', _base,
    'coupon_code', coupon_norm,
    'membership_plan', plan_norm,
    'membership_discount', m_disc,
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


CREATE OR REPLACE FUNCTION public.tg_price_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ch jsonb; base numeric; dep numeric; m_plan text := 'free';
BEGIN
  base := public.rental_base_price(NEW.vehicle_id, NEW.start_date, NEW.end_date, NEW.pickup_time, NEW.dropoff_time);
  SELECT COALESCE(security_deposit, 0) INTO dep FROM public.vehicles WHERE id = NEW.vehicle_id;

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = NEW.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  -- Black VIP zero security deposit requirement
  IF m_plan = 'black' THEN
    dep := 0;
  END IF;

  ch := public.compute_charges(base, NEW.coupon_code, m_plan);
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
DECLARE ch jsonb; p RECORD; m_plan text := 'free';
BEGIN
  SELECT * INTO p FROM public.driver_base_price(NEW.driver_id, NEW.rate_type::text, NEW.start_date, NEW.end_date, NEW.start_time, NEW.end_time);

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = NEW.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  ch := public.compute_charges(p.base, NEW.coupon_code, m_plan);
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
DECLARE ch jsonb; base numeric; m_plan text := 'free';
BEGIN
  SELECT price INTO base FROM public.wash_services WHERE id = NEW.service_id AND active;
  IF base IS NULL THEN RAISE EXCEPTION 'Wash service not available'; END IF;

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = NEW.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  -- 1 free doorstep wash per month (3 for Black VIP)
  IF upper(btrim(COALESCE(NEW.coupon_code, ''))) = 'MEMBERSHIP_FREE_WASH' AND m_plan IN ('plus', 'black') THEN
    NEW.base_price := base;
    NEW.coupon_code := 'MEMBERSHIP_FREE_WASH';
    NEW.discount := base;
    NEW.service_fee := 0;
    NEW.gst_amount := 0;
    NEW.commission_amount := 0;
    NEW.commission_gst := 0;
    NEW.provider_earning := base;
    NEW.price := 0;
    NEW.payment_status := 'paid';
    NEW.paid_at := now();
    NEW.earning_credited_at := NULL;
    NEW.refund_amount := 0;
    RETURN NEW;
  END IF;

  ch := public.compute_charges(base, NEW.coupon_code, m_plan);
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


CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; by_provider boolean; is_admin boolean; new_pay text;
  m_plan text := 'free';
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

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = b.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR by_provider THEN
      pct := 1;
    ELSIF m_plan = 'black' THEN
      -- Free cancellation up to 2 hours before start for Black VIP
      IF hours_left >= 2 THEN pct := 1;
      ELSIF hours_left >= 0 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSIF m_plan = 'plus' THEN
      -- Free cancellation up to 6 hours before start for Plus members
      IF hours_left >= 6 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSE
      -- Standard cancellation policy
      IF hours_left >= 24 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    END IF;

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


CREATE OR REPLACE FUNCTION public.cancel_driver_booking(_driver_booking_id uuid, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; is_driver boolean; is_admin boolean; new_pay_status text;
  m_plan text := 'free';
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

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = b.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR is_driver THEN
      pct := 1;
    ELSIF m_plan = 'black' THEN
      IF hours_left >= 2 THEN pct := 1;
      ELSIF hours_left >= 0 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSIF m_plan = 'plus' THEN
      IF hours_left >= 6 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSE
      IF hours_left >= 24 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    END IF;

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

  RETURN jsonb_build_object('refund', refund, 'percent', pct * 100, 'driver_share', share,
                            'payment_status', new_pay_status, 'cancelled_by_driver', is_driver);
END; $$;
"""

REVERSE_SQL = r"""
-- No-op reverse
"""

class Migration(migrations.Migration):
    dependencies = [("core", "0013_user_membership")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
