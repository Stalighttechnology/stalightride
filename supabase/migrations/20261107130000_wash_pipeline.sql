-- Wash pipeline, cleaner and washing-center roles, review moderation.
-- Builds on 20261105120000_money_phase1.sql and 20261107120000_money_phase1b.sql.
--
-- Fixes:
--  * admin "Delete review" / "Dismiss report" matched 0 rows (no admin policy);
--  * the wash stepper used statuses that don't exist, and only admins could
--    update wash_bookings, so cleaner and center updates silently did nothing;
--  * cleaner and washing-center profiles lived in localStorage and were
--    self-approved;
--  * wash earnings were never credited to anyone.
--
-- Roles are modelled as profile rows, not app_role values: a cleaner is a
-- row in public.cleaners, a washing center is a wash_vendors row with an
-- owner_id. Admin approval = cleaners.verification_status / wash_vendors.active.

-- =====================================================================
-- 1. Review moderation (admin)
-- =====================================================================
DROP POLICY IF EXISTS "Admins moderate reviews" ON public.reviews;
CREATE POLICY "Admins moderate reviews" ON public.reviews FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete reviews" ON public.reviews;
CREATE POLICY "Admins delete reviews" ON public.reviews FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 2. Cleaners
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cleaners (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 80),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 20),
  city text NOT NULL CHECK (char_length(btrim(city)) BETWEEN 2 AND 60),
  service_area text CHECK (service_area IS NULL OR char_length(service_area) <= 200),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 1000),
  experience_years int NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 60),
  services text[] NOT NULL DEFAULT '{}',
  available boolean NOT NULL DEFAULT true,
  verification_status public.verification_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cleaners TO authenticated;
GRANT ALL ON public.cleaners TO service_role;
ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cleaners and admins read cleaner profiles" ON public.cleaners;
CREATE POLICY "Cleaners and admins read cleaner profiles" ON public.cleaners FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users register as cleaner" ON public.cleaners;
CREATE POLICY "Users register as cleaner" ON public.cleaners FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "Cleaners and admins update cleaner profiles" ON public.cleaners;
CREATE POLICY "Cleaners and admins update cleaner profiles" ON public.cleaners FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Cleaners can't approve themselves. SECURITY INVOKER so current_user is the
-- caller (see the note on the scope guards in 20261107120000).
CREATE OR REPLACE FUNCTION public.tg_cleaner_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.verified_at := NULL;
  ELSE
    NEW.id := OLD.id;
    NEW.verification_status := OLD.verification_status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.verified_at := OLD.verified_at;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_cleaner_guard ON public.cleaners;
CREATE TRIGGER trg_cleaner_guard BEFORE INSERT OR UPDATE ON public.cleaners
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleaner_guard();

