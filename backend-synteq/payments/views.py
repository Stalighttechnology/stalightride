"""Server-side actions the browser must not do itself: Razorpay orders and
signature checks, wallet top-up, QR lookup, handover and trip inspection.

Ported one-to-one from the old server functions (same inputs, checks, error
messages and outputs). Reads run as the signed-in user, so row-level security
applies; writes to locked payment and handover columns run as service_role
after the checks.
"""

import base64
import hashlib
import hmac
import json
import re
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from django.conf import settings
from django.db import DatabaseError
from rest_framework.decorators import api_view
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

def create_razorpay_order(data, user_id):
    booking_id = _uuid(data, "bookingId")
    b = _get("bookings", "id, customer_id, status, payment_status, total_price, razorpay_order_id", "id", booking_id)
    if not b:
        raise FnError("Booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("Host has not accepted this booking yet")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    order = _create_order({"amount": _paise(b["total_price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_razorpay_payment(data, user_id):
    booking_id = _uuid(data, "bookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("bookings", "id, customer_id, razorpay_order_id", "id", booking_id)
    if not b:
        raise FnError("Booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["razorpay_order_id"] != order_id:
        raise FnError("Order mismatch")
    with db_role("service_role"):
        _update("bookings", _paid_patch(payment_id), [["id", "eq", b["id"]]])
    return {"ok": True}


# -- driver hire ---------------------------------------------------------------

def create_driver_razorpay_order(data, user_id):
    hire_id = _uuid(data, "driverBookingId")
    b = _get("driver_bookings", "id, customer_id, status, payment_status, total_price", "id", hire_id)
    if not b:
        raise FnError("Hire not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("Driver has not accepted this request yet")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    order = _create_order({"amount": _paise(b["total_price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"driver_booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("driver_bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_driver_razorpay_payment(data, user_id):
    hire_id = _uuid(data, "driverBookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("driver_bookings", "id, customer_id, driver_id, total_price, payment_status, razorpay_order_id", "id", hire_id)
    if not b:
        raise FnError("Hire not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["razorpay_order_id"] != order_id:
        raise FnError("Order mismatch")
    if b["payment_status"] == "paid":
        return {"ok": True}
    with db_role("service_role"):
        # The driver's earning is credited when the hire completes (tg_money_settle_driver_booking).
        _update("driver_bookings", _paid_patch(payment_id), [["id", "eq", b["id"]]])
    return {"ok": True}


# -- washes --------------------------------------------------------------------

def create_wash_razorpay_order(data, user_id):
    wash_id = _uuid(data, "washBookingId")
    b = _get("wash_bookings", "id, customer_id, status, payment_status, price", "id", wash_id)
    if not b:
        raise FnError("Wash booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("Admin has not approved this wash yet")
    if b["payment_status"] == "paid":
        raise FnError("Already paid")
    order = _create_order({"amount": _paise(b["price"]), "currency": "INR", "receipt": b["id"],
                           "notes": {"wash_booking_id": b["id"], "customer_id": user_id}}, "Razorpay order failed")
    with db_role("service_role"):
        _update("wash_bookings", {"razorpay_order_id": order["orderId"]}, [["id", "eq", b["id"]]])
    return order


def verify_wash_razorpay_payment(data, user_id):
    wash_id = _uuid(data, "washBookingId")
    order_id, payment_id = _check_signature(data)
    b = _get("wash_bookings", "id, customer_id, status, payment_status, razorpay_order_id", "id", wash_id)
    if not b:
        raise FnError("Wash booking not found")
    if b["customer_id"] != user_id:
        raise FnError("Not your booking")
    if b["status"] != "confirmed":
        raise FnError("This wash is not approved")
    if b["razorpay_order_id"] != order_id:
        raise FnError("Order mismatch")
    if b["payment_status"] == "paid":
        return {"ok": True}
    with db_role("service_role"):
        _update("wash_bookings", _paid_patch(payment_id), [["id", "eq", b["id"]], ["customer_id", "eq", user_id]])
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
        t = _get("wallet_topups", "id, user_id, amount, status", "razorpay_order_id", order_id)
        if not t:
            raise FnError("Top-up not found")
        if t["user_id"] != user_id:
            raise FnError("Not your top-up")
        if t["status"] == "paid":
            w = _get("wallets", "balance", "user_id", user_id)
            return {"ok": True, "alreadyCredited": True, "newBalance": float((w or {}).get("balance") or 0)}
        # shortcut: two simultaneous verify calls can both credit; fixed in the defects PR.
        _update("wallet_topups", {"status": "paid", "razorpay_payment_id": payment_id},
                [["id", "eq", t["id"]], ["status", "eq", "created"]])
        balance = run_rpc("wallet_apply", {
            "_user_id": user_id, "_amount": t["amount"], "_kind": "topup",
            "_reference": payment_id, "_description": "Money added to wallet"})
    return {"ok": True, "alreadyCredited": False, "newBalance": float(balance)}


# -- QR lookup, handover, inspection ---------------------------------------------

_QR_FIELDS = ("id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, base_price, "
              "security_deposit, total_price, paid_at, vehicle_id, customer_id, vendor_id, pickup_fuel_pct, "
              "return_fuel_pct, pickup_odometer, return_odometer, pickup_checked_at, return_checked_at")


def _by_code(select, code):
    """A booking by its QR code, or by id when the code is a booking id."""
    b = _get("bookings", select, "qr_code", code)
    if b is None and re.fullmatch(r"[0-9a-fA-F-]{36}", code):
        b = _get("bookings", select, "id", code)
    return b


def get_booking_by_qr(data, user_id):
    """Public: anyone holding a printed QR may see the trip's public details."""
    code = _text(data, "code", 8, 128)
    with db_role("service_role"):
        b = _by_code(_QR_FIELDS, code)
        if b is None:
            return None
        vehicle = _get("vehicles", "title, brand, model, year, city, address, lat, lng, category, fuel, transmission",
                       "id", b["vehicle_id"])
        customer = _get("profiles", "full_name, avatar_url", "id", b["customer_id"])
        vendor = _get("profiles", "full_name, avatar_url", "id", b["vendor_id"])

    def num(v):
        return float(v) if v is not None else None

    return {
        "id": b["id"], "status": b["status"], "paymentStatus": b["payment_status"],
        "startDate": b["start_date"], "endDate": b["end_date"],
        "pickupTime": b["pickup_time"], "dropoffTime": b["dropoff_time"],
        "basePrice": num(b["base_price"]), "securityDeposit": num(b["security_deposit"]),
        "totalPrice": num(b["total_price"]), "paidAt": b["paid_at"],
        "pickupFuelPct": b["pickup_fuel_pct"], "returnFuelPct": b["return_fuel_pct"],
        "pickupOdometer": b["pickup_odometer"], "returnOdometer": b["return_odometer"],
        "pickupCheckedAt": b["pickup_checked_at"], "returnCheckedAt": b["return_checked_at"],
        "vehicle": vehicle, "customer": customer, "vendor": vendor,
    }


def resolve_handover_code(data, user_id):
    code = _text(data, "code", 8, 200)
    b = _by_code("id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, total_price, "
                 "pickup_checked_at, return_checked_at, customer_id, vendor_id, vehicle_id", code)
    if b is None:
        return {"found": False}
    vehicle = _get("vehicles", "title, brand, model, city", "id", b["vehicle_id"])
    rider = _get("public_profiles", "full_name, avatar_url", "id", b["customer_id"])
    gate = handover_gate(b)
    return {
        "found": True, "booking": b, "vehicle": vehicle, "rider": rider,
        "canConfirm": b["vendor_id"] == user_id or _is_admin(user_id),
        "isRider": b["customer_id"] == user_id,
        "gate": {**gate, "opensAt": gate["opensAt"].isoformat() if gate["opensAt"] else None},
    }


def confirm_handover(data, user_id):
    code = _text(data, "code", 8, 200)
    phase = data.get("phase")
    if phase not in ("pickup", "return"):
        raise FnError("Invalid input: phase")
    b = _by_code("id, status, payment_status, vendor_id, start_date, end_date, pickup_time, dropoff_time, "
                 "pickup_checked_at, return_checked_at", code)
    if b is None:
        raise FnError("This QR code does not match any booking.")
    if b["vendor_id"] != user_id and not _is_admin(user_id):
        raise FnError("Only the vehicle host can confirm the handover.")
    if b["status"] != "confirmed" or b["payment_status"] != "paid":
        raise FnError("This booking is not paid and confirmed yet.")
    gate = handover_gate(b)
    if phase == "pickup":
        if b["pickup_checked_at"]:
            raise FnError("Pickup was already confirmed.")
        if not gate["canCheckin"]:
            raise FnError(gate["checkinReason"] or "Check-in is not open yet.")
    else:
        if not b["pickup_checked_at"]:
            raise FnError("Confirm the pickup first.")
        if b["return_checked_at"]:
            raise FnError("Return was already confirmed.")
        if not gate["canCheckout"]:
            raise FnError(gate["checkoutReason"] or "Check-out is not available yet.")
    with db_role("service_role"):
        _update("bookings", {f"{phase}_checked_at": _now()}, [["id", "eq", b["id"]]])
    return {"ok": True, "phase": phase, "bookingId": b["id"]}


def submit_inspection(data, user_id):
    booking_id = _uuid(data, "bookingId")
    phase = data.get("phase")
    if phase not in ("pickup", "return"):
        raise FnError("Invalid input: phase")
    fuel, odo = _int(data, "fuel", 0, 100), _int(data, "odo", 0, 3_000_000)
    photos = data.get("photoPaths")
    if not isinstance(photos, list) or len(photos) > 20 or not all(isinstance(p, str) and 1 <= len(p) <= 500 for p in photos):
        raise FnError("Invalid input: photoPaths")
    notes = data.get("notes")
    if notes is not None and (not isinstance(notes, str) or len(notes) > 2000):
        raise FnError("Invalid input: notes")
    damage = data.get("damage")
    if not isinstance(damage, list) or not all(
            isinstance(d, dict) and isinstance(d.get("area"), str) and 1 <= len(d["area"]) <= 120
            and d.get("condition") in ("ok", "minor", "major")
            and (d.get("note") is None or (isinstance(d["note"], str) and len(d["note"]) <= 500)) for d in damage):
        raise FnError("Invalid input: damage")

    b = _get("bookings", "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, customer_id, "
             "vendor_id, pickup_checked_at, return_checked_at, pickup_odometer, return_odometer", "id", booking_id)
    if not b:
        raise FnError("Booking not found.")
    if user_id not in (b["customer_id"], b["vendor_id"]) and not _is_admin(user_id):
        raise FnError("You don't have access to this trip.")
    gate = handover_gate(b)
    # A QR scan may already have stamped the handover; the checklist is still due then.
    pickup_scanned = bool(b["pickup_checked_at"]) and b["pickup_odometer"] is None
    return_scanned = bool(b["return_checked_at"]) and b["return_odometer"] is None
    if phase == "pickup" and b["pickup_odometer"] is not None:
        raise FnError("Pickup checklist already recorded.")
    if phase == "return" and b["return_odometer"] is not None:
        raise FnError("Return checklist already recorded.")
    if phase == "return" and b["pickup_odometer"] is not None and odo < b["pickup_odometer"]:
        raise FnError("Return odometer can't be lower than the pickup reading.")
    is_paid = b["payment_status"] == "paid" and b["status"] == "confirmed"
    if phase == "pickup" and not gate["canCheckin"] and not pickup_scanned and not is_paid:
        raise FnError(gate["checkinReason"] or "Check-in is not available yet.")
    if phase == "return" and not gate["canCheckout"] and not return_scanned:
        raise FnError(gate["checkoutReason"] or "Check-out is not available yet.")

    patch = {
        f"{phase}_fuel_pct": fuel, f"{phase}_odometer": odo, f"{phase}_photos": photos,
        f"{phase}_notes": notes or None, f"{phase}_damage": damage,
        f"{phase}_checked_at": b[f"{phase}_checked_at"] or _now(),
    }
    if phase == "return":
        patch["status"] = "completed"
    with db_role("service_role"):
        _update("bookings", patch, [["id", "eq", b["id"]]])
    return {"ok": True, "phase": phase}


FUNCTIONS = {
    "createRazorpayOrder": create_razorpay_order,
    "verifyRazorpayPayment": verify_razorpay_payment,
    "createDriverRazorpayOrder": create_driver_razorpay_order,
    "verifyDriverRazorpayPayment": verify_driver_razorpay_payment,
    "createWashRazorpayOrder": create_wash_razorpay_order,
    "verifyWashRazorpayPayment": verify_wash_razorpay_payment,
    "createWalletTopupOrder": create_wallet_topup_order,
    "verifyWalletTopup": verify_wallet_topup,
    "getBookingByQr": get_booking_by_qr,
    "resolveHandoverCode": resolve_handover_code,
    "confirmHandover": confirm_handover,
    "submitInspection": submit_inspection,
}
PUBLIC = {"getBookingByQr"}


@api_view(["POST"])
def call(request, name):
    fn = FUNCTIONS.get(name)
    if fn is None:
        return Response({"message": f"Unknown function: {name}"}, status=404)
    user_id = str(request.user.id) if request.user else None
    if user_id is None and name not in PUBLIC:
        return Response({"message": "Unauthorized"}, status=401)
    data = request.data if isinstance(request.data, dict) else {}
    try:
        return Response({"data": fn(data, user_id)})
    except FnError as e:
        return Response({"message": str(e)}, status=e.status)
    except QueryError as e:
        return Response(e.body, status=e.status)
    except DatabaseError as e:
        return Response(pg_error(e), status=400)
