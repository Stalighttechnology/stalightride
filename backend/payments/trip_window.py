"""When a trip handover may happen. Same rules as frontend/src/lib/trip-window.ts.

Check-in opens 30 minutes before the scheduled pickup and only once the
booking is confirmed and paid. Check-out opens once the pickup is recorded.
Dates and times are wall-clock times in the business time zone.
"""

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings

CHECKIN_LEAD_MINUTES = 30


def combine_date_time(date, time):
    if not date:
        return None
    t = str(time)[:5] if time and re.match(r"^\d{2}:\d{2}", str(time)) else "10:00"
    try:
        naive = datetime.fromisoformat(f"{str(date)[:10]}T{t}:00")
    except ValueError:
        return None
    return naive.replace(tzinfo=ZoneInfo(settings.BUSINESS_TIME_ZONE))


def format_when(d):
    """Like toLocaleString('en-IN', {day, month: 'short', hour, minute, hour12}): '20 Aug, 9:30 am'."""
    d = d.astimezone(ZoneInfo(settings.BUSINESS_TIME_ZONE))
    hour = d.hour % 12 or 12
    return f"{d.day} {d:%b}, {hour}:{d:%M} {'am' if d.hour < 12 else 'pm'}"


def handover_gate(b, now=None):
    now = now or datetime.now(ZoneInfo(settings.BUSINESS_TIME_ZONE))
    paid = b.get("status") == "confirmed" and (b.get("payment_status") == "paid" or bool(b.get("paid_at")))
    start = combine_date_time(b.get("start_date"), b.get("pickup_time"))
    end = combine_date_time(b.get("end_date"), b.get("dropoff_time"))
    opens_at = start - timedelta(minutes=CHECKIN_LEAD_MINUTES) if start else None
    checked_in, checked_out = bool(b.get("pickup_checked_at")), bool(b.get("return_checked_at"))

    can_checkin, checkin_reason = False, None
    if checked_in or checked_out:
        pass
    elif not paid:
        checkin_reason = "Check-in unlocks once the host accepts the request and payment is complete."
    elif opens_at and now < opens_at:
        checkin_reason = f"Check-in opens {format_when(opens_at)} ({CHECKIN_LEAD_MINUTES} minutes before pickup)."
    else:
        can_checkin = True

    can_checkout, checkout_reason = False, None
    if checked_out:
        pass
    elif not checked_in:
        checkout_reason = "Complete the pickup check-in first."
    elif b.get("status") != "confirmed":
        checkout_reason = "This booking is no longer active."
    else:
        can_checkout = True

    return {
        "canCheckin": can_checkin,
        "canCheckout": can_checkout,
        "checkinReason": checkin_reason,
        "checkoutReason": checkout_reason,
        "opensAt": opens_at or end,
    }
