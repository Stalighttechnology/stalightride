"""Tests for pool request booking windows: 1h cutoff, respond_by calculation,
accepting after deadline fails, expire_booking_windows expiry & departure closure,
seats unchanged, and driver response stats.
"""

import json
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.db import connection, transaction

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")


def q(sql, params=None):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.fetchall() if c.description else None


def parse_json(val):
    return json.loads(val) if isinstance(val, str) else val


@pytest.fixture
def pool_world(db):
    class W:
        pass

    w = W()
    w.driver = User.objects.create_user("driver@example.com", "secret123", full_name="Driver User")
    w.passenger = User.objects.create_user("passenger@example.com", "secret123", full_name="Passenger User")
    w.passenger2 = User.objects.create_user("passenger2@example.com", "secret123", full_name="Passenger 2")
    w.admin = User.objects.create_user("admin@example.com", "secret123", full_name="Admin User")

    q("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin')", [w.admin.id])
    q("UPDATE public.profiles SET dl_status = 'approved', dl_expiry = '2035-01-01' WHERE id = %s", [w.driver.id])

    return w


def create_trip(driver_id, depart_at, seats_total=4, seats_available=4, fare=150):
    trip_id = uuid.uuid4()
    q("""INSERT INTO public.pool_trips (
            id, driver_id, vehicle_label, origin_label, origin_lat, origin_lng,
            dest_label, dest_lat, dest_lng, depart_at, seats_total, seats_available,
            fare_per_seat, status
         ) VALUES (
            %s, %s, 'Toyota Etios (KA 01 AB 1234)', 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, %s, %s, %s,
            %s, 'scheduled'
         )""",
      [trip_id, driver_id, depart_at, seats_total, seats_available, fare])
    return trip_id


def test_pool_request_one_hour_cutoff(pool_world):
    """Pool requests less than 1 hour before departure are refused."""
    now = datetime.now(IST)
    # Trip departs in 45 minutes (less than 1 hour)
    trip_id = create_trip(pool_world.driver.id, now + timedelta(minutes=45))

    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.passenger.id)])
    with pytest.raises(Exception) as excinfo:
        with transaction.atomic():
            q("""INSERT INTO public.pool_requests (
                    trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                    drop_label, drop_lat, drop_lng, seats
                 ) VALUES (
                    %s, %s, 'Koramangala', 12.9352, 77.6245,
                    'Whitefield', 12.9698, 77.7500, 1
                 )""",
              [trip_id, pool_world.passenger.id])
    assert "Requests close 1 hour before departure" in str(excinfo.value)

    # Trip departs in 2 hours -> succeeds
    trip_id_valid = create_trip(pool_world.driver.id, now + timedelta(hours=2))
    req_id = uuid.uuid4()
    q("""INSERT INTO public.pool_requests (
            id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
            drop_label, drop_lat, drop_lng, seats
         ) VALUES (
            %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, 1
         )""",
      [req_id, trip_id_valid, pool_world.passenger.id])

    row = q("SELECT status, respond_by FROM public.pool_requests WHERE id = %s", [req_id])[0]
    assert row[0] == "pending"
    assert row[1] is not None


def test_pool_request_respond_by_calculation(pool_world):
    """respond_by is set to booking_deadline(created_at, depart_at, 30 min)."""
    now = datetime.now(IST)
    # Trip departs in 4 hours
    trip_id = create_trip(pool_world.driver.id, now + timedelta(hours=4))

    req_id = uuid.uuid4()
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.passenger.id)])
    q("""INSERT INTO public.pool_requests (
            id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
            drop_label, drop_lat, drop_lng, seats
         ) VALUES (
            %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, 1
         )""",
      [req_id, trip_id, pool_world.passenger.id])

    created_at, respond_by = q("SELECT created_at, respond_by FROM public.pool_requests WHERE id = %s", [req_id])[0]
    expected_deadline = q("""SELECT public.booking_deadline(pr.created_at, pt.depart_at, interval '30 minutes')
                             FROM public.pool_requests pr
                             JOIN public.pool_trips pt ON pt.id = pr.trip_id
                             WHERE pr.id = %s""", [req_id])[0][0]
    assert respond_by == expected_deadline


