"""Corporate accounts and approval windows (CO-01 to CO-21).

Tables:
- public.companies
- public.company_members
- public.company_policies
- public.company_trips
- public.company_invoices

Functions:
- public.check_corporate_policy(_company_id uuid, _user_id uuid, _service text, _amount numeric) RETURNS jsonb
- public.create_corporate_trip(...) RETURNS jsonb
- public.corporate_decide_trip(_trip_id uuid, _decision text) RETURNS jsonb
- public.flag_corporate_trip(_trip_id uuid, _reason text) RETURNS jsonb
- public.generate_corporate_invoice(_company_id uuid, _month text) RETURNS uuid
- Updates cancel_booking and cancel_driver_booking to refund to company wallet on corporate trips
- Extends expire_booking_windows to handle expired corporate manager approvals
"""

from django.db import migrations

SQL = r"""
-- 1. Tables
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gstin text NOT NULL UNIQUE,
  billing_email text NOT NULL,
  city text NOT NULL DEFAULT 'Bengaluru',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  credit_limit numeric NOT NULL DEFAULT 0,
  wallet_balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
  department text,
  monthly_limit numeric NOT NULL DEFAULT 10000,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.company_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  allowed_services text[] NOT NULL DEFAULT ARRAY['rental', 'driver', 'wash'],
  max_price_per_day numeric NOT NULL DEFAULT 5000,
  approval_threshold numeric NOT NULL DEFAULT 3000,
  require_manager_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  driver_booking_id uuid REFERENCES public.driver_bookings(id) ON DELETE SET NULL,
  wash_booking_id uuid REFERENCES public.wash_bookings(id) ON DELETE SET NULL,
  service_type text NOT NULL CHECK (service_type IN ('rental', 'driver', 'wash')),
  amount numeric NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('auto', 'pending', 'approved', 'rejected', 'expired')),
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manager_decided_at timestamptz,
  respond_by timestamptz,
  is_flagged boolean NOT NULL DEFAULT false,
  flagged_reason text,
  flagged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  month text NOT NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  igst numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Companies
DROP POLICY IF EXISTS "Companies viewable by members and admins" ON public.companies;
CREATE POLICY "Companies viewable by members and admins" ON public.companies
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Companies insertable by authenticated or admin" ON public.companies;
CREATE POLICY "Companies insertable by authenticated or admin" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Companies updatable by company admin or platform admin" ON public.companies;
CREATE POLICY "Companies updatable by company admin or platform admin" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Company Members
DROP POLICY IF EXISTS "Company members viewable by members of same company" ON public.company_members;
CREATE POLICY "Company members viewable by members of same company" ON public.company_members
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members manageable by company admin or platform admin" ON public.company_members;
CREATE POLICY "Company members manageable by company admin or platform admin" ON public.company_members
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Company Policies
DROP POLICY IF EXISTS "Company policies viewable by members" ON public.company_policies;
CREATE POLICY "Company policies viewable by members" ON public.company_policies
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company policies manageable by company admin" ON public.company_policies;
CREATE POLICY "Company policies manageable by company admin" ON public.company_policies
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Company Trips
DROP POLICY IF EXISTS "Company trips viewable by company members" ON public.company_trips;
CREATE POLICY "Company trips viewable by company members" ON public.company_trips
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company trips insertable by company employees" ON public.company_trips;
CREATE POLICY "Company trips insertable by company employees" ON public.company_trips
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR member_id IN (SELECT id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company trips updatable by managers and admins" ON public.company_trips;
CREATE POLICY "Company trips updatable by managers and admins" ON public.company_trips
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Company Invoices
DROP POLICY IF EXISTS "Company invoices viewable by members" ON public.company_invoices;
CREATE POLICY "Company invoices viewable by members" ON public.company_invoices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Company invoices manageable by platform admin" ON public.company_invoices;
CREATE POLICY "Company invoices manageable by platform admin" ON public.company_invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Policy Check Function
CREATE OR REPLACE FUNCTION public.check_corporate_policy(
  _company_id uuid,
  _user_id uuid,
  _service text,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  comp RECORD;
  mem RECORD;
  pol RECORD;
  current_spend numeric := 0;
  mgr_id uuid;
BEGIN
  -- 1. Check company
  SELECT * INTO comp FROM public.companies WHERE id = _company_id;
  IF comp IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Company not found');
  END IF;
  IF comp.status = 'paused' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Company booking is paused');
  END IF;
  IF comp.verification_status <> 'approved' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Company not approved yet');
  END IF;

  -- 2. Check member
  SELECT * INTO mem FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id;
  IF mem IS NULL OR mem.status <> 'active' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Employee is not an active company member');
  END IF;

  -- Find a manager or admin in the company
  SELECT user_id INTO mgr_id
  FROM public.company_members
  WHERE company_id = _company_id AND role IN ('manager', 'admin') AND user_id <> _user_id
  ORDER BY role = 'manager' DESC LIMIT 1;
  IF mgr_id IS NULL THEN
    SELECT user_id INTO mgr_id FROM public.company_members WHERE company_id = _company_id AND role = 'admin' LIMIT 1;
  END IF;

  -- 3. Check policy
  SELECT * INTO pol FROM public.company_policies WHERE company_id = _company_id;

  -- Check allowed services
  IF pol.allowed_services IS NOT NULL AND NOT (_service = ANY(pol.allowed_services)) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'in_policy', false,
      'reason', format('Service %s is not permitted under corporate policy', _service),
      'member_id', mem.id,
      'manager_id', mgr_id
    );
  END IF;

  -- Check price per day / cap
  IF pol.max_price_per_day IS NOT NULL AND _amount > pol.max_price_per_day THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'in_policy', false,
      'reason', format('Amount exceeds policy limit of ₹%s', pol.max_price_per_day),
      'member_id', mem.id,
      'manager_id', mgr_id
    );
  END IF;

  -- Check monthly limit
  SELECT coalesce(sum(amount), 0) INTO current_spend
  FROM public.company_trips
  WHERE member_id = mem.id
    AND approval_status IN ('auto', 'approved', 'pending')
    AND created_at >= date_trunc('month', now());

  IF (current_spend + _amount) > mem.monthly_limit THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'in_policy', false,
      'reason', format('Monthly spend limit of ₹%s exceeded', mem.monthly_limit),
      'member_id', mem.id,
      'manager_id', mgr_id
    );
  END IF;

  -- Within policy
  RETURN jsonb_build_object(
    'allowed', true,
    'in_policy', true,
    'reason', 'Within corporate policy',
    'member_id', mem.id,
    'manager_id', mgr_id
  );
END;
$$;

-- 5. Create Corporate Trip Function
CREATE OR REPLACE FUNCTION public.create_corporate_trip(
  _company_id uuid,
  _booking_id uuid DEFAULT NULL,
  _driver_booking_id uuid DEFAULT NULL,
  _wash_booking_id uuid DEFAULT NULL,
  _service_type text DEFAULT 'rental',
  _amount numeric DEFAULT 0,
  _force_personal boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pol_res jsonb;
  v_in_policy boolean;
  v_member_id uuid;
  v_manager_id uuid;
  v_trip_id uuid;
  v_status text := 'pending';
  v_starts_at timestamptz;
  v_respond_by timestamptz;
  v_comp RECORD;
  v_uid uuid;
BEGIN
  IF _force_personal THEN
    RETURN jsonb_build_object('success', true, 'mode', 'personal');
  END IF;

  v_uid := COALESCE(auth.uid(),
                    (SELECT customer_id FROM public.bookings WHERE id = _booking_id),
                    (SELECT customer_id FROM public.driver_bookings WHERE id = _driver_booking_id),
                    (SELECT customer_id FROM public.wash_bookings WHERE id = _wash_booking_id));

  pol_res := public.check_corporate_policy(_company_id, v_uid, _service_type, _amount);
  IF NOT (pol_res->>'allowed')::boolean THEN
    RAISE EXCEPTION '%', pol_res->>'reason';
  END IF;

  v_in_policy := (pol_res->>'in_policy')::boolean;
  v_member_id := (pol_res->>'member_id')::uuid;
  v_manager_id := (pol_res->>'manager_id')::uuid;

  SELECT * INTO v_comp FROM public.companies WHERE id = _company_id;

  -- Calculate booking deadline from the underlying booking
  IF _booking_id IS NOT NULL THEN
    SELECT (start_date + pickup_time) AT TIME ZONE 'Asia/Kolkata' INTO v_starts_at
    FROM public.bookings WHERE id = _booking_id;
  ELSIF _driver_booking_id IS NOT NULL THEN
    SELECT (start_date + start_time) AT TIME ZONE 'Asia/Kolkata' INTO v_starts_at
    FROM public.driver_bookings WHERE id = _driver_booking_id;
  ELSIF _wash_booking_id IS NOT NULL THEN
    SELECT (slot_date + slot_time) AT TIME ZONE 'Asia/Kolkata' INTO v_starts_at
    FROM public.wash_bookings WHERE id = _wash_booking_id;
  END IF;

  IF v_starts_at IS NOT NULL THEN
    v_respond_by := public.booking_deadline(now(), v_starts_at, interval '1 hour');
  ELSE
    v_respond_by := now() + interval '1 hour';
  END IF;

  IF v_in_policy THEN
    v_status := 'auto';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO public.company_trips (
    company_id, member_id, booking_id, driver_booking_id, wash_booking_id,
    service_type, amount, approval_status, manager_id, respond_by
  ) VALUES (
    _company_id, v_member_id, _booking_id, _driver_booking_id, _wash_booking_id,
    _service_type, _amount, v_status, v_manager_id, v_respond_by
  ) RETURNING id INTO v_trip_id;

  -- If in policy and booking confirmed immediately (e.g. instant book or wash):
  IF v_in_policy THEN
    IF _booking_id IS NOT NULL THEN
      IF (SELECT status FROM public.bookings WHERE id = _booking_id) = 'confirmed' THEN
        -- Instant book confirmed: charge company wallet
        UPDATE public.companies SET wallet_balance = wallet_balance - _amount WHERE id = _company_id;
        UPDATE public.bookings SET payment_status = 'paid', paid_at = now(), pay_by = NULL WHERE id = _booking_id;
      END IF;
    ELSIF _wash_booking_id IS NOT NULL THEN
      UPDATE public.companies SET wallet_balance = wallet_balance - _amount WHERE id = _company_id;
      UPDATE public.wash_bookings SET payment_status = 'paid', paid_at = now(), pay_by = NULL WHERE id = _wash_booking_id;
    END IF;
  ELSE
    -- Notify manager for approval
    IF v_manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        v_manager_id,
        'Corporate trip approval requested',
        format('An employee requested an out-of-policy %s (₹%s) awaiting your approval.', _service_type, _amount),
        '/corporate'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'trip_id', v_trip_id,
    'approval_status', v_status,
    'in_policy', v_in_policy,
    'respond_by', v_respond_by
  );
END;
$$;

-- 6. Manager Trip Decision Function
CREATE OR REPLACE FUNCTION public.corporate_decide_trip(
  _trip_id uuid,
  _decision text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ct RECORD;
  is_mgr boolean;
  emp_id uuid;
BEGIN
  SELECT * INTO ct FROM public.company_trips WHERE id = _trip_id FOR UPDATE;
  IF ct IS NULL THEN
    RAISE EXCEPTION 'Corporate trip not found';
  END IF;

  -- Verify caller is manager/admin of the company
  SELECT (role IN ('manager', 'admin')) INTO is_mgr
  FROM public.company_members
  WHERE company_id = ct.company_id AND user_id = auth.uid() AND status = 'active';

  IF NOT (COALESCE(is_mgr, false) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to approve corporate trips for this company';
  END IF;

  IF ct.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This trip is already %', ct.approval_status;
  END IF;

  IF ct.respond_by IS NOT NULL AND now() > ct.respond_by THEN
    RAISE EXCEPTION 'Approval deadline has expired';
  END IF;

  SELECT user_id INTO emp_id FROM public.company_members WHERE id = ct.member_id;

  IF _decision = 'approve' THEN
    UPDATE public.company_trips
    SET approval_status = 'approved',
        manager_decided_at = now(),
        updated_at = now()
    WHERE id = _trip_id;

    -- If provider already approved (or for wash): confirm and charge company
    IF ct.booking_id IS NOT NULL THEN
      IF (SELECT status FROM public.bookings WHERE id = ct.booking_id) = 'confirmed' THEN
        UPDATE public.companies SET wallet_balance = wallet_balance - ct.amount WHERE id = ct.company_id;
        UPDATE public.bookings SET payment_status = 'paid', paid_at = now(), pay_by = NULL WHERE id = ct.booking_id;
      END IF;
    ELSIF ct.driver_booking_id IS NOT NULL THEN
      IF (SELECT status FROM public.driver_bookings WHERE id = ct.driver_booking_id) = 'confirmed' THEN
        UPDATE public.companies SET wallet_balance = wallet_balance - ct.amount WHERE id = ct.company_id;
        UPDATE public.driver_bookings SET payment_status = 'paid', paid_at = now(), pay_by = NULL WHERE id = ct.driver_booking_id;
      END IF;
    ELSIF ct.wash_booking_id IS NOT NULL THEN
      UPDATE public.companies SET wallet_balance = wallet_balance - ct.amount WHERE id = ct.company_id;
      UPDATE public.wash_bookings SET payment_status = 'paid', paid_at = now(), pay_by = NULL WHERE id = ct.wash_booking_id;
    END IF;

    IF emp_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (emp_id, 'Corporate trip approved', 'Your manager approved your trip request.', '/corporate');
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'approved');

  ELSIF _decision = 'reject' THEN
    UPDATE public.company_trips
    SET approval_status = 'rejected',
        manager_decided_at = now(),
        updated_at = now()
    WHERE id = _trip_id;

    -- Cancel linked bookings
    IF ct.booking_id IS NOT NULL THEN
      UPDATE public.bookings
      SET status = 'cancelled', cancellation_reason = 'company_declined', cancelled_at = now()
      WHERE id = ct.booking_id AND status IN ('pending', 'confirmed');
    ELSIF ct.driver_booking_id IS NOT NULL THEN
      UPDATE public.driver_bookings
      SET status = 'cancelled', cancellation_reason = 'company_declined', cancelled_at = now()
      WHERE id = ct.driver_booking_id AND status IN ('pending', 'confirmed');
    ELSIF ct.wash_booking_id IS NOT NULL THEN
      UPDATE public.wash_bookings
      SET status = 'cancelled', cancellation_reason = 'company_declined', cancelled_at = now()
      WHERE id = ct.wash_booking_id AND status IN ('pending', 'confirmed');
    END IF;

    IF emp_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (emp_id, 'Corporate trip rejected', 'Your manager declined your trip request.', '/corporate');
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  ELSE
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;
END;
$$;

-- 7. Flag Corporate Trip Function
CREATE OR REPLACE FUNCTION public.flag_corporate_trip(
  _trip_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ct RECORD;
  is_mgr boolean;
BEGIN
  SELECT * INTO ct FROM public.company_trips WHERE id = _trip_id;
  IF ct IS NULL THEN
    RAISE EXCEPTION 'Corporate trip not found';
  END IF;

  SELECT (role IN ('manager', 'admin')) INTO is_mgr
  FROM public.company_members
  WHERE company_id = ct.company_id AND user_id = auth.uid();

  IF NOT (COALESCE(is_mgr, false) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to flag corporate trips for this company';
  END IF;

  UPDATE public.company_trips
  SET is_flagged = true,
      flagged_reason = _reason,
      flagged_at = now(),
      updated_at = now()
  WHERE id = _trip_id;

  RETURN jsonb_build_object('success', true, 'trip_id', _trip_id, 'flagged', true);
END;
$$;

-- 8. Generate Corporate Invoice Function
CREATE OR REPLACE FUNCTION public.generate_corporate_invoice(
  _company_id uuid,
  _month text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tot numeric := 0;
  v_base numeric := 0;
  v_tax numeric := 0;
  v_half numeric := 0;
  v_inv_no text;
  v_id uuid;
BEGIN
  SELECT coalesce(sum(amount), 0) INTO v_tot
  FROM public.company_trips
  WHERE company_id = _company_id
    AND approval_status IN ('auto', 'approved')
    AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = _month;

  v_base := round(v_tot / 1.18, 2);
  v_tax := v_tot - v_base;
  v_half := round(v_tax / 2.0, 2);

  v_inv_no := format('INV-%s-%s', to_char(now(), 'YYYYMMDD'), substr(gen_random_uuid()::text, 1, 6));

  INSERT INTO public.company_invoices (
    company_id, invoice_number, month, base_amount, cgst, sgst, igst, total, status, due_date, paid_at
  ) VALUES (
    _company_id, v_inv_no, _month, v_base, v_half, v_half, 0, v_tot, 'paid', (CURRENT_DATE + interval '30 days')::date, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 9. Update cancel_booking and cancel_driver_booking to refund to company wallet if corporate
CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; by_provider boolean; is_admin boolean; new_pay text;
  m_plan text := 'free';
  corp_comp_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  by_provider := (b.vendor_id = auth.uid());
  IF NOT is_admin AND NOT by_provider AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;
  IF b.status IN ('cancelled','rejected','completed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;
  IF b.pickup_checked_at IS NOT NULL AND NOT is_admin THEN
    RAISE EXCEPTION 'The trip has started — raise a dispute instead';
  END IF;

  starts_at := (b.start_date::timestamp + b.pickup_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = b.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR by_provider THEN
      pct := 1;
    ELSIF m_plan = 'black' THEN
      IF hours_left >= 2 THEN pct := 1;
      ELSIF hours_left >= 0 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSIF m_plan = 'plus' THEN
      IF hours_left >= 6 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSE
      IF hours_left >= 24 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    END IF;

    refund := b.security_deposit + round((b.total_price - b.security_deposit) * pct, 2);
    share := round(b.provider_earning * (1 - pct), 2);

    -- Check if corporate trip
    SELECT company_id INTO corp_comp_id
    FROM public.company_trips
    WHERE booking_id = b.id AND approval_status IN ('auto', 'approved') LIMIT 1;

    IF refund > 0 THEN
      IF corp_comp_id IS NOT NULL THEN
        -- Refund directly to company wallet
        UPDATE public.companies SET wallet_balance = wallet_balance + refund WHERE id = corp_comp_id;
      ELSE
        PERFORM public.wallet_apply(b.customer_id, refund, 'refund', b.id, NULL,
          CASE WHEN pct = 1 THEN 'Full refund for cancelled booking' ELSE 'Partial refund for cancelled booking' END);
      END IF;
    END IF;

    IF share > 0 AND b.vendor_id <> b.customer_id AND b.earning_credited_at IS NULL THEN
      PERFORM public.wallet_apply(b.vendor_id, share, 'booking_earning', b.id, NULL,
        'Late-cancellation share (after commission)');
    END IF;
    new_pay := CASE WHEN pct = 1 THEN 'refunded' ELSE 'partially_refunded' END;
  ELSE
    new_pay := b.payment_status;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled', payment_status = new_pay, refund_amount = refund,
         earning_credited_at = CASE WHEN b.payment_status = 'paid' THEN now() ELSE earning_credited_at END,
         cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = b.id;

  RETURN jsonb_build_object('refund', refund, 'percent', pct * 100, 'provider_share', share,
                            'payment_status', new_pay, 'cancelled_by_provider', by_provider);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_driver_booking(_driver_booking_id uuid, _reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; share numeric := 0; is_driver boolean; is_admin boolean; new_pay_status text;
  m_plan text := 'free';
  corp_comp_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Hire not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  is_driver := (b.driver_id = auth.uid());
  IF NOT is_admin AND NOT is_driver AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;
  IF b.status IN ('cancelled','rejected','completed') THEN
    RAISE EXCEPTION 'This hire can no longer be cancelled';
  END IF;

  starts_at := (b.start_date::timestamp + b.start_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  SELECT COALESCE(membership_plan, 'free') INTO m_plan
  FROM public.profiles
  WHERE id = b.customer_id
    AND (membership_expires_at IS NULL OR membership_expires_at > now());
  IF m_plan IS NULL THEN m_plan := 'free'; END IF;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR is_driver THEN
      pct := 1;
    ELSIF m_plan = 'black' THEN
      IF hours_left >= 2 THEN pct := 1;
      ELSIF hours_left >= 0 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSIF m_plan = 'plus' THEN
      IF hours_left >= 6 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    ELSE
      IF hours_left >= 24 THEN pct := 1;
      ELSIF hours_left >= 2 THEN pct := 0.5;
      ELSE pct := 0; END IF;
    END IF;

    refund := round(COALESCE(b.total_price, 0) * pct, 2);
    share := round(b.provider_earning * (1 - pct), 2);

    -- Check if corporate trip
    SELECT company_id INTO corp_comp_id
    FROM public.company_trips
    WHERE driver_booking_id = b.id AND approval_status IN ('auto', 'approved') LIMIT 1;

    IF refund > 0 THEN
      IF corp_comp_id IS NOT NULL THEN
        UPDATE public.companies SET wallet_balance = wallet_balance + refund WHERE id = corp_comp_id;
      ELSE
        PERFORM public.wallet_apply(b.customer_id, refund, 'driver_refund', NULL, b.id::text,
          CASE WHEN pct = 1 THEN 'Full refund for cancelled driver hire' ELSE 'Partial refund for cancelled driver hire' END);
      END IF;
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

-- 10. Extend expire_booking_windows() with corporate section
CREATE OR REPLACE FUNCTION public.expire_booking_windows() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_expired_pending integer := 0;
  v_expired_unpaid integer := 0;
  v_reminded_respond integer := 0;
  v_reminded_pay integer := 0;
  v_listings_paused integer := 0;
  v_driver_expired_pending integer := 0;
  v_driver_expired_unpaid integer := 0;
  v_driver_reminded_respond integer := 0;
  v_driver_reminded_pay integer := 0;
  v_wash_expired_unpaid integer := 0;
  v_wash_auto_cancelled integer := 0;
  v_wash_admin_alerted integer := 0;
  v_pool_expired_pending integer := 0;
  v_pool_reminded_respond integer := 0;
  v_corporate_expired_pending integer := 0;
  r RECORD;
  _v RECORD;
  _slot_start timestamptz;
  _lead_time interval;
  _elapsed interval;
  _alert_time timestamptz;
  _cancel_time timestamptz;
  _target_tier smallint;
  admin_rec RECORD;
  cleaner_rec RECORD;
  pool_rec RECORD;
  corp_rec RECORD;
BEGIN
  -- 1a. Cancel expired pending rental requests (host_no_response)
  FOR r IN
    SELECT b.id, b.customer_id, b.vendor_id, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'pending' AND b.respond_by < now()
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'host_no_response',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Request expired', format('Host did not respond in time for %s.', COALESCE(r.vehicle_title, 'the vehicle')), '/bookings'),
      (r.vendor_id, 'Request expired', format('Booking request for %s expired without response.', COALESCE(r.vehicle_title, 'your vehicle')), '/vendor');

    v_expired_pending := v_expired_pending + 1;
  END LOOP;

  -- 1b. Cancel expired confirmed unpaid rentals (payment_timeout)
  FOR r IN
    SELECT b.id, b.customer_id, b.vendor_id, v.title AS vehicle_title
    FROM public.bookings b
    LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
    WHERE b.status = 'confirmed' AND b.payment_status <> 'paid' AND b.pay_by < now()
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Payment window expired', format('Payment was not completed in time for %s.', COALESCE(r.vehicle_title, 'the vehicle')), '/bookings'),
      (r.vendor_id, 'Payment window expired', format('Customer did not pay in time for %s.', COALESCE(r.vehicle_title, 'your vehicle')), '/vendor');

    v_expired_unpaid := v_expired_unpaid + 1;
  END LOOP;

  -- 1c. Halfway reminder for pending rental requests (to host)
  FOR r IN
    SELECT b.id, b.vendor_id, b.respond_by
    FROM public.bookings b
    WHERE b.status = 'pending'
      AND b.respond_reminded_at IS NULL
      AND b.respond_by IS NOT NULL
      AND now() >= (b.created_at + ((b.respond_by - b.created_at) / 2))
      AND now() < b.respond_by
  LOOP
    UPDATE public.bookings
    SET respond_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.vendor_id,
      'Pending booking request',
      format('A booking request is awaiting your response before %s.', to_char(r.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/vendor'
    );

    v_reminded_respond := v_reminded_respond + 1;
  END LOOP;

  -- 1d. Halfway reminder for confirmed unpaid rentals (to customer)
  FOR r IN
    SELECT b.id, b.customer_id, b.pay_by
    FROM public.bookings b
    WHERE b.status = 'confirmed'
      AND b.payment_status <> 'paid'
      AND b.pay_reminded_at IS NULL
      AND b.pay_by IS NOT NULL
      AND now() >= (COALESCE(b.confirmed_at, b.created_at) + ((b.pay_by - COALESCE(b.confirmed_at, b.created_at)) / 2))
      AND now() < b.pay_by
  LOOP
    UPDATE public.bookings
    SET pay_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Complete your booking payment',
      format('Your booking is confirmed! Complete payment before %s to secure your vehicle.', to_char(r.pay_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/bookings'
    );

    v_reminded_pay := v_reminded_pay + 1;
  END LOOP;

  -- 1e. Auto-pause host listings when 3 or more requests expire with 'host_no_response' in 30 days
  FOR _v IN
    SELECT v.id AS vendor_id
    FROM public.vendors v
    WHERE (
      SELECT count(*)
      FROM public.bookings b
      WHERE b.vendor_id = v.id
        AND b.cancellation_reason = 'host_no_response'
        AND b.cancelled_at >= (now() - interval '30 days')
        AND (v.listings_reactivated_at IS NULL OR b.cancelled_at > v.listings_reactivated_at)
    ) >= 3
    AND EXISTS (
      SELECT 1 FROM public.vehicles veh WHERE veh.vendor_id = v.id AND veh.status = 'active'
    )
    AND (
      v.listings_paused_at IS NULL
      OR (v.listings_reactivated_at IS NOT NULL AND v.listings_reactivated_at > v.listings_paused_at)
    )
  LOOP
    UPDATE public.vehicles
    SET status = 'paused'
    WHERE vendor_id = _v.vendor_id
      AND status = 'active';

    UPDATE public.vendors
    SET listings_paused_at = now()
    WHERE id = _v.vendor_id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      _v.vendor_id,
      'Listings paused',
      'Your listings are paused because 3 requests expired without a response. Turn them back on from your dashboard.',
      '/vendor'
    );

    v_listings_paused := v_listings_paused + 1;
  END LOOP;

  -- 2a. Cancel expired pending driver requests (driver_no_response)
  FOR r IN
    SELECT db.id, db.customer_id, db.driver_id, d.full_name AS driver_name
    FROM public.driver_bookings db
    LEFT JOIN public.drivers d ON d.id = db.driver_id
    WHERE db.status = 'pending' AND db.respond_by < now()
  LOOP
    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'driver_no_response',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Request expired', format('Driver %s did not respond in time for your hire.', COALESCE(r.driver_name, 'the driver')), '/hires'),
      (r.driver_id, 'Request expired', 'Driver hire request expired without response.', '/driver-dashboard');

    v_driver_expired_pending := v_driver_expired_pending + 1;
  END LOOP;

  -- 2b. Cancel expired confirmed unpaid driver hires (payment_timeout)
  FOR r IN
    SELECT db.id, db.customer_id, db.driver_id, d.full_name AS driver_name
    FROM public.driver_bookings db
    LEFT JOIN public.drivers d ON d.id = db.driver_id
    WHERE db.status = 'confirmed' AND db.payment_status <> 'paid' AND db.pay_by < now()
  LOOP
    UPDATE public.driver_bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES
      (r.customer_id, 'Payment window expired', format('Payment was not completed in time for driver hire with %s.', COALESCE(r.driver_name, 'the driver')), '/hires'),
      (r.driver_id, 'Payment window expired', 'Customer did not pay in time for driver hire.', '/driver-dashboard');

    v_driver_expired_unpaid := v_driver_expired_unpaid + 1;
  END LOOP;

  -- 2c. Halfway reminder for pending driver requests (to driver)
  FOR r IN
    SELECT db.id, db.driver_id, db.respond_by
    FROM public.driver_bookings db
    WHERE db.status = 'pending'
      AND db.respond_reminded_at IS NULL
      AND db.respond_by IS NOT NULL
      AND now() >= (db.created_at + ((db.respond_by - db.created_at) / 2))
      AND now() < db.respond_by
  LOOP
    UPDATE public.driver_bookings
    SET respond_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.driver_id,
      'Pending driver hire request',
      format('A hire request is awaiting your response before %s.', to_char(r.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/driver-dashboard'
    );

    v_driver_reminded_respond := v_driver_reminded_respond + 1;
  END LOOP;

  -- 2d. Halfway reminder for confirmed unpaid driver hires (to customer)
  FOR r IN
    SELECT db.id, db.customer_id, db.pay_by
    FROM public.driver_bookings db
    WHERE db.status = 'confirmed'
      AND db.payment_status <> 'paid'
      AND db.pay_reminded_at IS NULL
      AND db.pay_by IS NOT NULL
      AND now() >= (COALESCE(db.confirmed_at, db.created_at) + ((db.pay_by - COALESCE(db.confirmed_at, db.created_at)) / 2))
      AND now() < db.pay_by
  LOOP
    UPDATE public.driver_bookings
    SET pay_reminded_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Complete your driver hire payment',
      format('Your hire is confirmed! Complete payment before %s to secure your driver.', to_char(r.pay_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/hires'
    );

    v_driver_reminded_pay := v_driver_reminded_pay + 1;
  END LOOP;

  -- 3a. Cancel expired pending unpaid washes
  FOR r IN
    SELECT wb.id, wb.customer_id, wb.slot_date, wb.slot_time
    FROM public.wash_bookings wb
    WHERE wb.status = 'pending'
      AND wb.payment_status <> 'paid'
      AND wb.pay_by IS NOT NULL
      AND wb.pay_by < now()
  LOOP
    UPDATE public.wash_bookings
    SET status = 'cancelled',
        cancellation_reason = 'payment_timeout',
        cancelled_at = now()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Payment window expired',
      'Payment was not completed in time for your doorstep wash.',
      '/washes'
    );

    v_wash_expired_unpaid := v_wash_expired_unpaid + 1;
  END LOOP;

  -- 3b. Tier widening for unclaimed paid washes
  CREATE TEMP TABLE IF NOT EXISTS tmp_tier_alerts (
    cleaner_id uuid,
    wash_id uuid,
    target_tier smallint
  ) ON COMMIT DROP;
  DELETE FROM tmp_tier_alerts;

  FOR r IN
    SELECT wb.id, wb.tier_notified, wb.paid_at, wb.slot_date, wb.slot_time
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    _elapsed := now() - r.paid_at;

    IF r.tier_notified >= 3 THEN
      _target_tier := 3;
    ELSIF _lead_time > INTERVAL '24 hours' THEN
      IF _elapsed >= INTERVAL '8 hours' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '4 hours' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      IF _elapsed >= INTERVAL '2 hours' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '1 hour' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    ELSE -- < 6 hours
      IF _elapsed >= INTERVAL '30 minutes' THEN
        _target_tier := 3;
      ELSIF _elapsed >= INTERVAL '15 minutes' THEN
        _target_tier := 2;
      ELSE
        _target_tier := 1;
      END IF;
    END IF;

    IF _target_tier > r.tier_notified THEN
      INSERT INTO tmp_tier_alerts (cleaner_id, wash_id, target_tier)
      SELECT c.id, r.id, _target_tier
      FROM public.cleaners c
      WHERE public.can_cleaner_see_wash_job(c.id, r.id);

      UPDATE public.wash_bookings
      SET tier_notified = _target_tier
      WHERE id = r.id;
    END IF;
  END LOOP;

  FOR cleaner_rec IN
    SELECT cleaner_id, count(*) AS new_jobs
    FROM tmp_tier_alerts
    GROUP BY cleaner_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      cleaner_rec.cleaner_id,
      'New wash jobs near you',
      format('%s new wash job%s near you', cleaner_rec.new_jobs, CASE WHEN cleaner_rec.new_jobs > 1 THEN 's' ELSE '' END),
      '/cleaner-dashboard'
    );
  END LOOP;

  -- 3c. Admin alerts for jobs with no cleaner
  FOR r IN
    SELECT wb.id, wb.city, wb.slot_date, wb.slot_time, wb.paid_at
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
      AND wb.admin_alerted_at IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    IF _lead_time > INTERVAL '24 hours' THEN
      _alert_time := _slot_start - INTERVAL '12 hours';
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      _alert_time := _slot_start - INTERVAL '3 hours';
    ELSE
      _alert_time := _slot_start - INTERVAL '1 hour';
    END IF;

    IF now() >= _alert_time THEN
      UPDATE public.wash_bookings
      SET admin_alerted_at = now()
      WHERE id = r.id;

      FOR admin_rec IN
        SELECT user_id FROM public.user_roles WHERE role = 'admin'
      LOOP
        INSERT INTO public.notifications (user_id, title, body, link)
        VALUES (
          admin_rec.user_id,
          'Wash job at risk',
          format('Doorstep wash in %s on %s has no washer assigned yet.', r.city, r.slot_date),
          '/admin'
        );
      END LOOP;
      v_wash_admin_alerted := v_wash_admin_alerted + 1;
    END IF;
  END LOOP;

  -- 3d. Auto-cancel and refund at auto-cancel time
  FOR r IN
    SELECT wb.id, wb.customer_id, wb.price, wb.slot_date, wb.slot_time, wb.paid_at
    FROM public.wash_bookings wb
    WHERE wb.status = 'confirmed'
      AND wb.progress = 'confirmed'
      AND wb.payment_status = 'paid'
      AND wb.assigned_cleaner_id IS NULL
  LOOP
    _slot_start := (r.slot_date + r.slot_time) AT TIME ZONE 'Asia/Kolkata';
    _lead_time := _slot_start - r.paid_at;
    IF _lead_time > INTERVAL '24 hours' THEN
      _cancel_time := _slot_start - INTERVAL '2 hours';
    ELSIF _lead_time >= INTERVAL '6 hours' THEN
      _cancel_time := _slot_start - INTERVAL '1 hour';
    ELSE
      _cancel_time := _slot_start - INTERVAL '30 minutes';
    END IF;

    IF now() >= _cancel_time THEN
      UPDATE public.wash_bookings
      SET status = 'cancelled',
          cancellation_reason = 'no_washer',
          cancelled_at = now(),
          payment_status = 'refunded',
          refund_amount = r.price
      WHERE id = r.id;

      PERFORM public.wallet_apply(
        r.customer_id,
        r.price,
        'wash_refund',
        NULL,
        r.id::text,
        'Full refund: no washer partner available'
      );

      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        r.customer_id,
        'Wash cancelled & refunded',
        'No washer was available in time for your slot. A full refund has been credited to your wallet.',
        '/washes'
      );

      v_wash_auto_cancelled := v_wash_auto_cancelled + 1;
    END IF;
  END LOOP;

  -- 4a. Expire pending pool requests past respond_by or whose trip has departed or cancelled
  FOR pool_rec IN
    SELECT
      pr.id,
      pr.passenger_id,
      t.driver_id,
      t.depart_at,
      t.status AS trip_status,
      pr.respond_by,
      CASE
        WHEN t.status = 'cancelled' OR t.depart_at <= now() THEN 'Trip departed'
        ELSE 'Driver didn''t respond'
      END AS cancel_reason
    FROM public.pool_requests pr
    JOIN public.pool_trips t ON t.id = pr.trip_id
    WHERE pr.status = 'pending'
      AND (
        (pr.respond_by IS NOT NULL AND pr.respond_by < now())
        OR t.status = 'cancelled'
        OR t.depart_at <= now()
      )
  LOOP
    UPDATE public.pool_requests
    SET status = 'rejected',
        cancellation_reason = pool_rec.cancel_reason,
        updated_at = now()
    WHERE id = pool_rec.id;

    v_pool_expired_pending := v_pool_expired_pending + 1;
  END LOOP;

  -- 4b. Halfway reminder to pool trip driver
  FOR pool_rec IN
    SELECT
      pr.id,
      pr.trip_id,
      t.driver_id,
      pr.respond_by,
      pr.pickup_label,
      pr.drop_label
    FROM public.pool_requests pr
    JOIN public.pool_trips t ON t.id = pr.trip_id
    WHERE pr.status = 'pending'
      AND pr.respond_reminded_at IS NULL
      AND pr.respond_by IS NOT NULL
      AND now() >= (pr.created_at + ((pr.respond_by - pr.created_at) / 2))
      AND now() < pr.respond_by
  LOOP
    UPDATE public.pool_requests
    SET respond_reminded_at = now()
    WHERE id = pool_rec.id;

    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      pool_rec.driver_id,
      'Pending pool request',
      format('A passenger is waiting for your response for trip %s to %s before %s.',
             COALESCE(pool_rec.pickup_label, ''),
             COALESCE(pool_rec.drop_label, ''),
             to_char(pool_rec.respond_by AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')),
      '/pooling/driver'
    );

    v_pool_reminded_respond := v_pool_reminded_respond + 1;
  END LOOP;

  -- 5a. Expire pending corporate trip approvals past respond_by
  FOR corp_rec IN
    SELECT ct.id, ct.company_id, ct.booking_id, ct.driver_booking_id, ct.wash_booking_id,
           cm.user_id AS employee_id, ct.manager_id
    FROM public.company_trips ct
    JOIN public.company_members cm ON cm.id = ct.member_id
    WHERE ct.approval_status = 'pending'
      AND ct.respond_by IS NOT NULL
      AND ct.respond_by < now()
  LOOP
    UPDATE public.company_trips
    SET approval_status = 'expired',
        updated_at = now()
    WHERE id = corp_rec.id;

    IF corp_rec.booking_id IS NOT NULL THEN
      UPDATE public.bookings
      SET status = 'cancelled',
          cancellation_reason = 'manager_no_response',
          cancelled_at = now()
      WHERE id = corp_rec.booking_id AND status = 'pending';
    END IF;

    IF corp_rec.driver_booking_id IS NOT NULL THEN
      UPDATE public.driver_bookings
      SET status = 'cancelled',
          cancellation_reason = 'manager_no_response',
          cancelled_at = now()
      WHERE id = corp_rec.driver_booking_id AND status = 'pending';
    END IF;

    IF corp_rec.wash_booking_id IS NOT NULL THEN
      UPDATE public.wash_bookings
      SET status = 'cancelled',
          cancellation_reason = 'manager_no_response',
          cancelled_at = now()
      WHERE id = corp_rec.wash_booking_id AND status = 'pending';
    END IF;

    IF corp_rec.employee_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        corp_rec.employee_id,
        'Corporate approval expired',
        'Your manager did not respond to your trip request in time.',
        '/corporate'
      );
    END IF;

    IF corp_rec.manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        corp_rec.manager_id,
        'Corporate request expired',
        'A trip approval request expired without response.',
        '/corporate'
      );
    END IF;

    v_corporate_expired_pending := v_corporate_expired_pending + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'bookings_expired_pending', v_expired_pending,
    'bookings_expired_unpaid', v_expired_unpaid,
    'bookings_reminded_respond', v_reminded_respond,
    'bookings_reminded_pay', v_reminded_pay,
    'vendors_listings_paused', v_listings_paused,
    'driver_cancelled_pending', v_driver_expired_pending,
    'driver_cancelled_unpaid', v_driver_expired_unpaid,
    'driver_reminded_respond', v_driver_reminded_respond,
    'driver_reminded_pay', v_driver_reminded_pay,
    'wash_expired_unpaid', v_wash_expired_unpaid,
    'wash_auto_cancelled', v_wash_auto_cancelled,
    'wash_admin_alerted', v_wash_admin_alerted,
    'pool_expired_pending', v_pool_expired_pending,
    'pool_reminded_respond', v_pool_reminded_respond,
    'corporate_expired_pending', v_corporate_expired_pending
  );
END;
$$;

-- 11. Grants
GRANT ALL ON TABLE public.companies TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_members TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_policies TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_trips TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_invoices TO anon, authenticated, service_role;

GRANT ALL ON FUNCTION public.check_corporate_policy(uuid, uuid, text, numeric) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.create_corporate_trip(uuid, uuid, uuid, uuid, text, numeric, boolean) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.corporate_decide_trip(uuid, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.flag_corporate_trip(uuid, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.generate_corporate_invoice(uuid, text) TO anon, authenticated, service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.generate_corporate_invoice(uuid, text);
DROP FUNCTION IF EXISTS public.flag_corporate_trip(uuid, text);
DROP FUNCTION IF EXISTS public.corporate_decide_trip(uuid, text);
DROP FUNCTION IF EXISTS public.create_corporate_trip(uuid, uuid, uuid, uuid, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.check_corporate_policy(uuid, uuid, text, numeric);

DROP TABLE IF EXISTS public.company_invoices CASCADE;
DROP TABLE IF EXISTS public.company_trips CASCADE;
DROP TABLE IF EXISTS public.company_policies CASCADE;
DROP TABLE IF EXISTS public.company_members CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_provider_earning_notifications'),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE_SQL),
    ]
