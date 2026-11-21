"""Server-side actions the browser must not do itself: Razorpay orders and
signature checks, wallet top-up, trip handover codes and inspection.

Ported one-to-one from the old server functions (same inputs, checks, error
messages and outputs). Reads run as the signed-in user, so row-level security
applies; writes to locked payment and handover columns run as service_role
after the checks.
"""

import base64
import hashlib
import hmac
import json
import random
import re
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta

from django.conf import settings
from django.db import DatabaseError, connection, transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.db import db_role
from core.query import QueryError, run, run_rpc
from core.views import pg_error
from .trip_window import handover_gate


class FnError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


# -- helpers -------------------------------------------------------------------

def _get(table, select, col, value):
    return run({"table": table, "select": select, "filters": [[col, "eq", value]], "single": "maybe"})[0]


def _update(table, values, filters):
    run({"table": table, "action": "update", "values": values, "filters": filters})


def _now():
    return datetime.now(timezone.utc).isoformat()


def _is_admin(user_id):
    return run_rpc("has_role", {"_user_id": user_id, "_role": "admin"}) is True


def _uuid(data, key):
    try:
        return str(uuid.UUID(str(data.get(key))))
    except ValueError:
        raise FnError(f"Invalid input: {key} must be a UUID")


def _text(data, key, lo=1, hi=None):
    v = data.get(key)
    if not isinstance(v, str) or len(v) < lo or (hi is not None and len(v) > hi):
        raise FnError(f"Invalid input: {key}")
    return v


def _int(data, key, lo, hi):
    v = data.get(key)
    if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
        raise FnError(f"Invalid input: {key}")
    return v


def _paise(rupees):
    return int(float(rupees) * 100 + 0.5)  # Math.round, as before


def _credentials():
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise FnError("Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.")
    return settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET


