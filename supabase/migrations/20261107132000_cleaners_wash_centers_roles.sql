-- Migration: Add cleaner and wash_center to app_role, create cleaners, wash_centers, wash_center_staff, wash_center_packages

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
