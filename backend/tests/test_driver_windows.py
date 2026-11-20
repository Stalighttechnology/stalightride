"""Tests for driver hire booking windows: deadlines, 2h notice, auto-expiry,
similar drivers, linked rental cancellation cascade, and late payment refund."""

import json
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def parse_json(val):
    return json.loads(val) if isinstance(val, str) else val


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


@pytest.fixture
def driver_world(db):
    class W:
        pass

    w = W()
    for name in ("cust", "cust2", "driver_user", "driver_user2", "host", "admin"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = ANY(%s)",
      [[w.cust.id, w.cust2.id]])

    # Seed vendor and vehicle
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Host Co')", [w.host.id])
    w.vehicle = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily)
         VALUES (%s, %s, 'Race Car', 'car', 'Maruti', 'Swift', 2024, 'Bengaluru', 2000)""", [w.vehicle, w.host.id])
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [w.vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    # Seed drivers
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    for u, name, rating in ((w.driver_user, "Driver One", 4.9), (w.driver_user2, "Driver Two", 4.5)):
        q("""INSERT INTO public.drivers (id, full_name, city, hourly_rate, daily_rate, dl_number, dl_expiry)
             VALUES (%s, %s, 'Bengaluru', 200, 1500, 'DL123', CURRENT_DATE + 365)""",
          [u.id, name])
        q("UPDATE public.drivers SET verification_status = 'approved', status = 'active' WHERE id = %s", [u.id])
        # Ensure public_drivers mirror table has it
        q("""INSERT INTO public.public_drivers (id, full_name, city, hourly_rate, daily_rate, avg_rating, review_count)
             VALUES (%s, %s, 'Bengaluru', 200, 1500, %s, 10)
             ON CONFLICT (id) DO UPDATE SET city = EXCLUDED.city, avg_rating = EXCLUDED.avg_rating""",
          [u.id, name, rating])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    return w


def test_driver_hire_windows_and_2h_notice(driver_world):
    """Driver hire enforces 2h notice and sets respond_by with 1 hour buffer."""
    c = login(driver_world.cust)

    # 1. Pickup under 2 hours is refused
    today_str = datetime.now(IST).date().isoformat()
    now_time = datetime.now(IST).time().strftime("%H:%M:%S")
    res_too_soon = c.post("/api/query/", {
        "table": "driver_bookings",
        "action": "insert",
        "values": {
            "driver_id": str(driver_world.driver_user.id),
            "customer_id": str(driver_world.cust.id),
            "start_date": today_str,
            "end_date": today_str,
            "start_time": now_time,
            "end_time": "23:00:00",
            "rate_type": "daily",
            "total_price": 1500,
        },
    }, format="json")
    assert res_too_soon.status_code == 400
    assert "Pickup must be at least 2 hours from now" in (res_too_soon.json().get("error") or res_too_soon.json().get("message", ""))

    # 2. Valid booking sets respond_by with 1 hour buffer
    far_day = day(3)
    res_ok = c.post("/api/query/", {
        "table": "driver_bookings",
        "action": "insert",
        "values": {
            "driver_id": str(driver_world.driver_user.id),
            "customer_id": str(driver_world.cust.id),
            "start_date": far_day,
            "end_date": far_day,
            "start_time": "10:00:00",
            "end_time": "18:00:00",
            "rate_type": "daily",
            "total_price": 1500,
        },
        "select": "id, status, respond_by, pay_by",
        "single": "one",
    }, format="json")
    assert res_ok.status_code == 200
    b = res_ok.json()["data"]
    assert b["status"] == "pending"
    assert b["respond_by"] is not None
    assert b["pay_by"] is None


def test_driver_approval_after_respond_by_fails(driver_world):
    """Driver cannot accept after respond_by has passed."""
    now = datetime.now(IST)
    hire_id = uuid.uuid4()
    # Insert an expired pending request
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, created_at, respond_by)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 'daily', 1500, 'pending', %s, %s)""",
      [hire_id, driver_world.driver_user.id, driver_world.cust.id, day(3), day(3),
       now - timedelta(hours=3), now - timedelta(hours=1)])

    d_client = login(driver_world.driver_user)
    res = d_client.post("/api/query/", {
        "table": "driver_bookings",
        "action": "update",
        "values": {"status": "confirmed"},
        "filters": [["id", "eq", str(hire_id)]],
    }, format="json")
    assert res.status_code == 400
    msg = (res.json().get("error") or res.json().get("message", "")).lower()
    assert "expired" in msg


