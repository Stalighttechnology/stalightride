-- Migration: Create wash_reviews table, BEFORE validation trigger, and AFTER rating recomputation trigger (Task 2.6)

-- 1. Ensure wash_centers has avg_rating and review_count columns
ALTER TABLE public.wash_centers
  ADD COLUMN IF NOT EXISTS avg_rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

-- 2. Create wash_reviews table (one per completed wash, written by customer)
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

-- 3. RLS Policies
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

-- 4. BEFORE INSERT trigger: Validate completed wash & auto-fill provider references (WR-02)
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

-- 5. AFTER INSERT/UPDATE/DELETE trigger: Recompute provider average ratings (WR-01)
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

