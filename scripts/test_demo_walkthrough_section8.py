import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import uuid

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection, transaction
from accounts.models import User
from core.db import db_role, as_owner

def run_section_8_tests():
    print("=" * 70)
    print("STARTING TEST SUITE: Section 8. Car pooling (06-demo-walkthrough.md)")
    print("=" * 70)

    results = []
    now = datetime.now(timezone.utc)

    def query(sql, params=None):
        with connection.cursor() as cur:
            cur.execute(sql, params)
            if cur.description:
                return cur.fetchall()
            return None

    def query_one(sql, params=None):
        res = query(sql, params)
        return res[0] if res else None

    # Setup test personas
    test_run_id = uuid.uuid4().hex[:6]
    dev_email = f"dev_{test_run_id}@example.com"
    asha_email = f"asha_{test_run_id}@example.com"
    ben_email = f"ben_{test_run_id}@example.com"

    print(f"\n[SETUP] Creating test users with run suffix: {test_run_id}")
    with transaction.atomic():
        with as_owner():
            dev_user = User.objects.create_user(dev_email, "TestPass123!", full_name="Dev Driver")
            asha_user = User.objects.create_user(asha_email, "TestPass123!", full_name="Asha Customer")
            ben_user = User.objects.create_user(ben_email, "TestPass123!", full_name="Ben Customer")

            dev_id = dev_user.id
            asha_id = asha_user.id
            ben_id = ben_user.id

            # Setup roles
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [dev_id])
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [asha_id])
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [ben_id])

            # Dev driver profile in drivers table (optional for pooling since any customer can offer rides, but let's ensure driver profile exists)
            query("""
                INSERT INTO public.drivers (
                    id, full_name, phone, city, bio, experience_years, languages, vehicle_types,
                    hourly_rate, daily_rate, status, verification_status, avg_rating, review_count,
                    trip_types, service_area, updated_at
                ) VALUES (
                    %s, 'Dev Driver', '+91 98765 43214', 'Bengaluru', 'Verified pooling driver',
                    5, ARRAY['English', 'Hindi'], ARRAY['Sedan'], 300, 2500, 'active', 'approved',
                    5.0, 1, ARRAY['city', 'outstation'], 'Bengaluru', NOW()
                ) ON CONFLICT (id) DO NOTHING;
            """, [dev_id])

    # -------------------------------------------------------------------------
    # 8.1 Dev -> /pooling/new -> route, departure tomorrow, 3 seats, ₹200 -> Publish pooling trip
    # -------------------------------------------------------------------------
    print("\n--- Running 8.1: Dev publishes pooling trip ---")
    trip_id = None
    try:
        depart_tomorrow = now + timedelta(days=1)
        with transaction.atomic():
            with db_role("authenticated", dev_id):
                inserted = query_one("""
                    INSERT INTO public.pool_trips (
                        driver_id, vehicle_label, origin_label, origin_lat, origin_lng,
                        dest_label, dest_lat, dest_lng, route, depart_at,
                        seats_total, fare_per_seat, notes
                    ) VALUES (
                        %s, 'Hyundai Verna (KA05 MB 5678)', 'Indiranagar, Bengaluru', 12.9784, 77.6408,
                        'Whitefield ITPL, Bengaluru', 12.9855, 77.7289, '[]'::jsonb, %s,
                        3, 200, 'Commute to ITPL. Non-smoking.'
                    ) RETURNING id, status, seats_total, seats_available, fare_per_seat;
                """, [dev_id, depart_tomorrow])

                trip_id = inserted[0]
                status = inserted[1]
                seats_total = inserted[2]
                seats_available = inserted[3]
                fare_per_seat = inserted[4]

                assert status == 'scheduled', f"Expected scheduled status, got {status}"
                assert seats_total == 3, f"Expected 3 seats total, got {seats_total}"
                assert seats_available == 3, f"Expected 3 seats available, got {seats_available}"
                assert fare_per_seat == 200, f"Expected fare 200, got {fare_per_seat}"

        print(f"  [PASS] Trip {trip_id} published: status={status}, seats={seats_available}/{seats_total}, fare=₹{fare_per_seat}")
        results.append({
            "step": "8.1",
            "who": "Dev",
            "action": "Publish pooling trip (tomorrow, 3 seats, ₹200)",
            "check": "Pooling trip published (status=scheduled, seats_available=3)",
            "result": "PASS",
            "notes": f"Trip ID: {trip_id}"
        })
    except Exception as e:
        print(f"  [FAIL] 8.1: {e}")
        results.append({"step": "8.1", "who": "Dev", "action": "Publish pooling trip", "check": "Pooling trip published", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 8.2 Asha -> /pooling -> same route -> Find matching trips -> Request 1 seat(s)
    # -------------------------------------------------------------------------
    print("\n--- Running 8.2: Asha requests 1 seat on Dev's trip ---")
    request_id = None
    try:
        assert trip_id is not None, "Trip ID from 8.1 is missing"
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                # Asha searches and finds trip, requests 1 seat
                req_row = query_one("""
                    INSERT INTO public.pool_requests (
                        trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                        drop_label, drop_lat, drop_lng, seats, match_score, note
                    ) VALUES (
                        %s, %s, 'Indiranagar Metro', 12.9784, 77.6408,
                        'ITPL Main Gate', 12.9855, 77.7289, 1, 95.0, 'Office ride'
                    ) RETURNING id, status, seats, fare_total, respond_by;
                """, [trip_id, asha_id])

                request_id = req_row[0]
                req_status = req_row[1]
                req_seats = req_row[2]
                fare_total = req_row[3]
                respond_by = req_row[4]

                assert req_status == 'pending', f"Expected pending status, got {req_status}"
                assert req_seats == 1, f"Expected 1 seat, got {req_seats}"
                assert fare_total == 200, f"Expected fare 200, got {fare_total}"
                assert respond_by is not None, "Expected respond_by deadline to be populated"

        print(f"  [PASS] Request {request_id} created: status={req_status}, seats={req_seats}, fare=₹{fare_total}, respond_by={respond_by}")
        results.append({
            "step": "8.2",
            "who": "Asha",
            "action": "Request 1 seat(s) on matching trip",
            "check": "Seat requested — driver will accept or decline shortly (status=pending, respond_by set)",
            "result": "PASS",
            "notes": f"Request ID: {request_id}, respond_by: {respond_by}"
        })
    except Exception as e:
        print(f"  [FAIL] 8.2: {e}")
        results.append({"step": "8.2", "who": "Asha", "action": "Request 1 seat", "check": "Seat requested", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 8.3 Dev -> /pooling/driver -> Accept
    # -------------------------------------------------------------------------
    print("\n--- Running 8.3: Dev accepts Asha's request -> seats go 3 -> 2 ---")
    try:
        assert request_id is not None, "Request ID from 8.2 is missing"
        with transaction.atomic():
            with db_role("authenticated", dev_id):
                # Dev driver accepts the request
                query("""
                    UPDATE public.pool_requests
                    SET status = 'confirmed'
                    WHERE id = %s;
                """, [request_id])

                # Verify updated request status
                upd_req = query_one("SELECT status FROM public.pool_requests WHERE id = %s", [request_id])
                assert upd_req[0] == 'confirmed', f"Expected status confirmed, got {upd_req[0]}"

                # Verify trip seats decremented from 3 to 2
                upd_trip = query_one("SELECT seats_available, seats_total FROM public.pool_trips WHERE id = %s", [trip_id])
                assert upd_trip[0] == 2, f"Expected seats_available=2, got {upd_trip[0]}"
                assert upd_trip[1] == 3, f"Expected seats_total=3, got {upd_trip[1]}"

        print(f"  [PASS] Rider accepted: seats updated 3 -> {upd_trip[0]}")
        results.append({
            "step": "8.3",
            "who": "Dev",
            "action": "Accept Asha's request (/pooling/driver)",
            "check": "Rider accepted — seats updated, and seats go 3 → 2",
            "result": "PASS",
            "notes": f"seats_available={upd_trip[0]} (decremented from 3)"
        })
    except Exception as e:
        print(f"  [FAIL] 8.3: {e}")
        results.append({"step": "8.3", "who": "Dev", "action": "Accept rider", "check": "Seats updated 3 -> 2", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 8.4 Asha -> /pooling/mine -> Cancel booking -> Seats go back to 3
    # -------------------------------------------------------------------------
    print("\n--- Running 8.4: Asha cancels booking -> seats go back to 3 ---")
    try:
        assert request_id is not None, "Request ID is missing"
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                # Asha cancels the confirmed booking
                query("""
                    UPDATE public.pool_requests
                    SET status = 'cancelled'
                    WHERE id = %s;
                """, [request_id])

                # Verify request is cancelled
                cancelled_req = query_one("SELECT status, cancelled_by FROM public.pool_requests WHERE id = %s", [request_id])
                assert cancelled_req[0] == 'cancelled', f"Expected status cancelled, got {cancelled_req[0]}"
                assert str(cancelled_req[1]) == str(asha_id), f"Expected cancelled_by {asha_id}, got {cancelled_req[1]}"

                # Verify trip seats restored to 3
                restored_trip = query_one("SELECT seats_available, seats_total FROM public.pool_trips WHERE id = %s", [trip_id])
                assert restored_trip[0] == 3, f"Expected seats_available=3, got {restored_trip[0]}"

        print(f"  [PASS] Booking cancelled: seats restored back to {restored_trip[0]}")
        results.append({
            "step": "8.4",
            "who": "Asha",
            "action": "Cancel booking (/pooling/mine)",
            "check": "Seats go back to 3",
            "result": "PASS",
            "notes": f"seats_available={restored_trip[0]} (restored from 2 to 3)"
        })
    except Exception as e:
        print(f"  [FAIL] 8.4: {e}")
        results.append({"step": "8.4", "who": "Asha", "action": "Cancel booking", "check": "Seats go back to 3", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 8.5 Ben -> Request 4 seats -> Refused, more than seats available
    # -------------------------------------------------------------------------
    print("\n--- Running 8.5: Ben requests 4 seats (available: 3) -> Refused ---")
    try:
        assert trip_id is not None, "Trip ID is missing"
        threw_expected_error = False
        error_message = ""
        try:
            with transaction.atomic():
                with db_role("authenticated", ben_id):
                    try:
                        with transaction.atomic():  # creates a SAVEPOINT
                            query("""
                                INSERT INTO public.pool_requests (
                                    trip_id, passenger_id, pickup_label, pickup_lat, pickup_lng,
                                    drop_label, drop_lat, drop_lng, seats, match_score
                                ) VALUES (
                                    %s, %s, 'Indiranagar Metro', 12.9784, 77.6408,
                                    'ITPL Main Gate', 12.9855, 77.7289, 4, 95.0
                                );
                            """, [trip_id, ben_id])
                    except Exception as ex:
                        error_message = str(ex)
                        if "Only 3 seat(s) left on this trip" in error_message or "left on this trip" in error_message:
                            threw_expected_error = True
        except Exception as outer_ex:
            if not threw_expected_error:
                error_message = str(outer_ex)

        assert threw_expected_error, f"Expected rejection for requesting > available seats, but got error: '{error_message}'"
        print(f"  [PASS] Request correctly refused: {error_message.strip()}")
        results.append({
            "step": "8.5",
            "who": "Ben",
            "action": "Request 4 seats (exceeding 3 available)",
            "check": "Refused, because that's more than the seats available",
            "result": "PASS",
            "notes": f"Trigger raised: '{error_message.strip()}'"
        })
    except Exception as e:
        print(f"  [FAIL] 8.5: {e}")
        results.append({"step": "8.5", "who": "Ben", "action": "Request 4 seats", "check": "Refused (excess seats)", "result": "FAIL", "notes": str(e)})

    # Summary
    print("\n" + "=" * 70)
    print("TEST EXECUTION RESULTS SUMMARY:")
    print("=" * 70)
    total = len(results)
    passed = sum(1 for r in results if r["result"] == "PASS")
    failed = total - passed

    for r in results:
        status_icon = "✅ PASS" if r["result"] == "PASS" else "❌ FAIL"
        print(f"[{status_icon}] {r['step']} ({r['who']}): {r['action']} -> {r['check']}")
        if r.get("notes"):
            print(f"         Detail: {r['notes']}")

    print("-" * 70)
    print(f"TOTAL: {total} | PASSED: {passed} | FAILED: {failed}")
    print("=" * 70)

    return results

if __name__ == "__main__":
    run_section_8_tests()
