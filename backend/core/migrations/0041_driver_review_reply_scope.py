"""Harden driver review update scope (FIX-02-DRV-01).

Prevents customers from modifying driver_response or driver_response_at on their own
reviews, mirroring the host review integrity rules from migration 0040.
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.enforce_driver_review_update_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.driver_booking_id IS DISTINCT FROM OLD.driver_booking_id THEN
    RAISE EXCEPTION 'Only the rating, comment and driver reply of a review can change';
  END IF;

  IF OLD.customer_id = auth.uid() THEN
    IF NEW.driver_response IS DISTINCT FROM OLD.driver_response
       OR NEW.driver_response_at IS DISTINCT FROM OLD.driver_response_at THEN
      RAISE EXCEPTION 'Only the driver can reply to a review';
    END IF;
    RETURN NEW;
  END IF;

  -- The reviewed driver may only write a public response.
  IF NEW.rating IS DISTINCT FROM OLD.rating OR NEW.comment IS DISTINCT FROM OLD.comment THEN
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
END; $function$;
"""

REVERSE = r"""
CREATE OR REPLACE FUNCTION public.enforce_driver_review_update_scope()
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
END; $function$;
"""

class Migration(migrations.Migration):

    dependencies = [
        ("core", "0040_review_reply_and_booking_host_integrity"),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE),
    ]
