import json

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from core.db import db_role


class Command(BaseCommand):
    help = "Create due trip reminders. Schedule every 15 minutes (cron or Windows Task Scheduler)."

    def handle(self, *args, **options):
        with transaction.atomic(), db_role("service_role"):
            with connection.cursor() as c:
                c.execute("SELECT public.generate_scheduled_reminders()")
                result = c.fetchone()[0]
        self.stdout.write(json.dumps(result))
