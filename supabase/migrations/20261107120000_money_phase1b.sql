-- Money phase 1b: admin refunds through the wallet ledger, and paid trip
-- extensions (wallet only). Builds on 20261105120000_money_phase1.sql.
--
-- Fixes:
--  * the admin "Payments & Refunds" tab wrote wallets / wallet_transactions
--    directly from the browser (blocked by RLS, and it skipped wallet_apply);
--  * the in-trip "Extend trip" button only showed a toast.

-- =====================================================================
-- 1. Admin refund (credited as 'refund', so it is never withdrawable)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_refund(_email text, _amount numeric, _reason text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; why text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF COALESCE(_amount, 0) <= 0 OR _amount > 100000 THEN RAISE EXCEPTION 'Amount must be between 1 and 100000'; END IF;
  IF why IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'No user with that email'; END IF;
  RETURN public.wallet_apply(uid, round(_amount, 2), 'refund', NULL, NULL, left('Admin refund: ' || why, 300));
END; $$;

-- =====================================================================
-- 2. Trip extensions
--    customer requests (+hours) -> host accepts/declines -> customer pays
--    from wallet, which extends the booking in the same transaction.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.booking_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  hours int NOT NULL CHECK (hours BETWEEN 1 AND 72),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  new_end_date date NOT NULL,
  new_dropoff_time time NOT NULL,
  extra_base numeric NOT NULL,
  service_fee numeric NOT NULL,
  gst_amount numeric NOT NULL,
  commission_amount numeric NOT NULL,
  commission_gst numeric NOT NULL,
  provider_earning numeric NOT NULL,
  extra_total numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','paid','cancelled')),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- At most one open request per booking.
CREATE UNIQUE INDEX IF NOT EXISTS booking_extensions_one_open
  ON public.booking_extensions (booking_id) WHERE status IN ('pending','accepted');
CREATE INDEX IF NOT EXISTS booking_extensions_booking_idx
  ON public.booking_extensions (booking_id, created_at DESC);

GRANT SELECT ON public.booking_extensions TO authenticated;
GRANT ALL ON public.booking_extensions TO service_role;
ALTER TABLE public.booking_extensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Parties view booking extensions" ON public.booking_extensions;
CREATE POLICY "Parties view booking extensions" ON public.booking_extensions
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = vendor_id OR public.has_role(auth.uid(), 'admin'));
-- No insert/update/delete policies: all writes go through the RPCs below.

-- Same overlap rule as prevent_booking_conflict(), for a proposed new end date.
CREATE OR REPLACE FUNCTION public.extension_clashes(_booking_id uuid, _new_end date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b, public.bookings o
     WHERE b.id = _booking_id AND o.vehicle_id = b.vehicle_id AND o.id <> b.id
       AND o.status IN ('pending','confirmed')
       AND o.start_date <= _new_end AND o.end_date >= b.start_date
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b, public.availability_blocks a
     WHERE b.id = _booking_id AND a.vehicle_id = b.vehicle_id
       AND a.start_date <= _new_end AND a.end_date >= b.start_date
  );
$$;

