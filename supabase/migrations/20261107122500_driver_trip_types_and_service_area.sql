-- Migration: Add trip_types and service_area to drivers and mirror into public_drivers

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
