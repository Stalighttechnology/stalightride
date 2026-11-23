"""Tests for doorstep wash booking dispatch: tiered job board, haversine distance,
clash and radius checks, releases and strikes, unpaid expiry, auto-cancel refund,
and summary notifications."""

import json
import uuid
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from rest_framework.test import APIClient

from core.db import db_role

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def day(offset):
    return (datetime.now(IST) + timedelta(days=offset)).date().isoformat()


def make_cleaner(user, city="Bengaluru", lat=12.9716, lng=77.5946, radius_km=8, rating=5.0):
    q("""INSERT INTO public.cleaners (id, full_name, phone, city, base_lat, base_lng, radius_km, avg_rating, verification_status, available)
         VALUES (%s, %s, '9876543210', %s, %s, %s, %s, %s, 'approved', true)
         ON CONFLICT (id) DO UPDATE SET base_lat = EXCLUDED.base_lat, base_lng = EXCLUDED.base_lng,
         radius_km = EXCLUDED.radius_km, avg_rating = EXCLUDED.avg_rating, verification_status = 'approved', available = true""",
      [user.id, getattr(user, "full_name", "Cleaner"), city, lat, lng, radius_km, rating])


@pytest.fixture
def wash_world(db):
    class W:
        pass

    w = W()
    for name in ("cust", "cust2", "cln1", "cln2", "cln3", "cln4", "admin"):
        setattr(w, name, User.objects.create_user(f"{name}@example.com", "secret123", full_name=name))
    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])

    # Ensure wash services exist
    w.service_id = q("SELECT id FROM public.wash_services WHERE active LIMIT 1")[0][0]

    # Cleaners in Bengaluru:
    # cln1 at center (12.9716, 77.5946)
    make_cleaner(w.cln1, "Bengaluru", 12.9716, 77.5946, radius_km=10, rating=4.9)
    # cln2 2 km away (12.9800, 77.5946)
    make_cleaner(w.cln2, "Bengaluru", 12.9800, 77.5946, radius_km=10, rating=4.8)
    # cln3 4 km away (13.0000, 77.5946)
    make_cleaner(w.cln3, "Bengaluru", 13.0000, 77.5946, radius_km=10, rating=4.7)
    # cln4 10 km away (13.0600, 77.5946)
    make_cleaner(w.cln4, "Bengaluru", 13.0600, 77.5946, radius_km=15, rating=5.0)

    return w


def create_paid_wash(w, slot_dt_ist, paid_at_utc=None, lat=12.9716, lng=77.5946):
    slot_date = slot_dt_ist.date().isoformat()
    slot_time = slot_dt_ist.time().strftime("%H:%M:%S")

    wid = q("""INSERT INTO public.wash_bookings (customer_id, service_id, city, address, lat, lng, slot_date, slot_time, price)
               VALUES (%s, %s, 'Bengaluru', 'MG Road', %s, %s, %s, %s, 499)
               RETURNING id""",
            [w.cust.id, w.service_id, lat, lng, slot_date, slot_time])[0][0]
    q("""UPDATE public.wash_bookings
         SET status = 'confirmed', progress = 'confirmed', payment_status = 'paid', paid_at = %s
         WHERE id = %s""",
      [paid_at_utc or datetime.now(ZoneInfo("UTC")), wid])
    return wid


