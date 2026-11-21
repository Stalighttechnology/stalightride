"""Providers see only what they earn, never the customer's total, fees or deposit (migration 0037)."""

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


def login(user):
    c = APIClient()
    res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


def api(client, **body):
    return client.post("/api/query/", body, format="json")


@pytest.fixture
def paid(db):
    """A paid ₹2,000 rental with a ₹3,000 deposit: customer pays 5,118, host earns 1,764."""
    class W:
        pass

    w = W()
    for name in ("host", "cust", "admin", "other"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s", [w.cust.id])
    q("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Host Co')", [w.host.id])
    vehicle = uuid.uuid4()
    q("""INSERT INTO public.vehicles (id, vendor_id, title, category, brand, model, year, city, price_daily, security_deposit)
         VALUES (%s, %s, 'Swift', 'car', 'Maruti', 'Swift', 2024, 'Mumbai', 2000, 3000)""", [vehicle, w.host.id])
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(w.admin.id)])
    q("UPDATE public.vehicles SET status = 'active', verification_status = 'approved' WHERE id = %s", [vehicle])
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    w.c, w.h, w.o = login(w.cust), login(w.host), login(w.other)
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
    w.total, w.earning = q("SELECT total_price, provider_earning FROM public.bookings WHERE id = %s", [w.booking])[0]
    assert w.total > w.earning
    return w


def test_host_payment_notification_quotes_only_the_earning(paid):
    body = q("""SELECT body FROM public.notifications WHERE user_id = %s AND title = 'Payment received'
                ORDER BY created_at DESC LIMIT 1""", [paid.host.id])[0][0]
    assert f"Rs {paid.earning}" in body
    assert str(paid.total) not in body


def test_qr_lookup_shows_money_by_viewer(paid):
    def money(client):
        r = client.post("/api/fn/getBookingByQr/", {"code": paid.booking}, format="json")
        assert r.status_code == 200, r.json()
        d = r.json()["data"]
        return {k: d.get(k) for k in ("totalPrice", "basePrice", "securityDeposit", "providerEarning")}

    assert money(paid.c) == {"totalPrice": float(paid.total), "basePrice": 2000.0,
                             "securityDeposit": 3000.0, "providerEarning": None}
    assert money(paid.h) == {"totalPrice": None, "basePrice": None, "securityDeposit": None,
                             "providerEarning": float(paid.earning)}
    assert money(paid.o) == dict.fromkeys(("totalPrice", "basePrice", "securityDeposit", "providerEarning"))


def test_handover_lookup_gives_the_host_only_the_earning(paid):
    r = paid.h.post("/api/fn/resolveHandoverCode/", {"code": paid.booking}, format="json")
    assert r.status_code == 200, r.json()
    b = r.json()["data"]["booking"]
    assert "total_price" not in b and float(b["provider_earning"]) == float(paid.earning)


def test_provider_payment_notifications_never_quote_the_customer_total(db):
    for fn in ("tg_notify_booking", "tg_notify_driver_booking"):
        body = q("SELECT pg_get_functiondef(%s::regproc)", [f"public.{fn}"])[0][0]
        received = body[body.index("'Payment received'"):].split(";")[0]
        assert "provider_earning" in received and "total_price" not in received, fn
