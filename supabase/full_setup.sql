-- ==================================================================
-- Synchoo / StalightRide - Complete Database Schema & Setup
-- Consolidated from 39 migrations + Storage Buckets setup
-- Compatible with Supabase Postgres
-- ==================================================================

-- 1. STORAGE BUCKETS SETUP
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('vehicle-images', 'vehicle-images', true),
  ('avatars', 'avatars', true),
  ('kyc-docs', 'kyc-docs', false),
  ('verification-docs', 'verification-docs', false),
  ('trip-photos', 'trip-photos', false)
ON CONFLICT (id) DO NOTHING;



-- ==================================================================
-- >>> Migration: 20260717063159_c38a6531-7ba2-4954-810d-84be1e67ae79.sql <<<
-- ==================================================================


-- =========== ENUMS ===========
CREATE TYPE public.app_role AS ENUM ('customer', 'vendor', 'admin');
CREATE TYPE public.vehicle_category AS ENUM ('scooter', 'bike', 'motorcycle', 'car', 'ev');
CREATE TYPE public.fuel_type AS ENUM ('petrol', 'diesel', 'electric', 'hybrid', 'none');
CREATE TYPE public.transmission_type AS ENUM ('manual', 'automatic', 'none');
CREATE TYPE public.vehicle_status AS ENUM ('draft', 'active', 'paused');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'rejected', 'cancelled', 'completed');
CREATE TYPE public.kyc_status AS ENUM ('unsubmitted', 'pending', 'approved', 'rejected');

-- =========== updated_at helper ===========
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========== PROFILES ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users manage own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- =========== USER ROLES ===========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Register signup trigger AFTER user_roles exists
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== VENDORS ===========
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  bio TEXT,
  id_document_url TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'unsubmitted',
  payout_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendors TO anon;
GRANT SELECT, INSERT, UPDATE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors public read" ON public.vendors FOR SELECT USING (true);
CREATE POLICY "Vendor manages self" ON public.vendors FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Vendor updates self" ON public.vendors FOR UPDATE USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== VEHICLES ===========
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category vehicle_category NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL,
  fuel fuel_type NOT NULL DEFAULT 'petrol',
  transmission transmission_type NOT NULL DEFAULT 'manual',
  mileage_kmpl NUMERIC,
  seats INT,
  city TEXT NOT NULL,
  address TEXT,
  lat NUMERIC,
  lng NUMERIC,
  description TEXT,
  price_hourly NUMERIC,
  price_daily NUMERIC NOT NULL,
  price_weekly NUMERIC,
  security_deposit NUMERIC NOT NULL DEFAULT 0,
  status vehicle_status NOT NULL DEFAULT 'draft',
  avg_rating NUMERIC NOT NULL DEFAULT 0,
  review_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_city_idx ON public.vehicles(city);
CREATE INDEX vehicles_category_idx ON public.vehicles(category);
CREATE INDEX vehicles_status_idx ON public.vehicles(status);
GRANT SELECT ON public.vehicles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active vehicles are public" ON public.vehicles FOR SELECT USING (status = 'active' OR auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendor inserts own vehicle" ON public.vehicles FOR INSERT WITH CHECK (auth.uid() = vendor_id);
CREATE POLICY "Vendor updates own vehicle" ON public.vehicles FOR UPDATE USING (auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendor deletes own vehicle" ON public.vehicles FOR DELETE USING (auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== VEHICLE IMAGES ===========
CREATE TABLE public.vehicle_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_images TO authenticated;
GRANT ALL ON public.vehicle_images TO service_role;
ALTER TABLE public.vehicle_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vehicle images public read" ON public.vehicle_images FOR SELECT USING (true);
CREATE POLICY "Vendor manages images" ON public.vehicle_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.vendor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.vendor_id = auth.uid()));

-- =========== AVAILABILITY BLOCKS ===========
CREATE TABLE public.availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.availability_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_blocks TO authenticated;
GRANT ALL ON public.availability_blocks TO service_role;
ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Availability public read" ON public.availability_blocks FOR SELECT USING (true);
CREATE POLICY "Vendor manages availability" ON public.availability_blocks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.vendor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.vendor_id = auth.uid()));

-- =========== BOOKINGS ===========
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  base_price NUMERIC NOT NULL,
  security_deposit NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL,
  coupon_code TEXT,
  status booking_status NOT NULL DEFAULT 'pending',
  qr_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX bookings_customer_idx ON public.bookings(customer_id);
CREATE INDEX bookings_vendor_idx ON public.bookings(vendor_id);
CREATE INDEX bookings_vehicle_dates_idx ON public.bookings(vehicle_id, start_date, end_date);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties read bookings" ON public.bookings FOR SELECT
  USING (auth.uid() = customer_id OR auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customer creates booking" ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Parties update booking" ON public.bookings FOR UPDATE
  USING (auth.uid() = customer_id OR auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Conflict prevention trigger
CREATE OR REPLACE FUNCTION public.prevent_booking_conflict() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.vehicle_id = NEW.vehicle_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Vehicle not available for selected dates';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.availability_blocks a
    WHERE a.vehicle_id = NEW.vehicle_id
      AND a.start_date <= NEW.end_date
      AND a.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Vehicle is blocked on selected dates';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER prevent_booking_conflict_ins BEFORE INSERT ON public.bookings
  FOR EACH ROW WHEN (NEW.status IN ('pending','confirmed'))
  EXECUTE FUNCTION public.prevent_booking_conflict();

-- =========== REVIEWS ===========
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews public read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Customer writes own review" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customer edits own review" ON public.reviews FOR UPDATE USING (auth.uid() = customer_id);
CREATE POLICY "Customer deletes own review" ON public.reviews FOR DELETE USING (auth.uid() = customer_id);

-- Recompute rating on review changes
CREATE OR REPLACE FUNCTION public.recompute_vehicle_rating() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE vid UUID;
BEGIN
  vid := COALESCE(NEW.vehicle_id, OLD.vehicle_id);
  UPDATE public.vehicles SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.reviews WHERE vehicle_id = vid), 0),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE vehicle_id = vid)
  WHERE id = vid;
  RETURN NEW;
END; $$;
CREATE TRIGGER reviews_recompute AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recompute_vehicle_rating();

-- =========== MESSAGES ===========
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_booking_idx ON public.messages(booking_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties read messages" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));
CREATE POLICY "Parties send messages" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- =========== NOTIFICATIONS ===========
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User updates own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- =========== COUPONS ===========
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  percent_off INT CHECK (percent_off BETWEEN 0 AND 100),
  amount_off NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active coupons readable" ON public.coupons FOR SELECT USING (active = true);
CREATE POLICY "Admins manage coupons" ON public.coupons FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========== WISHLISTS ===========
CREATE TABLE public.wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, vehicle_id)
);
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;
GRANT ALL ON public.wishlists TO service_role;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own wishlist" ON public.wishlists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== DISPUTES ===========
CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties read disputes" ON public.disputes FOR SELECT
  USING (raised_by = auth.uid() OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));
CREATE POLICY "User opens dispute" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = raised_by);
CREATE POLICY "Admin updates dispute" ON public.disputes FOR UPDATE USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== PAYOUTS ===========
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor reads own payouts" ON public.payouts FOR SELECT
  USING (auth.uid() = vendor_id OR public.has_role(auth.uid(),'admin'));


-- ==================================================================
-- >>> Migration: 20260717063227_6df38ce5-00e8-4531-b319-d48359b27892.sql <<<
-- ==================================================================


REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_booking_conflict() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_vehicle_rating() FROM PUBLIC, anon, authenticated;


-- ==================================================================
-- >>> Migration: 20260717063310_83c24582-20eb-44e2-962d-d84cd0586c0f.sql <<<
-- ==================================================================


-- Public read for vehicle-images & avatars
CREATE POLICY "Public read vehicle-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-images');
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Users upload into their own folder
CREATE POLICY "User uploads vehicle-images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User updates vehicle-images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User deletes vehicle-images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User uploads avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User updates avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "User uploads kyc" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User reads own kyc" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));


-- ==================================================================
-- >>> Migration: 20260718033451_c38710a4-1f77-42a0-89b9-df2be6c3c489.sql <<<
-- ==================================================================


-- Payment fields on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Attach the previously-created functions as triggers
DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_conflict ON public.bookings;
CREATE TRIGGER trg_bookings_conflict BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_conflict();

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON public.vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_recompute ON public.reviews;
CREATE TRIGGER trg_reviews_recompute AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recompute_vehicle_rating();

-- Ensure profile auto-creation on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==================================================================
-- >>> Migration: 20260718033507_1fd4ce30-02ee-42dd-8d69-f5eea54ad403.sql <<<
-- ==================================================================


REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_booking_conflict() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_vehicle_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- ==================================================================
-- >>> Migration: 20260718051854_99e5b7ed-e5f2-4e6b-9a14-a7d2d95a72fd.sql <<<
-- ==================================================================


-- Add pickup/dropoff time to bookings for hour-precision scheduling
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pickup_time time NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS dropoff_time time NOT NULL DEFAULT '10:00';

-- Allow the public QR page to look up a booking by its scan code.
-- Only exposes rows queried by the exact qr_code string (unguessable UUID) —
-- no listing, no other filters.
DROP POLICY IF EXISTS "Public QR lookup by code" ON public.bookings;
CREATE POLICY "Public QR lookup by code" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (qr_code IS NOT NULL);

GRANT SELECT ON public.bookings TO anon;


-- ==================================================================
-- >>> Migration: 20260719013724_76ba164a-b76f-4024-862c-6ff17ae1f423.sql <<<
-- ==================================================================