CREATE OR REPLACE FUNCTION public.request_booking_extension(_booking_id uuid, _hours int, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD; new_end timestamp; extra numeric; ch jsonb; ext_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' OR b.payment_status <> 'paid' THEN RAISE EXCEPTION 'Only paid, confirmed trips can be extended'; END IF;
  IF b.pickup_checked_at IS NULL OR b.return_checked_at IS NOT NULL THEN RAISE EXCEPTION 'Extensions are only possible during an active trip'; END IF;
  IF _hours IS NULL OR _hours < 1 OR _hours > 72 THEN RAISE EXCEPTION 'Extend by 1 to 72 hours'; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_extensions WHERE booking_id = b.id AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'An extension request is already open for this trip';
  END IF;

  new_end := (b.end_date + b.dropoff_time) + make_interval(hours => _hours);
  IF public.extension_clashes(b.id, new_end::date) THEN
    RAISE EXCEPTION 'The vehicle is not available for the extra time';
  END IF;

  -- Price the whole new window and charge the difference, so tiered
  -- hourly/daily/weekly pricing stays consistent. Never negative.
  extra := GREATEST(0, public.rental_base_price(b.vehicle_id, b.start_date, new_end::date, b.pickup_time, new_end::time) - b.base_price);
  ch := public.compute_charges(extra, NULL);

  INSERT INTO public.booking_extensions (
    booking_id, customer_id, vendor_id, hours, note, new_end_date, new_dropoff_time,
    extra_base, service_fee, gst_amount, commission_amount, commission_gst, provider_earning, extra_total)
  VALUES (
    b.id, b.customer_id, b.vendor_id, _hours, NULLIF(btrim(COALESCE(_note, '')), ''), new_end::date, new_end::time,
    extra, (ch->>'service_fee')::numeric, (ch->>'gst')::numeric, (ch->>'commission')::numeric,
    (ch->>'commission_gst')::numeric, (ch->>'provider_earning')::numeric, (ch->>'customer_total')::numeric)
  RETURNING id INTO ext_id;

  PERFORM public.notify_user(b.vendor_id, 'Trip extension requested',
    'Your guest wants to extend their trip by ' || _hours || 'h. Accept or decline it.',
    '/bookings/' || b.id || '/trip');
  RETURN ext_id;
END; $$;

CREATE OR REPLACE FUNCTION public.decide_booking_extension(_extension_id uuid, _accept boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO e FROM public.booking_extensions WHERE id = _extension_id FOR UPDATE;
  IF e IS NULL THEN RAISE EXCEPTION 'Extension not found'; END IF;
  IF e.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can decide'; END IF;
  IF e.status <> 'pending' THEN RAISE EXCEPTION 'This request was already decided'; END IF;
  IF _accept AND public.extension_clashes(e.booking_id, e.new_end_date) THEN
    RAISE EXCEPTION 'The vehicle is booked or blocked during the extra time';
  END IF;

  UPDATE public.booking_extensions
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END, decided_at = now()
   WHERE id = e.id;

  PERFORM public.notify_user(e.customer_id,
    CASE WHEN _accept THEN 'Extension accepted' ELSE 'Extension declined' END,
    CASE WHEN _accept THEN 'Pay from your wallet to confirm the extra ' || e.hours || 'h.'
         ELSE 'Your host could not extend this trip. Please return on time.' END,
    '/bookings/' || e.booking_id || '/trip');
  RETURN CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_booking_extension(_extension_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD;
BEGIN
  SELECT * INTO e FROM public.booking_extensions WHERE id = _extension_id FOR UPDATE;
  IF e IS NULL THEN RAISE EXCEPTION 'Extension not found'; END IF;
  IF e.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF e.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'This request is already closed'; END IF;
  UPDATE public.booking_extensions SET status = 'cancelled', decided_at = now() WHERE id = e.id;
END; $$;

CREATE OR REPLACE FUNCTION public.wallet_pay_extension(_extension_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO e FROM public.booking_extensions WHERE id = _extension_id FOR UPDATE;
  IF e IS NULL THEN RAISE EXCEPTION 'Extension not found'; END IF;
  IF e.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF e.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;
  IF e.status <> 'accepted' THEN RAISE EXCEPTION 'The host has not accepted this extension'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = e.booking_id FOR UPDATE;
  IF b.status <> 'confirmed' OR b.return_checked_at IS NOT NULL THEN RAISE EXCEPTION 'This trip has already ended'; END IF;

  IF e.extra_total > 0 THEN
    PERFORM public.wallet_apply(e.customer_id, -e.extra_total, 'booking_payment', b.id, NULL,
      'Trip extension +' || e.hours || 'h');
  END IF;

  -- trg_bookings_conflict re-checks availability here; a clash raises and
  -- rolls back the wallet debit too. The host's share is released with the
  -- rest of provider_earning when the trip completes (trg_money_settle).
  UPDATE public.bookings SET
    end_date = e.new_end_date,
    dropoff_time = e.new_dropoff_time,
    base_price = base_price + e.extra_base,
    service_fee = service_fee + e.service_fee,
    gst_amount = gst_amount + e.gst_amount,
    commission_amount = commission_amount + e.commission_amount,
    commission_gst = commission_gst + e.commission_gst,
    provider_earning = provider_earning + e.provider_earning,
    total_price = total_price + e.extra_total
  WHERE id = b.id;

  UPDATE public.booking_extensions SET status = 'paid', paid_at = now() WHERE id = e.id;

  PERFORM public.notify_user(e.vendor_id, 'Trip extended',
    'The guest paid for +' || e.hours || 'h. New return: ' || to_char(e.new_end_date + e.new_dropoff_time, 'DD Mon HH24:MI') || '.',
    '/bookings/' || b.id || '/trip');

  SELECT balance INTO bal FROM public.wallets WHERE user_id = e.customer_id;
  RETURN COALESCE(bal, 0);
END; $$;

-- =====================================================================
-- 3. Make the column-scope guards from 20260809013207 actually run.
--    They were SECURITY DEFINER, so inside them current_user is the owner,
--    is_end_user_request() is always false and every guard returned early:
--    a customer could PATCH their own paid booking's end_date (a free
--    extension), pickup_checked_at, qr_code, vehicle_id, and so on.
--    As SECURITY INVOKER, current_user is the caller's role again, the same
--    approach trg_money_guard uses.
-- =====================================================================
ALTER FUNCTION public.enforce_booking_update_scope() SECURITY INVOKER;
ALTER FUNCTION public.enforce_driver_booking_update_scope() SECURITY INVOKER;
ALTER FUNCTION public.enforce_review_update_scope() SECURITY INVOKER;
ALTER FUNCTION public.enforce_driver_review_update_scope() SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.is_end_user_request() TO authenticated, anon;

-- =====================================================================
-- 4. Function privileges
-- =====================================================================
REVOKE ALL ON FUNCTION public.admin_refund(text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund(text, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.extension_clashes(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_booking_extension(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_booking_extension(uuid, int, text) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_booking_extension(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_booking_extension(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_booking_extension(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_extension(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wallet_pay_extension(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_pay_extension(uuid) TO authenticated;
