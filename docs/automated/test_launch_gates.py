"""Launch gates: each test states the CORRECT behaviour, so a failure means the linked gap is still open.

Run from backend/ (uses the throwaway test_synchoo database):
    PYTHONPATH=. .venv/Scripts/python -m pytest -c pytest.ini --rootdir=. ../docs/automated/test_launch_gates.py -q

See docs/04-launch-gaps.md. Tests named test_ok_* guard rules that already work.
"""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")
SECRET = "gate-secret"


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


def insert(c, table, values):
    return c.post("/api/query/", {"table": table, "action": "insert", "values": values}, format="json")


def update(c, table, values, row_id):
    return c.post("/api/query/", {"table": table, "action": "update", "values": values,
                                  "filters": [["id", "eq", str(row_id)]]}, format="json")


def rpc(c, name, **body):
    return c.post(f"/api/rpc/{name}/", body, format="json")


def fn(c, name, **body):
    return c.post(f"/api/fn/{name}/", body, format="json")


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def act_as(user_id):
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(user_id) if user_id else ""])


def booking(row_id, columns):
    return dict(zip(columns.split(","), q(f"SELECT {columns} FROM public.bookings WHERE id = %s", [row_id])[0]))


@pytest.fixture
def world(settings, tmp_path):
    settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET = "rzp_test_gate", SECRET
    settings.MEDIA_ROOT = tmp_path

    class World:
        pass

    w = World()
    for name in ("host", "cust", "cust2", "admin"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = ANY(%s)",
      [[w.cust.id, w.cust2.id]])
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Host Co')", [w.host.id])
    w.vehicle = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, security_deposit)
         VALUES (%s, %s, 'Gate Car', 'car', 'Maruti', 'Swift', 2024, 'Mumbai', 2000, 3000)""", [w.vehicle, w.host.id])
    act_as(w.admin.id)
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [w.vehicle])
    act_as(None)
    w.c, w.c2, w.h, w.a = login(w.cust), login(w.cust2), login(w.host), login(w.admin)
    return w


def request_booking(w, client=None, customer=None, start=10, end=11, **extra):
    row_id = uuid.uuid4()
    res = insert(client or w.c, "bookings", {
        "id": str(row_id), "vehicle_id": str(w.vehicle), "vendor_id": str(w.host.id),
        "customer_id": str((customer or w.cust).id), "start_date": day(start), "end_date": day(end),
        "base_price": 1, "total_price": 1, "pickup_time": "10:00", "dropoff_time": "10:00", "status": "pending", **extra})
    return row_id, res


def paid_booking(w, **kwargs):
    row_id, res = request_booking(w, **kwargs)
    assert res.status_code < 300, res.json()
    assert update(w.h, "bookings", {"status": "confirmed"}, row_id).status_code < 300
    q("SELECT public.wallet_apply(%s, 50000, 'adjustment')", [w.cust.id])
    act_as(w.cust.id)
    q("SELECT public.wallet_pay_booking(%s)", [row_id])
    act_as(None)
    return row_id


def checklist(client, row_id, phase, odo):
    return fn(client, "submitInspection", bookingId=str(row_id), phase=phase, fuel=80, odo=odo, photoPaths=[], damage=[])


# -- open gaps: these fail until the gap is fixed ---------------------------------

def test_gap01_membership_needs_verified_payment(world):
    res = fn(world.c, "subscribeMembership", plan="black", cycle="annual", payment_method="razorpay",
             razorpay_payment_id="pay_fake")
    assert res.status_code >= 400
    assert q("SELECT membership_plan FROM public.profiles WHERE id = %s", [world.cust.id])[0][0] == "free"


def test_gap02_second_customer_cannot_request_taken_dates(world):
    _, first = request_booking(world)
    _, second = request_booking(world, client=world.c2, customer=world.cust2)
    assert first.status_code < 300
    assert second.status_code >= 400


def test_gap03_new_booking_always_starts_pending(world):
    row_id, res = request_booking(world, status="confirmed")
    assert res.status_code >= 400 or booking(row_id, "status")["status"] == "pending"


def test_gap04_replayed_payment_cannot_undo_a_refund(world):
    row_id, _ = request_booking(world)
    update(world.h, "bookings", {"status": "confirmed"}, row_id)
    q("UPDATE public.bookings SET razorpay_order_id = 'order_gate' WHERE id = %s", [row_id])
    signature = hmac.new(SECRET.encode(), b"order_gate|pay_gate", hashlib.sha256).hexdigest()
    proof = dict(bookingId=str(row_id), razorpay_order_id="order_gate", razorpay_payment_id="pay_gate",
                 razorpay_signature=signature)
    assert fn(world.c, "verifyRazorpayPayment", **proof).status_code == 200
    assert rpc(world.c, "cancel_booking", _booking_id=str(row_id)).status_code == 200
    fn(world.c, "verifyRazorpayPayment", **proof)
    assert booking(row_id, "payment_status")["payment_status"] == "refunded"


def test_gap08_uploaded_html_is_never_served_as_a_web_page(world):
    path = f"{world.cust.id}/page.html"
    world.c.post("/api/storage/avatars/upload/", {
        "path": path, "file": SimpleUploadedFile("page.html", b"<script>alert(1)</script>", content_type="text/html"),
    }, format="multipart")
    res = APIClient().get(f"/api/storage/public/avatars/{path}")
    assert res.status_code != 200 or not res["Content-Type"].startswith("text/html")


def test_gap09_host_cannot_complete_an_unpaid_booking(world):
    row_id, _ = request_booking(world)
    update(world.h, "bookings", {"status": "confirmed"}, row_id)
    update(world.h, "bookings", {"status": "completed"}, row_id)
    assert booking(row_id, "status")["status"] == "confirmed"


def test_gap09_cleaner_cannot_complete_an_unpaid_wash(world):
    cleaner = User.objects.create_user("cleaner@example.com", "secret123", full_name="Cleaner")
    q("INSERT INTO public.cleaners (id, full_name, city) VALUES (%s, 'Cleaner', 'Mumbai')", [cleaner.id])
    assert rpc(world.a, "verify_cleaner", _cleaner_id=str(cleaner.id), _decision="approved").status_code == 200
    service = q("SELECT id FROM public.wash_services WHERE active LIMIT 1")[0][0]
    wash = uuid.uuid4()
    assert insert(world.c, "wash_bookings", {
        "id": str(wash), "customer_id": str(world.cust.id), "service_id": str(service), "city": "Mumbai",
        "address": "1 Test Road", "slot_date": day(3), "slot_time": "10:00", "price": 1}).status_code < 300
    rpc(world.a, "admin_decide_wash_booking", _wash_booking_id=str(wash), _decision="confirmed",
        _vendor_id="00000000-0000-0000-0000-000000000000")
    c = login(cleaner)
    rpc(c, "claim_wash_job", _wash_booking_id=str(wash))
    for step in ("on_the_way", "started"):
        rpc(c, "advance_wash_status", _wash_booking_id=str(wash), _next_status=step)
    rpc(c, "advance_wash_status", _wash_booking_id=str(wash), _next_status="completed", _photos=["after.jpg"])
    assert q("SELECT status::text FROM public.wash_bookings WHERE id = %s", [wash])[0][0] != "completed"


def test_gap10_blocked_dates_never_trap_a_confirmed_booking(world):
    row_id = paid_booking(world)
    blocked = insert(world.h, "availability_blocks", {
        "vehicle_id": str(world.vehicle), "start_date": day(10), "end_date": day(10)})
    cancelled = rpc(world.c, "cancel_booking", _booking_id=str(row_id))
    assert blocked.status_code >= 400 or cancelled.status_code == 200


def test_gap11_customer_alone_cannot_close_the_trip(world):
    row_id = paid_booking(world)
    checklist(world.h, row_id, "pickup", 1000)
    checklist(world.c, row_id, "return", 1100)
    assert booking(row_id, "status")["status"] == "confirmed"


def test_gap12_recorded_inspection_cannot_be_rewritten(world):
    row_id = paid_booking(world)
    checklist(world.h, row_id, "pickup", 1000)
    update(world.c, "bookings", {"pickup_odometer": 5}, row_id)
    assert booking(row_id, "pickup_odometer")["pickup_odometer"] == 1000


def test_gap16_admin_can_save_platform_settings(world):
    res = update(world.a, "platform_settings", {"maintenance_mode": False, "sos_phone": "+911234567890", "gst_pct": 18}, 1)
    assert res.status_code < 300, res.json()


def test_gap18_past_dates_are_rejected(world):
    _, res = request_booking(world, start=-5, end=-4)
    assert res.status_code >= 400


def test_gap18_paused_vehicle_cannot_be_booked(world):
    q("UPDATE public.vehicles SET status = 'paused' WHERE id = %s", [world.vehicle])
    _, res = request_booking(world)
    assert res.status_code >= 400


def test_gap19_pickup_checklist_waits_for_the_check_in_window(world):
    row_id = paid_booking(world)
    assert checklist(world.c, row_id, "pickup", 1000).status_code >= 400


def test_gap20_cancelled_pool_trip_closes_and_notifies_passengers(world):
    trip, request = uuid.uuid4(), uuid.uuid4()
    assert insert(world.h, "pool_trips", {
        "id": str(trip), "driver_id": str(world.host.id), "vehicle_label": "Swift", "origin_label": "A", "origin_lat": 12.9,
        "origin_lng": 77.5, "dest_label": "B", "dest_lat": 13.0, "dest_lng": 77.6,
        "depart_at": (datetime.now(IST) + timedelta(days=2)).isoformat(), "seats_total": 3, "seats_available": 3,
        "fare_per_seat": 100}).status_code < 300
    assert insert(world.c, "pool_requests", {
        "id": str(request), "trip_id": str(trip), "passenger_id": str(world.cust.id), "pickup_label": "A", "pickup_lat": 12.9,
        "pickup_lng": 77.5, "drop_label": "B", "drop_lat": 13.0, "drop_lng": 77.6, "seats": 1}).status_code < 300
    assert update(world.h, "pool_requests", {"status": "confirmed"}, request).status_code < 300
    assert update(world.h, "pool_trips", {"status": "cancelled"}, trip).status_code < 300
    assert q("SELECT status::text FROM public.pool_requests WHERE id = %s", [request])[0][0] == "cancelled"
    assert q("SELECT count(*) FROM public.notifications WHERE user_id = %s AND title ILIKE %s",
             [world.cust.id, "%cancel%"])[0][0] >= 1


def test_gap21_deleted_account_cannot_sign_in(world):
    assert rpc(world.c2, "delete_my_account_data").json()["data"]["ok"] is True
    res = APIClient().post("/api/auth/signin/", {"email": world.cust2.email, "password": "secret123"}, format="json")
    assert res.status_code >= 400


# -- rules that work today: these must keep passing --------------------------------

def test_ok_price_breakdown_with_coupon(world):
    q("INSERT INTO public.coupons (code, percent_off) VALUES ('SAVE10', 10)")
    row_id = paid_booking(world, coupon_code="save10")
    money = booking(row_id, "discount,service_fee,gst_amount,commission_amount,commission_gst,provider_earning,total_price")
    assert money == {"discount": Decimal("200.00"), "service_fee": Decimal("90.00"), "gst_amount": Decimal("16.20"),
                     "commission_amount": Decimal("200.00"), "commission_gst": Decimal("36.00"),
                     "provider_earning": Decimal("1764.00"), "total_price": Decimal("4906.20")}


@pytest.mark.parametrize("hours,refund,share,status", [
    (48, "5118.00", "0.00", "refunded"),
    (10, "4059.00", "882.00", "partially_refunded"),
    (1, "3000.00", "1764.00", "partially_refunded"),
])
def test_ok_cancellation_refund_table(world, hours, refund, share, status):
    row_id = paid_booking(world)
    start = datetime.now(IST) + timedelta(hours=hours)
    q("UPDATE public.bookings SET start_date = %s, pickup_time = %s, end_date = %s WHERE id = %s",
      [start.date(), start.time().replace(microsecond=0), start.date() + timedelta(days=1), row_id])
    data = rpc(world.c, "cancel_booking", _booking_id=str(row_id)).json()["data"]
    assert Decimal(str(data["refund"])) == Decimal(refund)
    assert Decimal(str(data["provider_share"])) == Decimal(share)
    assert data["payment_status"] == status


def test_ok_completed_trip_pays_host_and_returns_deposit(world):
    row_id = paid_booking(world)
    checklist(world.h, row_id, "pickup", 1000)
    checklist(world.h, row_id, "return", 1100)
    assert q("SELECT amount FROM public.wallet_transactions WHERE user_id = %s AND kind = 'booking_earning'",
             [world.host.id]) == [(Decimal("1764.00"),)]
    assert q("SELECT amount FROM public.wallet_transactions WHERE user_id = %s AND kind = 'refund'",
             [world.cust.id]) == [(Decimal("3000.00"),)]


def test_ok_same_customer_cannot_overlap_or_share_a_handover_day(world):
    _, first = request_booking(world, start=10, end=11)
    _, second = request_booking(world, start=11, end=12)
    assert first.status_code < 300
    assert second.status_code >= 400


def test_ok_referral_bonus_pays_both_people_once(world):
    q("UPDATE public.profiles SET referred_by = %s WHERE id = %s", [world.cust2.id, world.cust.id])
    paid_booking(world)
    paid_booking(world, start=20, end=21)
    for user in (world.cust, world.cust2):
        assert q("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s AND kind = 'referral_bonus'",
                 [user.id])[0][0] == 1
