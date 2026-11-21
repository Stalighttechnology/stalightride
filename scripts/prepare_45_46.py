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
now_ist = datetime.now(IST)

with connection.cursor() as cur:
    asha_id = User.objects.get(email="asha@example.com").id
    hari_id = User.objects.get(email="hari@example.com").id
    cur.execute("SELECT id FROM public.vehicles WHERE vendor_id = %s LIMIT 1", [hari_id])
    vid = cur.fetchone()[0]

    # Delete non-cancelled bookings for Asha
    cur.execute("DELETE FROM public.bookings WHERE customer_id = %s AND vehicle_id = %s AND status NOT IN ('cancelled', 'completed')", [asha_id, vid])

    # 4.5: Unpaid pending booking (December 5-6)
    with transaction.atomic():
        with as_owner():
            cur.execute("""
                INSERT INTO public.bookings (
                    customer_id, vehicle_id, vendor_id, start_date, end_date,
                    pickup_time, dropoff_time, status, payment_status,
                    base_price, security_deposit, service_fee, gst_amount, total_price,
                    commission_amount, provider_earning, notes
                ) VALUES (
                    %s, %s, %s, '2026-12-05', '2026-12-06',
                    '10:00', '10:00', 'pending', 'unpaid',
                    2000, 3000, 100, 18, 5118,
                    36, 1764, 'STEP_4.5'
                ) RETURNING id
            """, [asha_id, vid, hari_id])
            b45 = cur.fetchone()[0]

    # 4.6: Completed booking (November 15-16)
    with transaction.atomic():
        with as_owner():
            cur.execute("""
                INSERT INTO public.bookings (
                    customer_id, vehicle_id, vendor_id, start_date, end_date,
                    pickup_time, dropoff_time, status, payment_status,
                    base_price, security_deposit, service_fee, gst_amount, total_price,
                    commission_amount, provider_earning, notes
                ) VALUES (
                    %s, %s, %s, '2026-11-15', '2026-11-16',
                    '10:00', '10:00', 'confirmed', 'paid',
                    2000, 3000, 100, 18, 5118,
                    36, 1764, 'STEP_4.6'
                ) RETURNING id
            """, [asha_id, vid, hari_id])
            b46 = cur.fetchone()[0]
            cur.execute("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [b46])
            cur.execute("UPDATE public.bookings SET status = 'completed' WHERE id = %s", [b46])

    print(f"Created 4.5 unpaid pending: {b45}")
    print(f"Created 4.6 completed: {b46}")
