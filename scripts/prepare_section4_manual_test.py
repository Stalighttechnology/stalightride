import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import uuid

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection, transaction
from accounts.models import User
from core.db import as_owner

IST = ZoneInfo("Asia/Kolkata")

def prepare_section4_bookings():
    with connection.cursor() as cur:
        asha_id = User.objects.get(email="asha@example.com").id
        hari_id = User.objects.get(email="hari@example.com").id

        # Find Hari's Test Swift
        cur.execute("SELECT id FROM public.vehicles WHERE vendor_id = %s LIMIT 1", [hari_id])
        vid = cur.fetchone()[0]

        # Clean up any existing test bookings for section 4 demo
        cur.execute("DELETE FROM public.bookings WHERE customer_id = %s AND notes LIKE 'DEMO_4_%%'", [asha_id])

        now_ist = datetime.now(IST)

        # Helper to create a paid booking
        def insert_booking(tag, pickup_dt, payment_status="paid", status="confirmed"):
            return_dt = pickup_dt + timedelta(days=1)
            start_date_str = pickup_dt.strftime("%Y-%m-%d")
            end_date_str = return_dt.strftime("%Y-%m-%d")
            pickup_time_str = pickup_dt.strftime("%H:%M:%S")
            dropoff_time_str = return_dt.strftime("%H:%M:%S")

            with transaction.atomic():
                with as_owner():
                    cur.execute(
                        """
                        INSERT INTO public.bookings (
                            customer_id, vehicle_id, vendor_id, start_date, end_date,
                            pickup_time, dropoff_time, status, payment_status,
                            base_price, security_deposit, service_fee, gst_amount, total_price,
                            commission_amount, provider_earning, notes
                        ) VALUES (
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            2000, 3000, 100, 18, 5118,
                            36, 1764, %s
                        ) RETURNING id
                        """,
                        [asha_id, vid, hari_id, start_date_str, end_date_str, pickup_time_str, dropoff_time_str, status, payment_status, tag]
                    )
                    bk_id = cur.fetchone()[0]

                    if payment_status == "paid":
                        cur.execute("SELECT public.wallet_apply(%s, -5118, 'booking_payment', %s, NULL, %s)", [asha_id, bk_id, f"Payment for {tag}"])
                        cur.execute("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_id])
            return bk_id

        print("Creating section 4 test bookings...")
        # 4.1: 4 days away (3+ days)
        b41 = insert_booking("DEMO_4_1_3_DAYS_AWAY", now_ist + timedelta(days=4))
        # 4.2: 10 hours away
        b42 = insert_booking("DEMO_4_2_10_HOURS_AWAY", now_ist + timedelta(hours=10))
        # 4.3: 1 hour away (Asha cancels)
        b43 = insert_booking("DEMO_4_3_1_HOUR_AWAY_ASHA", now_ist + timedelta(hours=1))
        # 4.4: 1 hour away (Hari cancels)
        b44 = insert_booking("DEMO_4_4_1_HOUR_AWAY_HARI", now_ist + timedelta(hours=1, minutes=15))
        # 4.5: Unpaid pending request (2 days away)
        b45 = insert_booking("DEMO_4_5_UNPAID_PENDING", now_ist + timedelta(days=2), payment_status="unpaid", status="pending")
        # 4.6: Completed booking (yesterday)
        b46 = insert_booking("DEMO_4_6_COMPLETED", now_ist - timedelta(days=2), payment_status="paid", status="completed")

        print("Created bookings:")
        print(f"  4.1 (3+ days): {b41}")
        print(f"  4.2 (10h away): {b42}")
        print(f"  4.3 (1h away Asha): {b43}")
        print(f"  4.4 (1h away Hari): {b44}")
        print(f"  4.5 (unpaid pending): {b45}")
        print(f"  4.6 (completed): {b46}")

if __name__ == "__main__":
    prepare_section4_bookings()
