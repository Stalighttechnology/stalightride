-- Migration: pool_ratings, user_reports, and pool_requests.emergency_contact
-- Task 2.8: Pooling ratings (both directions, completed only), user reports for moderation, and emergency contact column

-- 1. Add emergency_contact to pool_requests
ALTER TABLE public.pool_requests
  ADD COLUMN IF NOT EXISTS emergency_contact text;

-- 2. Create pool_ratings table
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

-- RLS for pool_ratings
ALTER TABLE public.pool_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool ratings readable by all authenticated users"
  ON public.pool_ratings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own pool rating"
  ON public.pool_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = rater_id);

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
  v_is_driver boolean;
  v_is_passenger boolean;
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
    -- Verify rater had a confirmed/completed request on this trip
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
    -- Verify ratee had a confirmed/completed request on this trip
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

-- 3. Create user_reports table (shared with Person 3 moderation)
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

-- RLS for user_reports
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their submitted reports"
  ON public.user_reports FOR SELECT
  TO authenticated
  USING (
    auth.uid() = reporter_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Authenticated users can submit user reports"
  ON public.user_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins can update and manage user reports"
  ON public.user_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete user reports"
  ON public.user_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

