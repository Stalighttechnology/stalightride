-- Migration: Add claim_wash_job RPC and update wash_bookings policies for cleaner job board (Task 2.5)

-- 1. Atomic claim_wash_job RPC with row lock
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

-- 2. Update SELECT policy on wash_bookings to allow verified cleaners to browse unassigned confirmed jobs in their city
DROP POLICY IF EXISTS "Customers and admins view wash bookings" ON public.wash_bookings;
DROP POLICY IF EXISTS "Cleaners and centers view wash bookings" ON public.wash_bookings;

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