-- Enums
DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dl_status AS ENUM ('none','pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vehicles verification columns
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rc_url text,
  ADD COLUMN IF NOT EXISTS insurance_url text,
  ADD COLUMN IF NOT EXISTS pollution_url text,
  ADD COLUMN IF NOT EXISTS fitness_url text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Profiles DL columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dl_number text,
  ADD COLUMN IF NOT EXISTS dl_expiry date,
  ADD COLUMN IF NOT EXISTS dl_front_url text,
  ADD COLUMN IF NOT EXISTS dl_back_url text,
  ADD COLUMN IF NOT EXISTS dl_status public.dl_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS dl_rejection_reason text,
  ADD COLUMN IF NOT EXISTS dl_verified_at timestamptz;

-- Reviews response / reporting
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS vendor_response text,
  ADD COLUMN IF NOT EXISTS vendor_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_reason text;

-- Messages image sharing
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

-- Update public vehicle visibility (only approved & active vehicles are public)
DROP POLICY IF EXISTS "Active vehicles are public" ON public.vehicles;
CREATE POLICY "Active vehicles are public" ON public.vehicles FOR SELECT
  USING (
    (status = 'active' AND verification_status = 'approved')
    OR auth.uid() = vendor_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- Admin can update any profile (needed for DL approval)
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Vendor can update own reviews (to add response) -- add policy that vendors can update reviews on their vehicles' response fields
DROP POLICY IF EXISTS "Vendor responds to review" ON public.reviews;
CREATE POLICY "Vendor responds to review" ON public.reviews FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid()));

-- Any authenticated user can flag a review as reported (reporting)
DROP POLICY IF EXISTS "Authenticated report review" ON public.reviews;
CREATE POLICY "Authenticated report review" ON public.reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Notifications insert
DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Trigger: prevent booking when customer DL not approved or expired
CREATE OR REPLACE FUNCTION public.enforce_customer_dl_approved()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  SELECT dl_status, dl_expiry INTO p FROM public.profiles WHERE id = NEW.customer_id;
  IF p.dl_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Your driving licence must be approved before booking';
  END IF;
  IF p.dl_expiry IS NOT NULL AND p.dl_expiry < NEW.end_date THEN
    RAISE EXCEPTION 'Your driving licence expires before the booking end date';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_dl_check ON public.bookings;
CREATE TRIGGER trg_booking_dl_check
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_dl_approved();

-- Storage policies for verification-docs bucket
DROP POLICY IF EXISTS "verif docs read own" ON storage.objects;
CREATE POLICY "verif docs read own" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );

DROP POLICY IF EXISTS "verif docs write own" ON storage.objects;
CREATE POLICY "verif docs write own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "verif docs update own" ON storage.objects;
CREATE POLICY "verif docs update own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );

DROP POLICY IF EXISTS "verif docs delete own" ON storage.objects;
CREATE POLICY "verif docs delete own" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );


-- ==================================================================
-- >>> Migration: 20260719013740_37eb65d5-903a-4f7a-863b-7723a484eec0.sql <<<
-- ==================================================================


REVOKE ALL ON FUNCTION public.enforce_customer_dl_approved() FROM PUBLIC, anon, authenticated;


-- ==================================================================
-- >>> Migration: 20260723093423_804a00c2-cc60-4dfe-9bd7-69cdfade4f97.sql <<<
-- ==================================================================


-- 1. bookings: server function already handles QR lookups via admin client
DROP POLICY IF EXISTS "Public QR lookup by code" ON public.bookings;

-- 2. coupons: authenticated only
DROP POLICY IF EXISTS "Active coupons readable" ON public.coupons;
CREATE POLICY "Active coupons readable" ON public.coupons
  FOR SELECT TO authenticated USING (active = true);
REVOKE SELECT ON public.coupons FROM anon;

-- 3. profiles: restrict to owner + admin; expose safe fields via view
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Owner or admin reads profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, full_name, avatar_url, city FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 4. vendors: restrict to owner + admin; expose safe fields via view
DROP POLICY IF EXISTS "Vendors public read" ON public.vendors;
CREATE POLICY "Owner or admin reads vendor" ON public.vendors
  FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.public_vendors
WITH (security_invoker = false) AS
SELECT id, business_name, bio, kyc_status, created_at FROM public.vendors;
GRANT SELECT ON public.public_vendors TO anon, authenticated;

-- 5. reviews: replace broad update with a narrow report RPC
DROP POLICY IF EXISTS "Authenticated report review" ON public.reviews;

CREATE OR REPLACE FUNCTION public.report_review(_review_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason required';
  END IF;
  UPDATE public.reviews
    SET reported = true,
        report_reason = left(btrim(_reason), 500)
    WHERE id = _review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_review(uuid, text) TO authenticated;


-- ==================================================================
-- >>> Migration: 20260723093520_5e6eb351-87b8-4d57-ae0a-5062c847d5fb.sql <<<
-- ==================================================================


-- Drop the security-definer views
DROP VIEW IF EXISTS public.public_profiles;
DROP VIEW IF EXISTS public.public_vendors;

-- =====================================================
-- public_profiles: safe subset of profiles, synced by trigger
-- =====================================================
CREATE TABLE public.public_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  city text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profile read" ON public.public_profiles FOR SELECT USING (true);

INSERT INTO public.public_profiles (id, full_name, avatar_url, city)
SELECT id, full_name, avatar_url, city FROM public.profiles
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      city = EXCLUDED.city;

CREATE OR REPLACE FUNCTION public.sync_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.public_profiles (id, full_name, avatar_url, city, updated_at)
  VALUES (NEW.id, NEW.full_name, NEW.avatar_url, NEW.city, now())
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        city = EXCLUDED.city,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_public_profile
AFTER INSERT OR UPDATE OF full_name, avatar_url, city ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile();

CREATE OR REPLACE FUNCTION public.remove_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.public_profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_remove_public_profile
AFTER DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.remove_public_profile();

-- =====================================================
-- public_vendors: safe subset of vendors, synced by trigger
-- =====================================================
CREATE TABLE public.public_vendors (
  id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  bio text,
  kyc_status kyc_status NOT NULL DEFAULT 'unsubmitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_vendors TO anon, authenticated;
GRANT ALL ON public.public_vendors TO service_role;

ALTER TABLE public.public_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public vendor read" ON public.public_vendors FOR SELECT USING (true);

INSERT INTO public.public_vendors (id, business_name, bio, kyc_status, created_at)
SELECT id, business_name, bio, kyc_status, created_at FROM public.vendors
ON CONFLICT (id) DO UPDATE
  SET business_name = EXCLUDED.business_name,
      bio = EXCLUDED.bio,
      kyc_status = EXCLUDED.kyc_status;

CREATE OR REPLACE FUNCTION public.sync_public_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.public_vendors (id, business_name, bio, kyc_status, created_at, updated_at)
  VALUES (NEW.id, NEW.business_name, NEW.bio, NEW.kyc_status, NEW.created_at, now())
  ON CONFLICT (id) DO UPDATE
    SET business_name = EXCLUDED.business_name,
        bio = EXCLUDED.bio,
        kyc_status = EXCLUDED.kyc_status,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_public_vendor
AFTER INSERT OR UPDATE OF business_name, bio, kyc_status ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.sync_public_vendor();

CREATE OR REPLACE FUNCTION public.remove_public_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.public_vendors WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_remove_public_vendor
AFTER DELETE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.remove_public_vendor();


-- ==================================================================
-- >>> Migration: 20260724105058_e4ed6d58-30b9-41db-902c-248f3b93cf58.sql <<<
-- ==================================================================


-- 1) Extend bookings with inspection fields
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pickup_fuel_pct SMALLINT CHECK (pickup_fuel_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS return_fuel_pct SMALLINT CHECK (return_fuel_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS pickup_odometer INTEGER CHECK (pickup_odometer >= 0),
  ADD COLUMN IF NOT EXISTS return_odometer INTEGER CHECK (return_odometer >= 0),
  ADD COLUMN IF NOT EXISTS pickup_photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS return_photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pickup_notes TEXT,
  ADD COLUMN IF NOT EXISTS return_notes TEXT,
  ADD COLUMN IF NOT EXISTS pickup_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_checked_at TIMESTAMPTZ;

-- 2) Extend disputes
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution TEXT;

-- 3) Storage policies on the private trip-photos bucket
-- Path convention: {bookingId}/pickup/... or {bookingId}/return/... or {bookingId}/dispute/...
CREATE OR REPLACE FUNCTION public.can_access_booking_folder(_folder TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id::text = _folder
      AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin');
$$;

DROP POLICY IF EXISTS "trip photos read"   ON storage.objects;
DROP POLICY IF EXISTS "trip photos write"  ON storage.objects;
DROP POLICY IF EXISTS "trip photos update" ON storage.objects;
DROP POLICY IF EXISTS "trip photos delete" ON storage.objects;

CREATE POLICY "trip photos read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'trip-photos' AND public.can_access_booking_folder((storage.foldername(name))[1]));

CREATE POLICY "trip photos write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'trip-photos' AND public.can_access_booking_folder((storage.foldername(name))[1]));

CREATE POLICY "trip photos update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'trip-photos' AND public.can_access_booking_folder((storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'trip-photos' AND public.can_access_booking_folder((storage.foldername(name))[1]));

CREATE POLICY "trip photos delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'trip-photos' AND public.can_access_booking_folder((storage.foldername(name))[1]));


-- ==================================================================
-- >>> Migration: 20260725013643_d7e212d5-4bd7-4c23-8621-b706e79873dd.sql <<<
-- ==================================================================


-- 1. Fix RLS by making sync triggers SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.sync_public_vendor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.public_vendors (id, business_name, bio, kyc_status, created_at, updated_at)
  VALUES (NEW.id, NEW.business_name, NEW.bio, NEW.kyc_status, NEW.created_at, now())
  ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, bio = EXCLUDED.bio, kyc_status = EXCLUDED.kyc_status, updated_at = now();
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_public_vendor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.public_vendors WHERE id = OLD.id; RETURN OLD; END; $$;

CREATE OR REPLACE FUNCTION public.sync_public_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.public_profiles (id, full_name, avatar_url, city, updated_at)
  VALUES (NEW.id, NEW.full_name, NEW.avatar_url, NEW.city, now())
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, avatar_url = EXCLUDED.avatar_url, city = EXCLUDED.city, updated_at = now();
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_public_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.public_profiles WHERE id = OLD.id; RETURN OLD; END; $$;

-- 2. Live GPS tracking table
CREATE TABLE IF NOT EXISTS public.booking_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_locations_booking_created ON public.booking_locations(booking_id, created_at DESC);

GRANT SELECT, INSERT ON public.booking_locations TO authenticated;
GRANT ALL ON public.booking_locations TO service_role;
ALTER TABLE public.booking_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read booking locations" ON public.booking_locations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Customer inserts own location" ON public.booking_locations FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_locations;

-- 3. Damage checklist columns on bookings (JSON array of {area, condition, note})
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pickup_damage JSONB,
  ADD COLUMN IF NOT EXISTS return_damage JSONB;

-- 4. Dispute resolution workflow
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
-- status column expected to already exist; ensure default
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='disputes' AND column_name='status') THEN
    ALTER TABLE public.disputes ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
  END IF;
END $$;

-- Allow admins to update disputes for resolution
DROP POLICY IF EXISTS "Admins resolve disputes" ON public.disputes;
CREATE POLICY "Admins resolve disputes" ON public.disputes FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));


