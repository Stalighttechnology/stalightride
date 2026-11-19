"""Bookings never overlap (migration 0020). Moved here from the launch gates for GAP-02, 03, 10 and 18."""

import threading
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
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


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


def insert(c, table, values):
    return c.post("/api/query/", {"table": table, "action": "insert", "values": values}, format="json")


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
        "start_date": day(start), "end_date": day(end), "base_price": 1, "total_price": 1, **extra})


def test_second_customer_cannot_request_taken_dates(world):
    assert request(world, world.c, world.cust).status_code == 200
    second = request(world, world.c2, world.cust2, start=11, end=12)
    assert second.status_code == 400 and second.json()["message"] == "Vehicle not available for selected dates"


def test_new_request_always_starts_pending(world):
    res = world.c.post("/api/query/", {"table": "bookings", "action": "insert", "select": "status", "single": "one",
                                       "values": {"vehicle_id": str(world.vehicle), "vendor_id": str(world.host.id),
                                                  "customer_id": str(world.cust.id), "start_date": day(10),
                                                  "end_date": day(11), "base_price": 1, "total_price": 1,
                                                  "status": "confirmed"}}, format="json")
    assert res.json()["data"]["status"] == "pending"


def test_host_cannot_block_dates_that_have_a_booking(world):
    assert request(world, world.c, world.cust).status_code == 200
    blocked = insert(world.h, "availability_blocks", {"vehicle_id": str(world.vehicle), "start_date": day(11),
                                                     "end_date": day(11)})
    assert blocked.status_code == 400
    assert blocked.json()["message"] == "These dates already have a booking. Decline or cancel it first"


def test_past_dates_and_paused_vehicles_are_refused(world):
    assert request(world, world.c, world.cust, start=-5, end=-4).json()["message"] == "Pickup date cannot be in the past"
    q("UPDATE public.vehicles SET status = 'paused' WHERE id = %s", [world.vehicle])
    assert request(world, world.c, world.cust).json()["message"] == "This vehicle is not available for booking"


def test_two_simultaneous_requests_make_exactly_one_booking(django_db_setup):
    """Two real connections insert at the same moment; the vehicle lock and the EXCLUDE constraint let one win."""
    s = connection.settings_dict
    params = {"dbname": s["NAME"], "user": s["USER"], "password": s["PASSWORD"],
              "host": s["HOST"] or None, "port": s["PORT"] or None}
    ids = {k: uuid.uuid4() for k in ("host", "a", "b", "admin", "vehicle")}
    people = [ids[k] for k in ("host", "a", "b", "admin")]
    with psycopg.connect(**params, autocommit=True) as setup:
        for p in people:
            setup.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", [p, f"race-{p}@example.com"])
        setup.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [ids["admin"]])
        setup.execute("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = ANY(%s)",
                      [[ids["a"], ids["b"]]])
        setup.execute("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Race Host')", [ids["host"]])
        setup.execute("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily)
                         VALUES (%s, %s, 'Race Car', 'car', 'Maruti', 'Swift', 2024, 'Mumbai', 2000)""",
                      [ids["vehicle"], ids["host"]])
        with setup.transaction():
            setup.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(ids["admin"])])
            setup.execute("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s",
                          [ids["vehicle"]])

        start = threading.Barrier(2)
        results = {}

        def book(customer):
            try:
                with psycopg.connect(**params) as c:
                    c.execute("SELECT set_config('role', 'authenticated', true), "
                              "set_config('request.jwt.claim.sub', %s, true)", [str(customer)])
                    start.wait()
                    c.execute("""INSERT INTO public.bookings (vehicle_id, vendor_id, customer_id, start_date, end_date,
                                 base_price, total_price) VALUES (%s, %s, %s, %s, %s, 1, 1)""",
                              [ids["vehicle"], ids["host"], customer, day(20), day(21)])
                    c.commit()
                results[customer] = "ok"
            except psycopg.Error as e:
                results[customer] = e.diag.message_primary

        try:
            threads = [threading.Thread(target=book, args=(ids[k],)) for k in ("a", "b")]
            for t in threads:
                t.start()
            for t in threads:
                t.join(30)
            assert sorted(results.values()) == ["Vehicle not available for selected dates", "ok"], results
            rows = setup.execute("SELECT count(*) FROM public.bookings WHERE vehicle_id = %s", [ids["vehicle"]]).fetchone()
            assert rows[0] == 1
        finally:
            setup.execute("DELETE FROM public.bookings WHERE vehicle_id = %s", [ids["vehicle"]])
            setup.execute("DELETE FROM public.vehicles WHERE id = %s", [ids["vehicle"]])
            setup.execute("DELETE FROM auth.users WHERE id = ANY(%s)", [people])
