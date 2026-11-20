import json

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from core.db import db_role


class Command(BaseCommand):
    help = "Create due trip reminders and expire booking windows. Schedule every 5 minutes (cron or Windows Task Scheduler)."

    def handle(self, *args, **options):
        with transaction.atomic(), db_role("service_role"):
            with connection.cursor() as c:
                c.execute("SELECT public.expire_booking_windows()")
                expired = c.fetchone()[0]
                c.execute("SELECT public.generate_scheduled_reminders()")
                reminders = c.fetchone()[0]
        self.stdout.write(json.dumps({"windows": expired, "reminders": reminders}))