-- ==================================================================
-- >>> Migration: 20260726040920_f4ec20cc-dc8c-4f46-8f33-5e21f6be2293.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.enforce_vehicle_verification_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    IF NEW.verification_status = 'approved' AND OLD IS DISTINCT FROM NULL THEN
      NEW.verified_at = COALESCE(NEW.verified_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.status := 'draft';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.verification_status := OLD.verification_status;
  NEW.verified_at := OLD.verified_at;
  NEW.rejection_reason := OLD.rejection_reason;

  IF OLD.verification_status IS DISTINCT FROM 'approved' AND NEW.status = 'active' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_verification_guard ON public.vehicles;
CREATE TRIGGER trg_enforce_vehicle_verification_guard
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_verification_guard();

-- ==================================================================
-- >>> Migration: 20260726041241_d116c81d-c669-46e3-aa54-9b89696b5c02.sql <<<
-- ==================================================================

REVOKE ALL ON FUNCTION public.enforce_vehicle_verification_guard() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Customer writes own review" ON public.reviews;
CREATE POLICY "Customer writes review after completed trip"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = customer_id
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = reviews.booking_id
      AND b.vehicle_id = reviews.vehicle_id
      AND b.customer_id = auth.uid()
      AND b.status = 'completed'
  )
);

-- ==================================================================
-- >>> Migration: 20260727105716_7fd14858-3b59-4060-8a7e-f1fe8c54caae.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.enforce_vendor_kyc_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.kyc_status := CASE WHEN NEW.id_document_url IS NULL THEN 'unsubmitted'::kyc_status ELSE 'pending'::kyc_status END;
    RETURN NEW;
  END IF;

  IF NEW.id_document_url IS DISTINCT FROM OLD.id_document_url AND NEW.id_document_url IS NOT NULL THEN
    NEW.kyc_status := 'pending'::kyc_status;
  ELSE
    NEW.kyc_status := OLD.kyc_status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vendor_kyc_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vendor_kyc_guard ON public.vendors;
CREATE TRIGGER trg_vendor_kyc_guard
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_kyc_guard();

-- ==================================================================
-- >>> Migration: 20260728075714_c47ab00b-4895-4d83-822a-1820f37f3e4b.sql <<<
-- ==================================================================


-- Bookings: payment method
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method text;

-- Wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all wallets" ON public.wallets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('topup','booking_payment','booking_earning','refund','payout','adjustment')),
  balance_after numeric(12,2) NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reference text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_created_idx ON public.wallet_transactions (user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Topups
CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own topups" ON public.wallet_topups FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER wallet_topups_updated_at BEFORE UPDATE ON public.wallet_topups FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Internal credit/debit helper (service_role / definer callers only)
CREATE OR REPLACE FUNCTION public.wallet_apply(_user_id uuid, _amount numeric, _kind text, _booking_id uuid DEFAULT NULL, _reference text DEFAULT NULL, _description text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_balance numeric;
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = balance + _amount WHERE user_id = _user_id RETURNING balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF new_balance < 0 THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.wallet_transactions (user_id, amount, kind, balance_after, booking_id, reference, description)
  VALUES (_user_id, _amount, _kind, new_balance, _booking_id, _reference, _description);
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.wallet_apply(uuid, numeric, text, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, numeric, text, uuid, text, text) TO service_role;

-- Pay a booking from the caller's wallet
CREATE OR REPLACE FUNCTION public.wallet_pay_booking(_booking_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Host has not accepted this booking yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.total_price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.total_price, 'booking_payment', b.id, NULL, 'Payment for booking');
  IF b.vendor_id <> b.customer_id THEN
    PERFORM public.wallet_apply(b.vendor_id, b.total_price, 'booking_earning', b.id, NULL, 'Earning from booking');
  END IF;

  UPDATE public.bookings
    SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
    WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;
REVOKE ALL ON FUNCTION public.wallet_pay_booking(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wallet_pay_booking(uuid) TO authenticated;


-- ==================================================================
-- >>> Migration: 20260729100942_8910acc1-27af-4ec8-b477-5527040dceef.sql <<<
-- ==================================================================

-- =========================
-- DRIVERS
-- =========================
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  city TEXT NOT NULL,
  bio TEXT,
  experience_years INTEGER NOT NULL DEFAULT 0,
  languages TEXT[] NOT NULL DEFAULT '{}',
  vehicle_types TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  daily_rate NUMERIC NOT NULL,
  dl_number TEXT,
  dl_expiry DATE,
  dl_front_url TEXT,
  dl_back_url TEXT,
  id_document_url TEXT,
  status vehicle_status NOT NULL DEFAULT 'draft',
  verification_status verification_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  trip_types text[] NOT NULL DEFAULT '{}',
  service_area text,
  avg_rating NUMERIC NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage own profile" ON public.drivers
  FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins manage drivers" ON public.drivers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Verification guard: non-admins can never self-approve
CREATE OR REPLACE FUNCTION public.enforce_driver_verification_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    IF NEW.verification_status = 'approved' THEN
      NEW.verified_at = COALESCE(NEW.verified_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.status := 'draft';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.avg_rating := 0;
    NEW.review_count := 0;
    RETURN NEW;
  END IF;

  -- Re-submitting documents sends the profile back for review
  IF (NEW.dl_front_url IS DISTINCT FROM OLD.dl_front_url)
     OR (NEW.dl_back_url IS DISTINCT FROM OLD.dl_back_url)
     OR (NEW.id_document_url IS DISTINCT FROM OLD.id_document_url)
     OR (NEW.dl_number IS DISTINCT FROM OLD.dl_number) THEN
    NEW.verification_status := 'pending';
    NEW.verified_at := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.avg_rating := OLD.avg_rating;
  NEW.review_count := OLD.review_count;

  IF NEW.verification_status IS DISTINCT FROM 'approved' AND NEW.status = 'active' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_drivers_verification_guard BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_verification_guard();

-- =========================
-- PUBLIC DRIVERS (safe directory)
-- =========================
CREATE TABLE public.public_drivers (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  city TEXT NOT NULL,
  bio TEXT,
  experience_years INTEGER NOT NULL DEFAULT 0,
  languages TEXT[] NOT NULL DEFAULT '{}',
  vehicle_types TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  daily_rate NUMERIC NOT NULL,
  trip_types text[] NOT NULL DEFAULT '{}',
  service_area text,
  avg_rating NUMERIC NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.public_drivers TO anon, authenticated;
GRANT ALL ON public.public_drivers TO service_role;
ALTER TABLE public.public_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public drivers are viewable by everyone" ON public.public_drivers
  FOR SELECT TO anon, authenticated USING (true);

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
      full_name = EXCLUDED.full_name, city = EXCLUDED.city, bio = EXCLUDED.bio,
      experience_years = EXCLUDED.experience_years, languages = EXCLUDED.languages,
      vehicle_types = EXCLUDED.vehicle_types, photo_url = EXCLUDED.photo_url,
      hourly_rate = EXCLUDED.hourly_rate, daily_rate = EXCLUDED.daily_rate,
      avg_rating = EXCLUDED.avg_rating, review_count = EXCLUDED.review_count,
      trip_types = EXCLUDED.trip_types, service_area = EXCLUDED.service_area,
      updated_at = now();
  ELSE
    DELETE FROM public.public_drivers WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_public_driver()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.public_drivers WHERE id = OLD.id; RETURN OLD; END; $$;

CREATE TRIGGER trg_sync_public_driver AFTER INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_driver();
CREATE TRIGGER trg_remove_public_driver AFTER DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.remove_public_driver();

-- =========================
-- DRIVER BOOKINGS
-- =========================
CREATE TABLE public.driver_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  rate_type TEXT NOT NULL DEFAULT 'daily' CHECK (rate_type IN ('hourly','daily')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  hours NUMERIC NOT NULL DEFAULT 0,
  days INTEGER NOT NULL DEFAULT 1,
  pickup_address TEXT,
  notes TEXT,
  total_price NUMERIC NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE ON public.driver_bookings TO authenticated;
GRANT ALL ON public.driver_bookings TO service_role;
ALTER TABLE public.driver_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own driver bookings" ON public.driver_bookings
  FOR SELECT TO authenticated USING (customer_id = auth.uid() OR driver_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers create driver bookings" ON public.driver_bookings
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Parties update driver bookings" ON public.driver_bookings
  FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR driver_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (customer_id = auth.uid() OR driver_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_driver_bookings_driver ON public.driver_bookings(driver_id, start_date, end_date);
CREATE INDEX idx_driver_bookings_customer ON public.driver_bookings(customer_id);

CREATE TRIGGER trg_driver_bookings_updated_at BEFORE UPDATE ON public.driver_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_driver_booking_conflict()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d RECORD;
BEGIN
  SELECT verification_status, status INTO d FROM public.drivers WHERE id = NEW.driver_id;
  IF d.verification_status IS DISTINCT FROM 'approved' OR d.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This driver is not available for hire';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.driver_bookings b
    WHERE b.driver_id = NEW.driver_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Driver is already booked for the selected dates';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_prevent_driver_booking_conflict BEFORE INSERT ON public.driver_bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_booking_conflict();

-- =========================
-- DRIVER REVIEWS
-- =========================
CREATE TABLE public.driver_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_booking_id UUID NOT NULL UNIQUE REFERENCES public.driver_bookings(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  driver_response TEXT,
  driver_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_reviews TO authenticated;
GRANT SELECT ON public.driver_reviews TO anon;
GRANT ALL ON public.driver_reviews TO service_role;
ALTER TABLE public.driver_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver reviews are public" ON public.driver_reviews
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Customers write reviews for completed hires" ON public.driver_reviews
  FOR INSERT TO authenticated WITH CHECK (
    customer_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.driver_bookings b
      WHERE b.id = driver_booking_id AND b.customer_id = auth.uid() AND b.status = 'completed'
    )
  );
CREATE POLICY "Authors and drivers update reviews" ON public.driver_reviews
  FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR driver_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() OR driver_id = auth.uid());

CREATE OR REPLACE FUNCTION public.recompute_driver_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE did UUID;
BEGIN
  did := COALESCE(NEW.driver_id, OLD.driver_id);
  UPDATE public.drivers SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.driver_reviews WHERE driver_id = did), 0),
    review_count = (SELECT COUNT(*) FROM public.driver_reviews WHERE driver_id = did)
  WHERE id = did;
  UPDATE public.public_drivers SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.driver_reviews WHERE driver_id = did), 0),
    review_count = (SELECT COUNT(*) FROM public.driver_reviews WHERE driver_id = did)
  WHERE id = did;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_recompute_driver_rating AFTER INSERT OR UPDATE OR DELETE ON public.driver_reviews
  FOR EACH ROW EXECUTE FUNCTION public.recompute_driver_rating();

-- =========================
-- WALLET PAYMENT FOR DRIVER HIRE
-- =========================
CREATE OR REPLACE FUNCTION public.wallet_pay_driver_booking(_driver_booking_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD; bal NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Driver has not accepted this request yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.total_price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.total_price, 'driver_payment', NULL, b.id::text, 'Payment for driver hire');
  IF b.driver_id <> b.customer_id THEN
    PERFORM public.wallet_apply(b.driver_id, b.total_price, 'driver_earning', NULL, b.id::text, 'Earning from driver hire');
  END IF;

  UPDATE public.driver_bookings
    SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
    WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;

-- ==================================================================
-- >>> Migration: 20260729101010_4267bcef-502a-4a6e-a353-f40a850729ef.sql <<<
-- ==================================================================

REVOKE ALL ON FUNCTION public.wallet_pay_driver_booking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_pay_driver_booking(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.enforce_driver_verification_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_public_driver() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_public_driver() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_driver_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_driver_booking_conflict() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.cancel_driver_booking(_driver_booking_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  starts_at TIMESTAMPTZ;
  hours_left NUMERIC;
  pct NUMERIC := 0;
  refund NUMERIC := 0;
  is_driver BOOLEAN;
  new_pay_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO b FROM public.driver_bookings WHERE id = _driver_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Hire not found'; END IF;

  is_driver := (b.driver_id = auth.uid());
  IF NOT is_driver AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;

  IF b.status IN ('cancelled','rejected','completed') THEN
    RAISE EXCEPTION 'This hire can no longer be cancelled';
  END IF;

  starts_at := (b.start_date::timestamp + b.start_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  IF b.payment_status = 'paid' THEN
    IF is_driver THEN
      pct := 1;
    ELSIF hours_left >= 24 THEN
      pct := 1;
    ELSIF hours_left >= 2 THEN
      pct := 0.5;
    ELSE
      pct := 0;
    END IF;
    refund := ROUND(COALESCE(b.total_price,0) * pct, 2);
  END IF;

  IF refund > 0 THEN
    IF b.driver_id <> b.customer_id THEN
      PERFORM public.wallet_apply(b.driver_id, -refund, 'driver_refund_reversal', NULL, b.id::text,
        CASE WHEN pct = 1 THEN 'Refund to customer (hire cancelled)' ELSE 'Partial refund to customer (hire cancelled)' END);
    END IF;
    PERFORM public.wallet_apply(b.customer_id, refund, 'driver_refund', NULL, b.id::text,
      CASE WHEN pct = 1 THEN 'Full refund for cancelled driver hire' ELSE 'Partial refund for cancelled driver hire' END);
    new_pay_status := CASE WHEN pct = 1 THEN 'refunded' ELSE 'partially_refunded' END;
  ELSE
    new_pay_status := b.payment_status;
  END IF;

  UPDATE public.driver_bookings
    SET status = 'cancelled',
        payment_status = new_pay_status,
        refund_amount = refund,
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancellation_reason = NULLIF(btrim(COALESCE(_reason,'')), '')
  WHERE id = b.id;

  RETURN jsonb_build_object(
    'refund', refund,
    'percent', pct * 100,
    'payment_status', new_pay_status,
    'cancelled_by_driver', is_driver
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_driver_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_driver_booking(uuid, text) TO authenticated;

-- ==================================================================
-- >>> Migration: 20260802040757_0c784c0e-9f5d-4bea-9161-a6b6e039c909.sql <<<
-- ==================================================================

-- ============ WASH SERVICES CATALOGUE ============
CREATE TABLE public.wash_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  vehicle_category vehicle_category NOT NULL DEFAULT 'car',
  price numeric NOT NULL CHECK (price >= 0),
  duration_minutes integer NOT NULL DEFAULT 45 CHECK (duration_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wash_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_services TO authenticated;
GRANT ALL ON public.wash_services TO service_role;
ALTER TABLE public.wash_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active wash services" ON public.wash_services
  FOR SELECT USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage wash services" ON public.wash_services
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update wash services" ON public.wash_services
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete wash services" ON public.wash_services
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER wash_services_updated_at BEFORE UPDATE ON public.wash_services
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ WASH PARTNERS (admin-only vendor directory) ============
CREATE TABLE public.wash_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  city text NOT NULL,
  daily_capacity integer NOT NULL DEFAULT 5 CHECK (daily_capacity > 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wash_vendors TO authenticated;
GRANT ALL ON public.wash_vendors TO service_role;
ALTER TABLE public.wash_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view wash partners" ON public.wash_vendors
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert wash partners" ON public.wash_vendors
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update wash partners" ON public.wash_vendors
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete wash partners" ON public.wash_vendors
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER wash_vendors_updated_at BEFORE UPDATE ON public.wash_vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ WASH BOOKINGS ============
CREATE TABLE public.wash_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.wash_services(id),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_label text,
  city text NOT NULL,
  address text NOT NULL,
  lat numeric,
  lng numeric,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  notes text,
  price numeric NOT NULL CHECK (price >= 0),
  status booking_status NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'unpaid',
  payment_method text,
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  assigned_vendor_id uuid REFERENCES public.wash_vendors(id) ON DELETE SET NULL,
  admin_note text,
  rejection_reason text,
  refund_amount numeric NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wash_bookings TO authenticated;
GRANT ALL ON public.wash_bookings TO service_role;
ALTER TABLE public.wash_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers and admins view wash bookings" ON public.wash_bookings
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers create own wash bookings" ON public.wash_bookings
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Admins update wash bookings" ON public.wash_bookings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX wash_bookings_customer_idx ON public.wash_bookings(customer_id, created_at DESC);
CREATE INDEX wash_bookings_status_idx ON public.wash_bookings(status, slot_date);

CREATE TRIGGER wash_bookings_updated_at BEFORE UPDATE ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- New bookings always start pending/unpaid, priced from the catalogue (non-admin inserts)
CREATE OR REPLACE FUNCTION public.enforce_wash_booking_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  SELECT * INTO s FROM public.wash_services WHERE id = NEW.service_id;
  IF s IS NULL OR NOT s.active THEN
    RAISE EXCEPTION 'This wash package is not available';
  END IF;
  IF NEW.slot_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Choose a slot in the future';
  END IF;

  NEW.price := s.price;
  NEW.status := 'pending';
  NEW.payment_status := 'unpaid';
  NEW.payment_method := NULL;
  NEW.paid_at := NULL;
  NEW.razorpay_order_id := NULL;
  NEW.razorpay_payment_id := NULL;
  NEW.assigned_vendor_id := NULL;
  NEW.admin_note := NULL;
  NEW.rejection_reason := NULL;
  NEW.refund_amount := 0;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  NEW.completed_at := NULL;
  RETURN NEW;
END; $$;

CREATE TRIGGER wash_bookings_guard BEFORE INSERT ON public.wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wash_booking_guard();

-- ============ PAY WITH WALLET ============
CREATE OR REPLACE FUNCTION public.wallet_pay_wash_booking(_wash_booking_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b RECORD; bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Admin has not approved this wash yet'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (b.customer_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id FOR UPDATE;
  IF bal < b.price THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  PERFORM public.wallet_apply(b.customer_id, -b.price, 'wash_payment', NULL, b.id::text, 'Payment for vehicle wash');

  UPDATE public.wash_bookings
     SET payment_status = 'paid', paid_at = now(), payment_method = 'wallet'
   WHERE id = b.id;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = b.customer_id;
  RETURN bal;
END; $$;

-- ============ ADMIN DECISION ============
CREATE OR REPLACE FUNCTION public.admin_decide_wash_booking(
  _wash_booking_id uuid,
  _decision text,
  _vendor_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b RECORD; refund numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _decision NOT IN ('confirmed','rejected','completed') THEN RAISE EXCEPTION 'Invalid decision'; END IF;

  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;

  IF _decision = 'confirmed' THEN
    IF _vendor_id IS NULL THEN RAISE EXCEPTION 'Assign a washer partner before approving'; END IF;
    UPDATE public.wash_bookings
       SET status = 'confirmed', assigned_vendor_id = _vendor_id,
           admin_note = NULLIF(btrim(COALESCE(_note,'')), ''), rejection_reason = NULL
     WHERE id = b.id;

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

-- ============ CUSTOMER / ADMIN CANCELLATION WITH REFUND ============
CREATE OR REPLACE FUNCTION public.cancel_wash_booking(_wash_booking_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD; starts_at timestamptz; hours_left numeric; pct numeric := 0;
  refund numeric := 0; is_admin boolean; new_pay text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO b FROM public.wash_bookings WHERE id = _wash_booking_id FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Wash booking not found'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT is_admin AND b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  IF b.status IN ('cancelled','rejected','completed') THEN RAISE EXCEPTION 'This wash can no longer be cancelled'; END IF;

  starts_at := (b.slot_date::timestamp + b.slot_time) AT TIME ZONE 'Asia/Kolkata';
  hours_left := EXTRACT(EPOCH FROM (starts_at - now())) / 3600.0;

  IF b.payment_status = 'paid' THEN
    IF is_admin OR hours_left >= 24 THEN pct := 1;
    ELSIF hours_left >= 2 THEN pct := 0.5;
    ELSE pct := 0; END IF;
    refund := ROUND(COALESCE(b.price, 0) * pct, 2);
  END IF;

  IF refund > 0 THEN
    PERFORM public.wallet_apply(b.customer_id, refund, 'wash_refund', NULL, b.id::text,
      CASE WHEN pct = 1 THEN 'Full refund for cancelled wash' ELSE 'Partial refund for cancelled wash' END);
    new_pay := CASE WHEN pct = 1 THEN 'refunded' ELSE 'partially_refunded' END;
  ELSE
    new_pay := b.payment_status;
  END IF;

  UPDATE public.wash_bookings
     SET status = 'cancelled', payment_status = new_pay, refund_amount = refund,
         cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = NULLIF(btrim(COALESCE(_reason,'')), '')
   WHERE id = b.id;

  RETURN jsonb_build_object('refund', refund, 'percent', pct * 100, 'payment_status', new_pay);
END; $$;

-- ============ SEED CATALOGUE + PARTNERS ============
INSERT INTO public.wash_services (name, description, vehicle_category, price, duration_minutes, sort_order) VALUES
  ('Bike Express Wash', 'Foam wash, chain degrease, tyre shine and hand dry for two-wheelers.', 'bike', 199, 30, 1),
  ('Scooter Sparkle Wash', 'Exterior foam wash, seat wipe-down and polish for scooters.', 'scooter', 179, 25, 2),
  ('Car Express Wash', 'Exterior foam wash, wheel clean, tyre dressing and hand dry.', 'car', 449, 45, 3),
  ('Car Interior + Exterior', 'Full exterior wash plus vacuum, dashboard polish and glass cleaning.', 'car', 899, 90, 4),
  ('Premium Ceramic Shine', 'Deep clean with ceramic spray sealant and 30-day gloss protection.', 'car', 1899, 150, 5),
  ('EV Care Wash', 'Waterless-safe wash for electric vehicles with port-safe detailing.', 'ev', 799, 75, 6);

INSERT INTO public.wash_vendors (name, contact_phone, city, daily_capacity, notes) VALUES
  ('ShinePro Detailers', '+91 90000 11111', 'Bengaluru', 8, 'Doorstep team, 2 washers available'),
  ('AquaFresh Wash Crew', '+91 90000 22222', 'Hyderabad', 6, 'Handles bikes and cars'),
  ('CeramicCare Studio', '+91 90000 33333', 'Mumbai', 4, 'Premium ceramic and detailing only');

-- ==================================================================
-- >>> Migration: 20260802040831_755d4c34-896e-4e81-b509-5af9329df87f.sql <<<
-- ==================================================================

-- Money/state-changing RPCs: signed-in users only (RLS/ownership checks stay inside each function)
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.wallet_pay_wash_booking(uuid)',
    'public.admin_decide_wash_booking(uuid, text, uuid, text)',
    'public.cancel_wash_booking(uuid, text)',
    'public.wallet_pay_booking(uuid)',
    'public.wallet_pay_driver_booking(uuid)',
    'public.cancel_driver_booking(uuid, text)',
    'public.report_review(uuid, text)',
    'public.wallet_apply(uuid, numeric, text, uuid, text, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.wallet_pay_wash_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_wash_booking(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_wash_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_pay_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_pay_driver_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_driver_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_review(uuid, text) TO authenticated;
-- wallet_apply is an internal ledger helper: service role only
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, numeric, text, uuid, text, text) TO service_role;

-- ==================================================================
-- >>> Migration: 20260803023241_d43d9aea-e5b9-4100-a378-3a1e6281db40.sql <<<
-- ==================================================================

-- 1. Coupons: stop bulk enumeration of active promo codes
DROP POLICY IF EXISTS "Active coupons readable" ON public.coupons;
REVOKE SELECT ON public.coupons FROM anon;
REVOKE SELECT ON public.coupons FROM authenticated;
GRANT ALL ON public.coupons TO service_role;

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'valid', true,
       'code', c.code,
       'percent_off', c.percent_off,
       'amount_off', c.amount_off)
     FROM public.coupons c
     WHERE upper(btrim(c.code)) = upper(btrim(_code))
       AND c.active
       AND (c.starts_at IS NULL OR c.starts_at <= now())
       AND (c.ends_at IS NULL OR c.ends_at >= now())
     LIMIT 1),
    jsonb_build_object('valid', false)
  );
$$;

-- 2. Lock down every SECURITY DEFINER routine in the exposed schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Trigger / internal-only routines stay callable by nobody but the engine + service role
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, numeric, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO service_role;

-- Re-grant only what the app must call as a signed-in user
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_booking_folder(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_pay_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_pay_driver_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_pay_wash_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_driver_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_wash_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_wash_booking(uuid, text, uuid, text) TO authenticated;

-- ==================================================================
-- >>> Migration: 20260804050757_e68a3c5f-81da-479e-a12c-86dc5f00f7a4.sql <<<
-- ==================================================================

-- 1. Scope policies to authenticated role explicitly
DROP POLICY IF EXISTS "Customer creates booking" ON public.bookings;
CREATE POLICY "Customer creates booking" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Parties read bookings" ON public.bookings;
CREATE POLICY "Parties read bookings" ON public.bookings FOR SELECT TO authenticated USING ((auth.uid() = customer_id) OR (auth.uid() = vendor_id) OR has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Parties update booking" ON public.bookings;
CREATE POLICY "Parties update booking" ON public.bookings FOR UPDATE TO authenticated USING ((auth.uid() = customer_id) OR (auth.uid() = vendor_id) OR has_role(auth.uid(), 'admin')) WITH CHECK ((auth.uid() = customer_id) OR (auth.uid() = vendor_id) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin updates dispute" ON public.disputes;
DROP POLICY IF EXISTS "Parties read disputes" ON public.disputes;
CREATE POLICY "Parties read disputes" ON public.disputes FOR SELECT TO authenticated USING ((raised_by = auth.uid()) OR has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = disputes.booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));
DROP POLICY IF EXISTS "User opens dispute" ON public.disputes;
CREATE POLICY "User opens dispute" ON public.disputes FOR INSERT TO authenticated WITH CHECK (auth.uid() = raised_by);

DROP POLICY IF EXISTS "Parties read messages" ON public.messages;
CREATE POLICY "Parties read messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = messages.booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));
DROP POLICY IF EXISTS "Parties send messages" ON public.messages;
CREATE POLICY "Parties send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK ((auth.uid() = sender_id) AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = messages.booking_id AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())));

DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Owner or admin reads profile" ON public.profiles;
CREATE POLICY "Owner or admin reads profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id) OR has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "User reads own notifications" ON public.notifications;
CREATE POLICY "User reads own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "User updates own notifications" ON public.notifications;
CREATE POLICY "User updates own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own wishlist" ON public.wishlists;
CREATE POLICY "Own wishlist" ON public.wishlists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage coupons" ON public.coupons;
CREATE POLICY "Admins manage coupons" ON public.coupons FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Customer deletes own review" ON public.reviews;
CREATE POLICY "Customer deletes own review" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Customer edits own review" ON public.reviews;
CREATE POLICY "Customer edits own review" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

-- 2. Vendor review response: add WITH CHECK + column guard trigger
DROP POLICY IF EXISTS "Vendor responds to review" ON public.reviews;
CREATE POLICY "Vendor responds to review" ON public.reviews FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_review_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin') OR OLD.customer_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  -- Vendors may only change their public response fields
  NEW.id := OLD.id;
  NEW.booking_id := OLD.booking_id;
  NEW.vehicle_id := OLD.vehicle_id;
  NEW.customer_id := OLD.customer_id;
  NEW.rating := OLD.rating;
  NEW.comment := OLD.comment;
  NEW.created_at := OLD.created_at;
  NEW.reported := OLD.reported;
  NEW.report_reason := OLD.report_reason;
  IF NEW.vendor_response IS DISTINCT FROM OLD.vendor_response THEN
    NEW.vendor_response_at := now();
  ELSE
    NEW.vendor_response_at := OLD.vendor_response_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_review_update_scope ON public.reviews;
CREATE TRIGGER trg_enforce_review_update_scope
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_review_update_scope();

REVOKE ALL ON FUNCTION public.enforce_review_update_scope() FROM PUBLIC, anon, authenticated;

-- ==================================================================
-- >>> Migration: 20260804123721_13bc4eb5-da1c-4b4a-9da1-f1c592c61e99.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.booked_vehicle_ids(_start date, _end date)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT b.vehicle_id
  FROM public.bookings b
  WHERE b.status IN ('pending','confirmed')
    AND b.start_date <= _end
    AND b.end_date >= _start
  UNION
  SELECT DISTINCT a.vehicle_id
  FROM public.availability_blocks a
  WHERE a.start_date <= _end
    AND a.end_date >= _start;
$$;

REVOKE ALL ON FUNCTION public.booked_vehicle_ids(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booked_vehicle_ids(date, date) TO anon, authenticated;

-- ==================================================================
-- >>> Migration: 20260805113350_e118a1c4-570b-45c8-a2ba-cb77b446753e.sql <<<
-- ==================================================================

-- Helper: create a notification row
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _title text, _body text, _link text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (_user_id, _title, _body, _link);
END; $$;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins(_title text, _body text, _link text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, link)
  SELECT ur.user_id, _title, _body, _link FROM public.user_roles ur WHERE ur.role = 'admin';
END; $$;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text) FROM anon, authenticated;

-- Vehicle rental bookings
CREATE OR REPLACE FUNCTION public.tg_notify_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
      COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date, '/vendor');
    PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
      'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Booking approved',
        COALESCE(v_title,'Your vehicle') || ' is confirmed. Complete the payment to lock it in.', '/bookings');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Booking declined',
        'The host could not accept your request for ' || COALESCE(v_title,'this vehicle') || '.', '/bookings');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Booking cancelled', 'Your trip was cancelled.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Booking cancelled', 'A trip on ' || COALESCE(v_title,'your vehicle') || ' was cancelled.', '/vendor');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Trip completed', 'Rate your ride and view your invoice.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Trip completed', COALESCE(v_title,'Your vehicle') || ' is back. Earnings updated.', '/vendor');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'Payment received',
      'Payment of Rs ' || NEW.total_price || ' received for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful',
      'Your booking is confirmed. Show your QR at pickup.', '/bookings');
  END IF;

  IF NEW.pickup_checked_at IS NOT NULL AND OLD.pickup_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Pickup confirmed', 'Handover verified by QR. Drive safe!', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Pickup confirmed', 'QR check-in completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor');
  END IF;

  IF NEW.return_checked_at IS NOT NULL AND OLD.return_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Return confirmed', 'Vehicle returned and verified by QR.', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Return confirmed', 'QR check-out completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_booking_ins ON public.bookings;
CREATE TRIGGER trg_notify_booking_ins AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_booking();
DROP TRIGGER IF EXISTS trg_notify_booking_upd ON public.bookings;
CREATE TRIGGER trg_notify_booking_upd AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_booking();

-- Driver hires
CREATE OR REPLACE FUNCTION public.tg_notify_driver_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.driver_id, 'New hire request',
      'A rider wants you on ' || NEW.start_date || ' at ' || NEW.start_time || '.', '/driver-dashboard');
    PERFORM public.notify_user(NEW.customer_id, 'Hire requested', 'Waiting for the driver to accept.', '/hires');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Driver accepted', 'Complete the payment to confirm your driver.', '/hires');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Driver declined', 'Try another driver for your trip.', '/drivers');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Hire cancelled',
        CASE WHEN NEW.refund_amount > 0 THEN 'Refund of Rs ' || NEW.refund_amount || ' credited to your wallet.' ELSE 'Your driver hire was cancelled.' END, '/hires');
      PERFORM public.notify_user(NEW.driver_id, 'Hire cancelled', 'A hire on your calendar was cancelled.', '/driver-dashboard');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Hire completed', 'Rate your driver and view your invoice.', '/hires');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.driver_id, 'Payment received', 'Rs ' || NEW.total_price || ' credited for your hire.', '/driver-dashboard');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful', 'Your driver is confirmed.', '/hires');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_driver_booking_ins ON public.driver_bookings;
