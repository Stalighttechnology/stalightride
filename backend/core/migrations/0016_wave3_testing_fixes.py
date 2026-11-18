from django.db import migrations

SQL = """
-- 1. Recompute vehicle rating with SECURITY DEFINER so customer reviews can update vehicle stats under RLS
CREATE OR REPLACE FUNCTION public.recompute_vehicle_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE vid UUID;
BEGIN
  vid := COALESCE(NEW.vehicle_id, OLD.vehicle_id);
  UPDATE public.vehicles SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.reviews WHERE vehicle_id = vid), 0),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE vehicle_id = vid)
  WHERE id = vid;
  RETURN NEW;
END; $$;

-- 2. cancel_driver_booking: set payment_status to 'no_refund' when pct = 0
CREATE OR REPLACE FUNCTION public.cancel_driver_booking(_driver_booking_id uuid, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; is_admin boolean; is_driver boolean;
  new_pay_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Driver booking not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  is_driver := (b.driver_id = auth.uid());
  IF NOT is_admin AND NOT is_driver AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;

  IF b.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
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
    new_pay_status := CASE WHEN pct = 1 THEN 'refunded' WHEN pct = 0 THEN 'no_refund' ELSE 'partially_refunded' END;
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

-- 3. delete_my_account_data: deactivate login in accounts_user
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
    AND status IN ('pending', 'confirmed', 'ongoing');
  IF active_rentals > 0 THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming vehicle rentals';
  END IF;

  SELECT count(*) INTO active_hires FROM public.driver_bookings
  WHERE (customer_id = uid OR driver_id = uid)
    AND status IN ('pending', 'confirmed', 'ongoing');
  IF active_hires > 0 THEN
    RAISE EXCEPTION 'Cannot delete account with active or upcoming driver bookings';
  END IF;

  SELECT count(*) INTO active_washes FROM public.wash_bookings
  WHERE (customer_id = uid OR cleaner_id = uid)
    AND status IN ('pending', 'confirmed', 'on_the_way', 'started');
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
END;
$$;

-- 4. handle_incident_notifications: ensure reporter is party to booking
CREATE OR REPLACE FUNCTION public.handle_incident_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_host_id uuid;
BEGIN
  IF NEW.type = 'sos' THEN
    -- Alert all admins
    INSERT INTO public.notifications (user_id, title, body, link)
    SELECT
      ur.user_id,
      'EMERGENCY SOS Triggered!',
      format('SOS alert reported at %s,%s for booking %s', COALESCE(NEW.lat::text, 'unknown'), COALESCE(NEW.lng::text, 'unknown'), COALESCE(NEW.booking_id::text, 'none')),
      '/admin'
    FROM public.user_roles ur
    WHERE ur.role = 'admin';
  ELSIF NEW.type = 'lost_item' AND NEW.booking_id IS NOT NULL THEN
    -- Look up vehicle host only if the reporter is party to the booking
    SELECT vendor_id INTO v_host_id FROM public.bookings
    WHERE id = NEW.booking_id AND (customer_id = NEW.user_id OR vendor_id = NEW.user_id);
    IF v_host_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        v_host_id,
        'Lost Item Reported',
        format('A customer reported a lost item (%s) on booking %s.', COALESCE(NEW.item_name, 'item'), NEW.booking_id),
        '/bookings'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0015_wash_voucher_pricing"),
    ]

    operations = [
        migrations.RunSQL(SQL),
    ]
