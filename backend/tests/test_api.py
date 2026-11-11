"""The HTTP API the frontend uses: auth, table queries, functions, files, actions."""

import hashlib
import hmac
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from rest_framework.test import APIClient

from payments.trip_window import handover_gate

pytestmark = pytest.mark.django_db
User = get_user_model()


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def client_for(user=None):
    c = APIClient()
    if user is not None:
        res = c.post("/api/auth/signin/", {"email": user.email, "password": "secret123"}, format="json")
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['session']['access_token']}")
    return c


@pytest.fixture
def alice():
    return User.objects.create_user("alice@example.com", "secret123", full_name="Alice")


@pytest.fixture
def bob():
    return User.objects.create_user("bob@example.com", "secret123", full_name="Bob")


def select(client, table, **extra):
    return client.post("/api/query/", {"table": table, **extra}, format="json")


# -- auth ------------------------------------------------------------------------

def test_signup_creates_profile_and_customer_role():
    res = APIClient().post("/api/auth/signup/", {
        "email": "New@Example.com", "password": "secret123", "data": {"full_name": "New Person"}}, format="json")
    assert res.status_code == 200, res.json()
    user = res.json()["user"]
    assert user["email"] == "new@example.com"
    assert user["user_metadata"]["full_name"] == "New Person"
    assert res.json()["session"]["access_token"]
    assert q("SELECT role::text FROM public.user_roles WHERE user_id = %s", [user["id"]]) == [("customer",)]


def test_signup_rejects_duplicates_and_short_passwords(alice):
    c = APIClient()
    assert c.post("/api/auth/signup/", {"email": alice.email, "password": "secret123"}, format="json").json()["message"] \
        == "User already registered"
    assert c.post("/api/auth/signup/", {"email": "x@example.com", "password": "123"}, format="json").status_code == 422


