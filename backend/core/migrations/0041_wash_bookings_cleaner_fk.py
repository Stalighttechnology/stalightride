"""Point wash_bookings.assigned_cleaner_id to public.cleaners(id).

Fixes PostgREST relationship lookup when embedding cleaner info on wash bookings
(e.g., `cleaners:assigned_cleaner_id(full_name,phone,city)` on the admin wash queue).
"""

from django.db import migrations

SQL = r"""
ALTER TABLE public.wash_bookings
  DROP CONSTRAINT IF EXISTS wash_bookings_assigned_cleaner_id_fkey;

ALTER TABLE public.wash_bookings
  ADD CONSTRAINT wash_bookings_assigned_cleaner_id_fkey
  FOREIGN KEY (assigned_cleaner_id) REFERENCES public.cleaners(id) ON DELETE SET NULL;
"""

REVERSE = r"""
ALTER TABLE public.wash_bookings
  DROP CONSTRAINT IF EXISTS wash_bookings_assigned_cleaner_id_fkey;

ALTER TABLE public.wash_bookings
  ADD CONSTRAINT wash_bookings_assigned_cleaner_id_fkey
  FOREIGN KEY (assigned_cleaner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0040_review_reply_and_booking_host_integrity")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
