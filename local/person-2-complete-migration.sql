-- =====================================================================
-- PERSON 2: COMPLETE SUPABASE BACKEND MIGRATION
-- Covers all database changes for Tasks 2.1 through 2.8
-- Modules: Drivers, Driver Hire, Vehicle Wash Pipeline, Cleaner Role,
--          Wash Centers, Job Board, Wash Reviews, Pooling & Reports
-- =====================================================================

-- =====================================================================
-- SECTION 1: DRIVER ONBOARDING & PUBLIC DRIVERS MIRROR (Task 2.1)
-- =====================================================================

-- Add trip_types and service_area to drivers and public_drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS trip_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_area text;

ALTER TABLE public.public_drivers
  ADD COLUMN IF NOT EXISTS trip_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_area text;

-- Update trigger function to mirror trip_types and service_area into public_drivers
CREATE OR REPLACE FUNCTION public.sync_public_driver()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND NEW.status = 'active' THEN
    INSERT INTO public.public_drivers (
      id, full_name, city, bio, experience_years, languages, vehicle_types,
      photo_url, hourly_rate, daily_rate, avg_rating, review_count, created_at, updated_at,
      trip_types, service_area
    )
    VALUES (
      NEW.id, NEW.full_name, NEW.city, NEW.bio, NEW.experience_years, NEW.languages, NEW.vehicle_types,
      NEW.photo_url, NEW.hourly_rate, NEW.daily_rate, NEW.avg_rating, NEW.review_count, NEW.created_at, now(),
      COALESCE(NEW.trip_types, '{}'), NEW.service_area
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      bio = EXCLUDED.bio,
      experience_years = EXCLUDED.experience_years,
      languages = EXCLUDED.languages,
      vehicle_types = EXCLUDED.vehicle_types,
      photo_url = EXCLUDED.photo_url,
      hourly_rate = EXCLUDED.hourly_rate,
      daily_rate = EXCLUDED.daily_rate,
      avg_rating = EXCLUDED.avg_rating,
      review_count = EXCLUDED.review_count,
      trip_types = EXCLUDED.trip_types,
      service_area = EXCLUDED.service_area,
      updated_at = now();
  ELSE
    DELETE FROM public.public_drivers WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;


-- =====================================================================
-- SECTION 2: DRIVER BOOKING TRIP TYPES (Task 2.2)
-- =====================================================================

ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS trip_type text;


-- =====================================================================
-- SECTION 3: WASH PIPELINE STATUS & PROOF PHOTOS (Task 2.3)
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.wash_status AS ENUM (
    'requested',
    'confirmed',
    'assigned',
    'on_the_way',
    'started',
    'completed',
    'cancelled',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.wash_bookings
  ALTER COLUMN status TYPE text,
  ADD COLUMN IF NOT EXISTS progress public.wash_status NOT NULL DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS before_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_cleaner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Forward-only status enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_wash_booking_forward_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  curr_step integer;
  next_step integer;
  norm_curr text;
  norm_next text;
BEGIN
  IF (NEW.progress IS DISTINCT FROM OLD.progress OR NEW.status IS DISTINCT FROM OLD.status) THEN
    norm_curr := lower(btrim(COALESCE(OLD.progress::text, OLD.status::text, 'requested')));
    IF norm_curr = 'pending' THEN norm_curr := 'requested'; END IF;
    
    norm_next := lower(btrim(COALESCE(NEW.progress::text, NEW.status::text, norm_curr)));
    IF norm_next = 'pending' THEN norm_next := 'requested'; END IF;

    IF norm_next IN ('cancelled', 'rejected') THEN
      RETURN NEW;
    END IF;

    curr_step := CASE norm_curr
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
      ELSE 0
    END;

    IF next_step > 0 AND curr_step > 0 AND next_step < curr_step THEN
      RAISE EXCEPTION 'Wash status cannot be moved backwards (current: %, requested: %)', norm_curr, norm_next;
    END IF;

    IF norm_next = 'completed' AND COALESCE(array_length(NEW.after_photos, 1), 0) = 0 THEN
      RAISE EXCEPTION 'After photos are required to complete the wash';
    END IF;

    -- Sync status and progress
    IF NEW.progress IS NOT DISTINCT FROM OLD.progress AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF norm_next IN ('requested', 'confirmed', 'assigned', 'on_the_way', 'started', 'completed', 'cancelled', 'rejected') THEN
        NEW.progress := norm_next::public.wash_status;
      END IF;
    ELSIF NEW.progress IS DISTINCT FROM OLD.progress AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := norm_next;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wash_booking_forward_progress ON public.wash_bookings;
CREATE TRIGGER trg_enforce_wash_booking_forward_progress
  BEFORE UPDATE ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wash_booking_forward_progress();

-- RPC for assigned cleaner or vendor center to advance wash status
CREATE OR REPLACE FUNCTION public.advance_wash_status(
  _wash_booking_id uuid,
  _next_status text,
  _photos text[] DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
         status = norm_next,
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

GRANT EXECUTE ON FUNCTION public.advance_wash_status(uuid, text, text[], text) TO authenticated;

-- RLS UPDATE policy for assigned cleaners/vendors
DROP POLICY IF EXISTS "Assigned cleaners update wash bookings" ON public.wash_bookings;
CREATE POLICY "Assigned cleaners update wash bookings" ON public.wash_bookings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR assigned_cleaner_id = auth.uid()
    OR assigned_vendor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wash_vendors
      WHERE id = wash_bookings.assigned_vendor_id AND id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR assigned_cleaner_id = auth.uid()
    OR assigned_vendor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wash_vendors
      WHERE id = wash_bookings.assigned_vendor_id AND id = auth.uid()
    )
  );

-- Update notifications trigger for progress states
CREATE OR REPLACE FUNCTION public.tg_notify_wash_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New wash request',
      NEW.city || ' · ' || NEW.slot_date || ' ' || NEW.slot_time || ' — assign a washer partner.', '/admin');
    PERFORM public.notify_user(NEW.customer_id, 'Wash requested', 'Our team is checking washer availability.', '/washes');
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.progress IS DISTINCT FROM OLD.progress) THEN
    IF NEW.progress = 'on_the_way' OR NEW.status = 'on_the_way' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Cleaner on the way', 'Your cleaner is heading to your address.', '/washes');
    ELSIF NEW.progress = 'started' OR NEW.status = 'started' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash started', 'Your vehicle wash is now in progress.', '/washes');
    ELSIF NEW.status = 'confirmed' OR NEW.progress = 'confirmed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash slot approved', 'Pay now to confirm your doorstep wash.', '/washes');
    ELSIF NEW.status = 'rejected' OR NEW.progress = 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash slot unavailable',
        COALESCE(NEW.rejection_reason, 'No washer partner is free for that slot.'), '/wash');
    ELSIF NEW.status = 'cancelled' OR NEW.progress = 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash cancelled',
        CASE WHEN NEW.refund_amount > 0 THEN 'Refund of Rs ' || NEW.refund_amount || ' credited to your wallet.' ELSE 'Your wash booking was cancelled.' END, '/washes');
    ELSIF NEW.status = 'completed' OR NEW.progress = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash completed', 'Your vehicle is sparkling. View your invoice.', '/washes');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash payment successful', 'Your slot is locked in.', '/washes');
  END IF;

  RETURN NEW;