def test_accepting_after_respond_by_fails(pool_world):
    """Accepting a pool request after respond_by raises 'This request has expired'."""
    now = datetime.now(IST)
    trip_id = create_trip(pool_world.driver.id, now + timedelta(hours=3))

    req_id = uuid.uuid4()
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.passenger.id)])
    q("""INSERT INTO public.pool_requests (
            id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
            drop_label, drop_lat, drop_lng, seats
         ) VALUES (
            %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, 1
         )""",
      [req_id, trip_id, pool_world.passenger.id])

    # Simulate past respond_by via direct system update
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    q("UPDATE public.pool_requests SET respond_by = %s WHERE id = %s", [now - timedelta(minutes=5), req_id])

    # Driver attempts to accept
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.driver.id)])
    with pytest.raises(Exception) as excinfo:
        with transaction.atomic():
            q("UPDATE public.pool_requests SET status = 'confirmed' WHERE id = %s", [req_id])
    assert "This request has expired" in str(excinfo.value)


def test_expire_booking_windows_pool_requests(pool_world):
    """expire_booking_windows rejects expired pool requests with 'Driver didn't respond'."""
    now = datetime.now(IST)
    trip_id = create_trip(pool_world.driver.id, now + timedelta(hours=3))

    req_id = uuid.uuid4()
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.passenger.id)])
    q("""INSERT INTO public.pool_requests (
            id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
            drop_label, drop_lat, drop_lng, seats
         ) VALUES (
            %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, 1
         )""",
      [req_id, trip_id, pool_world.passenger.id])

    # Set respond_by in the past
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    q("UPDATE public.pool_requests SET respond_by = %s WHERE id = %s", [now - timedelta(minutes=10), req_id])

    res = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res.get("pool_expired_pending", 0) >= 1

    row = q("SELECT status, cancellation_reason FROM public.pool_requests WHERE id = %s", [req_id])[0]
    assert row[0] == "rejected"
    assert row[1] == "Driver didn't respond"

    # Seats on the trip remain unchanged
    seats_left = q("SELECT seats_available FROM public.pool_trips WHERE id = %s", [trip_id])[0][0]
    assert seats_left == 4

    # Passenger received notification
    notifs = q("""SELECT title, body FROM public.notifications
                  WHERE user_id = %s AND title = 'Request expired'""",
               [pool_world.passenger.id])
    assert len(notifs) >= 1
    assert "The driver did not respond in time" in notifs[0][1]


def test_trip_departure_closes_pending_requests(pool_world):
    """expire_booking_windows rejects pending requests on departed or cancelled trips with 'Trip departed'."""
    now = datetime.now(IST)
    # Insert trip in the past with guard temporarily disabled
    trip_id = uuid.uuid4()
    q("ALTER TABLE public.pool_trips DISABLE TRIGGER pool_trips_guard")
    try:
        q("""INSERT INTO public.pool_trips (
                id, driver_id, vehicle_label, origin_label, origin_lat, origin_lng,
                dest_label, dest_lat, dest_lng, depart_at, seats_total, seats_available,
                fare_per_seat, status
             ) VALUES (
                %s, %s, 'Toyota Etios', 'Koramangala', 12.9352, 77.6245,
                'Whitefield', 12.9698, 77.7500, %s, 4, 4,
                150, 'scheduled'
             )""",
          [trip_id, pool_world.driver.id, now - timedelta(minutes=10)])
    finally:
        q("ALTER TABLE public.pool_trips ENABLE TRIGGER pool_trips_guard")

    # Insert pending request with guard disabled to allow booking past trip for test
    req_id = uuid.uuid4()
    q("ALTER TABLE public.pool_requests DISABLE TRIGGER pool_requests_guard")
    try:
        q("""INSERT INTO public.pool_requests (
                id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                drop_label, drop_lat, drop_lng, seats, status, respond_by
             ) VALUES (
                %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
                'Whitefield', 12.9698, 77.7500, 1, 'pending', %s
             )""",
          [req_id, trip_id, pool_world.passenger.id, now + timedelta(hours=1)])
    finally:
        q("ALTER TABLE public.pool_requests ENABLE TRIGGER pool_requests_guard")

    res = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res.get("pool_expired_pending", 0) >= 1

    row = q("SELECT status, cancellation_reason FROM public.pool_requests WHERE id = %s", [req_id])[0]
    assert row[0] == "rejected"
    assert row[1] == "Trip departed"

    notifs = q("""SELECT title, body FROM public.notifications
                  WHERE user_id = %s AND title = 'Trip departed'""",
               [pool_world.passenger.id])
    assert len(notifs) >= 1


