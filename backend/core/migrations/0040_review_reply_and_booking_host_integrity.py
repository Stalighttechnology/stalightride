"""Close two trust gaps found in the demo walkthrough (2.21).

- enforce_review_update_scope: a customer editing their own review could also write
  vendor_response, faking the host's reply, or move the review to another booking or vehicle.
  Customers may now change only rating and comment.
- trg_booking_vendor: bookings.vendor_id came from the client and was never checked, so a
  renter could name any account as host; that account then read the handover codes and was
  credited the earning. The host is now always the vehicle's owner.
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.enforce_review_update_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.reported IS DISTINCT FROM OLD.reported
     OR NEW.report_reason IS DISTINCT FROM OLD.report_reason THEN
    RAISE EXCEPTION 'Only the rating, comment and host reply of a review can change';
  END IF;

  IF OLD.customer_id = auth.uid() THEN
    IF NEW.vendor_response IS DISTINCT FROM OLD.vendor_response
       OR NEW.vendor_response_at IS DISTINCT FROM OLD.vendor_response_at THEN
      RAISE EXCEPTION 'Only the host can reply to a review';
    END IF;
    RETURN NEW;
  END IF;

  -- Vendors may only change their public response fields.
  IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.comment IS DISTINCT FROM OLD.comment THEN
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
END; $function$;

CREATE OR REPLACE FUNCTION public.tg_booking_vendor() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  SELECT vendor_id INTO NEW.vendor_id FROM public.vehicles WHERE id = NEW.vehicle_id;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tg_booking_vendor() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_booking_vendor ON public.bookings;
CREATE TRIGGER trg_booking_vendor
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_booking_vendor();
"""

REVERSE = r"""
DROP TRIGGER IF EXISTS trg_booking_vendor ON public.bookings;
DROP FUNCTION IF EXISTS public.tg_booking_vendor();

CREATE OR REPLACE FUNCTION public.enforce_review_update_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR OLD.customer_id = auth.uid() THEN RETURN NEW; END IF;

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
END; $function$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0039_trip_handover_codes")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