END; $$;


-- =====================================================================
-- SECTION 4: CLEANER & WASH CENTER ROLES, PROFILES, STAFF & PACKAGES (Task 2.4)
-- =====================================================================

-- 1. Add roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cleaner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'wash_center';

-- 2. Cleaners profile table
CREATE TABLE IF NOT EXISTS public.cleaners (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  city text NOT NULL DEFAULT 'Bangalore',
  service_area text,
  bio text,
  experience_years integer NOT NULL DEFAULT 1,
  available boolean NOT NULL DEFAULT true,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  services text[] NOT NULL DEFAULT '{}',
  avg_rating numeric NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cleaners TO authenticated;
GRANT ALL ON public.cleaners TO service_role;
ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cleaners view profiles" ON public.cleaners;
CREATE POLICY "Cleaners view profiles" ON public.cleaners
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR verification_status = 'approved');

DROP POLICY IF EXISTS "Cleaners upsert own profile" ON public.cleaners;
CREATE POLICY "Cleaners upsert own profile" ON public.cleaners
  FOR ALL TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Wash Centers profile table
CREATE TABLE IF NOT EXISTS public.wash_centers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Bangalore',
  address text,
  contact_phone text,
  contact_email text,
  daily_capacity integer NOT NULL DEFAULT 15,
  opening_time text NOT NULL DEFAULT '08:00',
  closing_time text NOT NULL DEFAULT '20:00',
  active boolean NOT NULL DEFAULT true,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  avg_rating numeric NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.wash_centers TO authenticated;
