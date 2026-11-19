"""Cheaper hot paths as data grows.

- Indexes for the columns the bell, browse, vendor pages, admin queues and row-level
  security filter on, which had none.
- The realtime notify carries the row's user_id, so a socket can skip rows that belong
  to someone else without a database read (one read per connected user per notification
  before).
- Only the cron job may generate reminders; anyone could call it through the API.
"""

from django.db import migrations

SQL = r"""
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_images_vehicle_idx ON public.vehicle_images (vehicle_id, sort_order);
CREATE INDEX IF NOT EXISTS vehicles_vendor_idx ON public.vehicles (vendor_id);
CREATE INDEX IF NOT EXISTS vehicles_status_created_idx ON public.vehicles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS availability_blocks_vehicle_idx ON public.availability_blocks (vehicle_id, start_date);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS wash_bookings_vendor_idx ON public.wash_bookings (assigned_vendor_id);
CREATE INDEX IF NOT EXISTS reviews_vehicle_idx ON public.reviews (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_booking_idx ON public.wallet_transactions (booking_id);

CREATE OR REPLACE FUNCTION public.notify_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  -- Delivered on commit. Only the key (and owner, when the row has one): the listener re-reads the row per user.
  PERFORM pg_notify('changes', json_build_object(
    'table', TG_TABLE_NAME, 'event', TG_OP, 'key', TG_ARGV[0], 'value', r ->> TG_ARGV[0],
    'owner', r ->> 'user_id')::text);
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.generate_scheduled_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_scheduled_reminders() TO service_role;  -- send_reminders
"""

REVERSE_SQL = r"""
GRANT EXECUTE ON FUNCTION public.generate_scheduled_reminders() TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.notify_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  PERFORM pg_notify('changes', json_build_object(
    'table', TG_TABLE_NAME, 'event', TG_OP, 'key', TG_ARGV[0], 'value', r ->> TG_ARGV[0])::text);
  RETURN NULL;
END $$;
DROP INDEX IF EXISTS public.notifications_user_created_idx, public.vehicle_images_vehicle_idx,
  public.vehicles_vendor_idx, public.vehicles_status_created_idx, public.availability_blocks_vehicle_idx,
  public.support_tickets_user_idx, public.ticket_messages_ticket_idx, public.wash_bookings_vendor_idx,
  public.reviews_vehicle_idx, public.wallet_transactions_booking_idx;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0022_admin_feed_and_broadcast")]
    operations = [migrations.RunSQL(SQL, REVERSE_SQL)]
