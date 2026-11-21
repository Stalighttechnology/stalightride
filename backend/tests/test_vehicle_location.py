"""The exact pickup address is private until the host confirms a booking (migration 0036)."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")
EXACT = "12, 3rd Cross, Indiranagar, Bengaluru, Karnataka 560038"


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


def api(client, **body):
    return client.post("/api/query/", body, format="json")


def location(client, vehicle_id):
    res = api(client, table="vehicle_locations", select="address, lat, lng",
              filters=[["vehicle_id", "eq", str(vehicle_id)]])
    return res.json()["data"] if res.status_code == 200 else None


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
    w.c, w.c2, w.h, w.a = login(w.cust), login(w.cust2), login(w.host), login(w.admin)
    w.vehicle = uuid.uuid4()
    res = api(w.h, table="vehicles", action="insert", values={
        "id": str(w.vehicle), "vendor_id": str(w.host.id), "title": "Swift", "category": "car",
        "brand": "Maruti", "model": "Swift", "year": 2024, "city": "Bengaluru", "price_daily": 2000,
        "address": EXACT, "lat": 12.971598, "lng": 77.640812})
    assert res.status_code < 300, res.json()
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [w.vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    return w


@pytest.mark.parametrize("address, city, area", [
    (EXACT, "Bengaluru", "Indiranagar"),
    ("Flat 4B, Prestige Tower, MG Road, Ashok Nagar, Bengaluru", "Bengaluru", "MG Road, Ashok Nagar"),
    ("XQ2M+3F, Koramangala", "Bengaluru", "Koramangala"),
    ("221B, 400001", "Mumbai", None),
    (None, "Mumbai", None),
])
def test_address_area(db, address, city, area):
    assert q("SELECT public.address_area(%s, %s)", [address, city])[0][0] == area


def test_public_row_keeps_only_the_area_and_a_rounded_pin(world):
    for client in (APIClient(), world.c):
        res = api(client, table="vehicles", select="*", filters=[["id", "eq", str(world.vehicle)]])
        row = res.json()["data"][0]
        assert row["address"] == "Indiranagar"
        assert float(row["lat"]) == 12.97 and float(row["lng"]) == 77.64


def test_exact_location_unlocks_only_for_confirmed_customer(world):
    assert location(APIClient(), world.vehicle) == []
    assert location(world.c, world.vehicle) == []

    res = api(world.c, table="bookings", action="insert", select="id", single="one", values={
        "vehicle_id": str(world.vehicle), "vendor_id": str(world.host.id), "customer_id": str(world.cust.id),
        "start_date": day(10), "end_date": day(11), "base_price": 2000, "total_price": 2000})
    assert res.status_code < 300, res.json()
    booking = res.json()["data"]["id"]
    assert location(world.c, world.vehicle) == [], "pending request must not reveal the address"

    res = api(world.h, table="bookings", action="update", values={"status": "confirmed"},
              filters=[["id", "eq", booking]])
    assert res.status_code < 300, res.json()

    rows = location(world.c, world.vehicle)
    assert rows and rows[0]["address"] == EXACT
    assert float(rows[0]["lat"]) == 12.971598
    assert location(world.c2, world.vehicle) == []
    assert location(world.h, world.vehicle)[0]["address"] == EXACT
    assert location(world.a, world.vehicle)[0]["address"] == EXACT


def test_host_moving_the_pin_updates_the_private_copy_only(world):
    res = api(world.h, table="vehicles", action="update", values={"lat": 12.935, "lng": 77.6245},
              filters=[["id", "eq", str(world.vehicle)]])
    assert res.status_code < 300, res.json()
    exact = q("SELECT address, lat, lng FROM public.vehicle_locations WHERE vehicle_id = %s", [world.vehicle])[0]
    assert exact[0] == EXACT and float(exact[1]) == 12.935 and float(exact[2]) == 77.6245
    public = q("SELECT address, lat, lng FROM public.vehicles WHERE id = %s", [world.vehicle])[0]
    assert public[0] == "Indiranagar" and float(public[1]) == 12.94 and float(public[2]) == 77.62


def test_customer_cannot_write_the_private_location(world):
    res = api(world.c, table="vehicle_locations", action="update", values={"address": "x"},
              filters=[["vehicle_id", "eq", str(world.vehicle)]])
    assert res.status_code >= 400
