"""Enable realtime change notifications for wash_bookings."""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("core", "0035_pool_request_booking_windows")]
    operations = [
        migrations.RunSQL(
            """
            DROP TRIGGER IF EXISTS notify_change ON public.wash_bookings;
            CREATE TRIGGER notify_change AFTER INSERT OR UPDATE OR DELETE ON public.wash_bookings
            FOR EACH ROW EXECUTE FUNCTION public.notify_change('id');
            """,
            "DROP TRIGGER IF EXISTS notify_change ON public.wash_bookings;",
        )
    ]
