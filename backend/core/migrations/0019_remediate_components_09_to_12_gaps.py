from django.db import migrations

SQL = r"""
-- 1. Add missing platform_settings columns for admin parameters (GAP-16)
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS maintenance_mode boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS instant_confirm_default boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS sos_phone text DEFAULT '+91 80 4567 8900',
    ADD COLUMN IF NOT EXISTS min_driver_advance_hours numeric DEFAULT 2,
    ADD COLUMN IF NOT EXISTS max_wallet_topup numeric DEFAULT 200000,
    ADD COLUMN IF NOT EXISTS commission_rental_pct numeric DEFAULT 10,
    ADD COLUMN IF NOT EXISTS commission_driver_pct numeric DEFAULT 10,
    ADD COLUMN IF NOT EXISTS commission_wash_pct numeric DEFAULT 15,
    ADD COLUMN IF NOT EXISTS commission_pool_pct numeric DEFAULT 5;

-- 2. Add compensation columns to incidents table (GAP-13)
ALTER TABLE public.incidents
    ADD COLUMN IF NOT EXISTS compensation_amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS compensated_to uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS resolution_type text DEFAULT 'dismissed';

-- 3. Function to resolve damage disputes with monetary compensation from deposit/wallet (GAP-13)
CREATE OR REPLACE FUNCTION public.resolve_dispute_compensation(
    _incident_id uuid,
    _amount numeric,
    _notes text,
    _award_to uuid DEFAULT NULL::uuid
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    inc RECORD;
    target_award uuid;
    award_amt numeric := COALESCE(_amount, 0);
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Admins only';
    END IF;

    SELECT * INTO inc FROM public.incidents WHERE id = _incident_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident not found';
    END IF;

    target_award := COALESCE(_award_to, inc.reporter_id);

    IF award_amt > 0 THEN
        IF target_award IS NULL THEN
            RAISE EXCEPTION 'Target recipient required for compensation';
        END IF;

        PERFORM public.wallet_apply(
            target_award,
            award_amt,
            'damage_compensation',
            inc.id::text,
            'Dispute resolution damage compensation: ' || COALESCE(_notes, 'Settlement')
        );
    END IF;

    UPDATE public.incidents
       SET status = 'resolved',
           admin_notes = COALESCE(admin_notes || E'\n', '') || COALESCE(_notes, 'Resolved with compensation'),
           compensation_amount = award_amt,
           compensated_to = target_award,
           resolution_type = CASE WHEN award_amt > 0 THEN 'compensated' ELSE 'dismissed' END,
           updated_at = now()
     WHERE id = _incident_id;

    IF award_amt > 0 AND target_award IS NOT NULL THEN
        PERFORM public.notify_user(
            target_award,
            'Dispute Resolved: Compensation Credited',
            'You have been awarded ₹' || award_amt::text || ' for incident #' || substr(_incident_id::text, 1, 8),
            '/wallet'
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'incident_id', _incident_id,
        'compensation_amount', award_amt,
        'compensated_to', target_award,
        'status', 'resolved'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_dispute_compensation(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_compensation(uuid, numeric, text, uuid) TO service_role;

-- 4. Exclude refundable deposits from gross volume & factor coupon discounts into net revenue (GAP-23)
CREATE OR REPLACE FUNCTION public.admin_revenue_aggregates() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rental_vol numeric; v_driver_vol numeric; v_wash_vol numeric; v_pool_vol numeric;
  v_rev numeric; v_payouts numeric; v_refunds numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  -- Rental volume excludes refundable security deposits
  SELECT COALESCE(SUM(total_price - COALESCE(security_deposit, 0)), 0) INTO v_rental_vol FROM public.bookings
   WHERE payment_status = 'paid' OR status = 'completed';

  SELECT COALESCE(SUM(total_price), 0) INTO v_driver_vol FROM public.driver_bookings
   WHERE payment_status = 'paid' OR status = 'completed';

  SELECT COALESCE(SUM(price), 0) INTO v_wash_vol FROM public.wash_bookings
   WHERE payment_status = 'paid' OR status = 'completed';

  -- Pool fares are settled with the driver in cash/UPI: volume only, no platform cut.
  SELECT COALESCE(SUM(pt.fare_per_seat * pr.seats), 0) INTO v_pool_vol
    FROM public.pool_requests pr JOIN public.pool_trips pt ON pr.trip_id = pt.id
   WHERE pr.status IN ('confirmed', 'completed');

  -- Platform net revenue: commission + service fee minus platform-funded coupon discounts
  SELECT COALESCE(SUM(commission_amount + service_fee - COALESCE(discount, 0)), 0) INTO v_rev FROM (
    SELECT commission_amount, service_fee, discount FROM public.bookings
     WHERE payment_status IN ('paid', 'partially_refunded')
    UNION ALL
    SELECT commission_amount, service_fee, discount FROM public.driver_bookings
     WHERE payment_status IN ('paid', 'partially_refunded')
    UNION ALL
    SELECT commission_amount, service_fee, 0::numeric AS discount FROM public.wash_bookings
     WHERE payment_status IN ('paid', 'partially_refunded')
  ) kept;

  SELECT COALESCE(SUM(amount), 0) INTO v_payouts FROM public.withdrawals WHERE status = 'paid';

  SELECT COALESCE((SELECT SUM(refund_amount) FROM public.bookings WHERE refund_amount > 0), 0)
       + COALESCE((SELECT SUM(refund_amount) FROM public.driver_bookings WHERE refund_amount > 0), 0)
       + COALESCE((SELECT SUM(refund_amount) FROM public.wash_bookings WHERE refund_amount > 0), 0)
    INTO v_refunds;

  RETURN jsonb_build_object(
    'gmv', v_rental_vol + v_driver_vol + v_wash_vol + v_pool_vol,
    'platform_revenue', round(v_rev, 2),
    'provider_payouts', v_payouts,
    'refunds', v_refunds,
    'rentals_volume', v_rental_vol,
    'driver_volume', v_driver_vol,
    'wash_volume', v_wash_vol,
    'pool_volume', v_pool_vol
  );
END;
$$;

-- 5. Award loyalty points into loyalty_ledger on trip completion (GAP-17)
CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    cust_plan text := 'free';
    mult numeric := 1.0;
    pts integer;
    amt numeric;
BEGIN
    IF (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed')
       OR (TG_OP = 'UPDATE' AND NEW.payment_status = 'paid' AND OLD.payment_status <> 'paid' AND NEW.status = 'completed') THEN
        
        amt := COALESCE(NEW.total_price, 0);
        IF amt <= 0 THEN
            RETURN NEW;
        END IF;

        SELECT COALESCE(membership_plan, 'free') INTO cust_plan
          FROM public.profiles
         WHERE id = NEW.customer_id;

        IF cust_plan = 'black' THEN
            mult := 2.0;
        ELSIF cust_plan = 'plus' THEN
            mult := 1.5;
        ELSE
            mult := 1.0;
        END IF;

        pts := round((amt / 10.0) * mult);
        IF pts > 0 THEN
            INSERT INTO public.loyalty_ledger (user_id, amount, kind, title, description)
            VALUES (
                NEW.customer_id,
                pts,
                'trip_completion',
                'Completed Trip Rewards',
                'Earned ' || pts || ' points for completed booking #' || substr(NEW.id::text, 1, 8)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_award_loyalty_points ON public.bookings;
CREATE TRIGGER trg_booking_award_loyalty_points
    AFTER UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.award_loyalty_points_on_completion();

-- 6. Enforce category minimum deposit rules on vehicle listings (GAP-22)
CREATE OR REPLACE FUNCTION public.check_vehicle_category_rules() RETURNS trigger
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    rule_min numeric := 0;
BEGIN
    IF NEW.security_deposit IS NOT NULL AND NEW.security_deposit > 0 THEN
        SELECT min_deposit INTO rule_min
          FROM public.category_rules
         WHERE lower(category) = lower(NEW.category::text)
         LIMIT 1;

        IF rule_min IS NOT NULL AND rule_min > 0 AND NEW.security_deposit < rule_min THEN
            RAISE EXCEPTION 'Security deposit (₹%) cannot be lower than the category minimum of ₹%',
                NEW.security_deposit, rule_min;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_category_rules ON public.vehicles;
CREATE TRIGGER trg_vehicles_category_rules
    BEFORE INSERT OR UPDATE OF category, security_deposit ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_vehicle_category_rules();
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS trg_vehicles_category_rules ON public.vehicles;
DROP FUNCTION IF EXISTS public.check_vehicle_category_rules();
DROP TRIGGER IF EXISTS trg_booking_award_loyalty_points ON public.bookings;
DROP FUNCTION IF EXISTS public.award_loyalty_points_on_completion();
DROP FUNCTION IF EXISTS public.resolve_dispute_compensation(uuid, numeric, text, uuid);
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0018_user_scoped_coupons")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