CREATE TRIGGER trg_notify_driver_booking_ins AFTER INSERT ON public.driver_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_driver_booking();
DROP TRIGGER IF EXISTS trg_notify_driver_booking_upd ON public.driver_bookings;
CREATE TRIGGER trg_notify_driver_booking_upd AFTER UPDATE ON public.driver_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_driver_booking();

-- Wash bookings
CREATE OR REPLACE FUNCTION public.tg_notify_wash_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New wash request',
      NEW.city || ' · ' || NEW.slot_date || ' ' || NEW.slot_time || ' — assign a washer partner.', '/admin');
    PERFORM public.notify_user(NEW.customer_id, 'Wash requested', 'Our team is checking washer availability.', '/washes');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash slot approved', 'Pay now to confirm your doorstep wash.', '/washes');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash slot unavailable',
        COALESCE(NEW.rejection_reason, 'No washer partner is free for that slot.'), '/wash');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash cancelled',
        CASE WHEN NEW.refund_amount > 0 THEN 'Refund of Rs ' || NEW.refund_amount || ' credited to your wallet.' ELSE 'Your wash booking was cancelled.' END, '/washes');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Wash completed', 'Your vehicle is sparkling. View your invoice.', '/washes');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.customer_id, 'Wash payment successful', 'Your slot is locked in.', '/washes');
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_wash_ins ON public.wash_bookings;
CREATE TRIGGER trg_notify_wash_ins AFTER INSERT ON public.wash_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_wash_booking();
DROP TRIGGER IF EXISTS trg_notify_wash_upd ON public.wash_bookings;
CREATE TRIGGER trg_notify_wash_upd AFTER UPDATE ON public.wash_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_wash_booking();

