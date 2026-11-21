"""Providers see only what they earn: payment notifications to hosts and drivers quote
provider_earning, never the customer's total (which includes the platform fee, GST and deposit).

Redefines the latest tg_notify_booking (0032) and tg_notify_driver_booking (schema.sql); only the
"Payment received" message changes.
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.tg_notify_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.notify_user(NEW.vendor_id, 'Instant booking confirmed',
        COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date || ' confirmed immediately via Instant Book.', '/vendor?tab=bookings');
      PERFORM public.notify_user(NEW.customer_id, 'Booking confirmed',
        COALESCE(v_title,'Your vehicle') || ' is confirmed via Instant Book. Complete the payment to lock it in.', '/bookings');
    ELSE
      PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
        COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date, '/vendor?tab=bookings');
      PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
        'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
    END IF;
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
      IF COALESCE(NEW.cancellation_reason, '') NOT IN ('host_no_response', 'payment_timeout') THEN
        PERFORM public.notify_user(NEW.customer_id, 'Booking cancelled', 'Your trip was cancelled.', '/bookings');
        PERFORM public.notify_user(NEW.vendor_id, 'Booking cancelled', 'A trip on ' || COALESCE(v_title,'your vehicle') || ' was cancelled.', '/vendor?tab=bookings');
      END IF;
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Trip completed', 'Rate your ride and view your invoice.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Trip completed', COALESCE(v_title,'Your vehicle') || ' is back. Earnings updated.', '/vendor?tab=bookings');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'Payment received',
      COALESCE(v_title,'Your vehicle') || ' is paid. Your earning: Rs ' || COALESCE(NEW.provider_earning, 0) || ', credited when the trip completes.', '/vendor?tab=payouts');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful',
      'Your booking is confirmed. Show your QR at pickup.', '/bookings');
  END IF;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.tg_notify_driver_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public.notify_user(NEW.driver_id, 'Payment received', 'Hire paid. Your earning: Rs ' || COALESCE(NEW.provider_earning, 0) || ', credited when the hire completes.', '/driver-dashboard');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful', 'Your driver is confirmed.', '/hires');
  END IF;

  RETURN NEW;
END; $function$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0036_vehicle_private_location")]
    # Reverting keeps the new wording; the old one leaked the customer's total.
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]
