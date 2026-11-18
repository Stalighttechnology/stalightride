from django.db import migrations

SQL = """
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
  IF NEW.price <= 0 THEN
    NEW.payment_status := 'paid';
    NEW.paid_at := now();
  ELSE
    NEW.payment_status := 'unpaid';
    NEW.paid_at := NULL;
  END IF;
  NEW.earning_credited_at := NULL;
  NEW.refund_amount := 0;
  RETURN NEW;
END; $$;
"""

REVERSE_SQL = """
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
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_membership_perks"),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE_SQL),
    ]
