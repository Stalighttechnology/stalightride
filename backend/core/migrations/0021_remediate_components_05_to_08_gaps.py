from django.db import migrations

SQL = r"""
-- 1. GAP-09: Unpaid bookings cannot be marked completed by hosts or drivers
CREATE OR REPLACE FUNCTION public.tg_money_guard_booking() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
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
      IF OLD.payment_status <> 'paid' THEN RAISE EXCEPTION 'Unpaid bookings cannot be completed'; END IF;
      IF OLD.return_checked_at IS NULL THEN
        RAISE EXCEPTION 'Record the return check-out before completing the trip';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_money_guard_driver_booking() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
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
    IF NEW.status = 'completed' THEN
      IF auth.uid() <> OLD.driver_id THEN RAISE EXCEPTION 'Only the driver can complete a hire'; END IF;
      IF OLD.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed hires can be completed'; END IF;
      IF OLD.payment_status <> 'paid' THEN RAISE EXCEPTION 'Unpaid hires cannot be completed'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 2. GAP-09: Unpaid wash bookings cannot be completed
CREATE OR REPLACE FUNCTION public.advance_wash_status(_wash_booking_id uuid, _next_status text, _photos text[] DEFAULT NULL::text[], _notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD;
  is_admin boolean;
  is_assigned boolean;
  current_step integer;
  next_step integer;
  norm_next text;
  norm_curr text;
  new_before text[];
  new_after text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN
    RAISE EXCEPTION 'Wash booking not found';
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  is_assigned := (b.assigned_cleaner_id = auth.uid())
    OR (b.assigned_vendor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.wash_vendors
      WHERE id = b.assigned_vendor_id AND (id = auth.uid() OR contact_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    );

  IF NOT is_admin AND NOT is_assigned THEN
    RAISE EXCEPTION 'You are not assigned to this wash job';
  END IF;

  norm_next := lower(btrim(_next_status));
  norm_curr := lower(btrim(COALESCE(b.progress::text, b.status::text, 'requested')));
  IF norm_curr = 'pending' THEN norm_curr := 'requested'; END IF;

  current_step := CASE norm_curr
    WHEN 'requested' THEN 1
    WHEN 'confirmed' THEN 2
    WHEN 'assigned' THEN 3
    WHEN 'on_the_way' THEN 4
    WHEN 'started' THEN 5
    WHEN 'completed' THEN 6
    ELSE 0
  END;

  next_step := CASE norm_next
    WHEN 'requested' THEN 1
    WHEN 'confirmed' THEN 2
    WHEN 'assigned' THEN 3
    WHEN 'on_the_way' THEN 4
    WHEN 'started' THEN 5
    WHEN 'completed' THEN 6
    ELSE -1
  END;

  IF next_step = -1 THEN
    RAISE EXCEPTION 'Invalid wash status: %', _next_status;
  END IF;

  IF next_step <= current_step THEN
    RAISE EXCEPTION 'Status cannot be moved backwards or to the same status (current: %, requested: %)', norm_curr, norm_next;
  END IF;

  IF norm_next = 'completed' AND b.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Unpaid wash bookings cannot be completed';
  END IF;

  new_before := COALESCE(b.before_photos, '{}');
  new_after := COALESCE(b.after_photos, '{}');

  IF norm_next = 'started' AND _photos IS NOT NULL THEN
    new_before := array_cat(new_before, _photos);
  ELSIF norm_next = 'completed' THEN
    IF _photos IS NOT NULL THEN
      new_after := array_cat(new_after, _photos);
    END IF;
    IF COALESCE(array_length(new_after, 1), 0) = 0 THEN
      RAISE EXCEPTION 'After photos are required to complete the wash';
    END IF;
  END IF;

  UPDATE public.wash_bookings
     SET progress = norm_next::public.wash_status,
         status = CASE
           WHEN norm_next IN ('confirmed', 'completed', 'cancelled', 'rejected') THEN norm_next::public.booking_status
           WHEN norm_next = 'requested' THEN 'pending'::public.booking_status
           ELSE b.status
         END,
         before_photos = new_before,
         after_photos = new_after,
         completed_at = CASE WHEN norm_next = 'completed' THEN now() ELSE b.completed_at END,
         notes = COALESCE(NULLIF(btrim(_notes), ''), b.notes),
         updated_at = now()
   WHERE id = b.id;

  RETURN jsonb_build_object(
    'id', b.id,
    'progress', norm_next,
    'status', norm_next,
    'before_photos', new_before,
    'after_photos', new_after
  );
END;
$$;

-- 3. GAP-20: Prevent enforce_pool_request_guard from erroring during cascade trip cancellation
CREATE OR REPLACE FUNCTION public.enforce_pool_request_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.pool_trips;
BEGIN
  SELECT * INTO t FROM public.pool_trips WHERE id = NEW.trip_id FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'Pool trip not found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF t.driver_id = NEW.passenger_id THEN
      RAISE EXCEPTION 'You cannot join your own pool trip';
    END IF;
    IF t.status <> 'scheduled' OR t.depart_at <= now() THEN
      RAISE EXCEPTION 'This pool trip has already started or is closed';
    END IF;
    IF NEW.seats > t.seats_available THEN
      RAISE EXCEPTION 'Only % seat(s) left on this trip', t.seats_available;
    END IF;
    NEW.status := 'pending';
    NEW.fare_total := t.fare_per_seat * NEW.seats;
    RETURN NEW;
  END IF;

  NEW.trip_id := OLD.trip_id;
  NEW.passenger_id := OLD.passenger_id;
  NEW.seats := OLD.seats;
  NEW.fare_total := OLD.fare_total;
  NEW.match_score := OLD.match_score;

  IF NEW.status <> OLD.status THEN
    IF OLD.status IN ('rejected','cancelled','completed') THEN
      RAISE EXCEPTION 'This request is already closed';
    END IF;
    IF NEW.status = 'confirmed' THEN
      IF auth.uid() <> t.driver_id AND NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only the trip driver can accept passengers';
      END IF;
      IF t.seats_available < OLD.seats THEN
        RAISE EXCEPTION 'Not enough seats left to accept this request';
      END IF;
      PERFORM set_config('app.pool_seat_sync', '1', true);
      UPDATE public.pool_trips SET seats_available = seats_available - OLD.seats WHERE id = t.id;
      PERFORM set_config('app.pool_seat_sync', '0', true);
    ELSIF NEW.status = 'rejected' THEN
      IF auth.uid() <> t.driver_id AND NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only the trip driver can reject passengers';
      END IF;
    ELSIF NEW.status = 'cancelled' THEN
      IF OLD.status = 'confirmed' AND t.status <> 'cancelled' THEN
        PERFORM set_config('app.pool_seat_sync', '1', true);
        UPDATE public.pool_trips SET seats_available = LEAST(t.seats_total, t.seats_available + OLD.seats) WHERE id = t.id;
        PERFORM set_config('app.pool_seat_sync', '0', true);
      END IF;
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. GAP-20: Automatic cascade cancellation and notifications when a pool trip is cancelled
CREATE OR REPLACE FUNCTION public.tg_pool_trip_cancelled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    FOR r IN
      SELECT pr.id, pr.passenger_id, NEW.origin_label, NEW.dest_label
      FROM public.pool_requests pr
      WHERE pr.trip_id = NEW.id AND pr.status IN ('pending', 'confirmed')
    LOOP
      UPDATE public.pool_requests SET status = 'cancelled', updated_at = now() WHERE id = r.id;
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        r.passenger_id,
        'Pool trip cancelled',
        'Your pool trip from ' || COALESCE(NEW.origin_label, 'origin') || ' to ' || COALESCE(NEW.dest_label, 'destination') || ' was cancelled by the driver.',
        '/pooling/mine'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pool_trip_cancelled ON public.pool_trips;
CREATE TRIGGER trg_pool_trip_cancelled
  AFTER UPDATE OF status ON public.pool_trips
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_pool_trip_cancelled();

-- 5. GAP-21 / Column & Enum Fix in delete_my_account_data
CREATE OR REPLACE FUNCTION public.delete_my_account_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid uuid;
  active_rentals int;
  active_hires int;
  active_washes int;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*) INTO active_rentals FROM public.bookings
  WHERE (customer_id = uid OR vendor_id = uid)
    AND status IN ('pending', 'confirmed');
  IF active_rentals > 0 THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming vehicle rentals';
  END IF;

  SELECT count(*) INTO active_hires FROM public.driver_bookings
  WHERE (customer_id = uid OR driver_id = uid)
    AND status IN ('pending', 'confirmed');
  IF active_hires > 0 THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming driver bookings';
  END IF;

  SELECT count(*) INTO active_washes FROM public.wash_bookings
  WHERE (customer_id = uid OR assigned_cleaner_id = uid OR assigned_vendor_id = uid)
    AND status IN ('pending', 'confirmed');
  IF active_washes > 0 THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming wash bookings';
  END IF;

  UPDATE public.profiles SET
    full_name = 'Deleted user',
    phone = NULL,
    avatar_url = NULL,
    dl_number = NULL,
    dl_expiry = NULL,
    dl_front_url = NULL,
    dl_back_url = NULL,
    dl_status = 'pending',
    bio = NULL,
    emergency_contact_name = NULL,
    emergency_contact_phone = NULL,
    payout_upi_id = NULL,
    payout_account_number = NULL,
    payout_ifsc = NULL,
    payout_account_name = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vendors SET
    business_name = 'Closed vendor',
    business_address = NULL,
    gst_number = NULL,
    pan_number = NULL,
    contact_phone = NULL,
    bio = NULL,
    payout_email = NULL,
    id_document_url = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vehicles SET status = 'paused', updated_at = now() WHERE vendor_id = uid;

  UPDATE public.drivers SET
    full_name = 'Deleted driver',
    phone = NULL,
    bio = NULL,
    photo_url = NULL,
    dl_number = NULL,
    dl_expiry = NULL,
    dl_front_url = NULL,
    dl_back_url = NULL,
    id_document_url = NULL,
    status = 'paused',
    updated_at = now()
  WHERE id = uid;

  UPDATE public.pool_trips SET status = 'cancelled', updated_at = now()
  WHERE driver_id = uid AND depart_at > now() AND status <> 'cancelled';

  -- Deactivate login in accounts_user so deleted users cannot sign back in
  UPDATE accounts_user SET is_active = false WHERE id = uid;

  RETURN jsonb_build_object('ok', true);
END; $$;

-- 6. GAP-26: Wash jobs settlement payee resolution
CREATE OR REPLACE FUNCTION public.tg_wash_settle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE payee uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    payee := COALESCE(
      NEW.assigned_cleaner_id,
      (SELECT id FROM public.wash_centers WHERE id = NEW.assigned_vendor_id),
      (SELECT id FROM auth.users WHERE id = NEW.assigned_vendor_id),
      (SELECT u.id FROM auth.users u JOIN public.wash_vendors v ON lower(v.contact_email) = lower(u.email) WHERE v.id = NEW.assigned_vendor_id),
      (SELECT u.id FROM auth.users u JOIN public.wash_centers c ON lower(c.contact_email) = lower(u.email) WHERE c.id = NEW.assigned_vendor_id)
    );
    IF payee IS NOT NULL AND payee <> NEW.customer_id AND COALESCE(NEW.provider_earning, 0) > 0 THEN
      PERFORM public.wallet_apply(payee, NEW.provider_earning, 'wash_earning', NULL, NEW.id::text,
        'Earning from completed wash (after commission)');
    END IF;
    NEW.earning_credited_at := now();
  END IF;
  RETURN NEW;
END; $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_remediate_components_01_to_04_gaps"),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=migrations.RunSQL.noop),
    ]
