"""Tests for booking windows: deadlines, auto-expiry, halfway reminders, and late payment refund."""

import json
import hmac
import hashlib
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
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


def insert(c, table, values):
    return c.post("/api/query/", {
        "table": table,
        "action": "insert",
        "values": values,
        "select": "id, status, respond_by, pay_by",
        "single": "one"
    }, format="json")


@pytest.fixture
def world(db):
    class W:
        pass

    w = W()
    for name in ("host", "cust", "cust2", "admin"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = ANY(%s)",
      [[w.cust.id, w.cust2.id]])
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Host Co')", [w.host.id])
    w.vehicle = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily)
         VALUES (%s, %s, 'Race Car', 'car', 'Maruti', 'Swift', 2024, 'Mumbai', 2000)""", [w.vehicle, w.host.id])
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [w.vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    w.c, w.c2, w.h = login(w.cust), login(w.cust2), login(w.host)
    return w


def request(w, client, customer, start=10, end=11, **extra):
    return insert(client, "bookings", {
        "vehicle_id": str(w.vehicle), "vendor_id": str(w.host.id), "customer_id": str(customer.id),
        "start_date": day(start), "end_date": day(end), "base_price": 2000, "total_price": 2000, **extra})


def test_booking_deadline_formula(db):
    """Formula: earliest of from + 12h, from + (start - from)/2, start - buffer."""
    t1 = datetime(2026, 8, 15, 15, 0, tzinfo=IST)
    t2 = datetime(2026, 8, 15, 18, 0, tzinfo=IST)
    # 3pm -> 6pm with 1h buffer gives 4:30pm (halfway is earlier than start - 1h)
    r1 = q("SELECT to_char(public.booking_deadline(%s, %s, interval '1 hour') AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')", [t1, t2])[0][0]
    assert r1 == "16:30"

    # Approve at 4pm for 6pm with 30m buffer gives pay_by 5:00pm (halfway 4pm + 1h = 5pm)
    t3 = datetime(2026, 8, 15, 16, 0, tzinfo=IST)
    r2 = q("SELECT to_char(public.booking_deadline(%s, %s, interval '30 minutes') AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')", [t3, t2])[0][0]
    assert r2 == "17:00"

    # Next week gives created + 12h
    t_next_week = datetime(2026, 8, 22, 15, 0, tzinfo=IST)
    r3 = q("SELECT to_char(public.booking_deadline(%s, %s, interval '1 hour') AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')", [t1, t_next_week])[0][0]
    assert r3 == "03:00"


def test_pickup_under_2h_refused(world):
    """Requests with pickup less than 2h away are refused."""
    now_ist = datetime.now(IST)
    target = now_ist + timedelta(hours=1)
    res = insert(world.c, "bookings", {
        "vehicle_id": str(world.vehicle), "vendor_id": str(world.host.id), "customer_id": str(world.cust.id),
        "start_date": target.date().isoformat(), "end_date": (target + timedelta(days=1)).date().isoformat(),
        "pickup_time": target.strftime("%H:%M:%S"), "dropoff_time": "20:00:00",
        "base_price": 2000, "total_price": 2000})
    assert res.status_code == 400
    assert "Pickup must be at least 2 hours from now" in res.json()["message"]


def test_approving_after_respond_by_fails(world):
    """Approving after respond_by fails."""
    res = request(world, world.c, world.cust, start=5, end=6)
    assert res.status_code == 200
    bid = res.json()["data"]["id"]

    # Set respond_by in the past
    q("UPDATE public.bookings SET respond_by = now() - interval '10 minutes' WHERE id = %s", [bid])

    # Host attempts to approve
    approve_res = world.h.post("/api/query/", {
        "table": "bookings",
        "action": "update",
        "values": {"status": "confirmed"},
        "filters": [["id", "eq", bid]]
    }, format="json")
    assert approve_res.status_code == 400
    assert "This request has expired" in approve_res.json()["message"]


def test_wallet_payment_after_pay_by_fails(world):
    """Wallet payment after pay_by fails."""
    res = request(world, world.c, world.cust, start=5, end=6)
    assert res.status_code == 200
    bid = res.json()["data"]["id"]

    # Host approves
    approve_res = world.h.post("/api/query/", {
        "table": "bookings",
        "action": "update",
        "values": {"status": "confirmed"},
        "filters": [["id", "eq", bid]]
    }, format="json")
    assert approve_res.status_code == 200

    # Top up customer wallet
    q("UPDATE public.wallets SET balance = 50000 WHERE user_id = %s", [world.cust.id])

    # Set pay_by in the past
    q("UPDATE public.bookings SET pay_by = now() - interval '5 minutes' WHERE id = %s", [bid])

    # Customer attempts wallet payment
    pay_res = world.c.post("/api/rpc/wallet_pay_booking/", {"_booking_id": bid}, format="json")
    assert pay_res.status_code == 400
    assert "Payment window has closed" in pay_res.json()["message"]


def test_new_request_succeeds_once_old_respond_by_passed(world):
    """A new request for the same car succeeds once the old one's respond_by is in the past."""
    res1 = request(world, world.c, world.cust, start=5, end=7)
    assert res1.status_code == 200
    bid1 = res1.json()["data"]["id"]

    # Second customer tries to book overlapping dates -> fails
    res2_fail = request(world, world.c2, world.cust2, start=6, end=8)
    assert res2_fail.status_code == 400

    # Set old booking's respond_by in the past
    q("UPDATE public.bookings SET respond_by = now() - interval '10 minutes' WHERE id = %s", [bid1])

    # Now second customer's request succeeds because first booking is cancelled lazily
    res2_ok = request(world, world.c2, world.cust2, start=6, end=8)
    assert res2_ok.status_code == 200

    # Verify old booking was cancelled with host_no_response
    row = q("SELECT status::text, cancellation_reason FROM public.bookings WHERE id = %s", [bid1])[0]
    assert row[0] == "cancelled"
    assert row[1] == "host_no_response"


