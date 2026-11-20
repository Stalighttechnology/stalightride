from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.complete_booking(
    _booking_id uuid,
    _return_odometer integer DEFAULT NULL,
    _return_fuel_pct integer DEFAULT NULL,
    _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b RECORD;
  is_admin boolean;
  now_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT is_admin AND b.vendor_id <> auth.uid() AND b.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;

  IF b.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'booking_id', b.id, 'status', 'completed', 'already_completed', true);
  END IF;

  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be completed';
  END IF;

  IF b.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid bookings can be completed';
  END IF;

  UPDATE public.bookings
  SET
    status = 'completed',
    pickup_checked_at = COALESCE(b.pickup_checked_at, now_ts),
    return_checked_at = COALESCE(b.return_checked_at, now_ts),
    return_odometer = COALESCE(_return_odometer, b.return_odometer, b.pickup_odometer),
    pickup_odometer = COALESCE(b.pickup_odometer, _return_odometer),
    return_fuel_pct = COALESCE(_return_fuel_pct, b.return_fuel_pct, b.pickup_fuel_pct),
    pickup_fuel_pct = COALESCE(b.pickup_fuel_pct, _return_fuel_pct),
    return_notes = COALESCE(_notes, b.return_notes)
  WHERE id = b.id;

  PERFORM public.notify_user(
    b.customer_id,
    'Trip completed',
    'Vehicle returned successfully. Security deposit returned to wallet.',
    '/bookings/' || b.id || '/trip'
  );

  PERFORM public.notify_user(
    b.vendor_id,
    'Trip completed',
    'Vehicle returned and your earnings have been credited to wallet.',
    '/vendor?tab=payouts'
  );

  RETURN jsonb_build_object('ok', true, 'booking_id', b.id, 'status', 'completed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_booking(uuid, integer, integer, text) TO authenticated, service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.complete_booking(uuid, integer, integer, text);
"""


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0027_notification_links'),
    ]

    operations = [
        migrations.RunSQL(SQL, REVERSE_SQL),
    ]
