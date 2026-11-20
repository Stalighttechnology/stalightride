from django.db import migrations

SQL = r"""
-- 1. Ensure 'platform_fee', 'commission_earning', and 'membership_payment' are allowed in wallet_transactions
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK (kind = ANY (ARRAY[
  'topup'::text, 'booking_payment'::text, 'booking_earning'::text, 'refund'::text,
  'payout'::text, 'adjustment'::text, 'driver_payment'::text, 'driver_earning'::text,
  'driver_refund'::text, 'driver_refund_reversal'::text, 'wash_payment'::text,
  'wash_refund'::text, 'payout_reversal'::text, 'promo_credit'::text,
  'wash_earning'::text, 'referral_bonus'::text, 'membership_payment'::text,
  'platform_fee'::text, 'commission_earning'::text
]));

-- 2. Allow admin to withdraw platform fees and commission earnings
CREATE OR REPLACE FUNCTION public.withdrawable_balance(_user uuid DEFAULT NULL::uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := COALESCE(_user, auth.uid()); bal numeric; earned numeric; withdrawn numeric;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  IF uid <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(balance, 0) INTO bal FROM public.wallets WHERE user_id = uid;
  SELECT COALESCE(sum(amount), 0) INTO earned FROM public.wallet_transactions
   WHERE user_id = uid AND kind IN ('booking_earning','driver_earning','driver_refund_reversal','wash_earning','platform_fee','commission_earning');
  SELECT COALESCE(sum(amount), 0) INTO withdrawn FROM public.withdrawals
   WHERE user_id = uid AND status <> 'rejected';
  RETURN GREATEST(0, LEAST(COALESCE(bal, 0), earned - withdrawn));
END; $$;

-- 3. Route service_fee to admin wallet upon rental booking completion
CREATE OR REPLACE FUNCTION public.tg_money_settle_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_uid uuid;
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
    IF COALESCE(NEW.service_fee, 0) > 0 THEN
      SELECT user_id INTO admin_uid FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
      IF admin_uid IS NOT NULL THEN
        PERFORM public.wallet_apply(admin_uid, NEW.service_fee, 'platform_fee', NEW.id, NULL,
          'Platform service fee from rental booking');
        PERFORM public.notify_admins('Service fee credited',
          'Platform service fee of Rs ' || NEW.service_fee || ' credited to admin wallet.', '/admin');
      END IF;
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;

-- 4. Route service_fee to admin wallet upon driver booking completion
CREATE OR REPLACE FUNCTION public.tg_money_settle_driver_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_uid uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    IF NEW.driver_id <> NEW.customer_id AND NEW.provider_earning > 0 THEN
      PERFORM public.wallet_apply(NEW.driver_id, NEW.provider_earning, 'driver_earning', NULL, NEW.id::text,
        'Earning from completed hire (after commission)');
    END IF;
    IF COALESCE(NEW.service_fee, 0) > 0 THEN
      SELECT user_id INTO admin_uid FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
      IF admin_uid IS NOT NULL THEN
        PERFORM public.wallet_apply(admin_uid, NEW.service_fee, 'platform_fee', NULL, NEW.id::text,
          'Platform service fee from driver hire');
        PERFORM public.notify_admins('Service fee credited',
          'Platform service fee of Rs ' || NEW.service_fee || ' credited to admin wallet.', '/admin');
      END IF;
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;

-- 5. Route service_fee to admin wallet upon vehicle wash completion
CREATE OR REPLACE FUNCTION public.tg_wash_settle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  payee uuid;
  admin_uid uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    payee := COALESCE(NEW.assigned_cleaner_id,
                      (SELECT id FROM public.wash_centers WHERE id = NEW.assigned_vendor_id));
    IF payee IS NOT NULL AND payee <> NEW.customer_id AND COALESCE(NEW.provider_earning, 0) > 0 THEN
      PERFORM public.wallet_apply(payee, NEW.provider_earning, 'wash_earning', NULL, NEW.id::text,
        'Earning from completed wash (after commission)');
    END IF;
    IF COALESCE(NEW.service_fee, 0) > 0 THEN
      SELECT user_id INTO admin_uid FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
      IF admin_uid IS NOT NULL THEN
        PERFORM public.wallet_apply(admin_uid, NEW.service_fee, 'platform_fee', NULL, NEW.id::text,
          'Platform service fee from wash booking');
        PERFORM public.notify_admins('Service fee credited',
          'Platform service fee of Rs ' || NEW.service_fee || ' credited to admin wallet.', '/admin');
      END IF;
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;

-- 6. Clarify notifications to host so service_fee is not misrepresented as host payment
CREATE OR REPLACE FUNCTION public.tg_notify_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
      COALESCE(v_title,'A vehicle') || ' · ' || NEW.start_date || ' — ' || NEW.end_date, '/vendor?tab=bookings');
    PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
      'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
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
      PERFORM public.notify_user(NEW.customer_id, 'Booking cancelled', 'Your trip was cancelled.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Booking cancelled', 'A trip on ' || COALESCE(v_title,'your vehicle') || ' was cancelled.', '/vendor?tab=bookings');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Trip completed', 'Rate your ride and view your invoice.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Trip completed', COALESCE(v_title,'Your vehicle') || ' is back. Earnings updated.', '/vendor?tab=bookings');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'Payment received',
      'Booking secured! Estimated earning: Rs ' || COALESCE(NEW.provider_earning, 0) || ' for ' || COALESCE(v_title,'your vehicle') || ' (platform service fee routed to Synchoo).', '/vendor?tab=payouts');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful',
      'Your booking is confirmed. Show your QR at pickup.', '/bookings');
  END IF;

  IF NEW.pickup_checked_at IS NOT NULL AND OLD.pickup_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Pickup confirmed', 'Handover verified by QR. Drive safe!', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Pickup confirmed', 'QR check-in completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor');
  END IF;

  IF NEW.return_checked_at IS NOT NULL AND OLD.return_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Return confirmed', 'Vehicle returned and verified by QR.', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Return confirmed', 'QR check-out completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor');
  END IF;

  RETURN NEW;
END; $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0028_complete_booking_rpc'),
    ]

    operations = [
        migrations.RunSQL(SQL),
    ]
