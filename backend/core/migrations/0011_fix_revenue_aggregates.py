from django.db import migrations

# WA-08.7: admin_revenue_aggregates() read platform_settings.commission_rental_pct and friends, which don't
# exist, so it always failed ("record v_settings has no field ...") and Revenue & Fees fell back to a
# client-side estimate at made-up rates. Every booking already stores what the platform earned on it, so
# sum that instead; provider payouts are paid withdrawals.
SQL = r"""
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

  SELECT COALESCE(SUM(total_price), 0) INTO v_rental_vol FROM public.bookings
   WHERE payment_status = 'paid' OR status = 'completed';
  SELECT COALESCE(SUM(total_price), 0) INTO v_driver_vol FROM public.driver_bookings
   WHERE payment_status = 'paid' OR status = 'completed';
  SELECT COALESCE(SUM(price), 0) INTO v_wash_vol FROM public.wash_bookings
   WHERE payment_status = 'paid' OR status = 'completed';
  -- Pool fares are settled with the driver in cash/UPI: volume only, no platform cut.
  SELECT COALESCE(SUM(pt.fare_per_seat * pr.seats), 0) INTO v_pool_vol
    FROM public.pool_requests pr JOIN public.pool_trips pt ON pr.trip_id = pt.id
   WHERE pr.status IN ('confirmed', 'completed');

  -- What the platform kept: commission on the provider's share plus the customer service fee,
  -- on bookings whose money was taken and not fully refunded.
  SELECT COALESCE(SUM(commission_amount + service_fee), 0) INTO v_rev FROM (
    SELECT commission_amount, service_fee FROM public.bookings
     WHERE payment_status IN ('paid', 'partially_refunded')
    UNION ALL
    SELECT commission_amount, service_fee FROM public.driver_bookings
     WHERE payment_status IN ('paid', 'partially_refunded')
    UNION ALL
    SELECT commission_amount, service_fee FROM public.wash_bookings
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
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0010_my_referrals")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
