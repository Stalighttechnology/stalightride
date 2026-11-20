"""Notification routing links for host dashboard and backfill.

- Updates tg_notify_booking to direct hosts directly to the relevant dashboard tabs:
  - 'New booking request', 'Booking cancelled', and 'Trip completed' -> '/vendor?tab=bookings'
  - 'Payment received' -> '/vendor?tab=payouts'
- Backfills existing notification rows in public.notifications so historic notifications route to tabs.
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.tg_notify_booking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_title text;
BEGIN
  SELECT title INTO v_title FROM public.vehicles WHERE id = NEW.vehicle_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'New booking request',
      COALESCE(v_title,'Your vehicle') || ' · ' || NEW.start_date || ' → ' || NEW.end_date, '/vendor?tab=bookings');
    PERFORM public.notify_user(NEW.customer_id, 'Booking requested',
      'Waiting for the host to accept ' || COALESCE(v_title,'the vehicle') || '.', '/bookings');
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
      PERFORM public.notify_user(NEW.customer_id, 'Booking cancelled', 'Your trip was cancelled.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Booking cancelled', 'A trip on ' || COALESCE(v_title,'your vehicle') || ' was cancelled.', '/vendor?tab=bookings');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'Trip completed', 'Rate your ride and view your invoice.', '/bookings');
      PERFORM public.notify_user(NEW.vendor_id, 'Trip completed', COALESCE(v_title,'Your vehicle') || ' is back. Earnings updated.', '/vendor?tab=bookings');
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'Payment received',
      'Payment of Rs ' || NEW.total_price || ' received for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=payouts');
    PERFORM public.notify_user(NEW.customer_id, 'Payment successful',
      'Your booking is confirmed. Show your QR at pickup.', '/bookings');
  END IF;

  IF NEW.pickup_checked_at IS NOT NULL AND OLD.pickup_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Pickup confirmed', 'Handover verified by QR. Drive safe!', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Pickup confirmed', 'QR check-in completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=bookings');
  END IF;

  IF NEW.return_checked_at IS NOT NULL AND OLD.return_checked_at IS NULL THEN
    PERFORM public.notify_user(NEW.customer_id, 'Return confirmed', 'Vehicle returned and verified by QR.', '/bookings/' || NEW.id || '/trip');
    PERFORM public.notify_user(NEW.vendor_id, 'Return confirmed', 'QR check-out completed for ' || COALESCE(v_title,'your vehicle') || '.', '/vendor?tab=bookings');
  END IF;

  RETURN NEW;
END; $$;

-- Backfill existing notifications with exact tabs
UPDATE public.notifications
   SET link = '/vendor?tab=bookings'
 WHERE link = '/vendor'
   AND (title ILIKE '%booking%' OR title ILIKE '%trip%');

UPDATE public.notifications
   SET link = '/vendor?tab=payouts'
 WHERE link = '/vendor'
   AND (title ILIKE '%payment%' OR title ILIKE '%payout%' OR title ILIKE '%earning%');
"""


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0024_hot_path_indexes"),
    ]

    operations = [
        migrations.RunSQL(SQL),
    ]
