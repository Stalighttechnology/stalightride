"""Tell the WebSocket server about writes to the tables the app watches live."""

from django.db import migrations

# table -> its key column, sent in the notification
WATCHED = {
    "messages": "id",
    "booking_locations": "id",
    "notifications": "id",
    "public_drivers": "id",
    "wallets": "user_id",
    "wallet_transactions": "id",
}

FUNCTION = r"""
CREATE FUNCTION public.notify_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  -- Delivered on commit. Only the key: the listener re-reads the row per user.
  PERFORM pg_notify('changes', json_build_object(
    'table', TG_TABLE_NAME, 'event', TG_OP, 'key', TG_ARGV[0], 'value', r ->> TG_ARGV[0])::text);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_change() FROM PUBLIC, anon, authenticated;
"""

TRIGGERS = "".join(
    f"CREATE TRIGGER notify_change AFTER INSERT OR UPDATE OR DELETE ON public.{t} "
    f"FOR EACH ROW EXECUTE FUNCTION public.notify_change('{key}');\n"
    for t, key in WATCHED.items()
)

REVERSE = "".join(f"DROP TRIGGER notify_change ON public.{t};\n" for t in WATCHED) + "DROP FUNCTION public.notify_change();"


class Migration(migrations.Migration):
    dependencies = [("core", "0001_schema")]
    operations = [migrations.RunSQL(FUNCTION + TRIGGERS, REVERSE)]
