-- Schema that the UI from PR #1 ("partialfix") already uses but no migration
-- created:
--  * drivers.trip_types / drivers.service_area — the driver dashboard upserts
--    them, so every driver profile save failed with "column does not exist";
--  * public.wash_reviews — the post-wash review form inserts into it.

-- =====================================================================
-- 1. Driver trip types and service area (+ public mirror)
-- =====================================================================
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS trip_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_trip_types_check;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_trip_types_check
  CHECK (trip_types <@ ARRAY['city','outstation','airport','corporate','events']::text[]);
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_service_area_len;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_service_area_len CHECK (char_length(service_area) <= 120);

ALTER TABLE public.public_drivers
  ADD COLUMN IF NOT EXISTS trip_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_area text;

CREATE OR REPLACE FUNCTION public.sync_public_driver()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND NEW.status = 'active' THEN
    INSERT INTO public.public_drivers (id, full_name, city, bio, experience_years, languages, vehicle_types, photo_url,
                                       hourly_rate, daily_rate, avg_rating, review_count, trip_types, service_area,
                                       created_at, updated_at)
    VALUES (NEW.id, NEW.full_name, NEW.city, NEW.bio, NEW.experience_years, NEW.languages, NEW.vehicle_types, NEW.photo_url,
            NEW.hourly_rate, NEW.daily_rate, NEW.avg_rating, NEW.review_count, NEW.trip_types, NEW.service_area,
            NEW.created_at, now())
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name, city = EXCLUDED.city, bio = EXCLUDED.bio,
      experience_years = EXCLUDED.experience_years, languages = EXCLUDED.languages,
      vehicle_types = EXCLUDED.vehicle_types, photo_url = EXCLUDED.photo_url,
      hourly_rate = EXCLUDED.hourly_rate, daily_rate = EXCLUDED.daily_rate,
      avg_rating = EXCLUDED.avg_rating, review_count = EXCLUDED.review_count,
      trip_types = EXCLUDED.trip_types, service_area = EXCLUDED.service_area, updated_at = now();
  ELSE
    DELETE FROM public.public_drivers WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_public_driver() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 2. Wash reviews (one per completed wash, by its customer)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.wash_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wash_booking_id uuid NOT NULL UNIQUE REFERENCES public.wash_bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.wash_reviews TO authenticated;
GRANT ALL ON public.wash_reviews TO service_role;
ALTER TABLE public.wash_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers and admins view wash reviews" ON public.wash_reviews;
CREATE POLICY "Customers and admins view wash reviews" ON public.wash_reviews
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Customers review their completed washes" ON public.wash_reviews;
CREATE POLICY "Customers review their completed washes" ON public.wash_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wash_bookings w
       WHERE w.id = wash_booking_id AND w.customer_id = auth.uid() AND w.status = 'completed'
    )
  );