def _create_order(body, failure):
    key_id, secret = _credentials()
    auth = base64.b64encode(f"{key_id}:{secret}".encode()).decode()
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders", data=json.dumps(body).encode(), method="POST",
        headers={"content-type": "application/json", "Authorization": f"Basic {auth}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            order = json.loads(res.read())
    except urllib.error.HTTPError as e:
        raise FnError(f"{failure} [{e.code}]: {e.read().decode(errors='replace')}")
    return {"orderId": order["id"], "amount": order["amount"], "currency": order["currency"], "keyId": key_id}


def _check_signature(data):
    _, secret = _credentials()
    order_id, payment_id = _text(data, "razorpay_order_id"), _text(data, "razorpay_payment_id")
    expected = hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(_text(data, "razorpay_signature").encode(), expected.encode()):
        raise FnError("Invalid payment signature")
    return order_id, payment_id


def _paid_patch(payment_id):
    return {"payment_status": "paid", "payment_method": "razorpay", "razorpay_payment_id": payment_id, "paid_at": _now()}


# -- rentals -------------------------------------------------------------------

def _parse_dt(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    return None


def _refund_late_rental_payment(b, payment_id):
    """Refund payment for a cancelled/rejected booking to customer wallet under service_role. Idempotent."""
    if b.get("payment_status") in ("paid", "refunded", "partially_refunded"):
        return
    with db_role("service_role"):
        with connection.cursor() as cur:
            cur.execute(
                "SELECT public.wallet_apply(%s, %s, 'refund', %s, %s, 'Refund: payment arrived after booking closed')",
                [b["customer_id"], b["total_price"], b["id"], payment_id],
            )
            cur.execute(
                """UPDATE public.bookings
                   SET payment_status = 'refunded',
                       payment_method = 'razorpay',
                       razorpay_payment_id = %s,
                       refund_amount = %s
                   WHERE id = %s""",
                [payment_id, b["total_price"], b["id"]],
            )
            cur.execute(
                """INSERT INTO public.notifications (user_id, title, body, link)
                   VALUES (%s, %s, %s, %s)""",
                [
                    b["customer_id"],
                    "Payment refunded",
                    f"Your payment of Rs {b['total_price']} was refunded to your wallet because the booking was closed.",
                    "/bookings",
                ],
            )


def create_razorpay_order(data, user_id):
    booking_id = _uuid(data, "bookingId")
    b = _get("bookings", "id, customer_id, status, payment_status, total_price, razorpay_order_id, pay_by", "id", booking_id)
    if not b:
        raise FnError("Booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("Host has not accepted this booking yet")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    pay_by = _parse_dt(b.get("pay_by"))
    if pay_by and pay_by <= datetime.now(timezone.utc) + timedelta(minutes=5):
        raise FnError("Payment window has closed or expires in less than 5 minutes")
    order = _create_order({"amount": _paise(b["total_price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_razorpay_payment(data, user_id):
    booking_id = _uuid(data, "bookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("bookings", "id, customer_id, status, payment_status, razorpay_order_id, total_price, razorpay_payment_id", "id", booking_id)
    if not b:
        raise FnError("Booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b.get("razorpay_order_id") != order_id:
        raise FnError("Order mismatch")
    if b.get("status") in ("cancelled", "rejected"):
        _refund_late_rental_payment(b, payment_id)
        return {"ok": True}
    if b.get("payment_status") in ("paid", "refunded", "partially_refunded"):
        return {"ok": True}
    with db_role("service_role"):
        _update("bookings", _paid_patch(payment_id), [["id", "eq", b["id"]]])
    return {"ok": True}


# -- driver hire ---------------------------------------------------------------

def _refund_late_driver_payment(b, payment_id):
    if b.get("payment_status") == "refunded" and b.get("razorpay_payment_id") == payment_id:
        return
    with db_role("service_role"):
        with connection.cursor() as cur:
            cur.execute(
                "SELECT public.wallet_apply(%s, %s, 'driver_refund', NULL, %s, 'Refund: payment arrived after driver hire closed')",
                [b["customer_id"], b["total_price"], str(b["id"])],
            )
            cur.execute(
                """UPDATE public.driver_bookings
                   SET payment_status = 'refunded',
                       payment_method = 'razorpay',
                       razorpay_payment_id = %s,
                       refund_amount = %s
                   WHERE id = %s""",
                [payment_id, b["total_price"], b["id"]],
            )
            cur.execute(
                """INSERT INTO public.notifications (user_id, title, body, link)
                   VALUES (%s, %s, %s, %s)""",
                [
                    b["customer_id"],
                    "Payment refunded",
                    f"Your payment of Rs {b['total_price']} was refunded to your wallet because the driver hire was closed.",
                    "/hires",
                ],
            )


def create_driver_razorpay_order(data, user_id):
    hire_id = _uuid(data, "driverBookingId")
    b = _get("driver_bookings", "id, customer_id, status, payment_status, total_price, pay_by", "id", hire_id)
    if not b:
        raise FnError("Hire not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("Driver has not accepted this request yet")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    pay_by = _parse_dt(b.get("pay_by"))
    if pay_by and pay_by <= datetime.now(timezone.utc) + timedelta(minutes=5):
        raise FnError("Payment window has closed or expires in less than 5 minutes")
    order = _create_order({"amount": _paise(b["total_price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"driver_booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("driver_bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_driver_razorpay_payment(data, user_id):
    hire_id = _uuid(data, "driverBookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("driver_bookings", "id, customer_id, driver_id, total_price, status, payment_status, razorpay_order_id, razorpay_payment_id", "id", hire_id)
    if not b:
        raise FnError("Hire not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["razorpay_order_id"] != order_id:
        raise FnError("Order mismatch")
    if b.get("status") in ("cancelled", "rejected"):
        _refund_late_driver_payment(b, payment_id)
        return {"ok": True}
    if b.get("payment_status") in ("paid", "refunded", "partially_refunded"):
        return {"ok": True}
    with db_role("service_role"):
        # The driver's earning is credited when the hire completes (tg_money_settle_driver_booking).
        _update("driver_bookings", _paid_patch(payment_id), [["id", "eq", b["id"]]])
    return {"ok": True}


# -- washes --------------------------------------------------------------------

def _refund_late_wash_payment(b, payment_id):
    if b.get("payment_status") == "refunded" and b.get("razorpay_payment_id") == payment_id:
        return
    with db_role("service_role"):
        with connection.cursor() as cur:
            cur.execute(
                "SELECT public.wallet_apply(%s, %s, 'wash_refund', NULL, %s, 'Refund: payment arrived after wash booking closed')",
                [b["customer_id"], b["price"], str(b["id"])],
            )
            cur.execute(
                """UPDATE public.wash_bookings
                   SET payment_status = 'refunded',
                       payment_method = 'razorpay',
                       razorpay_payment_id = %s,
                       refund_amount = %s
                   WHERE id = %s""",
                [payment_id, b["price"], b["id"]],
            )
            cur.execute(
                """INSERT INTO public.notifications (user_id, title, body, link)
                   VALUES (%s, %s, %s, %s)""",
                [
                    b["customer_id"],
                    "Payment refunded",
                    f"Your payment of Rs {b['price']} was refunded to your wallet because the wash booking was closed.",
                    "/washes",
                ],
            )


def create_wash_razorpay_order(data, user_id):
    wash_id = _uuid(data, "washBookingId")
    b = _get("wash_bookings", "id, customer_id, status, payment_status, price, pay_by", "id", wash_id)
    if not b:
        raise FnError("Wash booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] not in ("pending", "confirmed"):
        raise FnError("Wash booking cannot be paid")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    pay_by = _parse_dt(b.get("pay_by"))
    if pay_by and pay_by <= datetime.now(timezone.utc) + timedelta(minutes=5):
        raise FnError("Payment window has closed or expires in less than 5 minutes")
    order = _create_order({"amount": _paise(b["price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"wash_booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("wash_bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_wash_razorpay_payment(data, user_id):
    wash_id = _uuid(data, "washBookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("wash_bookings", "id, customer_id, price, status, payment_status, razorpay_order_id, razorpay_payment_id, pay_by", "id", wash_id)
    if not b:
        raise FnError("Wash booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["razorpay_order_id"] != order_id:
        raise FnError("Order mismatch")
    
    pay_by = _parse_dt(b.get("pay_by"))
    is_late = (pay_by and pay_by < datetime.now(timezone.utc)) or b.get("status") in ("cancelled", "rejected")
    if is_late:
        _refund_late_wash_payment(b, payment_id)
        return {"ok": True}

    if b.get("payment_status") in ("paid", "refunded", "partially_refunded"):
        return {"ok": True}
    with db_role("service_role"):
        patch = _paid_patch(payment_id)
        patch["status"] = "confirmed"
        patch["progress"] = "confirmed"
        patch["paid_at"] = _now()
        _update("wash_bookings", patch, [["id", "eq", b["id"]], ["customer_id", "eq", user_id]])
    return {"ok": True}


# -- wallet --------------------------------------------------------------------

def create_wallet_topup_order(data, user_id):
    amount = data.get("amount")
    if not isinstance(amount, (int, float)) or isinstance(amount, bool) or not 0 < amount <= 200000:
        raise FnError("Invalid input: amount")
    amount = int(amount + 0.5)
    if amount < 1:
        raise FnError("Enter a valid amount")
    order = _create_order({"amount": amount * 100, "currency": "INR",
                           "notes": {"purpose": "wallet_topup", "user_id": user_id}}, "Could not start top-up")
    with db_role("service_role"):
        run({"table": "wallet_topups", "action": "insert", "values": {
            "user_id": user_id, "amount": amount, "status": "created", "razorpay_order_id": order["orderId"]}})
    return order


def verify_wallet_topup(data, user_id):
    order_id, payment_id = _check_signature(data)
    with db_role("service_role"):
        with connection.cursor() as c:
            c.execute(
                "SELECT id, user_id, amount, status FROM public.wallet_topups WHERE razorpay_order_id = %s FOR UPDATE",
                [order_id],
            )
            row = c.fetchone()
            if not row:
                raise FnError("Top-up not found")
            topup_id, topup_user_id, amount, status = row
            if str(topup_user_id) != str(user_id):
                raise FnError("Not your top-up")
            if status == "paid":
                w = _get("wallets", "balance", "user_id", user_id)
                return {"ok": True, "alreadyCredited": True, "newBalance": float((w or {}).get("balance") or 0)}
            if status == "failed":
                raise FnError("This top-up can no longer be completed")
            c.execute(
                "UPDATE public.wallet_topups SET status = 'paid', razorpay_payment_id = %s, updated_at = now() WHERE id = %s AND status = 'created'",
                [payment_id, topup_id],
            )
        balance = run_rpc("wallet_apply", {
            "_user_id": user_id, "_amount": amount, "_kind": "topup",
            "_reference": payment_id, "_description": "Money added to wallet"})
    return {"ok": True, "alreadyCredited": False, "newBalance": float(balance)}


# -- trip handover: the renter's photos and odometer, plus the host's code --------

# A 360-degree walk-around (four sides and four corners) plus one dashboard shot showing the odometer
# and fuel gauge, required at both check-in and check-out. The slot name starts the file name.
INSPECTION_SHOTS = ("front", "front_left", "driver_side", "rear_left", "rear", "rear_right",
                    "passenger_side", "front_right", "dashboard")
_MAX_CODE_ATTEMPTS = 5
_CODE_LOCK = timedelta(minutes=15)


def _inspection_photos(data, booking_id, phase):
    shots, extras = data.get("photos"), data.get("extraPhotos") or []
    if not isinstance(shots, dict) or not isinstance(extras, list) or len(extras) > 10:
        raise FnError("Invalid input: photos")
    prefix = f"{booking_id}/{phase}/"
    paths = []
    for shot in INSPECTION_SHOTS:
        p = shots.get(shot)
        if not isinstance(p, str) or not p.startswith(f"{prefix}{shot}-") or len(p) > 500:
            raise FnError(f"Add the {shot.replace('_', ' ')} photo.")
        paths.append(p)
    for p in extras:
        if not isinstance(p, str) or not p.startswith(prefix) or len(p) > 500:
            raise FnError("Invalid input: extraPhotos")
        paths.append(p)
    if len(set(paths)) != len(paths):
        raise FnError("Each photo must be a different picture.")
    return paths


def submit_inspection(data, user_id):
    """The renter photographs the car, enters the odometer and the code the host gives them.
    The check-in code starts the trip; the check-out code completes it, so a trip never
    starts or ends without the host."""
    booking_id = _uuid(data, "bookingId")
    phase = data.get("phase")
    if phase not in ("pickup", "return"):
        raise FnError("Invalid input: phase")
    odo = _int(data, "odo", 0, 3_000_000)
    code = _text(data, "code", 1, 20).strip()
    notes = data.get("notes")
    if notes is not None and (not isinstance(notes, str) or len(notes) > 2000):
        raise FnError("Invalid input: notes")
    paths = _inspection_photos(data, booking_id, phase)

    b = _get("bookings", "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, customer_id, "
             "pickup_checked_at, return_checked_at, pickup_odometer", "id", booking_id)
    if not b:
        raise FnError("Booking not found.")
    if user_id != b["customer_id"]:
        raise FnError("Only the renter records the check-in and check-out.")
    if b["status"] != "confirmed" or b["payment_status"] != "paid":
        raise FnError("The booking must be confirmed and paid first.")
    gate = handover_gate(b)
    if phase == "pickup":
        if b["pickup_checked_at"]:
            raise FnError("The trip has already started.")
        if not gate["canCheckin"]:
            raise FnError(gate["checkinReason"] or "Check-in is not open yet.")
    else:
        if not b["pickup_checked_at"]:
            raise FnError("Check in first.")
        if b["return_checked_at"]:
            raise FnError("The trip has already ended.")
        if b["pickup_odometer"] is not None and odo < b["pickup_odometer"]:
            raise FnError("Return odometer can't be lower than the pickup reading.")

    now = datetime.now(timezone.utc)
    where = [["booking_id", "eq", booking_id]]
    with db_role("service_role"):
        codes = _get("booking_handover_codes", "checkin_code, checkout_code, failed_attempts, locked_until",
                     "booking_id", booking_id)
        if not codes:
            raise FnError("No handover code exists for this booking. Contact support.")
        if codes["locked_until"] and datetime.fromisoformat(codes["locked_until"]) > now:
            return {"ok": False, "message": "Too many wrong codes. Try again in 15 minutes."}
        expected = codes["checkin_code" if phase == "pickup" else "checkout_code"]
        if not hmac.compare_digest(code, expected):
            attempts = codes["failed_attempts"] + 1
            locked = attempts >= _MAX_CODE_ATTEMPTS
            _update("booking_handover_codes", {
                "failed_attempts": 0 if locked else attempts,
                "locked_until": (now + _CODE_LOCK).isoformat() if locked else None,
            }, where)
            # Returned, not raised: an error response would roll back the attempt counter.
            return {"ok": False, "message": "Too many wrong codes. Try again in 15 minutes." if locked
                    else "That code is not right. Ask your host for the code."}
        _update("booking_handover_codes", {"failed_attempts": 0, "locked_until": None}, where)
        patch = {f"{phase}_odometer": odo, f"{phase}_photos": paths, f"{phase}_notes": notes or None,
                 f"{phase}_checked_at": now.isoformat()}
        if phase == "return":
            patch["status"] = "completed"
        _update("bookings", patch, [["id", "eq", booking_id]])
    return {"ok": True, "phase": phase}


# -- membership subscriptions ----------------------------------------------------

MEMBERSHIP_PRICES = {
    ("plus", "monthly"): 499,
    ("plus", "annual"): 4990,
    ("black", "monthly"): 1499,
    ("black", "annual"): 14990,
}


def create_membership_order(data, user_id):
    plan = data.get("plan")
    cycle = data.get("cycle", "monthly")
    if plan not in ("plus", "black") or cycle not in ("monthly", "annual"):
        raise FnError("Invalid plan or billing cycle.")
    price = MEMBERSHIP_PRICES.get((plan, cycle))
    if not price:
        raise FnError("Invalid membership plan selected.")
    order = _create_order(
        {
            "amount": price * 100,
            "currency": "INR",
            "notes": {
                "purpose": "membership_subscription",
                "user_id": user_id,
                "plan": plan,
                "cycle": cycle,
            },
        },
        "Could not initialize membership payment",
    )
    return order


def subscribe_membership(data, user_id):
    plan = data.get("plan")
    if plan == "free":
        with db_role("service_role"):
            _update("profiles", {
                "membership_plan": "free",
                "membership_cycle": "monthly",
                "membership_expires_at": None,
                "membership_auto_renew": False,
            }, [["id", "eq", user_id]])
        return {"ok": True, "plan": "free", "message": "Switched to Synchoo Standard."}

    cycle = data.get("cycle", "monthly")
    if plan not in ("plus", "black") or cycle not in ("monthly", "annual"):
        raise FnError("Invalid plan or billing cycle.")

    price = MEMBERSHIP_PRICES.get((plan, cycle))
    if not price:
        raise FnError("Invalid membership plan.")

    payment_method = data.get("payment_method", "wallet")
    payment_ref = None

    if payment_method == "wallet":
        with db_role("service_role"):
            w = _get("wallets", "balance", "user_id", user_id)
            bal = float((w or {}).get("balance") or 0)
            if bal < price:
                raise FnError(f"Insufficient wallet balance (₹{bal:,.2f}). Needed: ₹{price:,.2f}.")
            payment_ref = f"mem_wlt_{uuid.uuid4().hex[:12]}"
            run_rpc("wallet_apply", {
                "_user_id": user_id,
                "_amount": -price,
                "_kind": "membership_payment",
                "_reference": payment_ref,
                "_description": f"Synchoo {plan.title()} Membership ({cycle.capitalize()})",
            })
    elif payment_method == "razorpay":
        order_id = data.get("razorpay_order_id")
        payment_id = data.get("razorpay_payment_id")
        signature = data.get("razorpay_signature")
        if not order_id or not payment_id or not signature:
            raise FnError("Missing required Razorpay payment confirmation (order_id, payment_id, signature).")
        _check_signature(data)
        payment_ref = payment_id
    else:
        raise FnError("Invalid payment method.")

    now = datetime.now(timezone.utc)
    duration_days = 365 if cycle == "annual" else 30
    expires_at = now + timedelta(days=duration_days)

    with db_role("service_role"):
        _update("profiles", {
            "membership_plan": plan,
            "membership_cycle": cycle,
            "membership_started_at": now.isoformat(),
            "membership_expires_at": expires_at.isoformat(),
            "membership_auto_renew": True,
        }, [["id", "eq", user_id]])

        plan_display = "Synchoo Plus" if plan == "plus" else "Synchoo Black VIP"
        exp_display = expires_at.strftime("%d %b %Y")
        run_rpc("notify_user", {
            "_user_id": user_id,
            "_title": f"Welcome to {plan_display}!",
            "_body": f"Your VIP privileges are active until {exp_display}. Enjoy 0% platform convenience fees and exclusive perks.",
            "_link": "/membership",
        })

    return {
        "ok": True,
        "plan": plan,
        "cycle": cycle,
        "expiresAt": expires_at.isoformat(),
        "paymentReference": payment_ref,
        "message": f"Successfully activated {plan_display}!",
    }


def cancel_membership(data, user_id):
    with db_role("service_role"):
        _update("profiles", {"membership_auto_renew": False}, [["id", "eq", user_id]])
    return {
        "ok": True,
        "message": "Auto-renewal turned off. Your membership benefits will remain active until the end of your billing cycle.",
    }


def resume_membership(data, user_id):
    with db_role("service_role"):
        _update("profiles", {"membership_auto_renew": True}, [["id", "eq", user_id]])
    return {
        "ok": True,
        "message": "Auto-renewal enabled. Your subscription will renew automatically at the end of the billing period.",
    }


def get_membership_status(data, user_id):
    with db_role("service_role"):
        p = _get("profiles", "membership_plan, membership_cycle, membership_started_at, membership_expires_at, membership_auto_renew", "id", user_id)
        if not p:
            return {"plan": "free", "cycle": "monthly", "active": False, "expiresAt": None, "autoRenew": False}
        plan = p.get("membership_plan") or "free"
        expires_at_str = p.get("membership_expires_at")
        active = plan != "free"
        if active and expires_at_str:
            try:
                exp = datetime.fromisoformat(str(expires_at_str).replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                if now > exp:
                    # Expiration date reached: process real auto-renewal or expiry
                    auto_renew = bool(p.get("membership_auto_renew", False))
                    cycle = p.get("membership_cycle") or "monthly"
                    price = MEMBERSHIP_PRICES.get((plan, cycle), 499)
                    if auto_renew:
                        # Attempt wallet charge for automated recurring subscription
                        w = _get("wallets", "balance", "user_id", user_id)
                        wallet_bal = float(w.get("balance", 0)) if w else 0.0
                        if wallet_bal >= price:
                            payment_ref = f"mem_renew_{uuid.uuid4().hex[:10]}"
                            duration_days = 365 if cycle == "annual" else 30
                            new_exp = now + timedelta(days=duration_days)
                            run_rpc("wallet_apply", {
                                "_user_id": user_id,
                                "_amount": -price,
                                "_kind": "membership_payment",
                                "_reference": payment_ref,
                                "_description": f"Auto-Renewal: Synchoo {plan.title()} Membership ({cycle.capitalize()})",
                            })
                            _update("profiles", {
                                "membership_started_at": now.isoformat(),
                                "membership_expires_at": new_exp.isoformat(),
                                "membership_auto_renew": True,
                            }, [["id", "eq", user_id]])
                            run_rpc("notify_user", {
                                "_user_id": user_id,
                                "_title": f"Membership Auto-Renewed: {plan.title()}",
                                "_body": f"Your VIP membership has renewed for {duration_days} days. Next renewal date: {new_exp.strftime('%d %b %Y')}.",
                                "_link": "/membership",
                            })
                            expires_at_str = new_exp.isoformat()
                            active = True
                        else:
                            # Insufficient wallet balance for auto-renewal
                            _update("profiles", {
                                "membership_plan": "free",
                                "membership_auto_renew": False,
                            }, [["id", "eq", user_id]])
                            run_rpc("notify_user", {
                                "_user_id": user_id,
                                "_title": "Membership Auto-Renewal Failed",
                                "_body": f"Your {plan.title()} membership could not auto-renew due to insufficient wallet balance (required {price}). Your account has transitioned to Synchoo Standard.",
                                "_link": "/membership",
                            })
                            active = False
                            plan = "free"
                    else:
                        # Auto-renew was off - grace period concluded, switch to free
                        _update("profiles", {
                            "membership_plan": "free",
                            "membership_expires_at": None,
                        }, [["id", "eq", user_id]])
                        active = False
                        plan = "free"
            except Exception:
                pass
        return {
            "plan": plan if active else "free",
            "cycle": p.get("membership_cycle") or "monthly",
            "active": active,
            "startedAt": p.get("membership_started_at"),
            "expiresAt": expires_at_str if active else None,
            "autoRenew": bool(p.get("membership_auto_renew", True)),
        }


def get_rewards_summary(data, user_id):
    with db_role("service_role"):
        ledger_rows, _ = run({
            "table": "loyalty_ledger",
            "select": "id, amount, kind, title, description, created_at",
            "filters": [["user_id", "eq", user_id]],
            "order": [["created_at", False, False]],
        })

        if not ledger_rows:
            welcome_bonus = {
                "user_id": user_id,
                "amount": 1500,
                "kind": "welcome_bonus",
                "title": "Welcome Milestone Bonus",
                "description": "Welcome to Starlight Mobility Club! 1,500 initial reward points.",
            }
            run({"table": "loyalty_ledger", "action": "insert", "values": [welcome_bonus]})
            ledger_rows, _ = run({
                "table": "loyalty_ledger",
                "select": "id, amount, kind, title, description, created_at",
                "filters": [["user_id", "eq", user_id]],
                "order": [["created_at", False, False]],
            })

        points_balance = sum(int(item.get("amount") or 0) for item in (ledger_rows or []))
        lifetime_earned = sum(int(item.get("amount") or 0) for item in (ledger_rows or []) if int(item.get("amount") or 0) > 0)
        lifetime_redeemed = abs(sum(int(item.get("amount") or 0) for item in (ledger_rows or []) if int(item.get("amount") or 0) < 0))

        voucher_rows, _ = run({
            "table": "claimed_vouchers",
            "select": "id, voucher_id, title, code, category, points_cost, terms, claimed_at, expires_at, status",
            "filters": [["user_id", "eq", user_id]],
            "order": [["claimed_at", False, False]],
        })

        # Seed welcome voucher in claimed_vouchers and coupons if user has none
        if not voucher_rows:
            now = datetime.now(timezone.utc)
            exp = (now + timedelta(days=60)).isoformat()
            user_welcome_code = f"STAR-RENT500-{uuid.uuid4().hex[:5].upper()}"
            
            # Check if user already has an active STAR-RENT500 coupon
            existing_c, _ = run({
                "table": "coupons",
                "select": "code",
                "filters": [["user_id", "eq", user_id], ["service", "eq", "rental"]],
            })
            if existing_c and len(existing_c) > 0:
                user_welcome_code = existing_c[0]["code"]
            else:
                run({
                    "table": "coupons",
                    "action": "insert",
                    "values": [{
                        "code": user_welcome_code,
                        "amount_off": 500,
                        "user_id": user_id,
                        "service": "rental",
                        "active": True,
                        "used": False,
                        "starts_at": now.isoformat(),
                        "ends_at": exp,
                    }],
                })

            welcome_v = {
                "user_id": user_id,
                "voucher_id": "rw-1",
                "title": "Flat ₹500 OFF on Self-Drive Car Rental",
                "code": user_welcome_code,
                "category": "Rides",
                "points_cost": 500,
                "terms": "Min. booking value ₹2,000. Valid exclusively on self-drive cars.",
                "expires_at": exp,
                "status": "active",
            }
            run({"table": "claimed_vouchers", "action": "insert", "values": [welcome_v]})
            voucher_rows, _ = run({
                "table": "claimed_vouchers",
                "select": "id, voucher_id, title, code, category, points_cost, terms, claimed_at, expires_at, status",
                "filters": [["user_id", "eq", user_id]],
                "order": [["claimed_at", False, False]],
            })

        w = _get("wallets", "balance", "user_id", user_id)
        wallet_balance = float((w or {}).get("balance") or 0)

        tier = "Explorer"
        if lifetime_earned >= 1500 or points_balance >= 1500:
            tier = "Platinum VIP"
        elif lifetime_earned >= 800 or points_balance >= 800:
            tier = "Gold"
        elif lifetime_earned >= 400 or points_balance >= 400:
            tier = "Silver"

        return {
            "pointsBalance": max(0, points_balance),
            "lifetimeEarned": lifetime_earned,
            "lifetimeRedeemed": lifetime_redeemed,
            "currentTier": tier,
            "claimedVouchers": voucher_rows or [],
            "activity": [
                {
                    "id": str(item["id"]),
                    "amount": int(item["amount"]),
                    "type": "earned" if int(item["amount"]) > 0 else "redeemed",
                    "title": item["title"],
                    "description": item.get("description") or "",
                    "date": item["created_at"],
                }
                for item in (ledger_rows or [])
            ],
            "walletBalance": wallet_balance,
        }


def redeem_reward_voucher(data, user_id):
    voucher_id = data.get("voucherId") or data.get("voucher_id") or "v1"
    raw_cost = data.get("pointsCost") or data.get("points_cost") or data.get("points") or 0
    try:
        points_cost = int(raw_cost)
    except (ValueError, TypeError):
        points_cost = 0

    title = data.get("title") or data.get("voucher_title") or data.get("name") or "Reward Voucher"
    category = data.get("category", "General")
    code_prefix = data.get("codePrefix") or data.get("code_prefix") or data.get("code") or "STAR-REWARD"
    terms = data.get("terms", "")

    # Clean code prefix (remove trailing dashes)
    code_prefix = str(code_prefix).rstrip("-")

    # Detect target service explicitly
    req_service = str(data.get("service") or "").lower().strip()
    if req_service in ("rental", "wash", "driver", "partner"):
        service = req_service
    elif "wash" in title.lower() or "wash" in category.lower():
        service = "wash"
    elif "driver" in title.lower() or "chauffeur" in title.lower():
        service = "driver"
    elif "rental" in title.lower() or "self-drive" in title.lower() or "rides" in category.lower():
        service = "rental"
    else:
        service = "partner"

    # Determine discount amount
    raw_discount = data.get("discountAmount") or data.get("discount_amount")
    if raw_discount:
        try:
            discount_amount = int(raw_discount)
        except Exception:
            discount_amount = 0
    else:
        if "500" in title:
            discount_amount = 500
        elif "400" in title:
            discount_amount = 400
        elif "350" in title:
            discount_amount = 350
        elif "300" in title:
            discount_amount = 300
        elif "250" in title:
            discount_amount = 250
        elif "150" in title:
            discount_amount = 150
        elif "100" in title:
            discount_amount = 100
        else:
            discount_amount = points_cost

    if points_cost <= 0:
        raise FnError("Invalid points cost.")

    with db_role("service_role"):
        ledger_rows, _ = run({
            "table": "loyalty_ledger",
            "select": "amount",
            "filters": [["user_id", "eq", user_id]],
        })
        current_balance = sum(int(item.get("amount") or 0) for item in (ledger_rows or []))

        # If user has no entries yet, initialize welcome bonus
        if current_balance < points_cost and not ledger_rows:
            initial_bonus = {
                "user_id": user_id,
                "amount": 1500,
                "kind": "welcome_bonus",
                "title": "Welcome Milestone Bonus",
                "description": "Welcome to Starlight Mobility Club! 1,500 initial reward points.",
            }
            run({"table": "loyalty_ledger", "action": "insert", "values": [initial_bonus]})
            current_balance = 1500

        if current_balance < points_cost:
            raise FnError(f"Insufficient points ({current_balance}). Needed: {points_cost}.")

        # Generate a guaranteed unique coupon code scoped to this user
        suffix = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=5))
        final_code = f"{code_prefix}-{suffix}"

        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(days=60)).isoformat()

        run({
            "table": "loyalty_ledger",
            "action": "insert",
            "values": [{
                "user_id": user_id,
                "amount": -points_cost,
                "kind": "voucher_redemption",
                "title": f"Redeemed: {title}",
                "description": f"Saved voucher code {final_code} to My Vouchers",
            }],
        })

        created_rows, _ = run({
            "table": "claimed_vouchers",
            "action": "insert",
            "values": [{
                "user_id": user_id,
                "voucher_id": str(voucher_id),
                "title": title,
                "code": final_code,
                "category": category,
                "points_cost": points_cost,
                "terms": terms,
                "expires_at": expires_at,
                "status": "active",
            }],
        })

        # Insert into public.coupons with strict user ownership and service scoping
        if discount_amount > 0:
            run({
                "table": "coupons",
                "action": "insert",
                "values": [{
                    "code": final_code,
                    "amount_off": discount_amount,
                    "user_id": user_id,
                    "service": service,
                    "active": True,
                    "used": False,
                    "starts_at": (now - timedelta(minutes=5)).isoformat(),
                    "ends_at": expires_at,
                }],
            })

        new_balance = current_balance - points_cost
        voucher_record = created_rows[0] if created_rows else {}

        return {
            "ok": True,
            "pointsBalance": new_balance,
            "voucher": {
                "id": str(voucher_record.get("id")),
                "voucherId": voucher_id,
                "title": title,
                "code": final_code,
                "category": category,
                "service": service,
                "pointsCost": points_cost,
                "discountAmount": discount_amount,
                "terms": terms,
                "claimedAt": now.isoformat(),
                "expiresAt": expires_at,
                "status": "active",
            },
        }


def convert_points_to_wallet(data, user_id):
    raise FnError("Points conversion to cash is disabled. Points can only be redeemed for Starlight discount coupons and mobility vouchers.")


def resolve_dispute_compensation(data, user_id):
    if not _is_admin(user_id):
        raise FnError("Admins only", 403)
    incident_id = _uuid(data, "incidentId")
    amount = float(data.get("amount") or 0)
    notes = data.get("notes") or "Damage dispute resolved"
    award_to = data.get("awardTo")
    with db_role("service_role"):
        res = run_rpc("resolve_dispute_compensation", {
            "_incident_id": incident_id,
            "_amount": amount,
            "_notes": notes,
            "_award_to": award_to
        })
    return res


FUNCTIONS = {
    "createRazorpayOrder": create_razorpay_order,
    "verifyRazorpayPayment": verify_razorpay_payment,
    "createDriverRazorpayOrder": create_driver_razorpay_order,
    "verifyDriverRazorpayPayment": verify_driver_razorpay_payment,
    "createWashRazorpayOrder": create_wash_razorpay_order,
    "verifyWashRazorpayPayment": verify_wash_razorpay_payment,
    "createWalletTopupOrder": create_wallet_topup_order,
    "verifyWalletTopup": verify_wallet_topup,
    "submitInspection": submit_inspection,
    "createMembershipOrder": create_membership_order,
    "subscribeMembership": subscribe_membership,
    "cancelMembership": cancel_membership,
    "resumeMembership": resume_membership,
    "getMembershipStatus": get_membership_status,
    "getRewardsSummary": get_rewards_summary,
    "redeemRewardVoucher": redeem_reward_voucher,
    "convertPointsToWallet": convert_points_to_wallet,
    "resolveDisputeCompensation": resolve_dispute_compensation,
}
PUBLIC = set()


@api_view(["POST"])
def call(request, name):
    fn = FUNCTIONS.get(name)
    if fn is None:
        return Response({"message": f"Unknown function: {name}"}, status=404)
    user_id = str(request.user.id) if request.user else None
    if user_id is None and name not in PUBLIC:
        return Response({"message": "Unauthorized"}, status=401)
    data = request.data if isinstance(request.data, dict) else {}
    if isinstance(data.get("data"), dict):
        data = data["data"]
    try:
        return Response({"data": fn(data, user_id)})
    except FnError as e:
        return Response({"message": str(e)}, status=e.status)
    except QueryError as e:
        return Response(e.body, status=e.status)
    except DatabaseError as e:
        return Response(pg_error(e), status=400)


@api_view(["POST"])
@permission_classes([AllowAny])
def razorpay_webhook(request):
    """Webhook endpoint for Razorpay payment notifications (GAP-05).
    Guarantees bookings/hires/washes/topups become paid even if the browser closes immediately after checkout.
    """
    secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", None) or getattr(settings, "RAZORPAY_KEY_SECRET", "")
    signature = request.headers.get("X-Razorpay-Signature") or request.META.get("HTTP_X_RAZORPAY_SIGNATURE")

    if secret and signature:
        raw_body = request.body
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            key_secret = getattr(settings, "RAZORPAY_KEY_SECRET", "")
            expected2 = hmac.new(key_secret.encode(), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected2):
                return Response({"error": "Invalid webhook signature"}, status=400)

    event_data = request.data if isinstance(request.data, dict) else {}
    payload = event_data.get("payload", {})
    payment_entity = payload.get("payment", {}).get("entity", {})
    order_entity = payload.get("order", {}).get("entity", {})

    order_id = payment_entity.get("order_id") or order_entity.get("id")
    payment_id = payment_entity.get("id")
    notes = payment_entity.get("notes") or order_entity.get("notes") or {}

    if not order_id and not payment_id:
        return Response({"status": "ignored", "reason": "no_identifiers"})

    with db_role("service_role"):
        # 1. Rental bookings
        booking_id = notes.get("booking_id")
        if booking_id:
            b = _get("bookings", "id, customer_id, status, payment_status, total_price, razorpay_payment_id", "id", booking_id)
            if b:
                if b.get("status") in ("cancelled", "rejected"):
                    _refund_late_rental_payment(b, payment_id or "pay_webhook")
                elif b.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    _update("bookings", _paid_patch(payment_id or "pay_webhook"), [["id", "eq", b["id"]]])
        elif order_id:
            b = _get("bookings", "id, customer_id, status, payment_status, total_price, razorpay_payment_id", "razorpay_order_id", order_id)
            if b:
                if b.get("status") in ("cancelled", "rejected"):
                    _refund_late_rental_payment(b, payment_id or "pay_webhook")
                elif b.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    _update("bookings", _paid_patch(payment_id or "pay_webhook"), [["id", "eq", b["id"]]])

        # 2. Driver hires
        driver_booking_id = notes.get("driver_booking_id")
        if driver_booking_id:
            db = _get("driver_bookings", "id, customer_id, total_price, status, payment_status, razorpay_payment_id", "id", driver_booking_id)
            if db:
                if db.get("status") in ("cancelled", "rejected"):
                    _refund_late_driver_payment(db, payment_id or "pay_webhook")
                elif db.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    _update("driver_bookings", _paid_patch(payment_id or "pay_webhook"), [["id", "eq", db["id"]]])
        elif order_id:
            db = _get("driver_bookings", "id, customer_id, total_price, status, payment_status, razorpay_payment_id", "razorpay_order_id", order_id)
            if db:
                if db.get("status") in ("cancelled", "rejected"):
                    _refund_late_driver_payment(db, payment_id or "pay_webhook")
                elif db.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    _update("driver_bookings", _paid_patch(payment_id or "pay_webhook"), [["id", "eq", db["id"]]])

        # 3. Vehicle washes
        wash_booking_id = notes.get("wash_booking_id")
        if wash_booking_id:
            wb = _get("wash_bookings", "id, customer_id, price, status, payment_status, razorpay_payment_id, pay_by", "id", wash_booking_id)
            if wb:
                pay_by = _parse_dt(wb.get("pay_by"))
                is_late = (pay_by and pay_by < datetime.now(timezone.utc)) or wb.get("status") in ("cancelled", "rejected")
                if is_late:
                    _refund_late_wash_payment(wb, payment_id or "pay_webhook")
                elif wb.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    patch = _paid_patch(payment_id or "pay_webhook")
                    patch["status"] = "confirmed"
                    patch["progress"] = "confirmed"
                    patch["paid_at"] = _now()
                    _update("wash_bookings", patch, [["id", "eq", wb["id"]]])
        elif order_id:
            wb = _get("wash_bookings", "id, customer_id, price, status, payment_status, razorpay_payment_id, pay_by", "razorpay_order_id", order_id)
            if wb:
                pay_by = _parse_dt(wb.get("pay_by"))
                is_late = (pay_by and pay_by < datetime.now(timezone.utc)) or wb.get("status") in ("cancelled", "rejected")
                if is_late:
                    _refund_late_wash_payment(wb, payment_id or "pay_webhook")
                elif wb.get("payment_status") not in ("paid", "refunded", "partially_refunded"):
                    patch = _paid_patch(payment_id or "pay_webhook")
                    patch["status"] = "confirmed"
                    patch["progress"] = "confirmed"
                    patch["paid_at"] = _now()
                    _update("wash_bookings", patch, [["id", "eq", wb["id"]]])

        # 4. Wallet topups
        if order_id:
            t = _get("wallet_topups", "id, user_id, amount, status", "razorpay_order_id", order_id)
            if t and t.get("status") not in ("paid", "completed"):
                _update("wallet_topups", {
                    "status": "paid",
                    "razorpay_payment_id": payment_id or "pay_webhook",
                    "updated_at": _now()
                }, [["id", "eq", t["id"]]])
                run_rpc("wallet_apply", {
                    "_user_id": t["user_id"],
                    "_amount": t["amount"],
                    "_kind": "topup",
                    "_reference": payment_id or order_id,
                    "_description": f"Wallet top-up ({order_id}) via Webhook"
                })

    return Response({"status": "ok"})
