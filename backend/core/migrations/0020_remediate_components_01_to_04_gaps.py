from django.db import migrations

SQL = r"""
-- 1. Add is_deleted column to public.vehicles for persistent soft-deletion (GAP-29)
ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- 2. Update prevent_booking_conflict with SECURITY DEFINER and validations (GAP-02, GAP-18)
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_status text;
    v_verif text;
    v_deleted boolean;
BEGIN
    -- Check 1: Reject past dates (GAP-18)
    IF NEW.start_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Booking start date cannot be in the past';
    END IF;
    IF NEW.end_date < NEW.start_date THEN
        RAISE EXCEPTION 'Drop-off must be after pickup';
    END IF;

    -- Check 2: Check vehicle is not paused or deleted (GAP-18, GAP-29)
    SELECT status::text, COALESCE(is_deleted, false)
    INTO v_status, v_deleted
    FROM public.vehicles
    WHERE id = NEW.vehicle_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;
    IF v_deleted OR v_status = 'paused' THEN
        RAISE EXCEPTION 'Vehicle is not available for booking';
    END IF;

    -- Check 3: Check overlapping bookings across ALL users (GAP-02)
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.vehicle_id = NEW.vehicle_id
          AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND b.status IN ('pending', 'confirmed')
          AND b.start_date <= NEW.end_date
          AND b.end_date >= NEW.start_date
    ) THEN
        RAISE EXCEPTION 'Vehicle not available for selected dates';
    END IF;

    -- Check 4: Check availability blocks (GAP-10)
    IF EXISTS (
        SELECT 1 FROM public.availability_blocks a
        WHERE a.vehicle_id = NEW.vehicle_id
          AND a.start_date <= NEW.end_date
          AND a.end_date >= NEW.start_date
    ) THEN
        RAISE EXCEPTION 'Vehicle is blocked on selected dates';
    END IF;

    -- Check 5: Non-admins cannot insert booking with status other than pending (GAP-03)
    IF TG_OP = 'INSERT' AND NEW.status <> 'pending'::public.booking_status THEN
        IF NOT public.has_role(auth.uid(), 'admin') THEN
            NEW.status := 'pending'::public.booking_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_booking_conflict_ins ON public.bookings;
DROP TRIGGER IF EXISTS trg_bookings_conflict ON public.bookings;
CREATE TRIGGER trg_bookings_conflict
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_conflict();

-- 3. Prevent availability blocks from trapping existing confirmed or pending bookings (GAP-10)
CREATE OR REPLACE FUNCTION public.prevent_availability_block_conflict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.vehicle_id = NEW.vehicle_id
          AND b.status IN ('pending', 'confirmed')
          AND b.start_date <= NEW.end_date
          AND b.end_date >= NEW.start_date
    ) THEN
        RAISE EXCEPTION 'Cannot block dates that overlap an existing booking';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_availability_block_conflict ON public.availability_blocks;
CREATE TRIGGER trg_prevent_availability_block_conflict
    BEFORE INSERT OR UPDATE ON public.availability_blocks
    FOR EACH ROW EXECUTE FUNCTION public.prevent_availability_block_conflict();

-- 4. Guard booking status and payment status integrity (GAP-04, GAP-09, GAP-12)
CREATE OR REPLACE FUNCTION public.guard_booking_lifecycle_integrity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        -- GAP-04: Cannot undo a refunded booking back to paid
        IF OLD.payment_status IN ('refunded', 'partially_refunded') AND NEW.payment_status = 'paid' THEN
            NEW.payment_status := OLD.payment_status;
        END IF;

        -- GAP-09: Cannot complete an unpaid booking
        IF NEW.status = 'completed'::public.booking_status AND NEW.payment_status <> 'paid' THEN
            RAISE EXCEPTION 'Cannot complete an unpaid booking';
        END IF;

        -- GAP-12: Recorded inspection readings cannot be rewritten
        IF OLD.pickup_odometer IS NOT NULL AND NEW.pickup_odometer IS DISTINCT FROM OLD.pickup_odometer THEN
            NEW.pickup_odometer := OLD.pickup_odometer;
        END IF;
        IF OLD.return_odometer IS NOT NULL AND NEW.return_odometer IS DISTINCT FROM OLD.return_odometer THEN
            NEW.return_odometer := OLD.return_odometer;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_lifecycle_integrity ON public.bookings;
CREATE TRIGGER trg_guard_booking_lifecycle_integrity
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.guard_booking_lifecycle_integrity();

-- 5. Prevent completing unpaid wash bookings (GAP-09 for wash)
CREATE OR REPLACE FUNCTION public.advance_wash_status(
    _wash_booking_id uuid,
    _next_status text,
    _photos text[] DEFAULT NULL::text[],
    _notes text DEFAULT NULL::text
) RETURNS jsonb
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

  -- GAP-09: Cleaner or non-admin cannot complete unpaid wash
  IF norm_next = 'completed' AND b.payment_status <> 'paid' AND NOT is_admin THEN
    RAISE EXCEPTION 'Cannot complete an unpaid wash booking';
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
    'status', CASE WHEN norm_next IN ('confirmed', 'completed', 'cancelled', 'rejected') THEN norm_next ELSE b.status::text END
  );
END;
$$;

-- 6. Cancelled pool trips close and notify passengers (GAP-20)
CREATE OR REPLACE FUNCTION public.handle_pool_trip_cancellation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    req RECORD;
BEGIN
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
        FOR req IN
            SELECT id, passenger_id FROM public.pool_requests
            WHERE trip_id = NEW.id AND status IN ('pending', 'confirmed')
        LOOP
            UPDATE public.pool_requests
            SET status = 'cancelled', updated_at = now()
            WHERE id = req.id;

            INSERT INTO public.notifications (user_id, title, body, link)
            VALUES (
                req.passenger_id,
                'Pool trip cancelled',
                'Your carpool ride has been cancelled by the driver.',
                '/pooling'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_trip_cancelled ON public.pool_trips;
CREATE TRIGGER trg_pool_trip_cancelled
    AFTER UPDATE OF status ON public.pool_trips
    FOR EACH ROW EXECUTE FUNCTION public.handle_pool_trip_cancellation();

-- 7. Fix delete_my_account_data enum crashes and deactivate user login (GAP-21)
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
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vendors SET
    business_name = 'Closed vendor',
    bio = NULL,
    payout_email = NULL,
    id_document_url = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vehicles SET status = 'paused', is_deleted = true, updated_at = now() WHERE vendor_id = uid;

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

  -- Deactivate user in accounts_user to prevent subsequent logins
  UPDATE accounts_user SET is_active = false WHERE id = uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 8. Cap sub-day hourly rate at daily price in rental_base_price (GAP-28)
CREATE OR REPLACE FUNCTION public.rental_base_price(
    _vehicle_id uuid,
    _start_date date,
    _end_date date,
    _pickup time without time zone,
    _dropoff time without time zone
) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v RECORD;
  hours numeric;
  rem numeric;
  weeks numeric := 0;
  days numeric;
  subtotal numeric := 0;
BEGIN
  SELECT price_hourly, price_daily, price_weekly INTO v FROM public.vehicles WHERE id = _vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;
  hours := EXTRACT(EPOCH FROM ((_end_date + _dropoff) - (_start_date + _pickup))) / 3600.0;
  IF hours IS NULL OR hours <= 0 THEN RAISE EXCEPTION 'Drop-off must be after pickup'; END IF;

  IF hours < 24 AND COALESCE(v.price_hourly, 0) > 0 THEN
    RETURN LEAST(ceil(hours) * v.price_hourly, COALESCE(v.price_daily, ceil(hours) * v.price_hourly));
  END IF;

  rem := ceil(hours);
  IF COALESCE(v.price_weekly, 0) > 0 AND rem >= 168 THEN
    weeks := floor(rem / 168);
    subtotal := weeks * v.price_weekly;
    rem := rem - weeks * 168;
  END IF;
  days := ceil(rem / 24.0);
  IF days > 0 THEN subtotal := subtotal + days * COALESCE(v.price_daily, 0); END IF;
  RETURN subtotal;
END;
$$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_remediate_components_09_to_12_gaps"),
    ]

    operations = [
        migrations.RunSQL(SQL),
    ]
