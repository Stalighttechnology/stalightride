"""Part 1 Security, Storage Authorization and Concurrency Fixes.

- FIX-01-SEC-01: Harden public.incidents INSERT RLS policy so only parties to the booking
  (customer, host/driver, cleaner) or admins can file incidents referencing a booking.
  Fix handle_incident_notifications() to use NEW.reporter_id.
- FIX-01-SEC-02: Fix enforce_vehicle_verification_guard() so non-end-user / admin requests
  can set verification_status.
- FIX-01-HOST-01: Enforce vehicle soft-deletion consistency: public and vendors cannot
  view soft-deleted vehicles, and soft-deleted vehicles cannot be reactivated to active status.
"""

from django.db import migrations

SQL = r"""
-- 1. FIX-01-SEC-01: Harden incidents INSERT policy
DROP POLICY IF EXISTS "Users insert incidents" ON public.incidents;

CREATE POLICY "Users insert incidents" ON public.incidents 
  FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = reporter_id AND (
      booking_id IS NULL OR 
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = incidents.booking_id
          AND (b.customer_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.vehicles v 
            WHERE v.id = b.vehicle_id AND v.vendor_id = auth.uid()
          ))
      ) OR
      EXISTS (
        SELECT 1 FROM public.driver_bookings db
        WHERE db.id = incidents.booking_id
          AND (db.customer_id = auth.uid() OR db.driver_id = auth.uid())
      ) OR
      EXISTS (
        SELECT 1 FROM public.wash_bookings wb
        WHERE wb.id = incidents.booking_id
          AND (wb.customer_id = auth.uid() OR wb.assigned_cleaner_id = auth.uid() OR wb.assigned_vendor_id = auth.uid())
      )
    )
  );

-- Fix handle_incident_notifications() to use reporter_id
CREATE OR REPLACE FUNCTION public.handle_incident_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Look up vehicle host only if the reporter is party to the booking
    SELECT vendor_id INTO v_host_id FROM public.bookings
    WHERE id = NEW.booking_id AND (customer_id = NEW.reporter_id OR vendor_id = NEW.reporter_id);
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
$function$;

-- FIX-01-SEC-02: Fix enforce_vehicle_verification_guard() for non-end-user / admin callers
CREATE OR REPLACE FUNCTION public.enforce_vehicle_verification_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
BEGIN
  IF NOT public.is_end_user_request() OR public.has_role(auth.uid(), 'admin') THEN
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

  IF NEW.status = 'active' AND OLD.verification_status <> 'approved' THEN
    RAISE EXCEPTION 'Vehicle cannot be activated until approved by an administrator';
  END IF;

  RETURN NEW;
END; $function$;

-- 2. FIX-01-HOST-01: Vehicles Soft-Deletion State Consistency
DROP POLICY IF EXISTS "Active vehicles are public" ON public.vehicles;
CREATE POLICY "Active vehicles are public" ON public.vehicles FOR SELECT TO authenticated, anon
USING (
  (status = 'active'::public.vehicle_status AND verification_status = 'approved'::public.verification_status AND NOT COALESCE(is_deleted, false))
  OR (auth.uid() = vendor_id AND NOT COALESCE(is_deleted, false))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Vendor updates own vehicle" ON public.vehicles;
CREATE POLICY "Vendor updates own vehicle" ON public.vehicles FOR UPDATE TO authenticated
USING (
  (auth.uid() = vendor_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  ((auth.uid() = vendor_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND NOT (COALESCE(is_deleted, false) = true AND status = 'active'::public.vehicle_status)
);

CREATE OR REPLACE FUNCTION public.enforce_vehicle_deletion_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.is_deleted = true OR NEW.is_deleted = true) AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Deleted vehicles cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_deletion_integrity ON public.vehicles;
CREATE TRIGGER trg_enforce_vehicle_deletion_integrity
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_deletion_integrity();
"""

REVERSE = r"""
DROP TRIGGER IF EXISTS trg_enforce_vehicle_deletion_integrity ON public.vehicles;
DROP FUNCTION IF EXISTS public.enforce_vehicle_deletion_integrity();

DROP POLICY IF EXISTS "Vendor updates own vehicle" ON public.vehicles;
CREATE POLICY "Vendor updates own vehicle" ON public.vehicles FOR UPDATE TO authenticated
USING (((auth.uid() = vendor_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Active vehicles are public" ON public.vehicles;
CREATE POLICY "Active vehicles are public" ON public.vehicles FOR SELECT TO authenticated, anon
USING ((((status = 'active'::vehicle_status) AND (verification_status = 'approved'::verification_status)) OR (auth.uid() = vendor_id) OR has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users insert incidents" ON public.incidents;
CREATE POLICY "Users insert incidents" ON public.incidents FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = reporter_id));
"""

class Migration(migrations.Migration):
    dependencies = [("core", "0040_review_reply_and_booking_host_integrity")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