def test_pool_halfway_reminder_to_driver(pool_world):
    """expire_booking_windows sends a halfway reminder to the driver once."""
    now = datetime.now(IST)
    trip_id = create_trip(pool_world.driver.id, now + timedelta(hours=4))

    req_id = uuid.uuid4()
    q("SELECT set_config('request.jwt.claim.sub', %s, true)", [str(pool_world.passenger.id)])
    q("""INSERT INTO public.pool_requests (
            id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
            drop_label, drop_lat, drop_lng, seats
         ) VALUES (
            %s, %s, %s, 'Koramangala', 12.9352, 77.6245,
            'Whitefield', 12.9698, 77.7500, 1
         )""",
      [req_id, trip_id, pool_world.passenger.id])

    # Set created_at 40 mins ago and respond_by in 20 mins -> halfway was 10 mins ago
    created_at = now - timedelta(minutes=40)
    respond_by = now + timedelta(minutes=20)
    q("SELECT set_config('request.jwt.claim.sub', '', true)")
    q("""UPDATE public.pool_requests
         SET created_at = %s, respond_by = %s, respond_reminded_at = NULL
         WHERE id = %s""",
      [created_at, respond_by, req_id])

    res = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    assert res.get("pool_reminded_respond", 0) >= 1

    reminded_at = q("SELECT respond_reminded_at FROM public.pool_requests WHERE id = %s", [req_id])[0][0]
    assert reminded_at is not None

    notifs = q("""SELECT title, body FROM public.notifications
                  WHERE user_id = %s AND title = 'Pending pool request'""",
               [pool_world.driver.id])
    assert len(notifs) >= 1

    # Running again does not send duplicate reminder
    res2 = parse_json(q("SELECT public.expire_booking_windows()")[0][0])
    notifs2 = q("""SELECT count(*) FROM public.notifications
                   WHERE user_id = %s AND title = 'Pending pool request'""",
                [pool_world.driver.id])[0][0]
    assert notifs2 == len(notifs)


def test_pool_driver_response_stats(pool_world):
    """pool_driver_response_stats calculates response_rate and request_count over 90 days."""
    now = datetime.now(IST)
    trip_id = create_trip(pool_world.driver.id, now + timedelta(hours=5))

    q("ALTER TABLE public.pool_requests DISABLE TRIGGER pool_requests_guard")
    try:
        # Request 1: answered (confirmed) before respond_by
        req1 = uuid.uuid4()
        q("""INSERT INTO public.pool_requests (
                id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                drop_label, drop_lat, drop_lng, seats, status, created_at, respond_by, updated_at
             ) VALUES (
                %s, %s, %s, 'A', 12.9, 77.6, 'B', 12.9, 77.7, 1, 'confirmed', %s, %s, %s
             )""",
          [req1, trip_id, pool_world.passenger.id, now - timedelta(days=2), now - timedelta(days=2) + timedelta(hours=1), now - timedelta(days=2) + timedelta(minutes=20)])

        # Request 2: expired without response ('Driver didn''t respond')
        req2 = uuid.uuid4()
        q("""INSERT INTO public.pool_requests (
                id, trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                drop_label, drop_lat, drop_lng, seats, status, cancellation_reason, created_at, respond_by, updated_at
             ) VALUES (
                %s, %s, %s, 'A', 12.9, 77.6, 'B', 12.9, 77.7, 1, 'rejected', 'Driver didn''t respond', %s, %s, %s
             )""",
          [req2, trip_id, pool_world.passenger2.id, now - timedelta(days=1), now - timedelta(days=1) + timedelta(hours=1), now - timedelta(days=1)])
    finally:
        q("ALTER TABLE public.pool_requests ENABLE TRIGGER pool_requests_guard")

    stats = parse_json(q("SELECT public.pool_driver_response_stats(%s)", [pool_world.driver.id])[0][0])
    assert stats["request_count"] == 2
    assert float(stats["response_rate"]) == 0.5
