"""Expose active driver booked date ranges via SECURITY DEFINER RPC.

Allows the driver booking UI to block dates with pending/confirmed bookings
and automatically unblock them when a booking is cancelled or rejected.
"""

from django.db import migrations

SQL = r"""
CREATE OR REPLACE FUNCTION public.driver_booked_ranges(_driver_id uuid)
RETURNS TABLE (
  start_date date,
  end_date date,
  start_time time without time zone,
  end_time time without time zone,
  rate_type text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT db.start_date, db.end_date, db.start_time, db.end_time, db.rate_type
  FROM public.driver_bookings db
  WHERE db.driver_id = _driver_id
    AND db.status IN ('pending', 'confirmed')
    AND db.end_date >= CURRENT_DATE;
$$;

GRANT ALL ON FUNCTION public.driver_booked_ranges(_driver_id uuid) TO anon;
GRANT ALL ON FUNCTION public.driver_booked_ranges(_driver_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.driver_booked_ranges(_driver_id uuid) TO service_role;
"""

REVERSE = r"""
DROP FUNCTION IF EXISTS public.driver_booked_ranges(uuid);
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0042_incident_and_storage_security")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