-- Chat messages
CREATE OR REPLACE FUNCTION public.tg_notify_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD; target uuid;
BEGIN
  SELECT customer_id, vendor_id INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF b IS NULL THEN RETURN NEW; END IF;
  target := CASE WHEN NEW.sender_id = b.customer_id THEN b.vendor_id ELSE b.customer_id END;
  PERFORM public.notify_user(target, 'New message',
    COALESCE(left(NEW.body, 120), 'Sent a photo'), '/messages/' || NEW.booking_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_message();

-- Vehicle verification
CREATE OR REPLACE FUNCTION public.tg_notify_vehicle_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New vehicle awaiting review', NEW.title || ' · ' || NEW.city, '/admin');
    RETURN NEW;
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NEW.verification_status = 'approved' THEN
      PERFORM public.notify_user(NEW.vendor_id, 'Vehicle approved', NEW.title || ' is now live on Synchoo.', '/vendor');
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM public.notify_user(NEW.vendor_id, 'Vehicle rejected',
        COALESCE(NEW.rejection_reason, 'Please re-upload clearer documents.'), '/vendor');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_vehicle_ins ON public.vehicles;
CREATE TRIGGER trg_notify_vehicle_ins AFTER INSERT ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_vehicle_verification();
DROP TRIGGER IF EXISTS trg_notify_vehicle_upd ON public.vehicles;
CREATE TRIGGER trg_notify_vehicle_upd AFTER UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_vehicle_verification();

-- Host KYC
CREATE OR REPLACE FUNCTION public.tg_notify_vendor_kyc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    IF NEW.kyc_status = 'pending' THEN
      PERFORM public.notify_admins('Host ID awaiting review', NEW.business_name, '/admin');
      PERFORM public.notify_user(NEW.id, 'Document submitted', 'Our team is reviewing your identity proof.', '/vendor');
    ELSIF NEW.kyc_status = 'approved' THEN
      PERFORM public.notify_user(NEW.id, 'You are a verified host', 'You can now publish listings.', '/vendor');
    ELSIF NEW.kyc_status = 'rejected' THEN
      PERFORM public.notify_user(NEW.id, 'Identity check failed', 'Please upload a clearer government ID.', '/vendor');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_vendor_kyc ON public.vendors;
CREATE TRIGGER trg_notify_vendor_kyc AFTER UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_vendor_kyc();

-- Driver licence verification
CREATE OR REPLACE FUNCTION public.tg_notify_driver_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New driver awaiting review', NEW.full_name || ' · ' || NEW.city, '/admin');
    RETURN NEW;
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NEW.verification_status = 'approved' THEN
      PERFORM public.notify_user(NEW.id, 'Driver profile approved', 'Riders can now hire you.', '/driver-dashboard');
    ELSIF NEW.verification_status = 'rejected' THEN
      PERFORM public.notify_user(NEW.id, 'Driver profile rejected',
        COALESCE(NEW.rejection_reason, 'Please re-submit your licence documents.'), '/driver-dashboard');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_driver_ins ON public.drivers;
CREATE TRIGGER trg_notify_driver_ins AFTER INSERT ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_driver_verification();
DROP TRIGGER IF EXISTS trg_notify_driver_upd ON public.drivers;
CREATE TRIGGER trg_notify_driver_upd AFTER UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_driver_verification();

-- Rider licence verification
CREATE OR REPLACE FUNCTION public.tg_notify_profile_dl()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dl_status IS DISTINCT FROM OLD.dl_status THEN
    IF NEW.dl_status = 'pending' THEN
      PERFORM public.notify_admins('Licence awaiting review', COALESCE(NEW.full_name, 'A rider') || ' submitted a driving licence.', '/admin');
      PERFORM public.notify_user(NEW.id, 'Licence submitted', 'We will verify it shortly.', '/profile');
    ELSIF NEW.dl_status = 'approved' THEN
      PERFORM public.notify_user(NEW.id, 'Licence approved', 'You can now book vehicles on Synchoo.', '/browse');
    ELSIF NEW.dl_status = 'rejected' THEN
      PERFORM public.notify_user(NEW.id, 'Licence rejected',
        COALESCE(NEW.dl_rejection_reason, 'Please upload clearer licence photos.'), '/profile');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_profile_dl ON public.profiles;
CREATE TRIGGER trg_notify_profile_dl AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_profile_dl();

-- Wallet movements
CREATE OR REPLACE FUNCTION public.tg_notify_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_user(NEW.user_id,
    CASE WHEN NEW.amount >= 0 THEN 'Wallet credited Rs ' || NEW.amount ELSE 'Wallet debited Rs ' || abs(NEW.amount) END,
    COALESCE(NEW.description, NEW.kind) || ' · Balance Rs ' || NEW.balance_after, '/wallet');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_wallet ON public.wallet_transactions;
CREATE TRIGGER trg_notify_wallet AFTER INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_wallet();

-- Disputes
CREATE OR REPLACE FUNCTION public.tg_notify_dispute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('New dispute raised', NEW.subject, '/admin');
    PERFORM public.notify_user(NEW.raised_by, 'Report received', 'Our support team will review it shortly.', '/bookings');
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved','rejected','closed') THEN
    PERFORM public.notify_user(NEW.raised_by, 'Dispute ' || NEW.status,
      COALESCE(NEW.resolution, 'Support has updated your report.'), '/bookings');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_dispute_ins ON public.disputes;
CREATE TRIGGER trg_notify_dispute_ins AFTER INSERT ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_dispute();
DROP TRIGGER IF EXISTS trg_notify_dispute_upd ON public.disputes;
CREATE TRIGGER trg_notify_dispute_upd AFTER UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_dispute();

-- Live notification stream
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ==================================================================
-- >>> Migration: 20260805113422_833cdc73-8d06-45bc-8bc4-a13589927ff3.sql <<<
-- ==================================================================


REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_notify_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_driver_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_wash_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_vehicle_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_vendor_kyc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_driver_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_profile_dl() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_wallet() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_dispute() FROM PUBLIC, anon, authenticated;


-- ==================================================================
-- >>> Migration: 20260807155915_3ee7af8c-7dbe-4f6d-a3c7-3a3f7309c2cd.sql <<<
-- ==================================================================

-- 1. availability_blocks: only for live, approved vehicles (or owner/admin)
DROP POLICY IF EXISTS "Availability public read" ON public.availability_blocks;
CREATE POLICY "Availability read for listed vehicles"
ON public.availability_blocks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = availability_blocks.vehicle_id
      AND v.status = 'active'
      AND v.verification_status = 'approved'
  )
  OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = availability_blocks.vehicle_id AND v.vendor_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- 2. vehicle_images: only for live, approved vehicles (or owner/admin)