def test_expire_booking_windows_cancels_and_reminds_once(world):
    """expire_booking_windows cancels expired rows and sends halfway reminders once."""
    # 1. Create all 4 bookings first so subsequent requests don't lazily cancel them
    res1 = request(world, world.c, world.cust, start=5, end=6)
    assert res1.status_code == 200
    bid1 = res1.json()["data"]["id"]

    res2 = request(world, world.c2, world.cust2, start=7, end=8)
    assert res2.status_code == 200
    bid2 = res2.json()["data"]["id"]

    res3 = request(world, world.c, world.cust, start=9, end=10)
    assert res3.status_code == 200
    bid3 = res3.json()["data"]["id"]

    res4 = request(world, world.c2, world.cust2, start=11, end=12)
    assert res4.status_code == 200
    bid4 = res4.json()["data"]["id"]

    # Confirm bid2 and bid4
    q("UPDATE public.bookings SET status = 'confirmed' WHERE id = %s", [bid2])
    q("UPDATE public.bookings SET status = 'confirmed' WHERE id = %s", [bid4])

    # Now set the test conditions:
    # bid1: expired pending
    q("UPDATE public.bookings SET respond_by = now() - interval '1 minute' WHERE id = %s", [bid1])
    # bid2: expired confirmed unpaid
    q("UPDATE public.bookings SET confirmed_at = now() - interval '2 hours', pay_by = now() - interval '1 minute' WHERE id = %s", [bid2])
    # bid3: pending halfway reminder (created 2h ago, respond_by in 1h, halfway was 30m ago)
    q("UPDATE public.bookings SET created_at = now() - interval '2 hours', respond_by = now() + interval '1 hour', respond_reminded_at = NULL WHERE id = %s", [bid3])
    # bid4: confirmed unpaid halfway reminder (confirmed 1h ago, pay_by in 30m)
    q("UPDATE public.bookings SET confirmed_at = now() - interval '1 hour', pay_by = now() + interval '30 minutes', pay_reminded_at = NULL WHERE id = %s", [bid4])

    # Run expire_booking_windows
    q("SELECT public.expire_booking_windows()")

    # Verify cancellations
    b1_status = q("SELECT status::text, cancellation_reason FROM public.bookings WHERE id = %s", [bid1])[0]
    assert b1_status == ("cancelled", "host_no_response")

    b2_status = q("SELECT status::text, cancellation_reason FROM public.bookings WHERE id = %s", [bid2])[0]
    assert b2_status == ("cancelled", "payment_timeout")

    # Verify notifications were created for cancellations
    notifs_cust1 = q("SELECT title FROM public.notifications WHERE user_id = %s AND title = 'Request expired'", [world.cust.id])
    assert len(notifs_cust1) >= 1

    notifs_cust2 = q("SELECT title FROM public.notifications WHERE user_id = %s AND title = 'Payment window expired'", [world.cust2.id])
    assert len(notifs_cust2) >= 1

    # Verify reminders were sent and recorded
    rem1 = q("SELECT respond_reminded_at FROM public.bookings WHERE id = %s", [bid3])[0][0]
    assert rem1 is not None

    rem2 = q("SELECT pay_reminded_at FROM public.bookings WHERE id = %s", [bid4])[0][0]
    assert rem2 is not None

    # Count notifications before second run
    count_before = q("SELECT count(*) FROM public.notifications")[0][0]

    # Run expire_booking_windows second time -> idempotent, no duplicate reminders
    q("SELECT public.expire_booking_windows()")
    count_after = q("SELECT count(*) FROM public.notifications")[0][0]
    assert count_after == count_before