GRANT ALL ON public.wash_centers TO service_role;
ALTER TABLE public.wash_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wash centers view profiles" ON public.wash_centers;
CREATE POLICY "Wash centers view profiles" ON public.wash_centers
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR verification_status = 'approved');

DROP POLICY IF EXISTS "Wash centers manage own profile" ON public.wash_centers;
CREATE POLICY "Wash centers manage own profile" ON public.wash_centers
  FOR ALL TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 4. Wash Center Staff table
CREATE TABLE IF NOT EXISTS public.wash_center_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.wash_centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'Cleaner',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_center_staff TO authenticated;
GRANT ALL ON public.wash_center_staff TO service_role;
ALTER TABLE public.wash_center_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Centers manage own staff" ON public.wash_center_staff;
CREATE POLICY "Centers manage own staff" ON public.wash_center_staff
  FOR ALL TO authenticated
  USING (center_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (center_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5. Wash Center Packages table
CREATE TABLE IF NOT EXISTS public.wash_center_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.wash_centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'car',
  price numeric NOT NULL CHECK (price >= 0),
  duration integer NOT NULL DEFAULT 45,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_center_packages TO authenticated;
GRANT ALL ON public.wash_center_packages TO service_role;
ALTER TABLE public.wash_center_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Centers manage own packages" ON public.wash_center_packages;
CREATE POLICY "Centers manage own packages" ON public.wash_center_packages
  FOR ALL TO authenticated
  USING (center_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (center_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 6. Admin verification functions
CREATE OR REPLACE FUNCTION public.verify_cleaner(
  _cleaner_id uuid,
  _decision text,
  _rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can verify cleaners';
  END IF;

  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;

  UPDATE public.cleaners
     SET verification_status = _decision::verification_status,
         rejection_reason = CASE WHEN _decision = 'rejected' THEN _rejection_reason ELSE NULL END,
         updated_at = now()
   WHERE id = _cleaner_id;

  IF _decision = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_cleaner_id, 'cleaner')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_cleaner(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_wash_center(
  _center_id uuid,
  _decision text,
  _rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can verify wash centers';
  END IF;

  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;

  UPDATE public.wash_centers
     SET verification_status = _decision::verification_status,
         rejection_reason = CASE WHEN _decision = 'rejected' THEN _rejection_reason ELSE NULL END,
         active = CASE WHEN _decision = 'approved' THEN true ELSE false END,
         updated_at = now()
   WHERE id = _center_id;

  IF _decision = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_center_id, 'wash_center')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.wash_vendors (id, name, city, contact_phone, contact_email, daily_capacity, active)
    SELECT id, name, city, contact_phone, contact_email, daily_capacity, true
    FROM public.wash_centers WHERE id = _center_id
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      contact_phone = EXCLUDED.contact_phone,
      contact_email = EXCLUDED.contact_email,
      daily_capacity = EXCLUDED.daily_capacity,
      active = true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_wash_center(uuid, text, text) TO authenticated;


-- =====================================================================
-- SECTION 5: CLEANER ATOMIC JOB CLAIM RPC (Task 2.5)
-- =====================================================================

-- Atomic claim_wash_job RPC with row lock
CREATE OR REPLACE FUNCTION public.claim_wash_job(
  _wash_booking_id uuid DEFAULT NULL,
  id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
   WHERE id = auth.uid();

  IF _cleaner IS NULL THEN
    RAISE EXCEPTION 'Cleaner profile not found';
  END IF;

  IF _cleaner.verification_status != 'approved' THEN
    RAISE EXCEPTION 'Only verified cleaners can claim jobs';
  END IF;

  -- 2. Lock the wash booking row atomically to prevent race conditions / double claiming (CJ-01)
  SELECT * INTO _booking
    FROM public.wash_bookings
   WHERE id = _target_id
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
   WHERE id = _target_id;

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

GRANT EXECUTE ON FUNCTION public.claim_wash_job(uuid, uuid) TO authenticated;

-- Update SELECT policy on wash_bookings to allow verified cleaners to browse unassigned confirmed jobs in their city
DROP POLICY IF EXISTS "Customers and admins view wash bookings" ON public.wash_bookings;
DROP POLICY IF EXISTS "Cleaners and centers view wash bookings" ON public.wash_bookings;
DROP POLICY IF EXISTS "Wash bookings access policy" ON public.wash_bookings;

CREATE POLICY "Wash bookings access policy" ON public.wash_bookings
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR assigned_cleaner_id = auth.uid()
    OR assigned_vendor_id = auth.uid()
    OR (
      -- Verified cleaners can view unassigned confirmed jobs in their city
      assigned_cleaner_id IS NULL
      AND assigned_vendor_id IS NULL
      AND (status = 'confirmed' OR progress = 'confirmed')
      AND EXISTS (
        SELECT 1 FROM public.cleaners c
        WHERE c.id = auth.uid()
          AND c.verification_status = 'approved'
          AND lower(trim(c.city)) = lower(trim(wash_bookings.city))
      )
    )
  );


-- =====================================================================
-- SECTION 6: WASH REVIEWS & PROVIDER RATING RECOMPUTATION (Task 2.6)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.wash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wash_booking_id uuid NOT NULL UNIQUE REFERENCES public.wash_bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cleaner_id uuid REFERENCES public.cleaners(id) ON DELETE SET NULL,
  center_id uuid REFERENCES public.wash_centers(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.wash_vendors(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  response text,
  response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_reviews TO authenticated;
GRANT SELECT ON public.wash_reviews TO anon;
GRANT ALL ON public.wash_reviews TO service_role;
ALTER TABLE public.wash_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wash reviews are public" ON public.wash_reviews;
CREATE POLICY "Wash reviews are public" ON public.wash_reviews
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Customers write reviews for completed washes" ON public.wash_reviews;
CREATE POLICY "Customers write reviews for completed washes" ON public.wash_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wash_bookings b
      WHERE b.id = wash_booking_id
        AND b.customer_id = auth.uid()
        AND (b.status = 'completed' OR b.progress = 'completed')
    )
  );

DROP POLICY IF EXISTS "Authors and providers update wash reviews" ON public.wash_reviews;
CREATE POLICY "Authors and providers update wash reviews" ON public.wash_reviews
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    OR cleaner_id = auth.uid()
    OR center_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR cleaner_id = auth.uid()
    OR center_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- BEFORE INSERT trigger: Validate completed wash & auto-fill provider references (WR-02)
CREATE OR REPLACE FUNCTION public.validate_and_fill_wash_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  SELECT * INTO b
    FROM public.wash_bookings
   WHERE id = NEW.wash_booking_id;

  IF b IS NULL THEN
    RAISE EXCEPTION 'Wash booking not found';
  END IF;

  IF b.status != 'completed' AND b.progress != 'completed' THEN
    RAISE EXCEPTION 'Only completed wash bookings can be reviewed';
  END IF;

  IF NEW.customer_id IS NULL THEN
    NEW.customer_id := auth.uid();
  END IF;

  IF NEW.customer_id != b.customer_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the customer who booked the wash can write a review';
  END IF;

  -- Auto-populate provider relations from the booking if not explicitly provided
  IF NEW.cleaner_id IS NULL AND b.assigned_cleaner_id IS NOT NULL THEN
    NEW.cleaner_id := b.assigned_cleaner_id;
  END IF;

  IF NEW.center_id IS NULL AND b.assigned_vendor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.wash_centers WHERE id = b.assigned_vendor_id) THEN
      NEW.center_id := b.assigned_vendor_id;
    END IF;
  END IF;

  IF NEW.vendor_id IS NULL THEN
    NEW.vendor_id := b.assigned_vendor_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_wash_review ON public.wash_reviews;
CREATE TRIGGER trg_validate_wash_review
  BEFORE INSERT ON public.wash_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_and_fill_wash_review();

-- AFTER INSERT/UPDATE/DELETE trigger: Recompute provider average ratings (WR-01)
CREATE OR REPLACE FUNCTION public.recompute_wash_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cleaner_id uuid;
  _center_id uuid;
BEGIN
  _cleaner_id := COALESCE(NEW.cleaner_id, OLD.cleaner_id);
  _center_id := COALESCE(NEW.center_id, OLD.center_id);

  -- Recompute for cleaner if assigned
  IF _cleaner_id IS NOT NULL THEN
    UPDATE public.cleaners
       SET avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.wash_reviews WHERE cleaner_id = _cleaner_id), 0),
           review_count = (SELECT COUNT(*) FROM public.wash_reviews WHERE cleaner_id = _cleaner_id),
           updated_at = now()
     WHERE id = _cleaner_id;
  END IF;

  -- Recompute for wash center if assigned
  IF _center_id IS NOT NULL THEN
    UPDATE public.wash_centers
       SET avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.wash_reviews WHERE center_id = _center_id), 0),
           review_count = (SELECT COUNT(*) FROM public.wash_reviews WHERE center_id = _center_id),
           updated_at = now()
     WHERE id = _center_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_wash_rating ON public.wash_reviews;