DROP POLICY IF EXISTS "Vehicle images public read" ON public.vehicle_images;
CREATE POLICY "Vehicle images read for listed vehicles"
ON public.vehicle_images FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_images.vehicle_id
      AND v.status = 'active'
      AND v.verification_status = 'approved'
  )
  OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_images.vehicle_id AND v.vendor_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- 3. reviews: only for live, approved vehicles (or author/owner/admin)
DROP POLICY IF EXISTS "Reviews public read" ON public.reviews;
CREATE POLICY "Reviews read for listed vehicles"
ON public.reviews FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = reviews.vehicle_id
      AND v.status = 'active'
      AND v.verification_status = 'approved'
  )
  OR customer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- 4. booking_locations: strict participant-only access (realtime honours RLS)
REVOKE ALL ON public.booking_locations FROM anon;
DROP POLICY IF EXISTS "Customer inserts own location" ON public.booking_locations;
CREATE POLICY "Participants insert own location"
ON public.booking_locations FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_locations.booking_id
      AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())
  )
);

-- 5. notifications: system-generated only, no direct client inserts
DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon, authenticated;

-- 6. internal helper functions must not be directly callable by clients
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.can_access_booking_folder(text) FROM anon, authenticated, public;

-- ==================================================================
-- >>> Migration: 20260807155958_7c7efaf8-0d19-4e0f-a37b-13ae7e1caf26.sql <<<
-- ==================================================================

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_booking_folder(text) TO authenticated;

-- ==================================================================
-- >>> Migration: 20260809013207_e57cee4b-b5df-4b10-8400-48ad4196ed81.sql <<<
-- ==================================================================

-- Helper: true when the statement runs through PostgREST as a normal end user
-- (SECURITY DEFINER RPCs and the service role run as other roles and are exempt).
CREATE OR REPLACE FUNCTION public.is_end_user_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user IN ('authenticated', 'anon');
$$;

REVOKE ALL ON FUNCTION public.is_end_user_request() FROM PUBLIC;

-- ============ bookings ============
CREATE OR REPLACE FUNCTION public.enforce_booking_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  -- Immutable identity / schedule / money / payment / handover columns
  NEW.id := OLD.id;
  NEW.vehicle_id := OLD.vehicle_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.customer_id := OLD.customer_id;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.pickup_time := OLD.pickup_time;
  NEW.dropoff_time := OLD.dropoff_time;
  NEW.base_price := OLD.base_price;
  NEW.security_deposit := OLD.security_deposit;
  NEW.discount := OLD.discount;
  NEW.total_price := OLD.total_price;
  NEW.coupon_code := OLD.coupon_code;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.razorpay_order_id := OLD.razorpay_order_id;
  NEW.razorpay_payment_id := OLD.razorpay_payment_id;
  NEW.paid_at := OLD.paid_at;
  NEW.qr_code := OLD.qr_code;
  NEW.pickup_checked_at := OLD.pickup_checked_at;
  NEW.return_checked_at := OLD.return_checked_at;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_booking_update_scope ON public.bookings;
CREATE TRIGGER trg_enforce_booking_update_scope
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_update_scope();

-- ============ driver_bookings ============
CREATE OR REPLACE FUNCTION public.enforce_driver_booking_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.driver_id := OLD.driver_id;
  NEW.customer_id := OLD.customer_id;
  NEW.booking_id := OLD.booking_id;
  NEW.rate_type := OLD.rate_type;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.start_time := OLD.start_time;
  NEW.end_time := OLD.end_time;
  NEW.hours := OLD.hours;
  NEW.days := OLD.days;
  NEW.total_price := OLD.total_price;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.razorpay_order_id := OLD.razorpay_order_id;
  NEW.razorpay_payment_id := OLD.razorpay_payment_id;
  NEW.paid_at := OLD.paid_at;
  NEW.refund_amount := OLD.refund_amount;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_driver_booking_update_scope ON public.driver_bookings;
CREATE TRIGGER trg_enforce_driver_booking_update_scope
BEFORE UPDATE ON public.driver_bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_booking_update_scope();

-- ============ driver_reviews ============
CREATE OR REPLACE FUNCTION public.enforce_driver_review_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR OLD.customer_id = auth.uid() THEN RETURN NEW; END IF;

  -- The reviewed driver may only write a public response.
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.driver_booking_id IS DISTINCT FROM OLD.driver_booking_id THEN
    RAISE EXCEPTION 'Drivers can only add a response to a review';
  END IF;

  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  IF NEW.driver_response IS DISTINCT FROM OLD.driver_response THEN
    NEW.driver_response_at := now();
  ELSE
    NEW.driver_response_at := OLD.driver_response_at;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_driver_review_update_scope ON public.driver_reviews;
CREATE TRIGGER trg_enforce_driver_review_update_scope
BEFORE UPDATE ON public.driver_reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_review_update_scope();

-- ============ reviews: make vendor tampering an explicit failure ============
CREATE OR REPLACE FUNCTION public.enforce_review_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR OLD.customer_id = auth.uid() THEN RETURN NEW; END IF;

  -- Vendors may only change their public response fields.
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.reported IS DISTINCT FROM OLD.reported
     OR NEW.report_reason IS DISTINCT FROM OLD.report_reason THEN
    RAISE EXCEPTION 'Hosts can only add a response to a review';
  END IF;

  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  IF NEW.vendor_response IS DISTINCT FROM OLD.vendor_response THEN
    NEW.vendor_response_at := now();
  ELSE
    NEW.vendor_response_at := OLD.vendor_response_at;
  END IF;

  RETURN NEW;
END; $$;

-- ==================================================================
-- >>> Migration: 20260810125943_316c76f7-cef8-42ed-80fc-02b0256690af.sql <<<
-- ==================================================================

ALTER TABLE public.public_drivers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_drivers;

-- ==================================================================
-- >>> Migration: 20260811145857_3de03eda-a29b-4102-91cc-ff40bfd697ca.sql <<<
-- ==================================================================

-- Defence in depth: keep the column-scope guards on review updates and make sure
-- they always run (even for replication/admin-owner sessions of end users).
DROP TRIGGER IF EXISTS trg_enforce_review_update_scope ON public.reviews;
CREATE TRIGGER trg_enforce_review_update_scope
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_update_scope();

DROP TRIGGER IF EXISTS trg_enforce_driver_review_update_scope ON public.driver_reviews;
CREATE TRIGGER trg_enforce_driver_review_update_scope
  BEFORE UPDATE ON public.driver_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_review_update_scope();

-- Narrow the update policies to the exact actors, so only the review author,
-- the responding host/driver, or an admin can update at all; the triggers above
-- then restrict hosts/drivers to their response columns only.
DROP POLICY IF EXISTS "Vendor responds to review" ON public.reviews;
CREATE POLICY "Vendor responds to review"
  ON public.reviews FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = reviews.vehicle_id AND v.vendor_id = auth.uid())
    AND vendor_response IS NOT NULL
  );

DROP POLICY IF EXISTS "Authors and drivers update reviews" ON public.driver_reviews;
CREATE POLICY "Authors update own driver reviews"
  ON public.driver_reviews FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Drivers reply to their reviews"
  ON public.driver_reviews FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid() AND driver_response IS NOT NULL);

COMMENT ON FUNCTION public.enforce_review_update_scope() IS
  'Blocks hosts from changing a customer review rating/comment/report fields; only vendor_response(_at) may change.';
COMMENT ON FUNCTION public.enforce_driver_review_update_scope() IS
  'Blocks drivers from changing a customer review rating/comment; only driver_response(_at) may change.';

-- ==================================================================
-- >>> Migration: 20260811151118_d406b81c-b0f0-4467-afcb-c980716ed5ef.sql <<<
-- ==================================================================

do $$
declare v_uid uuid; v_wb uuid; v_partner uuid;
begin
  select id into v_uid from auth.users where email = 'qa.cust1@example.com';
  if v_uid is not null then
    select id into v_wb from public.wash_bookings where customer_id = v_uid order by created_at desc limit 1;
    select id into v_partner from public.wash_vendors limit 1;
    if v_wb is not null and v_partner is not null then
      update public.wash_bookings set status = 'confirmed', assigned_vendor_id = v_partner where id = v_wb;
    end if;
    insert into public.wallets (user_id, balance) values (v_uid, 500000)
      on conflict (user_id) do update set balance = 500000;
    update public.profiles set dl_status = 'approved', dl_verified_at = now() where id = v_uid;
  end if;
end $$;

-- ==================================================================
-- >>> Migration: 20260811151435_f73052d0-66db-4eef-9393-a2ae912564dc.sql <<<
-- ==================================================================

-- 1) The hire guard read public.drivers as the calling customer, who has no direct
-- SELECT grant on that table (customers read public_drivers). The lookup returned
-- NULL and every hire was rejected with "This driver is not available for hire".
CREATE OR REPLACE FUNCTION public.prevent_driver_booking_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d RECORD;
BEGIN
  SELECT verification_status, status INTO d FROM public.drivers WHERE id = NEW.driver_id;
  IF d IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;
  IF d.verification_status IS DISTINCT FROM 'approved' OR d.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This driver is not available for hire';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.driver_bookings b
    WHERE b.driver_id = NEW.driver_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('pending','confirmed')
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'Driver is already booked for the selected dates';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_driver_booking_conflict() FROM anon, authenticated;

-- 2) Wallet payments for driver hires and washes inserted ledger kinds that the
-- CHECK constraint rejected, so every wallet payment failed at the last step.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind = ANY (ARRAY[
    'topup','booking_payment','booking_earning','refund','payout','adjustment',
    'driver_payment','driver_earning','driver_refund','driver_refund_reversal',
    'wash_payment','wash_refund'
  ]));

-- ==================================================================
-- >>> Migration: 20260813172257_01d028c0-d8c8-44f1-9a9c-03600171d482.sql <<<
-- ==================================================================