def test_late_razorpay_verify_refunds_wallet_once(world, settings):
    """A late Razorpay verify refunds to the wallet exactly once."""
    settings.RAZORPAY_KEY_ID = "rzp_test"
    settings.RAZORPAY_KEY_SECRET = "test_secret"
    res = request(world, world.c, world.cust, start=5, end=6)
    assert res.status_code == 200
    bid = res.json()["data"]["id"]

    # Cancel the booking
    q("UPDATE public.bookings SET status = 'cancelled', cancellation_reason = 'host_no_response', razorpay_order_id = 'order_late123' WHERE id = %s", [bid])

    # Balance before
    bal_before = q("SELECT balance FROM public.wallets WHERE user_id = %s", [world.cust.id])
    bal_before_val = float(bal_before[0][0]) if bal_before else 0.0

    total_price = float(q("SELECT total_price FROM public.bookings WHERE id = %s", [bid])[0][0])

    # Signature for order_late123 and pay_late123
    secret = settings.RAZORPAY_KEY_SECRET
    sig = hmac.new(secret.encode(), b"order_late123|pay_late123", hashlib.sha256).hexdigest()

    # Call verifyRazorpayPayment endpoint as customer
    v_res = world.c.post("/api/fn/verifyRazorpayPayment/", {
        "bookingId": bid,
        "razorpay_order_id": "order_late123",
        "razorpay_payment_id": "pay_late123",
        "razorpay_signature": sig,
    }, format="json")
    assert v_res.status_code == 200

    # Check booking status is refunded
    p_status = q("SELECT payment_status FROM public.bookings WHERE id = %s", [bid])[0][0]
    assert p_status == "refunded"

    # Check wallet balance increased by booking total_price
    bal_after = q("SELECT balance FROM public.wallets WHERE user_id = %s", [world.cust.id])[0][0]
    assert float(bal_after) == bal_before_val + total_price

    # Call verify a second time -> idempotent, wallet does NOT refund again
    v_res2 = world.c.post("/api/fn/verifyRazorpayPayment/", {
        "bookingId": bid,
        "razorpay_order_id": "order_late123",
        "razorpay_payment_id": "pay_late123",
        "razorpay_signature": sig,
    }, format="json")
    assert v_res2.status_code == 200

    bal_after2 = q("SELECT balance FROM public.wallets WHERE user_id = %s", [world.cust.id])[0][0]
    assert float(bal_after2) == float(bal_after)