def test_signin_refresh_and_signout(alice):
    c = APIClient()
    assert c.post("/api/auth/signin/", {"email": alice.email, "password": "wrong"}, format="json").json()["message"] \
        == "Invalid login credentials"
    session = c.post("/api/auth/signin/", {"email": alice.email, "password": "secret123"}, format="json").json()["session"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    assert c.get("/api/auth/user/").json()["id"] == str(alice.id)

    renewed = APIClient().post("/api/auth/refresh/", {"refresh_token": session["refresh_token"]}, format="json")
    assert renewed.status_code == 200
    # The old refresh token was rotated out.
    assert APIClient().post("/api/auth/refresh/", {"refresh_token": session["refresh_token"]}, format="json").status_code == 401

    new_refresh = renewed.json()["refresh_token"]
    assert APIClient().post("/api/auth/signout/", {"refresh_token": new_refresh}, format="json").status_code == 204
    assert APIClient().post("/api/auth/refresh/", {"refresh_token": new_refresh}, format="json").status_code == 401


def test_password_reset_round_trip(alice, settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    APIClient().post("/api/auth/password-reset/", {"email": alice.email}, format="json")
    APIClient().post("/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json")
    assert len(mail.outbox) == 1
    link = next(w for w in mail.outbox[0].body.split() if "reset-password" in w)
    params = dict(p.split("=", 1) for p in link.split("?", 1)[1].split("&"))
    res = APIClient().post("/api/auth/password-reset/confirm/", {**params, "password": "newsecret"}, format="json")
    assert res.status_code == 200
    alice.refresh_from_db()
    assert alice.check_password("newsecret")
    # A used link stops working: the token depends on the password.
    again = APIClient().post("/api/auth/password-reset/confirm/", {**params, "password": "another1"}, format="json")
    assert again.status_code == 400


# -- table queries -------------------------------------------------------------

def test_rows_follow_row_level_security(alice, bob):
    q("INSERT INTO public.notifications (user_id, title, body) VALUES (%s, 'hi', 'there')", [alice.id])
    assert len(select(client_for(alice), "notifications").json()["data"]) == 1
    assert select(client_for(bob), "notifications").json()["data"] == []
    assert select(client_for(), "wallets").status_code in (200, 400)  # anon: nothing or denied
    assert not (select(client_for(), "wallets").json().get("data") or [])


def test_filters_order_count_and_single(alice):
    for i in range(3):
        q("INSERT INTO public.notifications (user_id, title, body) VALUES (%s, %s, 'b')", [alice.id, f"t{i}"])
    c = client_for(alice)
    res = select(c, "notifications", select="title", filters=[["title", "in", ["t0", "t2"]]],
                 order=[["title", False, None]], count="exact").json()
    assert [r["title"] for r in res["data"]] == ["t2", "t0"] and res["count"] == 2
    res = select(c, "notifications", filters=[["or", "title.eq.t1,title.eq.t9"]], single="one").json()
    assert res["data"]["title"] == "t1"
    many = select(c, "notifications", single="one")
    assert many.status_code == 406 and many.json()["code"] == "PGRST116"
    assert select(c, "notifications", filters=[["title", "eq", "zzz"]], single="maybe").json()["data"] is None


def test_unknown_names_are_rejected(alice):
    c = client_for(alice)
    assert select(c, "pg_authid").status_code == 404
    assert select(c, "notifications", select="password").json()["code"] == "PGRST204"
    assert select(c, "notifications", filters=[["title", "drop table", 1]]).status_code == 400
    bad_value = select(c, "notifications", filters=[["title", "eq", "x'); DROP TABLE public.notifications; --"]])
    assert bad_value.status_code == 200 and bad_value.json()["data"] == []


def test_writes_embeds_and_database_errors(alice, bob):
    with connection.cursor() as c:
        c.execute("UPDATE public.profiles SET dl_status = 'approved' WHERE id = %s", [bob.id])
        c.execute("INSERT INTO public.vendors (id, business_name) VALUES (%s, 'Alice Rentals')", [alice.id])
        c.execute("""INSERT INTO public.vehicles (vendor_id, title, brand, model, year, category, city, price_daily, status)
                     VALUES (%s, 'Swift', 'Maruti', 'Swift', 2022, 'car', 'Bengaluru', 1000, 'active') RETURNING id""",
                  [alice.id])
        vehicle_id = c.fetchone()[0]
    booking = {"vehicle_id": str(vehicle_id), "vendor_id": str(alice.id), "customer_id": str(bob.id),
               "start_date": "2030-01-10", "end_date": "2030-01-11", "base_price": 1, "total_price": 1}
    res = client_for(bob).post("/api/query/", {"table": "bookings", "action": "insert", "values": booking,
                                               "select": "id, total_price", "single": "one"}, format="json")
    assert res.status_code == 200, res.json()
    created = res.json()["data"]
    assert created["total_price"] > 1  # repriced by the database, not the client
    # Many-to-one embed, read by the host (a draft vehicle is hidden from customers).
    hosted = select(client_for(alice), "bookings", select="id, vehicles:vehicle_id(title)").json()["data"]
    assert hosted == [{"id": created["id"], "vehicles": {"title": "Swift"}}]

    # Same dates again: the database rejects it, and the message reaches the UI unchanged.
    again = client_for(bob).post("/api/query/", {"table": "bookings", "action": "insert", "values": booking}, format="json")
    assert again.status_code == 400 and again.json()["message"] == "Vehicle not available for selected dates"

    # One-to-many embed from the other side.
    vehicles = select(client_for(alice), "vehicles", select="title, bookings(id)").json()["data"]
    assert vehicles[0]["bookings"] == [{"id": created["id"]}]

    upd = client_for(alice).post("/api/query/", {"table": "vehicles", "action": "update", "values": {"title": "Swift VXi"},
                                                 "filters": [["id", "eq", str(vehicle_id)]]}, format="json")
    assert upd.status_code == 200
    unfiltered = client_for(alice).post("/api/query/", {"table": "vehicles", "action": "delete"}, format="json")
    assert unfiltered.status_code == 400


# -- functions -------------------------------------------------------------------

def test_rpc_runs_with_grants(alice):
    c = client_for(alice)
    assert c.post("/api/rpc/has_role/", {"_user_id": str(alice.id), "_role": "customer"}, format="json").json()["data"] is True
    denied = c.post("/api/rpc/wallet_apply/", {"_user_id": str(alice.id), "_amount": 1000, "_kind": "topup"}, format="json")
    assert denied.status_code == 400 and denied.json()["code"] == "42501"
    assert c.post("/api/rpc/no_such_function/", {}, format="json").status_code == 404


# -- files -----------------------------------------------------------------------

def test_private_files_follow_bucket_policies(alice, bob, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    path = f"{alice.id}/licence.jpg"
    up = client_for(alice).post("/api/storage/kyc-docs/upload/",
                                {"path": path, "file": SimpleUploadedFile("l.jpg", b"jpeg-bytes")}, format="multipart")
    assert up.status_code == 200, up.json()
    # Uploading into someone else's folder is refused.
    other = client_for(bob).post("/api/storage/kyc-docs/upload/",
                                 {"path": path.replace(str(alice.id), str(bob.id) + "/../" + str(alice.id)),
                                  "file": SimpleUploadedFile("l.jpg", b"x")}, format="multipart")
    assert other.status_code == 400

    signed = client_for(alice).post("/api/storage/kyc-docs/sign/", {"paths": [path], "expiresIn": 60}, format="json").json()
    assert signed[0]["signedUrl"]
    assert b"".join(APIClient().get(signed[0]["signedUrl"]).streaming_content) == b"jpeg-bytes"
    assert client_for(bob).post("/api/storage/kyc-docs/sign/", {"paths": [path]}, format="json").json()[0]["signedUrl"] is None
    assert APIClient().get(f"/api/storage/public/kyc-docs/{path}").status_code == 404


# -- server actions ---------------------------------------------------------------

def test_actions_need_login_and_a_valid_signature(alice, settings):
    settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET = "rzp_test", "secret"
    assert APIClient().post("/api/fn/verifyWalletTopup/", {}, format="json").status_code == 401
    proof = {"razorpay_order_id": "order_1", "razorpay_payment_id": "pay_1", "razorpay_signature": "0" * 64}
    res = client_for(alice).post("/api/fn/verifyWalletTopup/", proof, format="json")
    assert res.json()["message"] == "Invalid payment signature"

    good = hmac.new(b"secret", b"order_1|pay_1", hashlib.sha256).hexdigest()
    q("INSERT INTO public.wallet_topups (user_id, amount, status, razorpay_order_id) VALUES (%s, 250, 'created', 'order_1')",
      [alice.id])
    res = client_for(alice).post("/api/fn/verifyWalletTopup/", {**proof, "razorpay_signature": good}, format="json")
    assert res.json()["data"] == {"ok": True, "alreadyCredited": False, "newBalance": 250.0}
    again = client_for(alice).post("/api/fn/verifyWalletTopup/", {**proof, "razorpay_signature": good}, format="json")
    assert again.json()["data"]["alreadyCredited"] is True


def test_public_qr_lookup_returns_none_for_unknown_codes():
    res = APIClient().post("/api/fn/getBookingByQr/", {"code": str(uuid.uuid4())}, format="json")
    assert res.status_code == 200 and res.json()["data"] is None


# -- trip window (same cases as frontend/src/lib/trip-window.test.ts) --------------

BASE = {"status": "confirmed", "payment_status": "paid", "start_date": "2026-08-20", "end_date": "2026-08-22",
        "pickup_time": "10:00", "dropoff_time": "18:00"}
IST = ZoneInfo("Asia/Kolkata")


@pytest.mark.parametrize("booking, now, can_checkin, can_checkout", [
    (BASE, datetime(2026, 8, 19, 10, 0, tzinfo=IST), False, False),
    (BASE, datetime(2026, 8, 20, 9, 40, tzinfo=IST), True, False),
    ({**BASE, "payment_status": "pending"}, datetime(2026, 8, 20, 11, 0, tzinfo=IST), False, False),
    ({**BASE, "pickup_checked_at": "2026-08-20T10:00:00Z"}, datetime(2026, 8, 21, 10, 0, tzinfo=IST), False, True),
])
def test_handover_gate(booking, now, can_checkin, can_checkout):
    gate = handover_gate(booking, now)
    assert (gate["canCheckin"], gate["canCheckout"]) == (can_checkin, can_checkout)


def test_handover_gate_explains_when_check_in_opens():
    gate = handover_gate(BASE, datetime(2026, 8, 19, 10, 0, tzinfo=IST))
    assert gate["checkinReason"] == "Check-in opens 20 Aug, 9:30 am (30 minutes before pickup)."
