"""Admin lists that page correctly (GAP-31).

admin_bookings_feed: the four booking kinds as one list, so the Bookings Monitor can
page, filter and count on the server. security_invoker keeps each table's row-level
security, so an admin sees everything and anyone else only their own rows.

admin_broadcast: sends a broadcast to every user in the audience in one statement.
The browser used to pick recipients itself and stopped at the first 100.
"""

from django.db import migrations

SQL = r"""
CREATE VIEW public.admin_bookings_feed WITH (security_invoker = true) AS
SELECT b.id, 'rental'::text AS kind, COALESCE(v.title, 'Self-drive Vehicle') AS title,
       b.customer_id, b.total_price AS amount, b.status::text AS status, b.created_at,
       b.start_date::text || ' → ' || b.end_date::text AS scheduled_time
  FROM public.bookings b LEFT JOIN public.vehicles v ON v.id = b.vehicle_id
UNION ALL
SELECT d.id, 'driver', 'Driver: ' || COALESCE(dr.full_name, 'Chauffeur'),
       d.customer_id, d.total_price, d.status::text, d.created_at, d.start_date::text
  FROM public.driver_bookings d LEFT JOIN public.drivers dr ON dr.id = d.driver_id
UNION ALL
SELECT w.id, 'wash', 'Wash: ' || COALESCE(s.name, 'Doorstep Wash'),
       w.customer_id, w.price, w.status::text, w.created_at, w.slot_date::text || ' ' || w.slot_time::text
  FROM public.wash_bookings w LEFT JOIN public.wash_services s ON s.id = w.service_id
UNION ALL
SELECT p.id, 'pooling', 'Carpool: ' || p.origin_label || ' → ' || p.dest_label,
       p.driver_id, p.fare_per_seat, p.status, p.created_at, p.depart_at::text
  FROM public.pool_trips p;
GRANT SELECT ON public.admin_bookings_feed TO authenticated;

CREATE FUNCTION public.admin_broadcast(_title text, _body text, _audience text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE sent integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can send broadcasts';
  END IF;
  IF btrim(COALESCE(_title, '')) = '' OR btrim(COALESCE(_body, '')) = '' THEN
    RAISE EXCEPTION 'Provide both title and message';
  END IF;
  IF _audience NOT IN ('all', 'hosts', 'drivers', 'cleaners') THEN
    RAISE EXCEPTION 'Unknown audience';
  END IF;
  INSERT INTO public.notifications (user_id, title, body, link)
  SELECT r.id, btrim(_title), btrim(_body), '/browse'
    FROM (SELECT id FROM public.profiles WHERE _audience = 'all'
          UNION SELECT user_id FROM public.user_roles WHERE _audience = 'hosts' AND role = 'vendor'
          UNION SELECT id FROM public.vendors WHERE _audience = 'hosts'
          UNION SELECT id FROM public.drivers WHERE _audience = 'drivers' AND verification_status = 'approved'
          UNION SELECT user_id FROM public.user_roles
                 WHERE _audience = 'cleaners' AND role IN ('cleaner', 'wash_center')) r;
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END; $$;
REVOKE ALL ON FUNCTION public.admin_broadcast(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast(text, text, text) TO authenticated;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.admin_broadcast(text, text, text);
DROP VIEW IF EXISTS public.admin_bookings_feed;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0020_booking_integrity")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
