-- Migration: Wash pipeline with wash_status enum, progress column, photo proofs, and forward-only status updates

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

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wash_reviews') THEN
    DROP POLICY IF EXISTS "Customers review their completed washes" ON public.wash_reviews;
    DROP POLICY IF EXISTS "Customers write reviews for completed washes" ON public.wash_reviews;
  END IF;
END $$;

ALTER TABLE public.wash_bookings
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