CREATE TRIGGER trg_recompute_wash_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.wash_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_wash_rating();


-- =====================================================================
-- SECTION 7: CAR POOLING EMERGENCY CONTACT (Task 2.8)
-- =====================================================================

ALTER TABLE public.pool_requests
  ADD COLUMN IF NOT EXISTS emergency_contact text;


-- =====================================================================
-- SECTION 8: POOL RATINGS & USER MODERATION REPORTS (Task 2.8)
-- =====================================================================

-- 1. Pool Ratings table
CREATE TABLE IF NOT EXISTS public.pool_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.pool_trips(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.pool_requests(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('passenger_to_driver', 'driver_to_passenger')),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_ratings_unique_per_party UNIQUE (trip_id, rater_id, ratee_id),
  CONSTRAINT pool_ratings_no_self_rate CHECK (rater_id <> ratee_id)
);

CREATE INDEX IF NOT EXISTS pool_ratings_trip_idx ON public.pool_ratings(trip_id);
CREATE INDEX IF NOT EXISTS pool_ratings_rater_idx ON public.pool_ratings(rater_id);
CREATE INDEX IF NOT EXISTS pool_ratings_ratee_idx ON public.pool_ratings(ratee_id);

GRANT SELECT, INSERT ON public.pool_ratings TO authenticated;
GRANT ALL ON public.pool_ratings TO service_role;
ALTER TABLE public.pool_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pool ratings readable by all authenticated users" ON public.pool_ratings;
CREATE POLICY "Pool ratings readable by all authenticated users"
  ON public.pool_ratings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own pool rating" ON public.pool_ratings;