CREATE OR REPLACE FUNCTION public.admin_verify_cleaner(_cleaner_id uuid, _decision text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  UPDATE public.cleaners
     SET verification_status = _decision::public.verification_status,
         rejection_reason = CASE WHEN _decision = 'rejected' THEN NULLIF(btrim(COALESCE(_reason, '')), '') END,
         verified_at = CASE WHEN _decision = 'approved' THEN now() END
   WHERE id = _cleaner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cleaner not found'; END IF;
  PERFORM public.notify_user(_cleaner_id,
    CASE WHEN _decision = 'approved' THEN 'You are a verified cleaner' ELSE 'Cleaner verification rejected' END,
    CASE WHEN _decision = 'approved' THEN 'You can now accept doorstep wash jobs in your city.'
         ELSE COALESCE(NULLIF(btrim(COALESCE(_reason, '')), ''), 'Please update your profile and try again.') END,
    '/cleaner-dashboard');
END; $$;

-- =====================================================================
-- 3. Washing centers = wash_vendors with an owner
-- =====================================================================
ALTER TABLE public.wash_vendors
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address text CHECK (address IS NULL OR char_length(address) <= 300),
  ADD COLUMN IF NOT EXISTS opening_time time,
  ADD COLUMN IF NOT EXISTS closing_time time;
CREATE UNIQUE INDEX IF NOT EXISTS wash_vendors_owner_idx ON public.wash_vendors (owner_id) WHERE owner_id IS NOT NULL;

DROP POLICY IF EXISTS "Owners read their center" ON public.wash_vendors;
CREATE POLICY "Owners read their center" ON public.wash_vendors FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners register a center" ON public.wash_vendors;
CREATE POLICY "Owners register a center" ON public.wash_vendors FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners update their center" ON public.wash_vendors;
CREATE POLICY "Owners update their center" ON public.wash_vendors FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- A self-registered center starts inactive; only an admin activates it.
CREATE OR REPLACE FUNCTION public.tg_wash_vendor_owner_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.active := false;
    NEW.owner_id := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.active := OLD.active;
    NEW.owner_id := OLD.owner_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_wash_vendor_owner_guard ON public.wash_vendors;
CREATE TRIGGER trg_wash_vendor_owner_guard BEFORE INSERT OR UPDATE ON public.wash_vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_wash_vendor_owner_guard();

CREATE TABLE IF NOT EXISTS public.wash_center_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.wash_vendors(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 20),
  role text NOT NULL DEFAULT 'Washer' CHECK (char_length(role) <= 40),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wash_center_staff_vendor_idx ON public.wash_center_staff (vendor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_center_staff TO authenticated;
GRANT ALL ON public.wash_center_staff TO service_role;
ALTER TABLE public.wash_center_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Center owners and admins manage staff" ON public.wash_center_staff;
CREATE POLICY "Center owners and admins manage staff" ON public.wash_center_staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         OR EXISTS (SELECT 1 FROM public.wash_vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin')
         OR EXISTS (SELECT 1 FROM public.wash_vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()));

-- =====================================================================
-- 4. Wash job pipeline
--    status stays booking_status (pending → confirmed → completed); the
--    in-between steps live in progress: assigned → on_the_way → started.
-- =====================================================================
ALTER TABLE public.wash_bookings
  ADD COLUMN IF NOT EXISTS cleaner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress text;
ALTER TABLE public.wash_bookings DROP CONSTRAINT IF EXISTS wash_bookings_progress_check;
ALTER TABLE public.wash_bookings ADD CONSTRAINT wash_bookings_progress_check
  CHECK (progress IS NULL OR progress IN ('assigned','on_the_way','started'));
CREATE INDEX IF NOT EXISTS wash_bookings_cleaner_idx ON public.wash_bookings (cleaner_id) WHERE cleaner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wash_bookings_vendor_idx ON public.wash_bookings (assigned_vendor_id);

-- Is the caller the cleaner on this job, or the owner of its assigned center?
CREATE OR REPLACE FUNCTION public.is_wash_job_provider(_cleaner_id uuid, _vendor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- COALESCE: a NULL cleaner_id must mean "no", not NULL (IF NOT NULL never raises).
  SELECT auth.uid() IS NOT NULL AND (
    COALESCE(_cleaner_id = auth.uid(), false)
    OR EXISTS (SELECT 1 FROM public.wash_vendors v WHERE v.id = _vendor_id AND v.owner_id = auth.uid()));
$$;

DROP POLICY IF EXISTS "Providers view their wash jobs" ON public.wash_bookings;
CREATE POLICY "Providers view their wash jobs" ON public.wash_bookings FOR SELECT TO authenticated
  USING (public.is_wash_job_provider(cleaner_id, assigned_vendor_id));

DROP POLICY IF EXISTS "Providers view reviews of their wash jobs" ON public.wash_reviews;
CREATE POLICY "Providers view reviews of their wash jobs" ON public.wash_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wash_bookings w
                  WHERE w.id = wash_booking_id AND public.is_wash_job_provider(w.cleaner_id, w.assigned_vendor_id)));

-- Open jobs a verified, available cleaner can claim in their city. The
-- address is only revealed after claiming. Jobs assigned to an owned center
-- belong to that center and are not on the board.
CREATE OR REPLACE FUNCTION public.wash_job_board()
RETURNS TABLE (id uuid, slot_date date, slot_time time, city text, vehicle_label text,
               service_name text, duration_minutes int, provider_earning numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.cleaners WHERE cleaners.id = auth.uid();
  IF c IS NULL OR c.verification_status <> 'approved' OR NOT c.available THEN RETURN; END IF;
  RETURN QUERY
    SELECT w.id, w.slot_date, w.slot_time, w.city, w.vehicle_label, s.name, s.duration_minutes, w.provider_earning
      FROM public.wash_bookings w
      JOIN public.wash_services s ON s.id = w.service_id
      LEFT JOIN public.wash_vendors v ON v.id = w.assigned_vendor_id
     WHERE w.status = 'confirmed' AND w.payment_status = 'paid'
       AND w.cleaner_id IS NULL AND w.progress IS NULL
       AND v.owner_id IS NULL
       AND lower(btrim(w.city)) = lower(btrim(c.city))
       AND w.slot_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     ORDER BY w.slot_date, w.slot_time
     LIMIT 50;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_wash_job(_wash_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; w RECORD; owner uuid;
BEGIN
  SELECT * INTO c FROM public.cleaners WHERE id = auth.uid();
  IF c IS NULL OR c.verification_status <> 'approved' THEN RAISE EXCEPTION 'Only verified cleaners can accept jobs'; END IF;
  IF NOT c.available THEN RAISE EXCEPTION 'Go online to accept jobs'; END IF;
  SELECT * INTO w FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;
  IF w.cleaner_id IS NOT NULL OR w.progress IS NOT NULL THEN RAISE EXCEPTION 'This job was already taken'; END IF;
  IF w.status <> 'confirmed' OR w.payment_status <> 'paid' THEN RAISE EXCEPTION 'This job is not open yet'; END IF;
  SELECT owner_id INTO owner FROM public.wash_vendors WHERE id = w.assigned_vendor_id;
  IF owner IS NOT NULL THEN RAISE EXCEPTION 'This job belongs to a washing center'; END IF;
  IF lower(btrim(w.city)) <> lower(btrim(c.city)) THEN RAISE EXCEPTION 'This job is outside your city'; END IF;
  IF w.customer_id = auth.uid() THEN RAISE EXCEPTION 'You cannot accept your own wash'; END IF;

  UPDATE public.wash_bookings SET cleaner_id = auth.uid(), progress = 'assigned' WHERE id = w.id;
  PERFORM public.notify_user(w.customer_id, 'Cleaner assigned',
    c.full_name || ' will handle your wash on ' || to_char(w.slot_date, 'DD Mon') || '.', '/washes');
END; $$;

-- Strictly one step forward: (none) → assigned → on_the_way → started → completed.
CREATE OR REPLACE FUNCTION public.advance_wash_job(_wash_booking_id uuid, _to text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w RECORD; steps text[] := ARRAY['assigned','on_the_way','started','completed']; cur int; nxt int;
BEGIN
  SELECT * INTO w FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;
  IF NOT public.is_wash_job_provider(w.cleaner_id, w.assigned_vendor_id) THEN RAISE EXCEPTION 'This is not your job'; END IF;
  IF w.status <> 'confirmed' OR w.payment_status <> 'paid' THEN RAISE EXCEPTION 'Only paid, confirmed washes can be updated'; END IF;
  cur := COALESCE(array_position(steps, w.progress), 0);
  nxt := array_position(steps, _to);
  IF nxt IS NULL OR nxt <> cur + 1 THEN
    RAISE EXCEPTION 'Next step must be %', steps[cur + 1];
  END IF;

  IF _to = 'completed' THEN
    -- Earnings are released by trg_wash_settle.
    UPDATE public.wash_bookings SET status = 'completed', completed_at = now() WHERE id = w.id;
  ELSE
    UPDATE public.wash_bookings SET progress = _to WHERE id = w.id;
    PERFORM public.notify_user(w.customer_id,
      CASE _to WHEN 'assigned' THEN 'Washer assigned' WHEN 'on_the_way' THEN 'Your washer is on the way'
               ELSE 'Your wash has started' END,
      'Track it in My washes.', '/washes');
  END IF;
  RETURN _to;
END; $$;

-- =====================================================================
-- 5. Wash earnings: credited to the cleaner, else the center owner, when a
--    paid wash completes (by the provider or by an admin). Platform-managed
--    partners without an owner: the platform keeps it, as before.
-- =====================================================================
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind = ANY (ARRAY[
    'topup','booking_payment','booking_earning','refund','payout','adjustment',
    'driver_payment','driver_earning','driver_refund','driver_refund_reversal',
    'wash_payment','wash_refund','payout_reversal','promo_credit','wash_earning'
  ]));

CREATE OR REPLACE FUNCTION public.tg_wash_settle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payee uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.payment_status = 'paid' AND NEW.earning_credited_at IS NULL THEN
    payee := COALESCE(NEW.cleaner_id, (SELECT owner_id FROM public.wash_vendors WHERE id = NEW.assigned_vendor_id));
    IF payee IS NOT NULL AND payee <> NEW.customer_id AND COALESCE(NEW.provider_earning, 0) > 0 THEN
      PERFORM public.wallet_apply(payee, NEW.provider_earning, 'wash_earning', NULL, NEW.id::text,
        'Earning from completed wash (after commission)');
    END IF;
    NEW.earning_credited_at := now();
    NEW.progress := NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_wash_settle ON public.wash_bookings;
CREATE TRIGGER trg_wash_settle BEFORE UPDATE ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_wash_settle();

CREATE OR REPLACE FUNCTION public.withdrawable_balance(_user uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := COALESCE(_user, auth.uid()); bal numeric; earned numeric; withdrawn numeric;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  IF uid <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(balance, 0) INTO bal FROM public.wallets WHERE user_id = uid;
  SELECT COALESCE(sum(amount), 0) INTO earned FROM public.wallet_transactions
   WHERE user_id = uid AND kind IN ('booking_earning','driver_earning','driver_refund_reversal','wash_earning');
  SELECT COALESCE(sum(amount), 0) INTO withdrawn FROM public.withdrawals
   WHERE user_id = uid AND status <> 'rejected';
  RETURN GREATEST(0, LEAST(COALESCE(bal, 0), earned - withdrawn));
END; $$;

-- Same as phase 1, plus cleaners and center owners may withdraw.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric, _method text, _upi_id text DEFAULT NULL, _account_name text DEFAULT NULL,
  _account_number text DEFAULT NULL, _ifsc text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s RECORD; avail numeric; wid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.cleaners WHERE id = uid)
     AND NOT EXISTS (SELECT 1 FROM public.wash_vendors WHERE owner_id = uid) THEN
    RAISE EXCEPTION 'Only hosts, drivers, cleaners and washing centers can withdraw earnings';
  END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = 1;
  _amount := round(COALESCE(_amount, 0), 2);
  IF _amount < COALESCE(s.min_withdrawal, 0) OR _amount <= 0 THEN
    RAISE EXCEPTION 'Minimum withdrawal is Rs %', s.min_withdrawal;
  END IF;

  -- Serialise concurrent requests from the same user.
  PERFORM 1 FROM public.wallets WHERE user_id = uid FOR UPDATE;
  avail := public.withdrawable_balance(uid);
  IF _amount > avail THEN RAISE EXCEPTION 'You can withdraw at most Rs %', avail; END IF;

  IF _method = 'upi' THEN
    IF COALESCE(btrim(_upi_id), '') !~ '^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID';
    END IF;
  ELSIF _method = 'bank' THEN
    IF COALESCE(btrim(_account_name), '') = '' THEN RAISE EXCEPTION 'Enter the account holder name'; END IF;
    IF COALESCE(btrim(_account_number), '') !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid account number'; END IF;
    IF upper(COALESCE(btrim(_ifsc), '')) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid IFSC code'; END IF;
  ELSE
    RAISE EXCEPTION 'Choose UPI or bank transfer';
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, upi_id, account_name, account_number, ifsc)
  VALUES (uid, _amount, _method,
          CASE WHEN _method = 'upi' THEN btrim(_upi_id) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_name) END,
          CASE WHEN _method = 'bank' THEN btrim(_account_number) END,
          CASE WHEN _method = 'bank' THEN upper(btrim(_ifsc)) END)
  RETURNING id INTO wid;

  PERFORM public.wallet_apply(uid, -_amount, 'payout', NULL, wid::text, 'Withdrawal requested');
  PERFORM public.notify_admins('New withdrawal request', 'Rs ' || _amount || ' via ' || _method || ' — review in Payouts.', '/admin');
  RETURN wid;
END; $$;

-- =====================================================================
-- 6. Function privileges
-- =====================================================================
REVOKE ALL ON FUNCTION public.tg_cleaner_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_wash_vendor_owner_guard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_wash_settle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_verify_cleaner(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_cleaner(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_wash_job_provider(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_wash_job_provider(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wash_job_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wash_job_board() TO authenticated;
REVOKE ALL ON FUNCTION public.claim_wash_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_wash_job(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.advance_wash_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_wash_job(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.withdrawable_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdrawable_balance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text, text, text) TO authenticated;
