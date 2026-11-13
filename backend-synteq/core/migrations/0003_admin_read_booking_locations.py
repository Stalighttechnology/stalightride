"""Admins can read live trip locations. This policy was applied to the old
database from drizzle/migrations, outside the SQL files that make up sql/schema.sql."""

from django.db import migrations

SQL = """
CREATE POLICY "Admins read booking locations" ON public.booking_locations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
"""

REVERSE = 'DROP POLICY "Admins read booking locations" ON public.booking_locations;'


class Migration(migrations.Migration):
    dependencies = [("core", "0002_realtime")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
