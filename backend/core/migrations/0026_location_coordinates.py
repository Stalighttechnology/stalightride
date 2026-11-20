"""Map-picked coordinates for driver pickups and wash centres (wash_bookings already has lat/lng).

Table-level GRANT ALL already covers new columns, so no grants change.
"""

from django.db import migrations

SQL = r"""
ALTER TABLE public.driver_bookings
  ADD COLUMN IF NOT EXISTS pickup_lat double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng double precision;
ALTER TABLE public.wash_centers
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric;
"""

REVERSE_SQL = r"""
ALTER TABLE public.driver_bookings DROP COLUMN IF EXISTS pickup_lat, DROP COLUMN IF EXISTS pickup_lng;
ALTER TABLE public.wash_centers DROP COLUMN IF EXISTS lat, DROP COLUMN IF EXISTS lng;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0025_time_aware_booking_availability")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
