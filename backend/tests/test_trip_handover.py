"""Trip handover codes (migration 0039): the host gives the code, the renter enters it with the car photos."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from payments import views

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")
SHOTS = ("front", "front_left", "driver_side", "rear_left", "rear", "rear_right",
         "passenger_side", "front_right", "dashboard")


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


def api(client, **body):
    return client.post("/api/query/", body, format="json")


@pytest.fixture
def trip(db, monkeypatch):
    """A paid rental whose check-in window is open."""
    monkeypatch.setattr(views, "handover_gate", lambda b: {"canCheckin": True, "checkinReason": None})

    class W:
        pass

    w = W()
    for name in ("host", "cust", "admin", "other"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s", [w.cust.id])
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Host Co')", [w.host.id])
    vehicle = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily)
         VALUES (%s, %s, 'Swift', 'car', 'Maruti', 'Swift', 2024, 'Mumbai', 2000)""", [vehicle, w.host.id])
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    w.c, w.h, w.a, w.o = login(w.cust), login(w.host), login(w.admin), login(w.other)
    start = (datetime.now(IST) + timedelta(days=10)).date()
    res = api(w.c, table="bookings", action="insert", select="id", single="one", values={
        "vehicle_id": str(vehicle), "vendor_id": str(w.host.id), "customer_id": str(w.cust.id),
        "start_date": start.isoformat(), "end_date": (start + timedelta(days=1)).isoformat(),
        "pickup_time": "10:00", "dropoff_time": "10:00"})
    assert res.status_code < 300, res.json()
    w.booking = res.json()["data"]["id"]
    assert api(w.h, table="bookings", action="update", values={"status": "confirmed"},
               filters=[["id", "eq", w.booking]]).status_code < 300
    q("SELECT public.wallet_apply(%s, 10000, 'adjustment')", [w.cust.id])
    assert w.c.post("/api/rpc/wallet_pay_booking/", {"_booking_id": w.booking}, format="json").status_code == 200
    return w


def codes(client, booking):
    res = api(client, table="booking_handover_codes", select="checkin_code, checkout_code",
              filters=[["booking_id", "eq", booking]])
    assert res.status_code == 200, res.json()
    return res.json()["data"]


def inspect(client, booking, phase, code, odo=1000, skip=None):
    photos = {s: f"{booking}/{phase}/{s}-1.jpg" for s in SHOTS if s != skip}
    return client.post("/api/fn/submitInspection/", {
        "bookingId": booking, "phase": phase, "odo": odo, "code": code, "photos": photos}, format="json")


def booking(booking_id, *cols):
    return dict(zip(cols, q(f"SELECT {', '.join(cols)} FROM public.bookings WHERE id = %s", [booking_id])[0]))


def test_codes_exist_once_paid_and_only_the_host_can_read_them(trip):
    host_codes = codes(trip.h, trip.booking)
    assert len(host_codes) == 1
    assert len(host_codes[0]["checkin_code"]) == 6 and host_codes[0]["checkin_code"].isdigit()
    assert codes(trip.a, trip.booking) == host_codes
    assert codes(trip.c, trip.booking) == []
    assert codes(trip.o, trip.booking) == []


def test_renter_starts_and_ends_the_trip_with_the_hosts_codes(trip):
    c = codes(trip.h, trip.booking)[0]
    res = inspect(trip.c, trip.booking, "pickup", c["checkin_code"], odo=1000)
    assert res.status_code == 200 and res.json()["data"]["ok"] is True, res.json()
    b = booking(trip.booking, "pickup_checked_at", "pickup_odometer", "pickup_photos", "status")
    assert b["pickup_checked_at"] and b["pickup_odometer"] == 1000 and len(b["pickup_photos"]) == 9
    assert b["status"] == "confirmed"

    assert inspect(trip.c, trip.booking, "return", c["checkout_code"], odo=900).status_code == 400
    assert inspect(trip.c, trip.booking, "return", c["checkin_code"], odo=1100).json()["data"]["ok"] is False
    res = inspect(trip.c, trip.booking, "return", c["checkout_code"], odo=1100)
    assert res.json()["data"]["ok"] is True, res.json()
    assert booking(trip.booking, "status")["status"] == "completed"
    earned = q("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s AND kind = 'booking_earning'",
               [trip.host.id])[0][0]
    assert earned == 1


def test_host_cannot_record_the_inspection(trip):
    c = codes(trip.h, trip.booking)[0]
    res = inspect(trip.h, trip.booking, "pickup", c["checkin_code"])
    assert res.status_code == 400 and "renter" in res.json()["message"]
    assert booking(trip.booking, "pickup_checked_at")["pickup_checked_at"] is None


def test_the_full_360_walk_around_and_dashboard_are_required_both_ways(trip):
    c = codes(trip.h, trip.booking)[0]
    res = inspect(trip.c, trip.booking, "pickup", c["checkin_code"], skip="dashboard")
    assert res.status_code == 400 and "dashboard" in res.json()["message"]
    res = inspect(trip.c, trip.booking, "pickup", c["checkin_code"], skip="rear_left")
    assert res.status_code == 400 and "rear left" in res.json()["message"]
    assert inspect(trip.c, trip.booking, "pickup", c["checkin_code"]).json()["data"]["ok"] is True
    res = inspect(trip.c, trip.booking, "return", c["checkout_code"], odo=1100, skip="front_right")
    assert res.status_code == 400 and "front right" in res.json()["message"]
    assert booking(trip.booking, "status")["status"] == "confirmed"


def test_wrong_codes_are_counted_and_lock_after_five(trip):
    c = codes(trip.h, trip.booking)[0]
    wrong = "000000" if c["checkin_code"] != "000000" else "111111"
    for _ in range(4):
        assert inspect(trip.c, trip.booking, "pickup", wrong).json()["data"]["ok"] is False
    assert q("SELECT failed_attempts FROM public.booking_handover_codes WHERE booking_id = %s",
             [trip.booking])[0][0] == 4
    assert "Too many" in inspect(trip.c, trip.booking, "pickup", wrong).json()["data"]["message"]
    locked = inspect(trip.c, trip.booking, "pickup", c["checkin_code"]).json()["data"]
    assert locked["ok"] is False and "Too many" in locked["message"]
    assert booking(trip.booking, "pickup_checked_at")["pickup_checked_at"] is None


def test_customer_can_no_longer_close_the_trip_through_complete_booking(trip):
    res = trip.c.post("/api/rpc/complete_booking/", {"_booking_id": trip.booking}, format="json")
    assert res.status_code >= 400
    assert trip.c.post("/api/fn/completeBooking/", {"bookingId": trip.booking}, format="json").status_code == 404
    assert booking(trip.booking, "status")["status"] == "confirmed"