def test_instant_book_insert_lands_as_confirmed_with_pay_by(world):
    """An Instant Book insert lands as confirmed with pay_by, respond_by NULL, and notifies both sides."""
    # Enable instant_book on the vehicle as the host
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(world.host.id)])
    q("UPDATE public.vehicles SET instant_book = true WHERE id = %s", [world.vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    # Customer books the instant_book car
    res = request(world, world.c, world.cust, start=15, end=16)
    assert res.status_code == 200, res.json()
    b = res.json()["data"]

    assert b["status"] == "confirmed"
    assert b["pay_by"] is not None
    assert b["respond_by"] is None

    # Check database row
    row = q("SELECT status, confirmed_at, pay_by, respond_by FROM public.bookings WHERE id = %s", [b["id"]])[0]
    assert row[0] == "confirmed"
    assert row[1] is not None
    assert row[2] is not None
    assert row[3] is None

    # Check notifications sent to both sides
    notes_vendor = q("SELECT title, body FROM public.notifications WHERE user_id = %s AND title = 'Instant booking confirmed'", [world.host.id])
    assert len(notes_vendor) == 1
    assert "confirmed immediately via Instant Book" in notes_vendor[0][1]

    notes_cust = q("SELECT title, body FROM public.notifications WHERE user_id = %s AND title = 'Booking confirmed'", [world.cust.id])
    assert len(notes_cust) == 1
    assert "Instant Book" in notes_cust[0][1]


def test_host_response_stats_numbers(world):
    """host_response_stats returns response_rate, median_response_minutes, request_count over 90 days."""
    # Initially no bookings requiring response
    stats_raw = parse_json(q("SELECT public.host_response_stats(%s)", [world.host.id])[0][0])
    assert stats_raw["request_count"] == 0
    assert stats_raw["response_rate"] is None
    assert stats_raw["median_response_minutes"] is None

    # Create 3 bookings:
    # 1. Responded (confirmed) in 20 minutes (before respond_by)
    # 2. Responded (rejected) in 40 minutes (before respond_by)
    # 3. Expired without response (host_no_response)
    now = datetime.now(IST)
    b1_id = uuid.uuid4()
    b2_id = uuid.uuid4()
    b3_id = uuid.uuid4()

    # b1: confirmed in 20 min
    q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
         base_price, total_price, status, created_at, respond_by, confirmed_at)
         VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'confirmed', %s, %s, %s)""",
      [b1_id, world.vehicle, world.host.id, world.cust.id, day(10), day(11),
       now - timedelta(days=5), now - timedelta(days=5) + timedelta(hours=6),
       now - timedelta(days=5) + timedelta(minutes=20)])

    # b2: rejected in 40 min
    q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
         base_price, total_price, status, created_at, respond_by, updated_at)
         VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'rejected', %s, %s, %s)""",
      [b2_id, world.vehicle, world.host.id, world.cust.id, day(12), day(13),
       now - timedelta(days=3), now - timedelta(days=3) + timedelta(hours=6),
       now - timedelta(days=3) + timedelta(minutes=40)])

    # b3: expired without response
    q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
         base_price, total_price, status, cancellation_reason, created_at, respond_by, cancelled_at)
         VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'cancelled', 'host_no_response', %s, %s, %s)""",
      [b3_id, world.vehicle, world.host.id, world.cust.id, day(14), day(15),
       now - timedelta(days=1), now - timedelta(days=1) + timedelta(hours=6),
       now - timedelta(days=1) + timedelta(hours=7)])

    # Query host_response_stats
    stats = parse_json(q("SELECT public.host_response_stats(%s)", [world.host.id])[0][0])
    assert stats["request_count"] == 3
    # 2 out of 3 responded in time -> 2/3 = 0.6667
    assert float(stats["response_rate"]) == pytest.approx(0.6667, abs=0.001)
    # Median of [20, 40] is 30 minutes
    assert stats["median_response_minutes"] == 30


def test_three_expiries_pause_listings_once(world):
    """3 expiries in 30 days pause the listings once; re-activating resets the count."""
    now = datetime.now(IST)
    # Ensure vehicle is active
    q("UPDATE public.vehicles SET status = 'active' WHERE id = %s", [world.vehicle])
    q("UPDATE public.vendors SET listings_paused_at = NULL, listings_reactivated_at = NULL WHERE id = %s", [world.host.id])

    # Insert 3 expired bookings in the last 30 days
    for i in range(3):
        q("""INSERT INTO public.bookings (id, vehicle_id, vendor_id, customer_id, start_date, end_date,
             base_price, total_price, status, cancellation_reason, created_at, respond_by, cancelled_at)
             VALUES (%s, %s, %s, %s, %s, %s, 2000, 2000, 'cancelled', 'host_no_response', %s, %s, %s)""",
          [uuid.uuid4(), world.vehicle, world.host.id, world.cust.id, day(20 + i), day(21 + i),
           now - timedelta(days=10), now - timedelta(days=10) + timedelta(hours=6), now - timedelta(days=10) + timedelta(hours=7)])

    # Call expire_booking_windows
    res = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res.get("vendors_listings_paused") == 1

    # Check vehicle is paused
    v_status = q("SELECT status FROM public.vehicles WHERE id = %s", [world.vehicle])[0][0]
    assert v_status == "paused"

    # Check vendor listings_paused_at is recorded
    paused_at = q("SELECT listings_paused_at FROM public.vendors WHERE id = %s", [world.host.id])[0][0]
    assert paused_at is not None

    # Check notification sent
    notes = q("SELECT title, body FROM public.notifications WHERE user_id = %s AND title = 'Listings paused'", [world.host.id])
    assert len(notes) == 1
    assert "Your listings are paused because 3 requests expired without a response." in notes[0][1]

    # Running expire_booking_windows again does NOT pause or notify again (only once per breach)
    res2 = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res2.get("vendors_listings_paused") == 0
    notes2 = q("SELECT count(*) FROM public.notifications WHERE user_id = %s AND title = 'Listings paused'", [world.host.id])[0][0]
    assert notes2 == 1

    # Reactivate listings
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(world.host.id)])
    reactivate_res = q("SELECT public.reactivate_vendor_listings(%s)", [world.host.id])[0][0]
    assert reactivate_res is True
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    # Vehicle is active again, listings_paused_at is cleared, listings_reactivated_at is set
    v_status_after = q("SELECT status FROM public.vehicles WHERE id = %s", [world.vehicle])[0][0]
    assert v_status_after == "active"
    v_row = q("SELECT listings_paused_at, listings_reactivated_at FROM public.vendors WHERE id = %s", [world.host.id])[0]
    assert v_row[0] is None
    assert v_row[1] is not None

    # Running expire_booking_windows again does NOT re-pause because the 3 expiries happened before reactivated_at
    res3 = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res3.get("vendors_listings_paused") == 0
    v_status_final = q("SELECT status FROM public.vehicles WHERE id = %s", [world.vehicle])[0][0]
    assert v_status_final == "active"