def test_board_visibility_per_tier_and_band(wash_world):
    w = wash_world
    now_ist = datetime.now(IST)

    # Band 1: L > 24h
    # slot is 48h in future.
    slot_dt = now_ist + timedelta(hours=48)
    # paid_at was 2 hours ago -> elapsed 2h (Tier 1: 0 -> 4h)
    paid_at = datetime.now(ZoneInfo("UTC")) - timedelta(hours=2)
    wid1 = create_paid_wash(w, slot_dt, paid_at, lat=12.9716, lng=77.5946)

    # cln1 (0 km away, top rating) is in Tier 1 -> can see
    with db_role("authenticated", w.cln1.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        job_ids = [j[0] for j in jobs]
        assert wid1 in job_ids

    # cln4 (10 km away) is NOT in Tier 1 (> 5 km) -> cannot see yet
    with db_role("authenticated", w.cln4.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        job_ids = [j[0] for j in jobs]
        assert wid1 not in job_ids

    # Now simulate elapsed 5h (Tier 2: 4h -> 8h)
    q("UPDATE public.wash_bookings SET paid_at = now() - interval '5 hours' WHERE id = %s", [wid1])
    # cln4 has radius 15km, job is ~9.8km away -> cln4 is within radius, so in Tier 2 cln4 CAN see!
    with db_role("authenticated", w.cln4.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        job_ids = [j[0] for j in jobs]
        assert wid1 in job_ids


def test_radius_and_clash_checks(wash_world):
    w = wash_world
    now_ist = datetime.now(IST)
    slot_dt = now_ist + timedelta(hours=20)
    paid_at = datetime.now(ZoneInfo("UTC")) - timedelta(hours=1, minutes=30) # Tier 2 (1h -> 2h for 6-24h band)

    # Job at lat 12.9716, lng 77.5946
    wid = create_paid_wash(w, slot_dt, paid_at, lat=12.9716, lng=77.5946)

    # Create a cleaner cln_small_radius whose base is 4 km away, radius 2 km
    cln_limited = User.objects.create_user("cln_lim@example.com", "secret123", full_name="cln_lim")
    make_cleaner(cln_limited, "Bengaluru", 13.0075, 77.5946, radius_km=2, rating=4.9)

    # In Tier 2, cln_limited is ~4km away which exceeds their 2km radius -> cannot see
    with db_role("authenticated", cln_limited.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        assert wid not in [j[0] for j in jobs]

    # In Tier 3 (elapsed 3h), whole city can see regardless of radius
    q("UPDATE public.wash_bookings SET paid_at = now() - interval '3 hours' WHERE id = %s", [wid])
    with db_role("authenticated", cln_limited.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        assert wid in [j[0] for j in jobs]

    # Clash test: assign another job to cln1 overlapping this slot
    # Service duration is 45 min, clash buffer is [slot, slot + 45m + 30m] = 75 min
    clash_slot = slot_dt + timedelta(minutes=30)
    clash_wid = create_paid_wash(w, clash_slot, paid_at, lat=12.9716, lng=77.5946)
    q("UPDATE public.wash_bookings SET assigned_cleaner_id = %s, progress = 'assigned' WHERE id = %s", [w.cln1.id, clash_wid])

    # Now cln1 has a clash with wid, so cln1 should no longer see wid on job board
    with db_role("authenticated", w.cln1.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        assert wid not in [j[0] for j in jobs]


def test_two_claims_of_same_job(wash_world):
    w = wash_world
    slot_dt = datetime.now(IST) + timedelta(hours=30)
    paid_at = datetime.now(ZoneInfo("UTC")) - timedelta(hours=10) # Tier 3
    wid = create_paid_wash(w, slot_dt, paid_at)

    # First cleaner claims
    with db_role("authenticated", w.cln1.id):
        res = q("SELECT public.claim_wash_job(%s)", [wid])[0][0]
        res_data = json.loads(res) if isinstance(res, str) else res
        assert res_data["progress"] == "assigned"

    # Second cleaner attempts to claim same job -> must fail with 'Another partner just claimed this job'
    with db_role("authenticated", w.cln2.id):
        with pytest.raises(Exception, match="Another partner just claimed this job"):
            with transaction.atomic():
                q("SELECT public.claim_wash_job(%s)", [wid])


def test_release_strike_and_tier_1_exclusion(wash_world):
    w = wash_world
    # Job 1: slot is in 5 hours (< 12h, so release will be late = strike)
    slot1 = datetime.now(IST) + timedelta(hours=5)
    wid1 = create_paid_wash(w, slot1, datetime.now(ZoneInfo("UTC")) - timedelta(minutes=45))

    # cln1 claims it
    with db_role("authenticated", w.cln1.id):
        q("SELECT public.claim_wash_job(%s)", [wid1])
        # cln1 releases it
        rel1 = q("SELECT public.release_wash_job(%s)", [wid1])[0][0]
        rel1_data = json.loads(rel1) if isinstance(rel1, str) else rel1
        assert rel1_data["late"] is True

    # 1 strike recorded
    strikes = q("SELECT count(*) FROM public.wash_job_releases WHERE cleaner_id = %s AND late = true", [w.cln1.id])[0][0]
    assert strikes == 1

    # cln1 can still see Tier 1 jobs (needs 2 strikes to be excluded)
    slot2 = datetime.now(IST) + timedelta(hours=4)
    wid2 = create_paid_wash(w, slot2, datetime.now(ZoneInfo("UTC")) - timedelta(minutes=30))
    with db_role("authenticated", w.cln1.id):
        q("SELECT public.claim_wash_job(%s)", [wid2])
        rel2 = q("SELECT public.release_wash_job(%s)", [wid2])[0][0]
        rel2_data = json.loads(rel2) if isinstance(rel2, str) else rel2
        assert rel2_data["late"] is True

    # 2 strikes recorded
    strikes = q("SELECT count(*) FROM public.wash_job_releases WHERE cleaner_id = %s AND late = true", [w.cln1.id])[0][0]
    assert strikes == 2

    # Now cln1 has 2 strikes in last 30 days -> must be EXCLUDED from Tier 1!
    slot3 = datetime.now(IST) + timedelta(hours=40)
    wid3 = create_paid_wash(w, slot3, datetime.now(ZoneInfo("UTC")) - timedelta(hours=1)) # Tier 1
    with db_role("authenticated", w.cln1.id):
        jobs = q("SELECT id FROM public.wash_job_board()")
        assert wid3 not in [j[0] for j in jobs]


def test_unpaid_wash_expires(wash_world):
    w = wash_world
    slot_date = day(2)
    # Insert pending wash and expire pay_by
    wid = q("""INSERT INTO public.wash_bookings (customer_id, service_id, city, address, lat, lng, slot_date, slot_time, price)
               VALUES (%s, %s, 'Bengaluru', 'MG Road', 12.9716, 77.5946, %s, '10:00', 499)
               RETURNING id""", [w.cust.id, w.service_id, slot_date])[0][0]
    q("UPDATE public.wash_bookings SET pay_by = now() - interval '5 minutes' WHERE id = %s", [wid])

    # Run expire_booking_windows
    res = q("SELECT public.expire_booking_windows()")[0][0]
    res_data = json.loads(res) if isinstance(res, str) else res
    assert res_data["wash_expired_unpaid"] >= 1

    row = q("SELECT status::text, cancellation_reason FROM public.wash_bookings WHERE id = %s", [wid])[0]
    assert row == ("cancelled", "payment_timeout")


def test_auto_cancel_with_refund(wash_world):
    w = wash_world
    # Insert with slot 30h ahead so guard passes, then simulate time passing
    slot_dt = datetime.now(IST) + timedelta(hours=30)
    paid_at = datetime.now(ZoneInfo("UTC")) - timedelta(hours=30) # L was 30h (> 24h)
    wid = create_paid_wash(w, slot_dt, paid_at)

    # Now move slot to 1 hour ahead (which is past slot - 2h auto-cancel time)
    new_slot = datetime.now(IST) + timedelta(hours=1)
    q("UPDATE public.wash_bookings SET slot_date = %s, slot_time = %s WHERE id = %s",
      [new_slot.date().isoformat(), new_slot.time().strftime("%H:%M:%S"), wid])

    # Initial wallet balance of customer
    q("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT (user_id) DO NOTHING", [w.cust.id])
    bal_before = q("SELECT balance FROM public.wallets WHERE user_id = %s", [w.cust.id])[0][0]
    expected_price = q("SELECT price FROM public.wash_bookings WHERE id = %s", [wid])[0][0]

    # Run expire_booking_windows
    res = q("SELECT public.expire_booking_windows()")[0][0]
    res_data = json.loads(res) if isinstance(res, str) else res
    assert res_data["wash_auto_cancelled"] >= 1

    row = q("SELECT status::text, cancellation_reason, payment_status::text, refund_amount FROM public.wash_bookings WHERE id = %s", [wid])[0]
    assert row == ("cancelled", "no_washer", "refunded", expected_price)

    bal_after = q("SELECT balance FROM public.wallets WHERE user_id = %s", [w.cust.id])[0][0]
    assert bal_after == bal_before + expected_price


def test_one_summary_notification_per_tier(wash_world):
    w = wash_world
    now_ist = datetime.now(IST)

    # Clear notifications
    q("DELETE FROM public.notifications")

    # Create 3 jobs in Tier 2
    for i in range(3):
        slot_dt = now_ist + timedelta(hours=10 + i)
        paid_at = datetime.now(ZoneInfo("UTC")) - timedelta(hours=1, minutes=15) # Tier 2 (1h -> 2h)
        create_paid_wash(w, slot_dt, paid_at)

    # Run expire_booking_windows
    q("SELECT public.expire_booking_windows()")

    # Each cleaner should receive at most 1 summary notification
    for cln in (w.cln1, w.cln2, w.cln3):
        notifs = q("SELECT title, body FROM public.notifications WHERE user_id = %s", [cln.id])
        # Summary notification: "New wash jobs near you", "3 new wash jobs near you"
        assert len(notifs) == 1
        assert notifs[0][0] == "New wash jobs near you"
        assert "3 new wash jobs" in notifs[0][1]
