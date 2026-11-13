from django.db import migrations

# DP wave 2: only the driver accepts, declines or completes a hire, and only from the right state.
# Before this a customer could confirm their own request, and a driver could flip a paid hire to
# 'rejected', after which cancel_driver_booking() refused to refund it.
SQL = r"""
CREATE OR REPLACE FUNCTION public.tg_money_guard_driver_booking() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
    IF auth.uid() IS DISTINCT FROM OLD.driver_id THEN
      RAISE EXCEPTION 'Only the driver can change the hire status';
    END IF;
    IF NEW.status IN ('confirmed', 'rejected') AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending requests can be accepted or declined';
    END IF;
    IF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'A hire cannot go back to pending';
    END IF;
    IF NEW.status = 'completed' AND OLD.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed hires can be completed';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0007_guards_and_pr14_schema")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
