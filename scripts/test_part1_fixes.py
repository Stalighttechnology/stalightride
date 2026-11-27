import os
import sys
import uuid
import shutil
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta, date, time

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from django.db import connection, transaction
from django.test import RequestFactory
from accounts.models import User
from core.db import db_role, as_owner
from files.views import public_file, purge_user_media

def run_tests():
    print("=" * 75)
    print("RUNNING AUTOMATED VERIFICATION SUITE FOR PART 1 FIXES")
    print("=" * 75)
    results = {}

    test_id = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # Setup test personas
    with transaction.atomic():
        with as_owner():
            u_attacker = User.objects.create_user(f"attacker_{test_id}@test.local", "Pass123!", full_name="Attacker User")
            u_customer = User.objects.create_user(f"customer_{test_id}@test.local", "Pass123!", full_name="Legit Customer")
            u_host = User.objects.create_user(f"host_{test_id}@test.local", "Pass123!", full_name="Legit Host")

            with connection.cursor() as cur:
                cur.execute("""
                    UPDATE profiles 
                    SET dl_status = 'approved', dl_number = 'KA01-20220009999', dl_verified_at = NOW()
                    WHERE id = %s;
                """, [u_customer.id])
                cur.execute("""
                    INSERT INTO user_roles (user_id, role) VALUES (%s, 'vendor') ON CONFLICT DO NOTHING;
                """, [u_host.id])
                cur.execute("""
                    INSERT INTO vendors (id, business_name, kyc_status) 
                    VALUES (%s, 'Host Rentals', 'approved')
                    ON CONFLICT (id) DO NOTHING;
                """, [u_host.id])
                cur.execute("""
                    INSERT INTO wallets (user_id, balance) 
                    VALUES (%s, 5000), (%s, 5000), (%s, 0)
                    ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance;
                """, [u_attacker.id, u_customer.id, u_host.id])

                # Approved vehicle
                cur.execute("""
                    INSERT INTO vehicles (
                        vendor_id, title, category, brand, model, year, fuel, transmission,
                        price_daily, security_deposit, status, verification_status, city, address, lat, lng
                    ) VALUES (
                        %s, 'Approved Car', 'car', 'Toyota', 'Yaris', 2022, 'petrol', 'manual',
                        1500, 3000, 'draft', 'pending', 'Bengaluru', 'MG Road', 12.9716, 77.5946
                    ) RETURNING id;
                """, [u_host.id])
                v_approved_id = cur.fetchone()[0]

                # Admin approves vehicle
                cur.execute("""
                    UPDATE vehicles 
                    SET status = 'active', verification_status = 'approved', verified_at = NOW()
                    WHERE id = %s;
                """, [v_approved_id])

                # Unapproved vehicle
                cur.execute("""
                    INSERT INTO vehicles (
                        vendor_id, title, category, brand, model, year, fuel, transmission,
                        price_daily, security_deposit, status, verification_status, city, address, lat, lng
                    ) VALUES (
                        %s, 'Pending Car', 'car', 'Toyota', 'Corolla', 2023, 'petrol', 'manual',
                        2000, 3000, 'draft', 'pending', 'Bengaluru', 'MG Road', 12.9716, 77.5946
                    ) RETURNING id;
                """, [u_host.id])
                v_pending_id = cur.fetchone()[0]

                # Booking owned by u_customer on v_approved_id
                cur.execute("""
                    INSERT INTO bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status, total_price, security_deposit
                    ) VALUES (
                        %s, %s, %s, (CURRENT_DATE + 5), (CURRENT_DATE + 7),
                        '10:00:00', '10:00:00', 'confirmed', 'paid', 3000, 3000
                    ) RETURNING id;
                """, [u_customer.id, v_approved_id, u_host.id])
                b_id = cur.fetchone()[0]

    # -------------------------------------------------------------------------
    # TEST 1: FIX-01-SEC-01 (Incident Reporting Cross-User Abuse & Notification Spam)
    # -------------------------------------------------------------------------
    print("\n--- Testing FIX-01-SEC-01: Incident Reporting Access Control ---")
    try:
        # 1. Attacker tries to insert incident against customer's booking -> MUST FAIL
        attacker_blocked = False
        with transaction.atomic():
            with db_role("authenticated", u_attacker.id):
                try:
                    with transaction.atomic():
                        with connection.cursor() as cur:
                            cur.execute("""
                                INSERT INTO public.incidents (reporter_id, type, booking_id, description)
                                VALUES (%s, 'accident', %s, 'Malicious fake accident report');
                            """, [u_attacker.id, b_id])
                except Exception as ex:
                    attacker_blocked = True
                    print(f"  [PASS] Cross-user incident report blocked: {ex}")

        assert attacker_blocked, "Attacker was able to insert an incident on a foreign booking!"

        # 2. Legit customer inserts incident against their own booking -> MUST SUCCEED
        with transaction.atomic():
            with db_role("authenticated", u_customer.id):
                with connection.cursor() as cur:
                    cur.execute("""
                        INSERT INTO public.incidents (reporter_id, type, booking_id, description, item_name)
                        VALUES (%s, 'lost_item', %s, 'Forgot sunglasses', 'RayBan');
                    """, [u_customer.id, b_id])
                print("  [PASS] Legitimate customer successfully reported incident on their booking.")

        # 3. Verify notification went to host
        with connection.cursor() as cur:
            cur.execute("SELECT id, title, body FROM notifications WHERE user_id = %s ORDER BY created_at DESC LIMIT 1;", [u_host.id])
            notif = cur.fetchone()
            assert notif is not None and "Lost Item Reported" in notif[1], f"Expected notification for host, got {notif}"
            print(f"  [PASS] Notification dispatched to host: {notif[1]}")

        # 4. Attacker inserts general SOS alert (no booking_id) -> MUST SUCCEED
        with transaction.atomic():
            with db_role("authenticated", u_attacker.id):
                with connection.cursor() as cur:
                    cur.execute("""
                        INSERT INTO public.incidents (reporter_id, type, booking_id, description, lat, lng)
                        VALUES (%s, 'sos', NULL, 'Emergency SOS', 12.9716, 77.5946);
                    """, [u_attacker.id])
                print("  [PASS] SOS without booking_id successfully filed.")

        results["FIX-01-SEC-01"] = {"status": "Passed", "notes": "Cross-user foreign booking incident reports rejected by RLS. Legitimate booking parties and booking-less SOS alerts allowed."}
    except Exception as e:
        print(f"  [FAIL] FIX-01-SEC-01: {e}")
        results["FIX-01-SEC-01"] = {"status": "Failed", "notes": str(e)}

    # -------------------------------------------------------------------------
    # TEST 2: FIX-01-SEC-02 (Unapproved Vehicle Images Public Storage Leak)
    # -------------------------------------------------------------------------
    print("\n--- Testing FIX-01-SEC-02: Storage Gating for Unapproved Vehicle Photos ---")
    try:
        rf = RequestFactory()
        
        # Create media directories and files on disk
        media_root = Path(settings.MEDIA_ROOT)
        pending_dir = media_root / "vehicle-images" / str(u_host.id) / str(v_pending_id)
        approved_dir = media_root / "vehicle-images" / str(u_host.id) / str(v_approved_id)
        pending_dir.mkdir(parents=True, exist_ok=True)
        approved_dir.mkdir(parents=True, exist_ok=True)

        pending_file = pending_dir / "car_pending.jpg"
        approved_file = approved_dir / "car_approved.jpg"
        pending_file.write_bytes(b"FAKE_PENDING_IMAGE_DATA")
        approved_file.write_bytes(b"FAKE_APPROVED_IMAGE_DATA")

        pending_obj_name = f"{u_host.id}/{v_pending_id}/car_pending.jpg"
        approved_obj_name = f"{u_host.id}/{v_approved_id}/car_approved.jpg"

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO storage.objects (bucket_id, name, owner)
                VALUES ('vehicle-images', %s, %s), ('vehicle-images', %s, %s)
                ON CONFLICT (bucket_id, name) DO NOTHING;
            """, [pending_obj_name, u_host.id, approved_obj_name, u_host.id])

        # 1. Anonymous request to unapproved vehicle image -> MUST RETURN 404
        req_anon = rf.get(f"/api/storage/file/vehicle-images/{pending_obj_name}")
        anon_blocked = False
        try:
            resp = public_file(req_anon, "vehicle-images", pending_obj_name)
            if resp.status_code == 404:
                anon_blocked = True
        except django.http.Http404:
            anon_blocked = True
        assert anon_blocked, "Anonymous visitor was able to access unapproved vehicle image!"
        print("  [PASS] Anonymous visitor blocked with 404 on unapproved vehicle photo.")

        # 2. Anonymous request to approved vehicle image -> MUST SUCCEED (200)
        req_anon_appr = rf.get(f"/api/storage/file/vehicle-images/{approved_obj_name}")
        resp_appr = public_file(req_anon_appr, "vehicle-images", approved_obj_name)
        assert resp_appr.status_code == 200, f"Expected 200 for approved vehicle photo, got {resp_appr.status_code}"
        print("  [PASS] Anonymous visitor served 200 for approved vehicle photo.")

        # 3. Host requesting their own unapproved vehicle image -> MUST SUCCEED (200)
        req_host = rf.get(f"/api/storage/file/vehicle-images/{pending_obj_name}")
        req_host.user = u_host
        resp_host = public_file(req_host, "vehicle-images", pending_obj_name)
        assert resp_host.status_code == 200, f"Expected 200 for host viewing own pending photo, got {resp_host.status_code}"
        print("  [PASS] Host authorized to view own unapproved vehicle photo.")

        results["FIX-01-SEC-02"] = {"status": "Passed", "notes": "public_file correctly returns 404 for unapproved vehicle images, while serving approved vehicles and allowing host access."}
    except Exception as e:
        print(f"  [FAIL] FIX-01-SEC-02: {e}")
        results["FIX-01-SEC-02"] = {"status": "Failed", "notes": str(e)}

    # -------------------------------------------------------------------------
    # TEST 3: FIX-01-CONC-01 (Mathematical Double-Booking Exclusion Constraint)
    # -------------------------------------------------------------------------
    print("\n--- Testing FIX-01-CONC-01: Double-Booking Exclusion Constraint ---")
    try:
        # Create a test vehicle for concurrency
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("""
                    INSERT INTO vehicles (
                        vendor_id, title, category, brand, model, year, fuel, transmission,
                        price_daily, security_deposit, status, verification_status, city, address, lat, lng
                    ) VALUES (
                        %s, 'Concurrency Test Swift', 'car', 'Maruti', 'Swift', 2023, 'petrol', 'manual',
                        1200, 3000, 'draft', 'pending', 'Bengaluru', 'MG Road', 12.9716, 77.5946
                    ) RETURNING id;
                """, [u_host.id])
                v_conc_id = cur.fetchone()[0]

                cur.execute("""
                    UPDATE vehicles 
                    SET status = 'active', verification_status = 'approved', verified_at = NOW()
                    WHERE id = %s;
                """, [v_conc_id])

        barrier = threading.Barrier(10)
        successes = []
        failures = []

        def attempt_booking(thread_idx):
            barrier.wait()
            try:
                # Run an insert for overlapping dates
                with transaction.atomic():
                    with connection.cursor() as cur:
                        cur.execute("""
                            INSERT INTO public.bookings (
                                customer_id, vehicle_id, vendor_id, start_date, end_date,
                                pickup_time, dropoff_time, status, payment_status, total_price, security_deposit
                            ) VALUES (
                                %s, %s, %s, (CURRENT_DATE + 15), (CURRENT_DATE + 18),
                                '10:00:00', '10:00:00', 'pending', 'unpaid', 3600, 3000
                            ) RETURNING id;
                        """, [u_customer.id, v_conc_id, u_host.id])
                        bid = cur.fetchone()[0]
                        successes.append(bid)
            except Exception as ex:
                failures.append(str(ex))

        threads = [threading.Thread(target=attempt_booking, args=(i,)) for i in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()

        print(f"  Concurrent Booking Results: {len(successes)} succeeded, {len(failures)} failed.")
        assert len(successes) == 1, f"Expected exactly 1 booking to succeed, but {len(successes)} succeeded!"
        assert len(failures) == 9, f"Expected 9 bookings to fail, but {len(failures)} failed!"
        print("  [PASS] Exactly 1 concurrent reservation succeeded; 9 failed with exclusion/availability conflict.")

        results["FIX-01-CONC-01"] = {"status": "Passed", "notes": f"10 concurrent threads tested: 1 succeeded, 9 rejected by exclusion constraint / pessimistic lock."}
    except Exception as e:
        print(f"  [FAIL] FIX-01-CONC-01: {e}")
        results["FIX-01-CONC-01"] = {"status": "Failed", "notes": str(e)}

    # -------------------------------------------------------------------------
    # TEST 4: FIX-01-SEC-03 (Account Deletion Storage & Media Disk Purge)
    # -------------------------------------------------------------------------
    print("\n--- Testing FIX-01-SEC-03: Account Deletion Storage & Disk Purge ---")
    try:
        u_delete = User.objects.create_user(f"todelete_{test_id}@test.local", "Pass123!", full_name="User To Delete")
        u_del_id = u_delete.id
        
        # Seed mock documents on disk
        kyc_user_dir = media_root / "kyc-docs" / str(u_del_id)
        avatar_user_dir = media_root / "avatars" / str(u_del_id)
        kyc_user_dir.mkdir(parents=True, exist_ok=True)
        avatar_user_dir.mkdir(parents=True, exist_ok=True)

        dl_file = kyc_user_dir / "driving_licence.pdf"
        avatar_file = avatar_user_dir / "face.png"
        dl_file.write_bytes(b"CONFIDENTIAL_DRIVING_LICENCE_DATA")
        avatar_file.write_bytes(b"AVATAR_IMAGE_DATA")

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO storage.objects (bucket_id, name, owner)
                VALUES ('kyc-docs', %s, %s), ('avatars', %s, %s);
            """, [f"{u_del_id}/driving_licence.pdf", u_del_id, f"{u_del_id}/face.png", u_del_id])

        # Purge user media
        purge_user_media(u_del_id)

        # Verify disk folders deleted
        assert not kyc_user_dir.exists(), f"KYC directory {kyc_user_dir} still exists on disk!"
        assert not avatar_user_dir.exists(), f"Avatar directory {avatar_user_dir} still exists on disk!"

        # Verify storage.objects rows deleted
        with connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM storage.objects WHERE (storage.foldername(name))[1] = %s;", [str(u_del_id)])
            cnt = cur.fetchone()[0]
            assert cnt == 0, f"Expected 0 storage objects for user, found {cnt}"

        print("  [PASS] All disk media directories and storage.objects records purged.")
        results["FIX-01-SEC-03"] = {"status": "Passed", "notes": "purge_user_media successfully removed KYC docs, avatars, and storage.objects records without orphaned disk files."}
    except Exception as e:
        print(f"  [FAIL] FIX-01-SEC-03: {e}")
        results["FIX-01-SEC-03"] = {"status": "Failed", "notes": str(e)}

    # -------------------------------------------------------------------------
    # TEST 5: FIX-01-HOST-01 (Vehicle Hard vs Soft Deletion State Consistency)
    # -------------------------------------------------------------------------
    print("\n--- Testing FIX-01-HOST-01: Vehicle Soft Deletion Consistency ---")
    try:
        # Create vehicle, then soft-delete it
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("""
                    INSERT INTO vehicles (
                        vendor_id, title, category, brand, model, year, fuel, transmission,
                        price_daily, security_deposit, status, verification_status, city, address, lat, lng
                    ) VALUES (
                        %s, 'Vehicle To Soft Delete', 'car', 'Honda', 'City', 2021, 'petrol', 'manual',
                        1800, 3000, 'active', 'approved', 'Bengaluru', 'MG Road', 12.9716, 77.5946
                    ) RETURNING id;
                """, [u_host.id])
                v_del_id = cur.fetchone()[0]

                # Soft delete vehicle
                cur.execute("UPDATE vehicles SET is_deleted = true, status = 'paused' WHERE id = %s;", [v_del_id])

        # 1. Anonymous user cannot see soft-deleted vehicle via SELECT policy
        with transaction.atomic():
            with db_role("anon"):
                with connection.cursor() as cur:
                    cur.execute("SELECT count(*) FROM vehicles WHERE id = %s;", [v_del_id])
                    cnt_anon = cur.fetchone()[0]
                    assert cnt_anon == 0, f"Soft-deleted vehicle was visible to anonymous user!"
        print("  [PASS] Soft-deleted vehicle is hidden from anonymous public catalog.")

        # 2. Host cannot see soft-deleted vehicle via normal vendor list policy
        with transaction.atomic():
            with db_role("authenticated", u_host.id):
                with connection.cursor() as cur:
                    cur.execute("SELECT count(*) FROM vehicles WHERE id = %s;", [v_del_id])
                    cnt_host = cur.fetchone()[0]
                    assert cnt_host == 0, f"Soft-deleted vehicle was visible in host fleet!"
        print("  [PASS] Soft-deleted vehicle is hidden from host fleet list.")

        # 3. Host tries to unpause/activate soft-deleted vehicle -> MUST FAIL
        reactivate_blocked = False
        with transaction.atomic():
            with db_role("authenticated", u_host.id):
                try:
                    with transaction.atomic():
                        with connection.cursor() as cur:
                            cur.execute("UPDATE vehicles SET status = 'active' WHERE id = %s;", [v_del_id])
                            if cur.rowcount == 0:
                                reactivate_blocked = True
                                print("  [PASS] Reactivation blocked via RLS (0 rows updated).")
                except Exception as ex:
                    reactivate_blocked = True
                    print(f"  [PASS] Reactivation blocked via exception: {ex}")

        assert reactivate_blocked, "Host was able to reactivate a soft-deleted vehicle!"

        # 4. Trigger check: even if matched, setting status = 'active' on soft-deleted vehicle is rejected
        trigger_blocked = False
        try:
            with transaction.atomic():
                with connection.cursor() as cur:
                    cur.execute("UPDATE vehicles SET status = 'active' WHERE id = %s;", [v_del_id])
        except Exception as ex:
            trigger_blocked = True
            print(f"  [PASS] Trigger enforce_vehicle_deletion_integrity blocked reactivation: {ex}")
        assert trigger_blocked, "Trigger did not block setting active status on soft-deleted vehicle!"

        results["FIX-01-HOST-01"] = {"status": "Passed", "notes": "Soft-deleted vehicle is hidden from public and host fleet queries; reactivation rejected by trigger."}
    except Exception as e:
        print(f"  [FAIL] FIX-01-HOST-01: {e}")
        results["FIX-01-HOST-01"] = {"status": "Failed", "notes": str(e)}

    # Summary
    print("\n" + "=" * 75)
    print("FINAL SUMMARY OF PART 1 FIXES VERIFICATION:")
    print("=" * 75)
    all_passed = True
    for fid, r in results.items():
        icon = "✅" if r["status"] == "Passed" else "❌"
        print(f"{icon} {fid}: {r['status']} - {r['notes']}")
        if r["status"] != "Passed":
            all_passed = False

    return all_passed, results

if __name__ == "__main__":
    success, _ = run_tests()
    sys.exit(0 if success else 1)
