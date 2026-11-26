from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from core.db import db_role

IST = ZoneInfo("Asia/Kolkata")


class Command(BaseCommand):
    help = (
        "Generate consolidated monthly corporate invoices (with 18% GST) "
        "for active companies with approved trips."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--month",
            type=str,
            default=None,
            help="Billing month in YYYY-MM format (e.g. 2026-11). Defaults to current month.",
        )
        parser.add_argument(
            "--prev-month",
            action="store_true",
            help="Generate invoice for previous calendar month.",
        )
        parser.add_argument(
            "--company-id",
            type=str,
            default=None,
            help="Target a specific company UUID. Omit to process all active companies.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Regenerate invoice even if one already exists for that month.",
        )

    def handle(self, *args, **options):
        now_ist = datetime.now(IST)

        if options.get("prev_month"):
            first_of_this_month = now_ist.replace(day=1)
            last_month_end = first_of_this_month - timedelta(days=1)
            month_str = last_month_end.strftime("%Y-%m")
        elif options.get("month"):
            month_str = options["month"].strip()
        else:
            month_str = now_ist.strftime("%Y-%m")

        target_company = options.get("company_id")
        force = options.get("force", False)

        self.stdout.write(f"Generating corporate invoices for month: {month_str}")

        created_count = 0
        skipped_count = 0

        with transaction.atomic(), db_role("service_role"):
            with connection.cursor() as cur:
                if target_company:
                    cur.execute(
                        "SELECT id, name, status FROM public.companies WHERE id = %s",
                        [target_company],
                    )
                else:
                    cur.execute(
                        "SELECT id, name, status FROM public.companies WHERE status = 'active' ORDER BY name"
                    )

                companies = cur.fetchall()

                if not companies:
                    self.stdout.write(self.style.WARNING("No matching active companies found."))
                    return

                for cid, cname, cstatus in companies:
                    # Check if already invoiced for this month
                    cur.execute(
                        "SELECT id, invoice_number, total FROM public.company_invoices WHERE company_id = %s AND month = %s",
                        [cid, month_str],
                    )
                    existing = cur.fetchone()

                    if existing and not force:
                        self.stdout.write(
                            f"  [SKIPPED] {cname} ({cid}): already has invoice {existing[1]} for {month_str} (Total: ₹{existing[2]})"
                        )
                        skipped_count += 1
                        continue

                    # Check if there are any approved trips in this month
                    cur.execute(
                        """
                        SELECT count(*), coalesce(sum(amount), 0)
                          FROM public.company_trips
                         WHERE company_id = %s
                           AND approval_status = 'approved'
                           AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = %s
                        """,
                        [cid, month_str],
                    )
                    trip_count, trip_sum = cur.fetchone()

                    if trip_count == 0 or float(trip_sum) <= 0:
                        self.stdout.write(
                            f"  [SKIPPED] {cname} ({cid}): no approved trips in {month_str}"
                        )
                        skipped_count += 1
                        continue

                    # Generate invoice using the stored procedure
                    cur.execute(
                        "SELECT public.generate_corporate_invoice(%s, %s)",
                        [cid, month_str],
                    )
                    inv_id = cur.fetchone()[0]

                    cur.execute(
                        "SELECT invoice_number, base_amount, cgst, sgst, total FROM public.company_invoices WHERE id = %s",
                        [inv_id],
                    )
                    inv_row = cur.fetchone()

                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  [CREATED] {cname}: Invoice {inv_row[0]} | Base: ₹{inv_row[1]} | CGST: ₹{inv_row[2]} | SGST: ₹{inv_row[3]} | Total: ₹{inv_row[4]}"
                        )
                    )
                    created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Processed: {created_count} generated, {skipped_count} skipped."
            )
        )
