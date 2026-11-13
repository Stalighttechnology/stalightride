"""Bring existing databases up to PR #14's schema.sql, and close two self-approval holes.

PR #14 edited only schema.sql, which loads on fresh databases alone; everything here is
idempotent so it also runs cleanly on those. New: customers can no longer approve their
own licence (profiles guard) or confirm their own booking (money guard status rules).
"""

from django.db import migrations

SQL = r"""
-- PR #14: cleaner pool dispatch
CREATE OR REPLACE FUNCTION public.admin_decide_wash_booking(_wash_booking_id uuid, _decision text, _vendor_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b RECORD; refund numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _decision NOT IN ('confirmed','rejected','completed') THEN RAISE EXCEPTION 'Invalid decision'; END IF;

  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;

  IF _decision = 'confirmed' THEN
    IF _vendor_id IS NULL THEN RAISE EXCEPTION 'Assign a washer partner before approving'; END IF;
    IF _vendor_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE public.wash_bookings
         SET status = 'confirmed', progress = 'confirmed', assigned_vendor_id = NULL,
             admin_note = NULLIF(btrim(COALESCE(_note,'')), ''), rejection_reason = NULL
       WHERE id = b.id;
    ELSE
      UPDATE public.wash_bookings
         SET status = 'confirmed', progress = 'confirmed', assigned_vendor_id = _vendor_id,
             admin_note = NULLIF(btrim(COALESCE(_note,'')), ''), rejection_reason = NULL
       WHERE id = b.id;
    END IF;

  ELSIF _decision = 'rejected' THEN
    IF b.payment_status = 'paid' THEN
      refund := COALESCE(b.price, 0);
      PERFORM public.wallet_apply(b.customer_id, refund, 'wash_refund', NULL, b.id::text, 'Refund for rejected wash booking');
    END IF;
    UPDATE public.wash_bookings
       SET status = 'rejected',
           rejection_reason = NULLIF(btrim(COALESCE(_note,'')), ''),
           payment_status = CASE WHEN refund > 0 THEN 'refunded' ELSE b.payment_status END,
           refund_amount = refund,
           cancelled_at = now(), cancelled_by = auth.uid()
     WHERE id = b.id;

  ELSE
    IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Only approved washes can be completed'; END IF;
    IF b.payment_status <> 'paid' THEN RAISE EXCEPTION 'Payment is still pending for this wash'; END IF;
    UPDATE public.wash_bookings
       SET status = 'completed', completed_at = now(),
           admin_note = COALESCE(NULLIF(btrim(COALESCE(_note,'')), ''), b.admin_note)
     WHERE id = b.id;
  END IF;
END; $$;

-- PR #14: "column reference id is ambiguous"
CREATE OR REPLACE FUNCTION public.claim_wash_job(_wash_booking_id uuid DEFAULT NULL::uuid, id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  _target_id uuid;
  _cleaner record;
  _booking record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _target_id := COALESCE(_wash_booking_id, id);
  IF _target_id IS NULL THEN
    RAISE EXCEPTION 'Wash booking ID is required';
  END IF;

  -- 1. Verify cleaner profile and approved status
  SELECT * INTO _cleaner
    FROM public.cleaners
   WHERE cleaners.id = auth.uid();

  IF _cleaner IS NULL THEN
    RAISE EXCEPTION 'Cleaner profile not found';
  END IF;

  IF _cleaner.verification_status != 'approved' THEN
    RAISE EXCEPTION 'Only verified cleaners can claim jobs';
  END IF;

  -- 2. Lock the wash booking row atomically to prevent race conditions / double claiming (CJ-01)
  SELECT * INTO _booking
    FROM public.wash_bookings
   WHERE wash_bookings.id = _target_id
     FOR UPDATE;

  IF _booking IS NULL THEN
    RAISE EXCEPTION 'Wash booking not found';
  END IF;

  -- 3. Check if already claimed or assigned
  IF _booking.assigned_cleaner_id IS NOT NULL OR _booking.assigned_vendor_id IS NOT NULL THEN
    RAISE EXCEPTION 'This wash job is already assigned';
  END IF;

  -- 4. Check if confirmed (must be confirmed)
  IF _booking.status != 'confirmed' AND _booking.progress != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed wash jobs can be claimed';
  END IF;

  -- 5. Check city match (case-insensitive) (CJ-02)
  IF lower(trim(_cleaner.city)) != lower(trim(_booking.city)) THEN
    RAISE EXCEPTION 'Cleaner cannot claim jobs outside their operating city (cleaner city: %, job city: %)', _cleaner.city, _booking.city;
  END IF;

  -- 6. Atomically assign job to cleaner
  UPDATE public.wash_bookings
     SET assigned_cleaner_id = auth.uid(),
         progress = 'assigned',
         status = 'confirmed',
         updated_at = now()
   WHERE wash_bookings.id = _target_id;

  -- 7. Notify customer
  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (
    _booking.customer_id,
    'Cleaner Assigned to Your Wash',
    _cleaner.full_name || ' has claimed your wash booking and will arrive at your scheduled slot.',
    '/washes'
  );

  RETURN jsonb_build_object(
    'id', _booking.id,
    'assigned_cleaner_id', auth.uid(),
    'progress', 'assigned',
    'status', 'confirmed',
    'cleaner_name', _cleaner.full_name
  );
END;
$$;

-- PR #14: referral bonus is a valid wallet transaction
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check CHECK ((kind = ANY (ARRAY['topup'::text, 'booking_payment'::text, 'booking_earning'::text, 'refund'::text, 'payout'::text, 'adjustment'::text, 'driver_payment'::text, 'driver_earning'::text, 'driver_refund'::text, 'driver_refund_reversal'::text, 'wash_payment'::text, 'wash_refund'::text, 'payout_reversal'::text, 'promo_credit'::text, 'wash_earning'::text, 'referral_bonus'::text])));

-- PR #14: admin broadcasts
DROP POLICY IF EXISTS "User reads own notifications" ON public.notifications;
CREATE POLICY "User reads own notifications" ON public.notifications FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
CREATE POLICY "Admins insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (auth.uid() = user_id)));
GRANT INSERT ON TABLE public.notifications TO authenticated;

-- RN-12.2: only the host approves, declines or completes; cancelling stays with cancel_booking()
CREATE OR REPLACE FUNCTION public.tg_money_guard_booking() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
    IF auth.uid() IS DISTINCT FROM OLD.vendor_id THEN
      RAISE EXCEPTION 'Only the host can change the booking status';
    END IF;
    IF NEW.status IN ('confirmed', 'rejected') AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending requests can be approved or declined';
    END IF;
    IF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'A booking cannot go back to pending';
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

-- RN-12.1: users edit their own profile but not its review or referral fields
CREATE OR REPLACE FUNCTION public.tg_guard_profile_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Two IFs on purpose, as in tg_money_guard_booking: service-role callers never reach has_role().
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.referral_rewarded := OLD.referral_rewarded;

  -- A (re)submitted licence always goes back to review; otherwise the status is the admin's.
  IF NEW.dl_status = 'pending'
     OR (NEW.dl_number, NEW.dl_expiry, NEW.dl_front_url, NEW.dl_back_url)
        IS DISTINCT FROM (OLD.dl_number, OLD.dl_expiry, OLD.dl_front_url, OLD.dl_back_url) THEN
    NEW.dl_status := 'pending';
    NEW.dl_verified_at := NULL;
    NEW.dl_rejection_reason := NULL;
  ELSE
    NEW.dl_status := OLD.dl_status;
    NEW.dl_verified_at := OLD.dl_verified_at;
    NEW.dl_rejection_reason := OLD.dl_rejection_reason;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_guard_profile_update();
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0006_fix_driver_rating_and_user_reports_details")]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
