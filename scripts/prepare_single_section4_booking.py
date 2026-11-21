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

def prepare_step(step):
    with connection.cursor() as cur:
        asha_id = User.objects.get(email="asha@example.com").id
        hari_id = User.objects.get(email="hari@example.com").id

        cur.execute("SELECT id FROM public.vehicles WHERE vendor_id = %s LIMIT 1", [hari_id])
        vid = cur.fetchone()[0]

        now_ist = datetime.now(IST)

        # Clear existing non-cancelled bookings for Asha on Test Swift to avoid date conflicts
        cur.execute("DELETE FROM public.bookings WHERE customer_id = %s AND vehicle_id = %s", [asha_id, vid])

        if step == "4.1":
            # 3+ days away (4 days away)
            pickup_dt = now_ist + timedelta(days=4)
            payment_status = "paid"
            status = "confirmed"
        elif step == "4.2":
            # 10 hours away
            pickup_dt = now_ist + timedelta(hours=10)
            payment_status = "paid"
            status = "confirmed"
        elif step == "4.3":
            # 1 hour away (Asha cancels)
            pickup_dt = now_ist + timedelta(hours=1)
            payment_status = "paid"
            status = "confirmed"
        elif step == "4.4":
            # 1 hour away (Hari cancels)
            pickup_dt = now_ist + timedelta(hours=1)
            payment_status = "paid"
            status = "confirmed"
        elif step == "4.5":
            # Unpaid pending request
            pickup_dt = now_ist + timedelta(days=2)
            payment_status = "unpaid"
            status = "pending"
        elif step == "4.6":
            # Completed booking
            pickup_dt = now_ist - timedelta(days=2)
            payment_status = "paid"
            status = "completed"
        else:
            raise ValueError(f"Unknown step: {step}")

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
                    [asha_id, vid, hari_id, start_date_str, end_date_str, pickup_time_str, dropoff_time_str, status, payment_status, f"STEP_{step}"]
                )
                bk_id = cur.fetchone()[0]

                if payment_status == "paid":
                    cur.execute("SELECT public.wallet_apply(%s, -5118, 'booking_payment', %s, NULL, %s)", [asha_id, bk_id, f"Payment for {step}"])
                    cur.execute("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_id])

        print(f"Prepared step {step} booking: {bk_id} (pickup {pickup_dt.strftime('%Y-%m-%d %H:%M:%S')}, status={status}, payment={payment_status})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python prepare_single_section4_booking.py <step>")
        sys.exit(1)
    prepare_step(sys.argv[1])
