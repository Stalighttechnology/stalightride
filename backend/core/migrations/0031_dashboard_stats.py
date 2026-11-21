"""Dashboard aggregated stats for host, driver, and wash center.

Read-only aggregates using LANGUAGE sql STABLE respecting RLS and auth.uid().
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.host_dashboard_stats() RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH stats AS (
    SELECT
      count(*) AS total_bookings,
      count(*) FILTER (WHERE status = 'pending') AS pending_count,
      count(*) FILTER (WHERE status = 'completed') AS completed_count,
      count(*) FILTER (WHERE status IN ('cancelled', 'rejected')) AS cancelled_count,
      coalesce(sum(coalesce(provider_earning, total_price)) FILTER (
        WHERE payment_status IN ('paid', 'partially_refunded')
      ), 0) AS earnings,
      count(*) FILTER (WHERE payment_status IN ('paid', 'partially_refunded')) AS paid_count
    FROM public.bookings
    WHERE vendor_id = auth.uid()
  ),
  months AS (
    SELECT generate_series(
      date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata') - interval '5 months'),
      date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')),
      interval '1 month'
    ) AS m_start
  ),
  monthly_totals AS (
    SELECT
      to_char(m.m_start, 'YYYY-MM') AS month,
      coalesce(sum(coalesce(b.provider_earning, b.total_price)), 0) AS total,
      m.m_start
    FROM months m
    LEFT JOIN public.bookings b
      ON b.vendor_id = auth.uid()
     AND b.payment_status IN ('paid', 'partially_refunded')
     AND date_trunc('month', (coalesce(b.paid_at, b.created_at) AT TIME ZONE 'Asia/Kolkata')) = m.m_start
    GROUP BY m.m_start
    ORDER BY m.m_start
  ),
  monthly_agg AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'month', mt.month,
        'total', mt.total
      )
    ), '[]'::jsonb) AS monthly
    FROM monthly_totals mt
  )
  SELECT jsonb_build_object(
    'total_bookings', s.total_bookings,
    'pending_count', s.pending_count,
    'completed_count', s.completed_count,
    'cancelled_count', s.cancelled_count,
    'earnings', s.earnings,
    'paid_count', s.paid_count,
    'monthly', ma.monthly
  )
  FROM stats s, monthly_agg ma;
$$;

CREATE OR REPLACE FUNCTION public.driver_dashboard_stats() RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'upcoming_count', count(*) FILTER (WHERE status = 'confirmed' AND start_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'earnings', coalesce(sum(coalesce(provider_earning, total_price)) FILTER (
      WHERE status <> 'cancelled' AND (payment_status IN ('paid', 'partially_refunded') OR status = 'completed')
    ), 0)
  )
  FROM public.driver_bookings
  WHERE driver_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.wash_center_dashboard_stats() RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'active', count(*) FILTER (WHERE status = 'confirmed'),
    'completed', count(*) FILTER (WHERE status = 'completed')
  )
  FROM public.wash_bookings;
$$;

GRANT ALL ON FUNCTION public.host_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.host_dashboard_stats() TO service_role;

GRANT ALL ON FUNCTION public.driver_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.driver_dashboard_stats() TO service_role;

GRANT ALL ON FUNCTION public.wash_center_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.wash_center_dashboard_stats() TO service_role;
"""

REVERSE_SQL = r"""
DROP FUNCTION IF EXISTS public.wash_center_dashboard_stats();
DROP FUNCTION IF EXISTS public.driver_dashboard_stats();
DROP FUNCTION IF EXISTS public.host_dashboard_stats();
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0030_rental_booking_windows")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