def test_wallet_pay_driver_hire_after_pay_by_fails(driver_world):
    """Customer cannot pay via wallet after pay_by has passed."""
    now = datetime.now(IST)
    hire_id = uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, payment_status, confirmed_at, pay_by)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 'daily', 1500, 'confirmed', 'unpaid', %s, %s)""",
      [hire_id, driver_world.driver_user.id, driver_world.cust.id, day(3), day(3),
       now - timedelta(hours=2), now - timedelta(hours=1)])

    # Topup wallet
    q("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 5000) ON CONFLICT (user_id) DO UPDATE SET balance = 5000",
      [driver_world.cust.id])

    c = login(driver_world.cust)
    res = c.post("/api/rpc/wallet_pay_driver_booking/", {
        "_driver_booking_id": str(hire_id),
    }, format="json")
    assert res.status_code == 400
    msg = (res.json().get("error") or res.json().get("message", "")).lower()
    assert "payment window has closed" in msg


def test_expire_booking_windows_driver_hires(driver_world):
    """expire_booking_windows cancels expired driver requests and unpaid hires."""
    now = datetime.now(IST)
    hire1 = uuid.uuid4()
    hire2 = uuid.uuid4()

    # hire1: expired pending
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, created_at, respond_by)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 'daily', 1500, 'pending', %s, %s)""",
      [hire1, driver_world.driver_user.id, driver_world.cust.id, day(3), day(3),
       now - timedelta(hours=3), now - timedelta(hours=1)])

    # hire2: expired confirmed unpaid
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, payment_status, confirmed_at, pay_by)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 'daily', 1500, 'confirmed', 'unpaid', %s, %s)""",
      [hire2, driver_world.driver_user2.id, driver_world.cust.id, day(3), day(3),
       now - timedelta(hours=2), now - timedelta(hours=1)])

    res = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res.get("driver_cancelled_pending", 0) >= 1
    assert res.get("driver_cancelled_unpaid", 0) >= 1

    s1, r1 = q("SELECT status, cancellation_reason FROM public.driver_bookings WHERE id = %s", [hire1])[0]
    assert s1 == "cancelled"
    assert r1 == "driver_no_response"

    s2, r2 = q("SELECT status, cancellation_reason FROM public.driver_bookings WHERE id = %s", [hire2])[0]
    assert s2 == "cancelled"
    assert r2 == "payment_timeout"


def test_similar_drivers_excludes_busy_and_original(driver_world):
    """similar_drivers returns approved/active drivers in the same city, excluding the original and busy drivers."""
    now = datetime.now(IST)
    hire_id = uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, cancellation_reason, created_at, respond_by)
         VALUES (%s, %s, %s, %s, %s, '10:00:00', '18:00:00', 'daily', 1500, 'cancelled', 'driver_no_response', %s, %s)""",
      [hire_id, driver_world.driver_user.id, driver_world.cust.id, day(3), day(4),
       now - timedelta(hours=3), now - timedelta(hours=1)])

    # Third driver in same city
    d3 = User.objects.create_user("driver3@example.com", "secret123", full_name="Driver Three")
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(driver_world.admin.id)])
    q("""INSERT INTO public.drivers (id, full_name, city, hourly_rate, daily_rate, dl_number, dl_expiry)
         VALUES (%s, 'Driver Three', 'Bengaluru', 200, 1500, 'DL123', CURRENT_DATE + 365)""",
      [d3.id])
    q("UPDATE public.drivers SET verification_status = 'approved', status = 'active' WHERE id = %s", [d3.id])
    q("""INSERT INTO public.public_drivers (id, full_name, city, hourly_rate, daily_rate, avg_rating, review_count)
         VALUES (%s, 'Driver Three', 'Bengaluru', 200, 1500, 4.8, 5)
         ON CONFLICT (id) DO UPDATE SET city = EXCLUDED.city, avg_rating = EXCLUDED.avg_rating""",
      [d3.id])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    # Mark driver_user2 busy on day 3
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status)
         VALUES (%s, %s, %s, %s, %s, '09:00:00', '18:00:00', 'daily', 1500, 'confirmed')""",
      [uuid.uuid4(), driver_world.driver_user2.id, driver_world.cust2.id, day(3), day(3)])

    # Caller must be customer
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(driver_world.cust.id)])
    rows = q("SELECT id, full_name FROM public.similar_drivers(%s)", [hire_id])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    # driver_user is original -> excluded
    # driver_user2 is busy -> excluded
    # driver3 is available -> included
    returned_ids = [r[0] for r in rows]
    assert driver_world.driver_user.id not in returned_ids
    assert driver_world.driver_user2.id not in returned_ids
    assert d3.id in returned_ids


def test_linked_rental_cascade_cancels_driver_hire(driver_world):
    """Cancelling a rental cancels linked driver hires and refunds to wallet if paid."""
    # Create rental
    booking_id = uuid.uuid4()
    q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
         base_price, total_price, status, payment_status)
         VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'confirmed', 'paid')""",
      [booking_id, driver_world.vehicle, driver_world.host.id, driver_world.cust.id, day(3), day(4)])

    # Create linked paid driver hire
    hire_id = uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, booking_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status)
         VALUES (%s, %s, %s, %s, %s, %s, '09:00:00', '18:00:00', 'daily', 1500, 'confirmed')""",
      [hire_id, driver_world.driver_user.id, driver_world.cust.id, booking_id, day(3), day(4)])
    q("UPDATE public.driver_bookings SET payment_status = 'paid', paid_at = now() WHERE id = %s", [hire_id])

    # Ensure wallet balance starts at 0
    q("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT (user_id) DO UPDATE SET balance = 0",
      [driver_world.cust.id])

    # Cancel rental booking
    q("UPDATE public.bookings SET status = 'cancelled', cancellation_reason = 'customer_request', cancelled_at = now() WHERE id = %s",
      [booking_id])

    # Linked driver hire must be cancelled with refund
    s, ps, ref, r, tot = q("SELECT status, payment_status, refund_amount, cancellation_reason, total_price FROM public.driver_bookings WHERE id = %s", [hire_id])[0]
    assert s == "cancelled"
    assert ps == "refunded"
    assert float(ref) == float(tot)
    assert r == "linked_rental_cancelled"

    # Wallet has been credited
    bal = q("SELECT balance FROM public.wallets WHERE user_id = %s", [driver_world.cust.id])[0][0]
    assert float(bal) == float(tot)


def test_late_razorpay_verify_driver_refunds_wallet_once(driver_world):
    """Late driver hire Razorpay payment arrival refunds full amount to wallet once."""
    hire_id = uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, driver_id, customer_id, start_date, end_date,
         start_time, end_time, rate_type, total_price, status, cancellation_reason, razorpay_order_id)
         VALUES (%s, %s, %s, %s, %s, '09:00:00', '18:00:00', 'daily', 1500, 'cancelled', 'payment_timeout', 'order_test_drv')""",
      [hire_id, driver_world.driver_user.id, driver_world.cust.id, day(3), day(3)])

    q("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT (user_id) DO UPDATE SET balance = 0",
      [driver_world.cust.id])

    b_data = {
        "id": str(hire_id),
        "customer_id": str(driver_world.cust.id),
        "total_price": 1500,
        "payment_status": "unpaid",
        "razorpay_payment_id": None,
    }
    from payments.views import _refund_late_driver_payment

    _refund_late_driver_payment(b_data, "pay_drv_123")

    bal = q("SELECT balance FROM public.wallets WHERE user_id = %s", [driver_world.cust.id])[0][0]
    assert float(bal) == 1500.0

    b_refreshed = q("SELECT payment_status, refund_amount, razorpay_payment_id FROM public.driver_bookings WHERE id = %s", [hire_id])[0]
    assert b_refreshed[0] == "refunded"
    assert float(b_refreshed[1]) == 1500.0
    assert b_refreshed[2] == "pay_drv_123"

    # Running it again is idempotent
    b_data["payment_status"] = "refunded"
    b_data["razorpay_payment_id"] = "pay_drv_123"
    _refund_late_driver_payment(b_data, "pay_drv_123")
    bal2 = q("SELECT balance FROM public.wallets WHERE user_id = %s", [driver_world.cust.id])[0][0]
    assert float(bal2) == 1500.0
