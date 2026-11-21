import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import uuid
import json

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection, transaction
from accounts.models import User
from core.db import db_role, as_owner

IST = ZoneInfo("Asia/Kolkata")

def run_section_4_tests():
    print("=" * 70)
    print("STARTING TEST SUITE: Section 4. Cancellation and refunds (06-demo-walkthrough.md)")
    print("=" * 70)

    results = []

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
    asha_email = f"asha_c_{test_run_id}@example.com"
    hari_email = f"hari_c_{test_run_id}@example.com"

    print(f"\n[SETUP] Creating test users with run suffix: {test_run_id}")
    with transaction.atomic():
        with as_owner():
            asha_user = User.objects.create_user(asha_email, "TestPass123!", full_name="Asha Customer")
            hari_user = User.objects.create_user(hari_email, "TestPass123!", full_name="Hari Host")

            asha_id = asha_user.id
            hari_id = hari_user.id

            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [asha_id])
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'vendor') ON CONFLICT DO NOTHING", [hari_id])
            query("INSERT INTO public.vendors (id, business_name, kyc_status) VALUES (%s, 'Hari Rentals', 'approved') ON CONFLICT DO NOTHING", [hari_id])

            # Approve Asha's driving licence
            query("UPDATE public.profiles SET dl_status = 'approved', dl_number = 'KA01-20220001234' WHERE id = %s", [asha_id])

            # Initialize wallets
            query("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 50000) ON CONFLICT (user_id) DO UPDATE SET balance = 50000", [asha_id])
            query("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT (user_id) DO UPDATE SET balance = 0", [hari_id])

            # Setup Hari's vehicle (Test Swift, daily 2000, deposit 3000 -> 1 day = 5118 total)
            vid = query_one(
                """
                INSERT INTO public.vehicles (
                    vendor_id, title, category, brand, model, year, fuel, transmission, seats,
                    city, address, lat, lng, price_daily, security_deposit, status, verification_status
                ) VALUES (
                    %s, 'Test Swift', 'car', 'Maruti', 'Swift', 2023, 'petrol', 'manual', 5,
                    'Bengaluru', 'MG Road', 12.9716, 77.5946, 2000, 3000, 'active', 'approved'
                ) RETURNING id
                """,
                [hari_id]
            )[0]

    now_ist = datetime.now(IST)

    # Helper to create a standard booking of 5,118.00 total
    def create_paid_booking(pickup_dt):
        return_dt = pickup_dt + timedelta(days=1)
        start_date_str = pickup_dt.strftime("%Y-%m-%d")
        end_date_str = return_dt.strftime("%Y-%m-%d")
        pickup_time_str = pickup_dt.strftime("%H:%M:%S")
        dropoff_time_str = return_dt.strftime("%H:%M:%S")

        with transaction.atomic():
            with as_owner():
                bk_id = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, 'confirmed', 'pending',
                        2000, 3000, 100, 18, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [asha_id, vid, hari_id, start_date_str, end_date_str, pickup_time_str, dropoff_time_str]
                )[0]

                # Asha pays with wallet
                query("SELECT public.wallet_apply(%s, -5118, 'booking_payment', %s, NULL, 'Payment for Test Swift')", [asha_id, bk_id])
                query("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_id])
        return bk_id

    # -------------------------------------------------------------------------
    # 4.1: 3+ days away, Asha cancels
    # -------------------------------------------------------------------------
    print("\n--- Running 4.1: 3+ days away, Asha cancels ---")
    try:
        # Pickup 4 days from now
        pickup_41 = now_ist + timedelta(days=4)
        bk_41 = create_paid_booking(pickup_41)

        w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])

        with transaction.atomic():
            with db_role("authenticated", asha_id):
                res_raw = query_one("SELECT public.cancel_booking(%s, 'Trip plan changed')", [bk_41])[0]
                res = json.loads(res_raw) if isinstance(res_raw, str) else res_raw

        w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])
        b_row = query_one("SELECT status, payment_status, refund_amount FROM public.bookings WHERE id = %s", [bk_41])

        asha_refund = w_asha_after - w_asha_before
        hari_gain = w_hari_after - w_hari_before

        assert asha_refund == 5118.00, f"Expected Asha refund 5118.00, got {asha_refund}"
        assert hari_gain == 0.00, f"Expected Hari gain 0.00, got {hari_gain}"
        assert b_row[0] == "cancelled", f"Expected status 'cancelled', got {b_row[0]}"
        assert b_row[1] == "refunded", f"Expected payment_status 'refunded', got {b_row[1]}"

        print(f"  [PASS] 4.1: Asha refund=₹{asha_refund:,.2f}, Host gets=₹{hari_gain:,.2f}, Status='{b_row[1]}'")
        results.append({
            "step": "4.1",
            "time": "3+ days away",
            "who": "Asha",
            "expected_refund": "₹5,118.00",
            "actual_refund": f"₹{asha_refund:,.2f}",
            "expected_host": "₹0.00",
            "actual_host": f"₹{hari_gain:,.2f}",
            "status": b_row[1],
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.1: {e}")
        results.append({"step": "4.1", "time": "3+ days away", "who": "Asha", "expected_refund": "₹5,118.00", "actual_refund": "ERROR", "expected_host": "₹0.00", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # 4.2: 10 hours away, Asha cancels
    # -------------------------------------------------------------------------
    print("\n--- Running 4.2: 10 hours away, Asha cancels ---")
    try:
        # Pickup 10 hours from now
        pickup_42 = now_ist + timedelta(hours=10)
        bk_42 = create_paid_booking(pickup_42)

        w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])

        with transaction.atomic():
            with db_role("authenticated", asha_id):
                res_raw = query_one("SELECT public.cancel_booking(%s, 'Emergency cancelled')", [bk_42])[0]
                res = json.loads(res_raw) if isinstance(res_raw, str) else res_raw

        w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])
        b_row = query_one("SELECT status, payment_status, refund_amount FROM public.bookings WHERE id = %s", [bk_42])

        asha_refund = w_asha_after - w_asha_before
        hari_gain = w_hari_after - w_hari_before

        assert asha_refund == 4059.00, f"Expected Asha refund 4059.00, got {asha_refund}"
        assert hari_gain == 882.00, f"Expected Hari gain 882.00, got {hari_gain}"
        assert b_row[0] == "cancelled", f"Expected status 'cancelled', got {b_row[0]}"
        assert b_row[1] == "partially_refunded", f"Expected payment_status 'partially_refunded', got {b_row[1]}"

        print(f"  [PASS] 4.2: Asha refund=₹{asha_refund:,.2f}, Host gets=₹{hari_gain:,.2f}, Status='{b_row[1]}'")
        results.append({
            "step": "4.2",
            "time": "10 hours away",
            "who": "Asha",
            "expected_refund": "₹4,059.00",
            "actual_refund": f"₹{asha_refund:,.2f}",
            "expected_host": "₹882.00",
            "actual_host": f"₹{hari_gain:,.2f}",
            "status": b_row[1],
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.2: {e}")
        results.append({"step": "4.2", "time": "10 hours away", "who": "Asha", "expected_refund": "₹4,059.00", "actual_refund": "ERROR", "expected_host": "₹882.00", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # 4.3: 1 hour away, Asha cancels
    # -------------------------------------------------------------------------
    print("\n--- Running 4.3: 1 hour away, Asha cancels ---")
    try:
        # Pickup 1 hour from now
        pickup_43 = now_ist + timedelta(hours=1)
        bk_43 = create_paid_booking(pickup_43)

        w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])

        with transaction.atomic():
            with db_role("authenticated", asha_id):
                res_raw = query_one("SELECT public.cancel_booking(%s, 'Late cancellation')", [bk_43])[0]
                res = json.loads(res_raw) if isinstance(res_raw, str) else res_raw

        w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])
        b_row = query_one("SELECT status, payment_status, refund_amount FROM public.bookings WHERE id = %s", [bk_43])

        asha_refund = w_asha_after - w_asha_before
        hari_gain = w_hari_after - w_hari_before

        assert asha_refund == 3000.00, f"Expected Asha refund 3000.00, got {asha_refund}"
        assert hari_gain == 1764.00, f"Expected Hari gain 1764.00, got {hari_gain}"
        assert b_row[0] == "cancelled", f"Expected status 'cancelled', got {b_row[0]}"
        assert b_row[1] == "partially_refunded", f"Expected payment_status 'partially_refunded', got {b_row[1]}"

        print(f"  [PASS] 4.3: Asha refund=₹{asha_refund:,.2f} (deposit only), Host gets=₹{hari_gain:,.2f}, Status='{b_row[1]}'")
        results.append({
            "step": "4.3",
            "time": "1 hour away",
            "who": "Asha",
            "expected_refund": "₹3,000.00 (deposit only)",
            "actual_refund": f"₹{asha_refund:,.2f}",
            "expected_host": "₹1,764.00",
            "actual_host": f"₹{hari_gain:,.2f}",
            "status": b_row[1],
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.3: {e}")
        results.append({"step": "4.3", "time": "1 hour away", "who": "Asha", "expected_refund": "₹3,000.00", "actual_refund": "ERROR", "expected_host": "₹1,764.00", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # 4.4: 1 hour away, Hari cancels & refunds
    # -------------------------------------------------------------------------
    print("\n--- Running 4.4: 1 hour away, Hari cancels & refunds ---")
    try:
        pickup_44 = now_ist + timedelta(hours=1)
        bk_44 = create_paid_booking(pickup_44)

        w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])

        with transaction.atomic():
            with db_role("authenticated", hari_id):
                res_raw = query_one("SELECT public.cancel_booking(%s, 'Vehicle maintenance required')", [bk_44])[0]
                res = json.loads(res_raw) if isinstance(res_raw, str) else res_raw

        w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        w_hari_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [hari_id])[0])
        b_row = query_one("SELECT status, payment_status, refund_amount FROM public.bookings WHERE id = %s", [bk_44])

        asha_refund = w_asha_after - w_asha_before
        hari_gain = w_hari_after - w_hari_before

        assert asha_refund == 5118.00, f"Expected Asha refund 5118.00, got {asha_refund}"
        assert hari_gain == 0.00, f"Expected Hari gain 0.00, got {hari_gain}"
        assert b_row[0] == "cancelled", f"Expected status 'cancelled', got {b_row[0]}"
        assert b_row[1] == "refunded", f"Expected payment_status 'refunded', got {b_row[1]}"

        print(f"  [PASS] 4.4: Asha refund=₹{asha_refund:,.2f}, Host gets=₹{hari_gain:,.2f}, Status='{b_row[1]}'")
        results.append({
            "step": "4.4",
            "time": "1 hour away",
            "who": "Hari → Cancel & refund",
            "expected_refund": "₹5,118.00",
            "actual_refund": f"₹{asha_refund:,.2f}",
            "expected_host": "₹0.00",
            "actual_host": f"₹{hari_gain:,.2f}",
            "status": b_row[1],
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.4: {e}")
        results.append({"step": "4.4", "time": "1 hour away", "who": "Hari", "expected_refund": "₹5,118.00", "actual_refund": "ERROR", "expected_host": "₹0.00", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # 4.5: Unpaid pending request, Asha cancels
    # -------------------------------------------------------------------------
    print("\n--- Running 4.5: Unpaid pending request, Asha cancels ---")
    try:
        # Create an unpaid pending request
        pickup_45 = now_ist + timedelta(days=2)
        return_45 = pickup_45 + timedelta(days=1)
        with transaction.atomic():
            with as_owner():
                bk_45 = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        '10:00', '10:00', 'pending', 'unpaid',
                        2000, 3000, 100, 18, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [asha_id, vid, hari_id, pickup_45.strftime("%Y-%m-%d"), return_45.strftime("%Y-%m-%d")]
                )[0]

        w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        tx_count_before = query_one("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s", [asha_id])[0]

        with transaction.atomic():
            with db_role("authenticated", asha_id):
                res_raw = query_one("SELECT public.cancel_booking(%s, 'Changed mind')", [bk_45])[0]

        w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        tx_count_after = query_one("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s", [asha_id])[0]
        b_row = query_one("SELECT status, payment_status, refund_amount FROM public.bookings WHERE id = %s", [bk_45])

        assert w_asha_after == w_asha_before, "Asha wallet balance changed unexpectedly"
        assert tx_count_after == tx_count_before, "Unexpected wallet transaction created"
        assert b_row[0] == "cancelled", f"Expected status 'cancelled', got {b_row[0]}"

        print(f"  [PASS] 4.5: Refund=₹0, no wallet row created, Status='{b_row[0]}'")
        results.append({
            "step": "4.5",
            "time": "Unpaid pending request",
            "who": "Asha",
            "expected_refund": "₹0, no wallet row",
            "actual_refund": "₹0.00 (no txn)",
            "expected_host": "—",
            "actual_host": "—",
            "status": b_row[0],
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.5: {e}")
        results.append({"step": "4.5", "time": "Unpaid pending", "who": "Asha", "expected_refund": "₹0", "actual_refund": "ERROR", "expected_host": "—", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # 4.6: Completed booking, Asha cancels -> Refused
    # -------------------------------------------------------------------------
    print("\n--- Running 4.6: Completed booking, Asha cancels -> Refused ---")
    try:
        # Create a paid booking and mark it completed
        pickup_46 = now_ist + timedelta(days=1)
        bk_46 = create_paid_booking(pickup_46)

        with transaction.atomic():
            with as_owner():
                query("UPDATE public.bookings SET status = 'completed' WHERE id = %s", [bk_46])

        # Asha attempts to cancel
        refused = False
        error_msg = ""
        try:
            with transaction.atomic():
                with db_role("authenticated", asha_id):
                    query_one("SELECT public.cancel_booking(%s, 'Cancel completed booking')", [bk_46])
        except Exception as ex:
            refused = True
            all_errs = [str(ex)]
            curr = ex
            while curr.__cause__ or curr.__context__:
                curr = curr.__cause__ or curr.__context__
                all_errs.append(str(curr))
            error_msg = " | ".join(all_errs)

        assert refused is True, "Cancel was not refused on completed booking!"
        assert "This booking can no longer be cancelled" in error_msg, f"Expected error message not found: {error_msg}"

        print(f"  [PASS] 4.6: Refused as expected: '{error_msg.strip().splitlines()[-1]}'")
        results.append({
            "step": "4.6",
            "time": "Completed booking",
            "who": "Asha",
            "expected_refund": "Refused: This booking can no longer be cancelled",
            "actual_refund": "Refused: This booking can no longer be cancelled",
            "expected_host": "—",
            "actual_host": "—",
            "status": "completed (unchanged)",
            "result": "PASS"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 4.6: {e}")
        results.append({"step": "4.6", "time": "Completed booking", "who": "Asha", "expected_refund": "Refused", "actual_refund": "ERROR", "expected_host": "—", "actual_host": "ERROR", "status": "FAIL", "result": "FAIL"})

    # -------------------------------------------------------------------------
    # Summary Table
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("FINAL RESULTS TABLE: Section 4. Cancellation and refunds")
    print("=" * 80)
    print(f"{'#':<4} | {'Pickup time':<23} | {'Who cancels':<20} | {'Refund to Asha':<22} | {'Host gets':<10} | {'Status':<18} | {'Result':<6}")
    print("-" * 115)
    all_pass = True
    for r in results:
        print(f"{r['step']:<4} | {r['time']:<23} | {r['who']:<20} | {r['actual_refund']:<22} | {r['actual_host']:<10} | {r['status']:<18} | {r['result']:<6}")
        if r['result'] != "PASS":
            all_pass = False
    print("=" * 115)
    if all_pass:
        print("ALL 6 TEST CASES IN SECTION 4 PASSED SUCCESSFULLY!")
    else:
        print("SOME TEST CASES FAILED.")

    return all_pass

if __name__ == "__main__":
    success = run_section_4_tests()
    sys.exit(0 if success else 1)
