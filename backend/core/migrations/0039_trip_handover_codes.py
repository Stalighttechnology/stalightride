"""Trip handover codes replace the QR handover.

- public.booking_handover_codes: a 6-digit check-in code and check-out code per paid rental.
  Only the host and admins can read them; the host tells the customer, who enters the code
  (with the car photos and odometer) to start and to end the trip. failed_attempts and
  locked_until throttle guessing.
- trg_booking_handover_codes creates the codes when a booking becomes paid; existing paid,
  unfinished bookings are backfilled.
- Drops public.complete_booking(): it let the customer close a trip alone (GAP-11) and has no
  callers. The check-out code is now the only way a trip completes (besides admin tools).
- tg_notify_booking: the payment message no longer mentions a QR.
"""

from django.db import migrations

SQL = r"""
CREATE TABLE IF NOT EXISTS public.booking_handover_codes (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  checkin_code text NOT NULL,
  checkout_code text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_handover_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_handover_codes_select ON public.booking_handover_codes;
CREATE POLICY booking_handover_codes_select ON public.booking_handover_codes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.bookings b
               WHERE b.id = booking_handover_codes.booking_id AND b.vendor_id = auth.uid())
  );

-- Customers must never read the codes; writes go through the trigger and service_role.
GRANT SELECT ON TABLE public.booking_handover_codes TO authenticated;
GRANT ALL ON TABLE public.booking_handover_codes TO service_role;

CREATE OR REPLACE FUNCTION public.tg_booking_handover_codes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_status = 'paid' THEN
    INSERT INTO public.booking_handover_codes (booking_id, checkin_code, checkout_code)
    VALUES (NEW.id,
            lpad((floor(random() * 1000000))::int::text, 6, '0'),
            lpad((floor(random() * 1000000))::int::text, 6, '0'))
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.tg_booking_handover_codes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_booking_handover_codes ON public.bookings;
CREATE TRIGGER trg_booking_handover_codes
  AFTER INSERT OR UPDATE OF payment_status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_booking_handover_codes();

INSERT INTO public.booking_handover_codes (booking_id, checkin_code, checkout_code)
SELECT id,
       lpad((floor(random() * 1000000))::int::text, 6, '0'),
       lpad((floor(random() * 1000000))::int::text, 6, '0')
FROM public.bookings
WHERE payment_status = 'paid' AND status = 'confirmed'
ON CONFLICT (booking_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.complete_booking(uuid, integer, integer, text);

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
      'Your booking is confirmed. At pickup, photograph the car and enter the check-in code your host gives you.', '/bookings');
  END IF;

  RETURN NEW;
END; $function$;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0038_corporate_accounts_and_approval_windows")]
    # complete_booking is not restored on reverse: it bypassed host involvement.
    operations = [migrations.RunSQL(SQL, r"""
DROP TRIGGER IF EXISTS trg_booking_handover_codes ON public.bookings;
DROP FUNCTION IF EXISTS public.tg_booking_handover_codes();
DROP TABLE IF EXISTS public.booking_handover_codes;
""")]
