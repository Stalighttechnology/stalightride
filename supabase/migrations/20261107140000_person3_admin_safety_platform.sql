-- Migration: 20261107140000_person3_admin_safety_platform.sql
-- Person 3: Admin, Trust and Safety, Platform Settings, Growth

-- =====================================================================
-- 1. Review Moderation & User Reports (Task 3.1)
-- =====================================================================

-- Allow admins to delete any review (recalculates vehicle rating via existing trigger)
DROP POLICY IF EXISTS "Admins delete reviews" ON public.reviews;
CREATE POLICY "Admins delete reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update review reported state and report reason
DROP POLICY IF EXISTS "Admins update reviews" ON public.reviews;
CREATE POLICY "Admins update reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RPC to remove review with rating recalculation (MD-01)
CREATE OR REPLACE FUNCTION public.admin_remove_review(_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  DELETE FROM public.reviews WHERE id = _review_id;
END;
$$;

-- RPC to dismiss review report (MD-02)
CREATE OR REPLACE FUNCTION public.admin_dismiss_review_report(_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  UPDATE public.reviews
     SET reported = false, report_reason = NULL
   WHERE id = _review_id;
END;
$$;

-- User reports table
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL, -- 'user', 'driver', 'host', 'trip', 'pooling_trip', 'review'
  target_id text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  admin_notes text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own reports" ON public.user_reports;
CREATE POLICY "Users insert own reports" ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users and admins read reports" ON public.user_reports;
CREATE POLICY "Users and admins read reports" ON public.user_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update reports" ON public.user_reports;
CREATE POLICY "Admins update reports" ON public.user_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete reports" ON public.user_reports;
CREATE POLICY "Admins delete reports" ON public.user_reports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 2. Support Tickets & Ticket Messages (Task 3.2)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'Other' CHECK (category IN ('Billing', 'Roadside', 'Safety', 'Account', 'Other')),
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Urgent', 'High', 'Medium', 'Low')),
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  description text NOT NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users and admins select tickets" ON public.support_tickets;
CREATE POLICY "Users and admins select tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert tickets" ON public.support_tickets;
CREATE POLICY "Users insert tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins update tickets" ON public.support_tickets;
CREATE POLICY "Admins update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users and admins select messages" ON public.ticket_messages;
CREATE POLICY "Users and admins select messages" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_messages.ticket_id AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Users and admins insert messages" ON public.ticket_messages;
CREATE POLICY "Users and admins insert messages" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_messages.ticket_id AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger to notify user when ticket is resolved or admin sends message
CREATE OR REPLACE FUNCTION public.notify_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'Resolved' AND OLD.status != 'Resolved' THEN
      INSERT INTO public.notifications (user_id, title, body, link)
      VALUES (
        NEW.user_id,
        'Support Ticket Resolved',
        format('Your ticket %s (%s) has been marked as resolved.', NEW.ticket_no, NEW.subject),
        '/help'
      );
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.is_admin THEN
    -- Admin message on ticket
    INSERT INTO public.notifications (user_id, title, body, link)
    SELECT
      t.user_id,
      'Support Reply',
      format('New reply on ticket %s: %s', t.ticket_no, substring(NEW.message from 1 for 60)),
      '/help'
    FROM public.support_tickets t
    WHERE t.id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_resolved ON public.support_tickets;
CREATE TRIGGER trg_notify_ticket_resolved
  AFTER UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_update();

DROP TRIGGER IF EXISTS trg_notify_ticket_reply ON public.ticket_messages;
CREATE TRIGGER trg_notify_ticket_reply
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_update();

-- =====================================================================
-- 3. Safety Incidents & Trusted Contacts (Task 3.3)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sos', 'accident', 'breakdown', 'lost_item', 'other')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  lat numeric,
  lng numeric,
  location_text text,
  item_name text,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.incidents TO authenticated;
GRANT UPDATE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users and admins read incidents" ON public.incidents;
CREATE POLICY "Users and admins read incidents" ON public.incidents
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert incidents" ON public.incidents;
CREATE POLICY "Users insert incidents" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins update incidents" ON public.incidents;
CREATE POLICY "Admins update incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger when incident is filed: notify admins for SOS/accident, and notify host for lost item
CREATE OR REPLACE FUNCTION public.handle_incident_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Look up vehicle host
    SELECT vendor_id INTO v_host_id FROM public.bookings WHERE id = NEW.booking_id;
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

DROP TRIGGER IF EXISTS trg_handle_incident_notifications ON public.incidents;
CREATE TRIGGER trg_handle_incident_notifications
  AFTER INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_incident_notifications();

-- Trusted contacts table
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts TO authenticated;
GRANT ALL ON public.trusted_contacts TO service_role;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own trusted contacts" ON public.trusted_contacts;
CREATE POLICY "Users manage own trusted contacts" ON public.trusted_contacts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 4. Cities & Category Rules (Task 3.4)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'India',
  active boolean NOT NULL DEFAULT true,
  surge_multiplier numeric NOT NULL DEFAULT 1.0 CHECK (surge_multiplier >= 1.0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads cities" ON public.cities;
CREATE POLICY "Anyone reads cities" ON public.cities
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage cities" ON public.cities;
CREATE POLICY "Admins manage cities" ON public.cities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed operating cities if empty
INSERT INTO public.cities (name, state, active, surge_multiplier) VALUES
  ('Bengaluru', 'Karnataka', true, 1.0),
  ('Mumbai', 'Maharashtra', true, 1.2),
  ('Delhi', 'Delhi NCR', true, 1.1),
  ('Hyderabad', 'Telangana', true, 1.0),
  ('Chennai', 'Tamil Nadu', true, 1.0),
  ('Pune', 'Maharashtra', true, 1.0),
  ('Goa', 'Goa', true, 1.3),
  ('Jaipur', 'Rajasthan', true, 1.0),
  ('Ahmedabad', 'Gujarat', true, 1.0),
  ('Kochi', 'Kerala', true, 1.0),
  ('Chandigarh', 'Punjab', true, 1.0),
  ('Kolkata', 'West Bengal', true, 1.0)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  min_deposit numeric NOT NULL DEFAULT 2000 CHECK (min_deposit >= 0),
  min_window_hours int NOT NULL DEFAULT 2 CHECK (min_window_hours >= 1),
  advance_notice_hours int NOT NULL DEFAULT 2 CHECK (advance_notice_hours >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.category_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads category rules" ON public.category_rules;
CREATE POLICY "Anyone reads category rules" ON public.category_rules
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage category rules" ON public.category_rules;
CREATE POLICY "Admins manage category rules" ON public.category_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed category rules
INSERT INTO public.category_rules (category, min_deposit, min_window_hours, advance_notice_hours) VALUES
  ('car', 3000, 4, 2),
  ('bike', 1000, 2, 1),
  ('scooter', 800, 2, 1),
  ('ev', 4000, 4, 3)
ON CONFLICT (category) DO NOTHING;

-- =====================================================================
-- 5. Platform Settings (Task 3.5)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gst_pct numeric NOT NULL DEFAULT 18 CHECK (gst_pct >= 0 AND gst_pct <= 100),
  service_fee_pct numeric NOT NULL DEFAULT 5 CHECK (service_fee_pct >= 0 AND service_fee_pct <= 100),
  commission_rental_pct numeric NOT NULL DEFAULT 10 CHECK (commission_rental_pct >= 0 AND commission_rental_pct <= 100),
  commission_driver_pct numeric NOT NULL DEFAULT 10 CHECK (commission_driver_pct >= 0 AND commission_driver_pct <= 100),
  commission_wash_pct numeric NOT NULL DEFAULT 15 CHECK (commission_wash_pct >= 0 AND commission_wash_pct <= 100),
  commission_pool_pct numeric NOT NULL DEFAULT 5 CHECK (commission_pool_pct >= 0 AND commission_pool_pct <= 100),
  commission_pct numeric NOT NULL DEFAULT 10 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  sos_phone text NOT NULL DEFAULT '+91 80 4567 8900',
  maintenance_mode boolean NOT NULL DEFAULT false,
  instant_confirm_default boolean NOT NULL DEFAULT true,
  min_driver_advance_hours int NOT NULL DEFAULT 2 CHECK (min_driver_advance_hours >= 0),
  min_withdrawal numeric NOT NULL DEFAULT 500 CHECK (min_withdrawal >= 0),
  max_wallet_topup numeric NOT NULL DEFAULT 200000 CHECK (max_wallet_topup >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
CREATE POLICY "Anyone reads platform settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins update platform settings" ON public.platform_settings;
CREATE POLICY "Admins update platform settings" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 6. Revenue Aggregates RPC (Task 3.6)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_revenue_aggregates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental_vol numeric;
  v_driver_vol numeric;
  v_wash_vol numeric;
  v_pool_vol numeric;
  v_gmv numeric;
  v_payouts numeric;
  v_refunds numeric;
  v_settings record;
  v_platform_rev numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  -- 1. Rentals volume
  SELECT COALESCE(SUM(total_price), 0) INTO v_rental_vol
  FROM public.bookings
  WHERE payment_status = 'paid' OR status = 'completed';

  -- 2. Driver hires volume
  SELECT COALESCE(SUM(total_price), 0) INTO v_driver_vol
  FROM public.driver_bookings
  WHERE payment_status = 'paid' OR status = 'completed';

  -- 3. Washes volume
  SELECT COALESCE(SUM(price), 0) INTO v_wash_vol
  FROM public.wash_bookings
  WHERE payment_status = 'paid' OR status = 'completed';

  -- 4. Carpooling volume
  SELECT COALESCE(SUM(pt.fare_per_seat * pr.seats), 0) INTO v_pool_vol
  FROM public.pool_requests pr
  JOIN public.pool_trips pt ON pr.trip_id = pt.id
  WHERE pr.status IN ('confirmed', 'completed');

  v_gmv := v_rental_vol + v_driver_vol + v_wash_vol + v_pool_vol;

  -- Disbursed payouts to providers
  SELECT COALESCE(SUM(amount), 0) INTO v_payouts
  FROM public.payouts
  WHERE status = 'paid';

  -- Total refunds issued
  SELECT (
    COALESCE((SELECT SUM(refund_amount) FROM public.bookings WHERE refund_amount > 0), 0) +
    COALESCE((SELECT SUM(refund_amount) FROM public.driver_bookings WHERE refund_amount > 0), 0) +
    COALESCE((SELECT SUM(refund_amount) FROM public.wash_bookings WHERE refund_amount > 0), 0)
  ) INTO v_refunds;

  -- Platform net revenue from commissions
  v_platform_rev := round(
    (v_rental_vol * COALESCE(v_settings.commission_rental_pct, 10) / 100.0) +
    (v_driver_vol * COALESCE(v_settings.commission_driver_pct, 10) / 100.0) +
    (v_wash_vol * COALESCE(v_settings.commission_wash_pct, 15) / 100.0) +
    (v_pool_vol * COALESCE(v_settings.commission_pool_pct, 5) / 100.0),
    2
  );

  RETURN jsonb_build_object(
    'gmv', v_gmv,
    'platform_revenue', v_platform_rev,
    'provider_payouts', v_payouts,
    'refunds', v_refunds,
    'rentals_volume', v_rental_vol,
    'driver_volume', v_driver_vol,
    'wash_volume', v_wash_vol,
    'pool_volume', v_pool_vol
  );
END;
$$;

-- =====================================================================
-- 7. Scheduled Reminders (Task 3.7)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generate_scheduled_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  r record;
BEGIN
  -- 1. Bookings pickup in <= 24 hours
  FOR r IN
    SELECT b.id, b.customer_id, b.start_date, b.pickup_time, v.title AS vehicle_title
    FROM public.bookings b
    JOIN public.vehicles v ON b.vehicle_id = v.id
    WHERE b.status = 'confirmed' AND b.payment_status = 'paid'
      AND (b.start_date + b.pickup_time) BETWEEN now() AND (now() + interval '24 hours')
      -- Idempotency: skip if 24h reminder already generated
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = b.customer_id
          AND n.link = '/bookings'
          AND n.title = 'Trip reminder (24h)'
          AND n.body LIKE '%' || b.id::text || '%'
      )
  LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Trip reminder (24h)',
      format('Your upcoming trip with %s starts within 24 hours (Ref: %s).', r.vehicle_title, r.id),
      '/bookings'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 2. Bookings pickup in <= 2 hours
  FOR r IN
    SELECT b.id, b.customer_id, b.start_date, b.pickup_time, v.title AS vehicle_title
    FROM public.bookings b
    JOIN public.vehicles v ON b.vehicle_id = v.id
    WHERE b.status = 'confirmed' AND b.payment_status = 'paid'
      AND (b.start_date + b.pickup_time) BETWEEN now() AND (now() + interval '2 hours')
      -- Idempotency
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = b.customer_id
          AND n.link = '/bookings'
          AND n.title = 'Pickup in 2 hours'
          AND n.body LIKE '%' || b.id::text || '%'
      )
  LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.customer_id,
      'Pickup in 2 hours',
      format('Pickup begins shortly for %s (Ref: %s). Check-in opens 30 min before departure.', r.vehicle_title, r.id),
      '/bookings'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 3. Customer DL expiry within 30 days
  FOR r IN
    SELECT p.id AS user_id, p.dl_expiry
    FROM public.profiles p
    WHERE p.dl_expiry IS NOT NULL
      AND p.dl_expiry BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '30 days')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = p.id
          AND n.title = 'Driving Licence Expiring Soon'
          AND n.created_at >= (now() - interval '15 days')
      )
  LOOP
    INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (
      r.user_id,
      'Driving Licence Expiring Soon',
      format('Your driving licence expires on %s. Please renew and update your document.', r.dl_expiry),
      '/profile'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('reminders_created', v_inserted);
END;
$$;

-- =====================================================================
-- 8. Growth Features: Referrals & Vehicle Maintenance (Task 3.8)
-- =====================================================================

-- Referrals columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS referral_rewarded boolean NOT NULL DEFAULT false;

-- Trigger to give every user an auto-generated referral code if null
CREATE OR REPLACE FUNCTION public.tg_generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'SYN-' || upper(substring(NEW.id::text from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_referral_code ON public.profiles;
CREATE TRIGGER trg_profile_referral_code
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_generate_referral_code();

-- Credit referral bonus on first paid booking (GR-01)
CREATE OR REPLACE FUNCTION public.apply_referral_bonus_on_first_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_user uuid;
  v_rewarded boolean;
  v_prior_paid_count int;
BEGIN
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid') THEN
    SELECT referred_by, referral_rewarded INTO v_ref_user, v_rewarded
    FROM public.profiles
    WHERE id = NEW.customer_id;

    IF v_ref_user IS NOT NULL AND NOT COALESCE(v_rewarded, false) THEN
      -- Verify this is their first paid booking
      SELECT count(*) INTO v_prior_paid_count
      FROM public.bookings
      WHERE customer_id = NEW.customer_id AND payment_status = 'paid' AND id != NEW.id;

      IF v_prior_paid_count = 0 THEN
        -- Credit referrer ₹500
        PERFORM public.wallet_apply(v_ref_user, 500, 'referral_bonus');
        INSERT INTO public.notifications (user_id, title, body, link)
        VALUES (v_ref_user, 'Referral Bonus Credited', '₹500 added to your wallet! A friend completed their first ride.', '/wallet');

        -- Credit friend ₹500
        PERFORM public.wallet_apply(NEW.customer_id, 500, 'referral_bonus');
        INSERT INTO public.notifications (user_id, title, body, link)
        VALUES (NEW.customer_id, 'Welcome Bonus Credited', '₹500 referral credit added to your wallet!', '/wallet');

        -- Mark rewarded so it only fires once
        UPDATE public.profiles SET referral_rewarded = true WHERE id = NEW.customer_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_referral_bonus ON public.bookings;
CREATE TRIGGER trg_booking_referral_bonus
  AFTER UPDATE OF payment_status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.apply_referral_bonus_on_first_paid();

-- Vehicle maintenance records for host maintenance
CREATE TABLE IF NOT EXISTS public.vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  workshop text,
  odometer int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_maintenance TO authenticated;
GRANT ALL ON public.vehicle_maintenance TO service_role;
ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors manage own vehicle maintenance" ON public.vehicle_maintenance;
CREATE POLICY "Vendors manage own vehicle maintenance" ON public.vehicle_maintenance
  FOR ALL TO authenticated
  USING (auth.uid() = vendor_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = vendor_id OR public.has_role(auth.uid(), 'admin'));
