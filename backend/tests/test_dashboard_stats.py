import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")
pytestmark = pytest.mark.django_db


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def client_for(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    token = res.json()["session"]["access_token"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


@pytest.fixture
def env(db):
    class E:
        pass

    e = E()
    e.host1 = User.objects.create_user("host1@example.com", "secret123", full_name="Host One")
    e.host2 = User.objects.create_user("host2@example.com", "secret123", full_name="Host Two")
    e.cust = User.objects.create_user("cust@example.com", "secret123", full_name="Customer")
    e.driver1 = User.objects.create_user("driver1@example.com", "secret123", full_name="Driver One")
    e.driver2 = User.objects.create_user("driver2@example.com", "secret123", full_name="Driver Two")
    e.center1 = User.objects.create_user("center1@example.com", "secret123", full_name="Center One")
    e.center2 = User.objects.create_user("center2@example.com", "secret123", full_name="Center Two")
    e.admin = User.objects.create_user("admin@example.com", "secret123", full_name="Admin")

    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [e.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s", [e.cust.id])

    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Vendor One'), (%s, 'Vendor Two')",
      [e.host1.id, e.host2.id])
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'vendor'), (%s, 'vendor') ON CONFLICT (user_id, role) DO NOTHING",
      [e.host1.id, e.host2.id])

    e.v1 = uuid.uuid4()
    e.v2 = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, status, verification_status)
         VALUES (%s, %s, 'Car 1', 'car', 'Maruti', 'Swift', 2024, 'Bangalore', 2000, 'active', 'approved'),
                (%s, %s, 'Car 2', 'car', 'Hyundai', 'i20', 2024, 'Bangalore', 2500, 'active', 'approved')""",
      [e.v1, e.host1.id, e.v2, e.host2.id])

    q("INSERT INTO public.drivers (id, full_name, phone, city, daily_rate) VALUES (%s, 'D1', '9999999991', 'Bangalore', 1000), (%s, 'D2', '9999999992', 'Bangalore', 1000)",
      [e.driver1.id, e.driver2.id])
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(e.admin.id)])
    q("UPDATE public.drivers SET verification_status = 'approved', status = 'active' WHERE id = ANY(%s)",
      [[e.driver1.id, e.driver2.id]])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")

    q("INSERT INTO public.wash_centers (id, name, city, verification_status, active) VALUES (%s, 'Spa 1', 'Bangalore', 'approved', true), (%s, 'Spa 2', 'Bangalore', 'approved', true)",
      [e.center1.id, e.center2.id])
    q("INSERT INTO public.wash_vendors (id, name, contact_phone, city) VALUES (%s, 'Spa 1', '9888888881', 'Bangalore'), (%s, 'Spa 2', '9888888882', 'Bangalore')",
      [e.center1.id, e.center2.id])
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'wash_center'), (%s, 'wash_center') ON CONFLICT (user_id, role) DO NOTHING",
      [e.center1.id, e.center2.id])

    return e


def test_host_dashboard_stats(env):
    b1, b2, b3, b4 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    q("""INSERT INTO public.bookings (id, customer_id, vehicle_id, vendor_id, start_date, end_date)
         VALUES (%s, %s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s, %s)""",
      [b1, env.cust.id, env.v1, env.host1.id, day(10), day(11),
       b2, env.cust.id, env.v1, env.host1.id, day(1), day(3),
       b3, env.cust.id, env.v1, env.host1.id, day(5), day(6),
       b4, env.cust.id, env.v2, env.host2.id, day(2), day(4)])

    q("UPDATE public.bookings SET status = 'pending', payment_status = 'unpaid', provider_earning = 1800 WHERE id = %s", [b1])
    q("UPDATE public.bookings SET status = 'completed', payment_status = 'paid', provider_earning = 3600, paid_at = now() WHERE id = %s", [b2])
    q("UPDATE public.bookings SET status = 'cancelled', payment_status = 'refunded', provider_earning = 1800 WHERE id = %s", [b3])
    q("UPDATE public.bookings SET status = 'completed', payment_status = 'paid', provider_earning = 5000, paid_at = now() WHERE id = %s", [b4])

    h1_client = client_for(env.host1)
    res1 = h1_client.post("/api/rpc/host_dashboard_stats/", {}, format="json")
    assert res1.status_code == 200, res1.json()
    d1 = res1.json()["data"]

    assert d1["total_bookings"] == 3
    assert d1["pending_count"] == 1
    assert d1["completed_count"] == 1
    assert d1["cancelled_count"] == 1
    assert d1["earnings"] == 3600
    assert d1["paid_count"] == 1
    assert len(d1["monthly"]) == 6
    curr_month = datetime.now(IST).strftime("%Y-%m")
    curr_stat = next(m for m in d1["monthly"] if m["month"] == curr_month)
    assert curr_stat["total"] == 3600

    # Host 2 checks (isolation between hosts)
    h2_client = client_for(env.host2)
    res2 = h2_client.post("/api/rpc/host_dashboard_stats/", {}, format="json")
    assert res2.status_code == 200
    d2 = res2.json()["data"]
    assert d2["total_bookings"] == 1
    assert d2["earnings"] == 5000
    assert d2["paid_count"] == 1


def test_driver_dashboard_stats(env):
    db1, db2, db3, db4 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    q("""INSERT INTO public.driver_bookings (id, customer_id, driver_id, start_date, end_date)
         VALUES (%s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s),
                (%s, %s, %s, %s, %s)""",
      [db1, env.cust.id, env.driver1.id, day(10), day(11),
       db2, env.cust.id, env.driver1.id, day(2), day(3),
       db3, env.cust.id, env.driver1.id, day(5), day(6),
       db4, env.cust.id, env.driver2.id, day(1), day(2)])

    q("UPDATE public.driver_bookings SET status = 'pending', payment_status = 'unpaid', provider_earning = 900 WHERE id = %s", [db1])
    q("UPDATE public.driver_bookings SET status = 'confirmed', payment_status = 'paid', provider_earning = 1800 WHERE id = %s", [db2])
    q("UPDATE public.driver_bookings SET status = 'completed', payment_status = 'paid', provider_earning = 1500 WHERE id = %s", [db3])
    q("UPDATE public.driver_bookings SET status = 'completed', payment_status = 'paid', provider_earning = 3000 WHERE id = %s", [db4])

    d1_client = client_for(env.driver1)
    res1 = d1_client.post("/api/rpc/driver_dashboard_stats/", {}, format="json")
    assert res1.status_code == 200
    s1 = res1.json()["data"]
    assert s1["total"] == 3
    assert s1["pending_count"] == 1
    assert s1["upcoming_count"] == 1
    assert s1["earnings"] == 3300

    # Driver 2 checks (isolation between drivers)
    d2_client = client_for(env.driver2)
    res2 = d2_client.post("/api/rpc/driver_dashboard_stats/", {}, format="json")
    assert res2.status_code == 200
    s2 = res2.json()["data"]
    assert s2["total"] == 1
    assert s2["earnings"] == 3000


def test_wash_center_dashboard_stats(env):
    service_id = uuid.uuid4()
    q("""INSERT INTO public.wash_services (id, name, duration_minutes, vehicle_category, price, active)
         VALUES (%s, 'Basic Wash', 30, 'car', 400, true)""", [service_id])

    wb1, wb2, wb3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    q("""INSERT INTO public.wash_bookings (id, customer_id, service_id, city, address, slot_date, slot_time)
         VALUES (%s, %s, %s, 'Bangalore', 'Addr 1', %s, '10:00:00'),
                (%s, %s, %s, 'Bangalore', 'Addr 2', %s, '11:00:00'),
                (%s, %s, %s, 'Bangalore', 'Addr 3', %s, '14:00:00')""",
      [wb1, env.cust.id, service_id, day(1),
       wb2, env.cust.id, service_id, day(2),
       wb3, env.cust.id, service_id, day(3)])

    q("UPDATE public.wash_bookings SET assigned_vendor_id = %s, status = 'confirmed', payment_status = 'paid' WHERE id = %s", [env.center1.id, wb1])
    q("UPDATE public.wash_bookings SET assigned_vendor_id = %s, status = 'completed', payment_status = 'paid' WHERE id = %s", [env.center1.id, wb2])
    q("UPDATE public.wash_bookings SET assigned_vendor_id = %s, status = 'confirmed', payment_status = 'paid' WHERE id = %s", [env.center2.id, wb3])

    c1 = client_for(env.center1)
    res1 = c1.post("/api/rpc/wash_center_dashboard_stats/", {}, format="json")
    assert res1.status_code == 200, res1.json()
    st1 = res1.json()["data"]
    assert st1["active"] == 1
    assert st1["completed"] == 1

    # Center 2 checks (isolation between centers)
    c2 = client_for(env.center2)
    res2 = c2.post("/api/rpc/wash_center_dashboard_stats/", {}, format="json")
    assert res2.status_code == 200
    st2 = res2.json()["data"]
    assert st2["active"] == 1
    assert st2["completed"] == 0