CREATE POLICY "Users can insert their own pool rating"
  ON public.pool_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "Admins can manage all pool ratings" ON public.pool_ratings;
CREATE POLICY "Admins can manage all pool ratings"
  ON public.pool_ratings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Validation Trigger: only completed trips, and parties must be actual trip participants
CREATE OR REPLACE FUNCTION public.validate_pool_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip record;
BEGIN
  -- Check trip exists and is completed
  SELECT id, driver_id, status INTO v_trip
  FROM public.pool_trips
  WHERE id = NEW.trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF v_trip.status <> 'completed' THEN
    RAISE EXCEPTION 'Ratings can only be submitted for completed trips (trip status is %)', v_trip.status;
  END IF;

  -- Validate participant roles
  IF NEW.role = 'passenger_to_driver' THEN
    IF NEW.ratee_id <> v_trip.driver_id THEN
      RAISE EXCEPTION 'Ratee must be the trip driver';
    END IF;
    PERFORM 1 FROM public.pool_requests
    WHERE trip_id = NEW.trip_id
      AND passenger_id = NEW.rater_id
      AND status IN ('confirmed', 'completed');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rater is not a confirmed passenger on this trip';
    END IF;

  ELSIF NEW.role = 'driver_to_passenger' THEN
    IF NEW.rater_id <> v_trip.driver_id THEN
      RAISE EXCEPTION 'Rater must be the trip driver';
    END IF;
    PERFORM 1 FROM public.pool_requests
    WHERE trip_id = NEW.trip_id
      AND passenger_id = NEW.ratee_id
      AND status IN ('confirmed', 'completed');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ratee is not a confirmed passenger on this trip';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid rating role %', NEW.role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pool_rating ON public.pool_ratings;
CREATE TRIGGER trg_validate_pool_rating
  BEFORE INSERT ON public.pool_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pool_rating();

-- 2. User Reports table (shared moderation with Person 3)
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('pooling_trip', 'pooling_request', 'rental_booking', 'driver_hire', 'wash_booking', 'user', 'review')),
  target_id uuid,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_reports_status_idx ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS user_reports_reporter_idx ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS user_reports_reported_user_idx ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS user_reports_created_idx ON public.user_reports(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their submitted reports" ON public.user_reports;
CREATE POLICY "Users can view their submitted reports"
  ON public.user_reports FOR SELECT
  TO authenticated
  USING (
    auth.uid() = reporter_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated users can submit user reports" ON public.user_reports;
CREATE POLICY "Authenticated users can submit user reports"
  ON public.user_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins can update and manage user reports" ON public.user_reports;
CREATE POLICY "Admins can update and manage user reports"
  ON public.user_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete user reports" ON public.user_reports;
CREATE POLICY "Admins can delete user reports"
  ON public.user_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