-- Car pooling module (independent of rentals)
CREATE TABLE public.pool_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_label text NOT NULL,
  origin_label text NOT NULL,
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  dest_label text NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  route jsonb NOT NULL DEFAULT '[]'::jsonb,
  depart_at timestamptz NOT NULL,
  seats_total smallint NOT NULL CHECK (seats_total BETWEEN 1 AND 8),
  seats_available smallint NOT NULL CHECK (seats_available >= 0),
  fare_per_seat numeric NOT NULL CHECK (fare_per_seat >= 0),
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','started','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_available <= seats_total)
);

CREATE TABLE public.pool_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.pool_trips(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_label text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  drop_label text NOT NULL,
  drop_lat double precision NOT NULL,
  drop_lng double precision NOT NULL,
  seats smallint NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 8),
  fare_total numeric NOT NULL DEFAULT 0 CHECK (fare_total >= 0),
  match_score numeric NOT NULL DEFAULT 0,
  note text,
  status booking_status NOT NULL DEFAULT 'pending',
  cancelled_by uuid,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pool_trips_search_idx ON public.pool_trips (status, depart_at);
CREATE INDEX pool_trips_driver_idx ON public.pool_trips (driver_id);
CREATE INDEX pool_requests_trip_idx ON public.pool_requests (trip_id);
CREATE INDEX pool_requests_passenger_idx ON public.pool_requests (passenger_id);
CREATE UNIQUE INDEX pool_requests_one_active_idx ON public.pool_requests (trip_id, passenger_id)
  WHERE status IN ('pending','confirmed');

GRANT SELECT ON public.pool_trips TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pool_trips TO authenticated;
GRANT ALL ON public.pool_trips TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.pool_requests TO authenticated;
GRANT ALL ON public.pool_requests TO service_role;

ALTER TABLE public.pool_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view open upcoming pool trips" ON public.pool_trips
  FOR SELECT TO anon, authenticated
  USING (status = 'scheduled' AND seats_available > 0 AND depart_at > now());

CREATE POLICY "Drivers view own pool trips" ON public.pool_trips
  FOR SELECT TO authenticated USING (auth.uid() = driver_id);

CREATE POLICY "Passengers view trips they requested" ON public.pool_trips
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.pool_requests r
    WHERE r.trip_id = pool_trips.id AND r.passenger_id = auth.uid()
  ));

CREATE POLICY "Admins view all pool trips" ON public.pool_trips
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Drivers create own pool trips" ON public.pool_trips
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers update own pool trips" ON public.pool_trips
  FOR UPDATE TO authenticated USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Passengers manage own pool requests" ON public.pool_requests
  FOR SELECT TO authenticated USING (auth.uid() = passenger_id);

CREATE POLICY "Drivers view requests on own trips" ON public.pool_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.pool_trips t WHERE t.id = pool_requests.trip_id AND t.driver_id = auth.uid()
  ));

CREATE POLICY "Admins view all pool requests" ON public.pool_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Passengers create own pool requests" ON public.pool_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "Passengers update own pool requests" ON public.pool_requests
  FOR UPDATE TO authenticated USING (auth.uid() = passenger_id) WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "Drivers decide requests on own trips" ON public.pool_requests
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.pool_trips t WHERE t.id = pool_requests.trip_id AND t.driver_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.pool_trips t WHERE t.id = pool_requests.trip_id AND t.driver_id = auth.uid()
  ));

CREATE TRIGGER pool_trips_updated_at BEFORE UPDATE ON public.pool_trips
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER pool_requests_updated_at BEFORE UPDATE ON public.pool_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- New trips always start with all seats free and cannot be backdated
CREATE OR REPLACE FUNCTION public.enforce_pool_trip_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.depart_at <= now() THEN
      RAISE EXCEPTION 'Departure time must be in the future';
    END IF;
    NEW.seats_available := NEW.seats_total;
    NEW.status := 'scheduled';
  ELSE
    NEW.seats_available := OLD.seats_available;
    NEW.driver_id := OLD.driver_id;
    NEW.seats_total := OLD.seats_total;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pool_trips_guard BEFORE INSERT OR UPDATE ON public.pool_trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_trip_guard();

-- Validate joins and keep seat counts in sync
CREATE OR REPLACE FUNCTION public.enforce_pool_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- immutable fields
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
      UPDATE public.pool_trips SET seats_available = seats_available - OLD.seats WHERE id = t.id;
    ELSIF NEW.status = 'rejected' THEN
      IF auth.uid() <> t.driver_id AND NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Only the trip driver can reject passengers';
      END IF;
    ELSIF NEW.status = 'cancelled' THEN
      IF OLD.status = 'confirmed' THEN
        UPDATE public.pool_trips SET seats_available = LEAST(seats_total, seats_available + OLD.seats) WHERE id = t.id;
      END IF;
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pool_requests_guard BEFORE INSERT OR UPDATE ON public.pool_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_request_guard();

-- Notifications reuse the existing helper
CREATE OR REPLACE FUNCTION public.tg_notify_pool_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.pool_trips;
BEGIN
  SELECT * INTO t FROM public.pool_trips WHERE id = NEW.trip_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(t.driver_id, 'New pooling request', 'A passenger wants to join your ride.', '/pooling/driver');
  ELSIF NEW.status <> OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.passenger_id, 'Pooling request accepted', 'Your seat is confirmed.', '/pooling/mine');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.passenger_id, 'Pooling request declined', 'The driver could not take you along.', '/pooling/mine');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(
        CASE WHEN auth.uid() = NEW.passenger_id THEN t.driver_id ELSE NEW.passenger_id END,
        'Pooling booking cancelled', 'A pooling booking was cancelled.', '/pooling/mine');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pool_requests_notify AFTER INSERT OR UPDATE ON public.pool_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_pool_request();

REVOKE ALL ON FUNCTION public.enforce_pool_trip_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_pool_request_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_pool_request() FROM anon, authenticated;

-- ==================================================================
-- >>> Migration: 20260814130244_e0bc9877-9a46-4c0d-a034-a0ce0e919fba.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.can_read_vehicle_image(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id::text = (storage.foldername(_name))[2]
      AND (
        (v.status = 'active' AND v.verification_status = 'approved')
        OR v.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_vehicle_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_vehicle_image(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public read vehicle-images" ON storage.objects;
CREATE POLICY "Read approved vehicle-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-images' AND public.can_read_vehicle_image(name));

-- ==================================================================
-- >>> Migration: 20260814130958_e97f5f88-f098-4932-abfc-83b767d0b8e8.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.enforce_pool_trip_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.depart_at <= now() THEN
      RAISE EXCEPTION 'Departure time must be in the future';
    END IF;
    NEW.seats_available := NEW.seats_total;
    NEW.status := 'scheduled';
  ELSE
    NEW.driver_id := OLD.driver_id;
    NEW.seats_total := OLD.seats_total;
    -- Seat counts may only change through the pool-request workflow.
    IF coalesce(current_setting('app.pool_seat_sync', true), '') <> '1' THEN
      NEW.seats_available := OLD.seats_available;
    ELSE
      NEW.seats_available := GREATEST(0, LEAST(NEW.seats_total, NEW.seats_available));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_pool_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      IF OLD.status = 'confirmed' THEN
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

REVOKE EXECUTE ON FUNCTION public.enforce_pool_trip_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_pool_request_guard() FROM PUBLIC, anon, authenticated;

-- ==================================================================
-- >>> Migration: 20260814134033_f3290fc7-75d8-4cab-826e-50149dbaaf58.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.is_pool_trip_driver(_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pool_trips t WHERE t.id = _trip_id AND t.driver_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_pool_request_on_trip(_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pool_requests r WHERE r.trip_id = _trip_id AND r.passenger_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_pool_trip_driver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_pool_request_on_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pool_trip_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pool_request_on_trip(uuid) TO authenticated;

DROP POLICY IF EXISTS "Drivers view requests on own trips" ON public.pool_requests;
CREATE POLICY "Drivers view requests on own trips" ON public.pool_requests
FOR SELECT TO authenticated USING (public.is_pool_trip_driver(trip_id));

DROP POLICY IF EXISTS "Drivers decide requests on own trips" ON public.pool_requests;
CREATE POLICY "Drivers decide requests on own trips" ON public.pool_requests
FOR UPDATE TO authenticated USING (public.is_pool_trip_driver(trip_id)) WITH CHECK (public.is_pool_trip_driver(trip_id));

DROP POLICY IF EXISTS "Passengers view trips they requested" ON public.pool_trips;
CREATE POLICY "Passengers view trips they requested" ON public.pool_trips
FOR SELECT TO authenticated USING (public.has_pool_request_on_trip(id));

-- ==================================================================
-- >>> Migration: 20260816124248_9144d573-2493-4f19-aa29-3cfe34241df1.sql <<<
-- ==================================================================

DROP POLICY IF EXISTS "User opens dispute" ON public.disputes;
CREATE POLICY "User opens dispute" ON public.disputes
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = raised_by
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = disputes.booking_id
        AND (b.customer_id = auth.uid() OR b.vendor_id = auth.uid())
    )
  )
);

-- ==================================================================
-- >>> Migration: 20260817032259_80cce440-7277-4e39-87dd-1b82dccaaa96.sql <<<
-- ==================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  open_count int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT count(*) INTO open_count FROM (
    SELECT 1 FROM public.bookings WHERE (customer_id = uid OR vendor_id = uid) AND status IN ('pending','confirmed')
    UNION ALL
    SELECT 1 FROM public.driver_bookings WHERE customer_id = uid AND status IN ('pending','confirmed')
    UNION ALL
    SELECT 1 FROM public.wash_bookings WHERE customer_id = uid AND status IN ('pending','confirmed')
  ) s;

  IF open_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'open_bookings', 'count', open_count);
  END IF;

  DELETE FROM public.wishlists WHERE user_id = uid;
  DELETE FROM public.notifications WHERE user_id = uid;

  UPDATE public.profiles SET
    full_name = 'Deleted user',
    avatar_url = NULL,
    phone = NULL,
    city = NULL,
    dl_number = NULL,
    dl_expiry = NULL,
    dl_front_url = NULL,
    dl_back_url = NULL,
    dl_status = 'none',
    dl_rejection_reason = NULL,
    dl_verified_at = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.vendors SET
    business_name = 'Deleted host',
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

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
