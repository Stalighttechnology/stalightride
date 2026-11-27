import time
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Autonomous 5-minute background scheduler for booking expirations and reminders"

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run one cycle and exit")

    def handle(self, *args, **options):
        self.stdout.write("Starting Synchoo Background Scheduler...")
        while True:
            try:
                with connection.cursor() as c:
                    c.execute("SELECT public.expire_booking_windows()")
                    res = c.fetchone()[0]
                    self.stdout.write(f"Executed expire_booking_windows: {res}")

                with connection.cursor() as c:
                    c.execute("SELECT public.generate_scheduled_reminders()")
                    rem = c.fetchone()[0]
                    self.stdout.write(f"Executed generate_scheduled_reminders: {rem}")
            except Exception as e:
                self.stderr.write(f"Scheduler error: {e}")

            if options["once"]:
                break
            time.sleep(300)