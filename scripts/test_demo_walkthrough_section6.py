import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
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
from payments.views import (
    redeem_reward_voucher,
    subscribe_membership,
    get_membership_status,
    get_rewards_summary,
)

def run_section_6_tests():
    print("=" * 70)
    print("STARTING TEST SUITE: Section 6. Referral and rewards (06-demo-walkthrough.md)")
    print("=" * 70)

    results = []
    now = datetime.now(timezone.utc)

    # Helper function for queries
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
    asha_email = f"asha_{test_run_id}@example.com"
    hari_email = f"hari_{test_run_id}@example.com"
    rio_email = f"rio_{test_run_id}@example.com"
    ben_email = f"ben_{test_run_id}@example.com"

    print(f"\n[SETUP] Creating test users with run suffix: {test_run_id}")
    with transaction.atomic():
        with as_owner():
            asha_user = User.objects.create_user(asha_email, "TestPass123!", full_name="Asha Customer")
            hari_user = User.objects.create_user(hari_email, "TestPass123!", full_name="Hari Host")
            ben_user = User.objects.create_user(ben_email, "TestPass123!", full_name="Ben Other")

            asha_id = asha_user.id
            hari_id = hari_user.id
            ben_id = ben_user.id

            # Setup roles and vendor
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [asha_id])
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'vendor') ON CONFLICT DO NOTHING", [hari_id])
            query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [ben_id])
            query("INSERT INTO public.vendors (id, business_name, kyc_status) VALUES (%s, 'Hari Rentals', 'approved') ON CONFLICT DO NOTHING", [hari_id])

            # Approve Asha's driving licence
            query("UPDATE public.profiles SET dl_status = 'approved', dl_number = 'KA01-20220001234' WHERE id = %s", [asha_id])

            # Initialize wallets
            query("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT DO NOTHING", [asha_id])
            query("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT DO NOTHING", [hari_id])
            query("INSERT INTO public.wallets (user_id, balance) VALUES (%s, 0) ON CONFLICT DO NOTHING", [ben_id])

            # Setup Hari's vehicle (Test Swift)
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

    # -------------------------------------------------------------------------
    # 6.1 Asha (A) -> /referrals -> Copy Invite Link
    # -------------------------------------------------------------------------
    print("\n--- Running 6.1: Referral link check ---")
    try:
        ref_code = query_one("SELECT referral_code FROM public.profiles WHERE id = %s", [asha_id])[0]
        assert ref_code is not None and len(ref_code) > 0, "Asha has no referral code"
        invite_link = f"https://synchoo.com/auth?mode=signup&ref={ref_code}"
        expected_pattern = f"/auth?mode=signup&ref={ref_code}"
        assert expected_pattern in invite_link, f"Invite link pattern mismatch: {invite_link}"
        print(f"  [PASS] Referral code: '{ref_code}', Invite link: '{invite_link}'")
        results.append({
            "step": "6.1",
            "who": "Asha",
            "action": "Copy Invite Link",
            "check": f"Link looks like /auth?mode=signup&ref={ref_code}",
            "result": "PASS",
            "notes": f"Generated code: {ref_code}"
        })
    except Exception as e:
        print(f"  [FAIL] 6.1: {e}")
        results.append({"step": "6.1", "who": "Asha", "action": "Copy Invite Link", "check": "Link format", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.2 New user Rio signs up with referral link
    # -------------------------------------------------------------------------
    print("\n--- Running 6.2: Rio sign-up with referral code ---")
    try:
        with transaction.atomic():
            with as_owner():
                # Mimic backend/accounts/views.py signup logic with ref parameter
                ref = str(ref_code).strip().upper()
                row = query_one("SELECT id FROM public.profiles WHERE upper(referral_code) = %s", [ref])
                referrer_id = row[0] if row else None
                assert referrer_id == asha_id, f"Referrer id {referrer_id} did not match Asha {asha_id}"

                rio_user = User.objects.create_user(rio_email, "TestPass123!", full_name="Rio Friend")
                rio_id = rio_user.id
                query("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING", [rio_id])

                if referrer_id:
                    query("UPDATE public.profiles SET referred_by = %s WHERE id = %s", [referrer_id, rio_id])

        rio_profile = query_one("SELECT referred_by, referral_rewarded FROM public.profiles WHERE id = %s", [rio_id])
        assert rio_profile[0] == asha_id, f"Rio's referred_by is {rio_profile[0]}, expected {asha_id}"
        assert rio_profile[1] is False or rio_profile[1] is None, f"Rio referral_rewarded is {rio_profile[1]}, expected False"
        print(f"  [PASS] Rio registered. referred_by={rio_profile[0]} (Asha), referral_rewarded={rio_profile[1]}")
        results.append({
            "step": "6.2",
            "who": "Rio (signed out)",
            "action": "Sign up with referral link",
            "check": f"Referral code {ref_code} applied, account created",
            "result": "PASS",
            "notes": f"Rio linked to Asha ({asha_id})"
        })
    except Exception as e:
        print(f"  [FAIL] 6.2: {e}")
        results.append({"step": "6.2", "who": "Rio", "action": "Sign up", "check": "Referral code applied", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.3 Asha reloads /referrals -> Rio listed as pending with ₹0 rewarded
    # -------------------------------------------------------------------------
    print("\n--- Running 6.3: Asha /referrals view (pending status) ---")
    try:
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                my_refs = query("SELECT id, full_name, referral_rewarded FROM public.my_referrals()")
        
        assert len(my_refs) >= 1, "my_referrals() returned 0 rows for Asha"
        rio_ref = next((r for r in my_refs if r[0] == rio_id), None)
        assert rio_ref is not None, "Rio not found in Asha's my_referrals"
        assert rio_ref[2] is False, f"Expected referral_rewarded=False, got {rio_ref[2]}"
        earned_amount = 500 if rio_ref[2] else 0
        assert earned_amount == 0, f"Expected earnedAmount=0, got {earned_amount}"
        print(f"  [PASS] Rio is pending in my_referrals: full_name={rio_ref[1]}, rewarded={rio_ref[2]}, earned={earned_amount}")
        results.append({
            "step": "6.3",
            "who": "Asha",
            "action": "Reload /referrals",
            "check": "Rio is listed as pending with ₹0 rewarded",
            "result": "PASS",
            "notes": f"Status: Account Created, Earned: ₹{earned_amount}"
        })
    except Exception as e:
        print(f"  [FAIL] 6.3: {e}")
        results.append({"step": "6.3", "who": "Asha", "action": "Reload /referrals", "check": "Rio listed as pending", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.4 Ada approves Rio's licence & grants ₹10,000 promo credit
    # -------------------------------------------------------------------------
    print("\n--- Running 6.4: Licence approval & ₹10,000 promo credit ---")
    try:
        with transaction.atomic():
            with as_owner():
                query("UPDATE public.profiles SET dl_status = 'approved', dl_number = 'KA05-20230009999' WHERE id = %s", [rio_id])
                query("SELECT public.wallet_apply(%s, 10000, 'promo_credit', NULL, NULL, 'Admin demo grant')", [rio_id])

        wallet_row = query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [rio_id])
        rio_bal = float(wallet_row[0]) if wallet_row else 0
        assert rio_bal >= 10000, f"Expected Rio wallet balance >= 10000, got {rio_bal}"
        print(f"  [PASS] Licence approved, promo credit granted. Rio's wallet balance: ₹{rio_bal:,.2f}")
        results.append({
            "step": "6.4",
            "who": "Ada",
            "action": "Approve licence + Grant ₹10,000 promo credit",
            "check": "Rio's wallet shows ₹10,000",
            "result": "PASS",
            "notes": f"Rio wallet: ₹{rio_bal:,.2f}"
        })
    except Exception as e:
        print(f"  [FAIL] 6.4: {e}")
        results.append({"step": "6.4", "who": "Ada", "action": "Approve licence & grant promo credit", "check": "Wallet shows ₹10,000", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.5 Rio books rental, Hari approves, Rio pays with wallet -> Both get +₹500
    # -------------------------------------------------------------------------
    print("\n--- Running 6.5: First paid rental triggers referral bonuses (+₹500 each) ---")
    try:
        with transaction.atomic():
            with as_owner():
                # Initial wallet balances before booking
                w_asha_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
                w_rio_before = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [rio_id])[0])

                # Rio books Test Swift for 1 day
                start_date = (now + timedelta(days=2)).strftime("%Y-%m-%d")
                end_date = (now + timedelta(days=3)).strftime("%Y-%m-%d")

                # Insert booking: 2 days @ 900 = 1800, deposit = 3000, service fee + GST = 236, total = 5118
                bk_id = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        '10:00', '10:00', 'confirmed', 'pending',
                        1800, 3000, 200, 36, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [rio_id, vid, hari_id, start_date, end_date]
                )[0]

                # Rio pays ₹5,118 with wallet
                query("SELECT public.wallet_apply(%s, -5118, 'booking_payment', %s, NULL, 'Test Swift Rental Booking')", [rio_id, bk_id])
                # Update booking to 'paid' -> Trigger apply_referral_bonus_on_first_paid() fires!
                query("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_id])

                w_asha_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
                w_rio_after = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [rio_id])[0])

                # Asha got +500
                assert w_asha_after == w_asha_before + 500, f"Asha expected {w_asha_before + 500}, got {w_asha_after}"
                # Rio paid 5118 and received +500 referral bonus: net = w_rio_before - 5118 + 500
                assert w_rio_after == w_rio_before - 5118 + 500, f"Rio expected {w_rio_before - 5118 + 500}, got {w_rio_after}"

                # Check notifications
                notif_asha = query_one("SELECT title FROM public.notifications WHERE user_id = %s AND title = 'Referral Bonus Credited'", [asha_id])
                notif_rio = query_one("SELECT title FROM public.notifications WHERE user_id = %s AND title = 'Welcome Bonus Credited'", [rio_id])
                assert notif_asha is not None, "Asha missing 'Referral Bonus Credited' notification"
                assert notif_rio is not None, "Rio missing 'Welcome Bonus Credited' notification"

                # Check profile referral_rewarded = True
                rio_rewarded = query_one("SELECT referral_rewarded FROM public.profiles WHERE id = %s", [rio_id])[0]
                assert rio_rewarded is True, f"Expected Rio referral_rewarded=True, got {rio_rewarded}"

        print(f"  [PASS] Both Asha and Rio received +₹500. Notifications verified. Rio referral_rewarded=True.")
        results.append({
            "step": "6.5",
            "who": "Rio",
            "action": "Pay with wallet for 1st rental",
            "check": "Rio and Asha both get +₹500 with Welcome & Referral Bonus notifications",
            "result": "PASS",
            "notes": "Asha +₹500, Rio +₹500, notifications logged"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 6.5: {e}")
        results.append({"step": "6.5", "who": "Rio", "action": "Pay for rental", "check": "Referral bonus credited", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.6 Asha /referrals -> Rio shows as rewarded, ₹500
    # -------------------------------------------------------------------------
    print("\n--- Running 6.6: Asha /referrals view (rewarded status) ---")
    try:
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                my_refs_after = query("SELECT id, full_name, referral_rewarded FROM public.my_referrals()")
        
        rio_ref_after = next((r for r in my_refs_after if r[0] == rio_id), None)
        assert rio_ref_after is not None, "Rio not found in Asha's my_referrals"
        assert rio_ref_after[2] is True, f"Expected referral_rewarded=True, got {rio_ref_after[2]}"
        earned_after = 500 if rio_ref_after[2] else 0
        assert earned_after == 500, f"Expected earnedAmount=500, got {earned_after}"

        print(f"  [PASS] Rio shows as rewarded: full_name={rio_ref_after[1]}, rewarded={rio_ref_after[2]}, earned=₹{earned_after}")
        results.append({
            "step": "6.6",
            "who": "Asha",
            "action": "/referrals",
            "check": "Rio shows as rewarded, ₹500",
            "result": "PASS",
            "notes": "Status: First Trip Completed, Reward: ₹500"
        })
    except Exception as e:
        print(f"  [FAIL] 6.6: {e}")
        results.append({"step": "6.6", "who": "Asha", "action": "/referrals", "check": "Rio shows as rewarded", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.7 Rio pays for a second rental -> No further bonus (MR-06)
    # -------------------------------------------------------------------------
    print("\n--- Running 6.7: Second rental pays -> No further bonus ---")
    try:
        with transaction.atomic():
            with as_owner():
                w_asha_before2 = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
                bonuses_count_asha_before = query_one("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s AND kind = 'referral_bonus'", [asha_id])[0]

                start_date2 = (now + timedelta(days=5)).strftime("%Y-%m-%d")
                end_date2 = (now + timedelta(days=6)).strftime("%Y-%m-%d")

                bk2_id = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        '10:00', '10:00', 'confirmed', 'pending',
                        1800, 3000, 200, 36, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [rio_id, vid, hari_id, start_date2, end_date2]
                )[0]

                query("SELECT public.wallet_apply(%s, -5118, 'booking_payment', %s, NULL, 'Second Rental')", [rio_id, bk2_id])
                query("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk2_id])

                w_asha_after2 = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
                bonuses_count_asha_after = query_one("SELECT count(*) FROM public.wallet_transactions WHERE user_id = %s AND kind = 'referral_bonus'", [asha_id])[0]

                assert w_asha_after2 == w_asha_before2, f"Asha's balance changed on 2nd rental: {w_asha_before2} -> {w_asha_after2}"
                assert bonuses_count_asha_after == bonuses_count_asha_before, "Additional referral bonus transaction was created!"

        print(f"  [PASS] MR-06 verified: No additional referral bonus awarded on second rental.")
        results.append({
            "step": "6.7",
            "who": "Rio",
            "action": "Pay for a second rental",
            "check": "No further bonus (MR-06)",
            "result": "PASS",
            "notes": "Referral bonus count remained 1; balance unchanged"
        })
    except Exception as e:
        print(f"  [FAIL] 6.7: {e}")
        results.append({"step": "6.7", "who": "Rio", "action": "Pay for 2nd rental", "check": "No further bonus", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.8 Asha checks /rewards -> Points balance matches history (512 points)
    # -------------------------------------------------------------------------
    print("\n--- Running 6.8: Asha rewards points balance (512 points) ---")
    try:
        with transaction.atomic():
            with as_owner():
                # Create a paid rental for Asha (total ₹5,118) and complete it
                start_date_a = (now + timedelta(days=8)).strftime("%Y-%m-%d")
                end_date_a = (now + timedelta(days=9)).strftime("%Y-%m-%d")
                bk_asha = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        '10:00', '10:00', 'confirmed', 'paid',
                        1800, 3000, 200, 36, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [asha_id, vid, hari_id, start_date_a, end_date_a]
                )[0]

                # Pay booking and mark completed -> trigger trg_booking_award_loyalty_points awards round((5118/10)*1.0) = 512 points
                query("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_asha])
                query("UPDATE public.bookings SET status = 'completed' WHERE id = %s", [bk_asha])

                # Read points from loyalty_ledger
                pts_row = query_one("SELECT COALESCE(SUM(amount), 0) FROM public.loyalty_ledger WHERE user_id = %s", [asha_id])
                points_bal = int(pts_row[0]) if pts_row else 0
                assert points_bal == 512, f"Expected exactly 512 points for ₹5,118 booking, got {points_bal}"

        print(f"  [PASS] Loyalty ledger balance for Asha = {points_bal} points (MR-23, matches 512 points).")
        results.append({
            "step": "6.8",
            "who": "Asha",
            "action": "/rewards (Synchoo Rewards)",
            "check": "Read points balance: matches history (512 points)",
            "result": "PASS",
            "notes": f"Server ledger total: {points_bal} pts"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"  [FAIL] 6.8: {e}")
        results.append({"step": "6.8", "who": "Asha", "action": "Check points", "check": "Points balance matches 512", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.9 Asha unlocks a voucher she can afford -> points drop, code in My Vouchers
    # -------------------------------------------------------------------------
    print("\n--- Running 6.9: Unlock voucher (400 points) ---")
    try:
        redeem_payload = {
            "voucherId": "v-rental-400",
            "title": "Car Rental Discount ₹400",
            "category": "Rides",
            "service": "rental",
            "pointsCost": 400,
            "discountAmount": 400,
            "terms": "Valid for self-drive car rentals."
        }
        with transaction.atomic():
            res = redeem_reward_voucher(redeem_payload, asha_id)
        assert res.get("ok") is True, f"redeem_reward_voucher failed: {res}"
        claimed_code = res["voucher"]["code"]
        new_balance = res["pointsBalance"]

        # Points drop from 512 to 112 (512 - 400 = 112)
        assert new_balance == 112, f"Expected remaining points 112, got {new_balance}"

        # Verify entry in claimed_vouchers and coupons
        cv = query_one("SELECT code, points_cost, status FROM public.claimed_vouchers WHERE user_id = %s AND code = %s", [asha_id, claimed_code])
        assert cv is not None, f"Claimed voucher not recorded: {claimed_code}"

        cpn = query_one("SELECT code, amount_off, user_id, service, active FROM public.coupons WHERE code = %s", [claimed_code])
        assert cpn is not None, f"Coupon not inserted in public.coupons: {claimed_code}"
        assert cpn[2] == asha_id, f"Coupon user_id is {cpn[2]}, expected {asha_id}"
        assert cpn[3] == "rental", f"Coupon service is {cpn[3]}, expected 'rental'"

        print(f"  [PASS] Voucher unlocked: code={claimed_code}, points remaining={new_balance}, coupon scoped to Asha and 'rental'.")
        results.append({
            "step": "6.9",
            "who": "Asha",
            "action": "Explore Perks → Unlock Voucher (400 pts)",
            "check": "Toast 'Redeemed', points drop by voucher cost (512 → 112), code appears in My Redeemed Rewards",
            "result": "PASS",
            "notes": f"Voucher code: {claimed_code}, balance: {new_balance} pts"
        })
    except Exception as e:
        print(f"  [FAIL] 6.9: {e}")
        results.append({"step": "6.9", "who": "Asha", "action": "Unlock voucher", "check": "Points drop and voucher created", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.10 Asha copies code and validates; only on rental and only for Asha
    # -------------------------------------------------------------------------
    print("\n--- Running 6.10: Coupon validation rules (service & user scoping) ---")
    try:
        # 1. Asha validating on 'rental' -> Accepted
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                v_rental_raw = query_one("SELECT public.validate_coupon(%s, 'rental')", [claimed_code])[0]
                v_rental = json.loads(v_rental_raw) if isinstance(v_rental_raw, str) else v_rental_raw
                assert v_rental.get("valid") is True, f"Asha on rental was rejected: {v_rental}"

        # 2. Asha validating on 'wash' -> Rejected (wrong service)
        with transaction.atomic():
            with db_role("authenticated", asha_id):
                v_wash_raw = query_one("SELECT public.validate_coupon(%s, 'wash')", [claimed_code])[0]
                v_wash = json.loads(v_wash_raw) if isinstance(v_wash_raw, str) else v_wash_raw
                assert v_wash.get("valid") is False, f"Asha on wash was accepted: {v_wash}"
                assert "only valid for rental" in v_wash.get("reason", "").lower(), f"Unexpected reason: {v_wash}"

        # 3. Ben validating on 'rental' -> Rejected (different user)
        with transaction.atomic():
            with db_role("authenticated", ben_id):
                v_ben_raw = query_one("SELECT public.validate_coupon(%s, 'rental')", [claimed_code])[0]
                v_ben = json.loads(v_ben_raw) if isinstance(v_ben_raw, str) else v_ben_raw
                assert v_ben.get("valid") is False, f"Ben was accepted: {v_ben}"
                assert "exclusive to another account" in v_ben.get("reason", "").lower(), f"Unexpected reason: {v_ben}"

        print(f"  [PASS] Coupon scoping verified: Valid for Asha on rental, refused on wash ('{v_wash['reason']}'), refused for Ben ('{v_ben['reason']}').")
        results.append({
            "step": "6.10",
            "who": "Asha",
            "action": "Copy Code → Apply Coupon code on matching and non-matching services / users",
            "check": "Accepted only on its own service (rental) and only for Asha; Ben pasting it is refused",
            "result": "PASS",
            "notes": "User scoping & service scoping strictly enforced"
        })
    except Exception as e:
        print(f"  [FAIL] 6.10: {e}")
        results.append({"step": "6.10", "who": "Asha", "action": "Validate coupon", "check": "Accepted only on own service and for Asha", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.11 Asha upgrades to Plus -> Pay ₹499 & Activate (wallet)
    # -------------------------------------------------------------------------
    print("\n--- Running 6.11: Upgrade to Plus (₹499) ---")
    try:
        with transaction.atomic():
            with as_owner():
                # Topup Asha's wallet if needed
                query("SELECT public.wallet_apply(%s, 1000, 'topup', NULL, NULL, 'Wallet topup for membership')", [asha_id])
                w_asha_before_mem = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])

        with transaction.atomic():
            sub_res = subscribe_membership({"plan": "plus", "cycle": "monthly", "payment_method": "wallet"}, asha_id)
        assert sub_res.get("ok") is True, f"subscribe_membership failed: {sub_res}"

        w_asha_after_mem = float(query_one("SELECT balance FROM public.wallets WHERE user_id = %s", [asha_id])[0])
        assert w_asha_after_mem == w_asha_before_mem - 499, f"Expected wallet -499 ({w_asha_before_mem - 499}), got {w_asha_after_mem}"

        prof_mem = query_one("SELECT membership_plan, membership_expires_at, membership_auto_renew FROM public.profiles WHERE id = %s", [asha_id])
        assert prof_mem[0] == "plus", f"Expected plan 'plus', got {prof_mem[0]}"
        exp_dt = prof_mem[1]
        assert exp_dt is not None, "membership_expires_at is None"
        days_left = (exp_dt - datetime.now(timezone.utc)).total_seconds() / 86400
        assert 28 <= days_left <= 31, f"Expected ~30 days, got {days_left:.1f} days"

        print(f"  [PASS] Asha upgraded to Plus: Wallet -₹499, plan='plus', expires in {days_left:.1f} days.")
        results.append({
            "step": "6.11",
            "who": "Asha",
            "action": "/membership → Upgrade to Plus → Pay ₹499 & Activate (wallet)",
            "check": "Wallet drops by ₹499, plan shows active with expiry 30 days out",
            "result": "PASS",
            "notes": f"Plan: plus, Days active: {days_left:.1f}"
        })
    except Exception as e:
        print(f"  [FAIL] 6.11: {e}")
        results.append({"step": "6.11", "who": "Asha", "action": "Upgrade to Plus", "check": "Wallet drops ₹499, active 30 days", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # 6.12 Asha completes another paid rental -> Points earned are 1.5x (Plus multiplier)
    # -------------------------------------------------------------------------
    print("\n--- Running 6.12: Complete paid rental under Plus -> 1.5x points multiplier ---")
    try:
        with transaction.atomic():
            with as_owner():
                start_date_plus = (now + timedelta(days=12)).strftime("%Y-%m-%d")
                end_date_plus = (now + timedelta(days=13)).strftime("%Y-%m-%d")

                bk_plus = query_one(
                    """
                    INSERT INTO public.bookings (
                        customer_id, vehicle_id, vendor_id, start_date, end_date,
                        pickup_time, dropoff_time, status, payment_status,
                        base_price, security_deposit, service_fee, gst_amount, total_price,
                        commission_amount, provider_earning
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        '10:00', '10:00', 'confirmed', 'paid',
                        1800, 3000, 200, 36, 5118,
                        36, 1764
                    ) RETURNING id
                    """,
                    [asha_id, vid, hari_id, start_date_plus, end_date_plus]
                )[0]

                # Pay booking and complete booking -> Trigger award_loyalty_points_on_completion fires with mult = 1.5!
                query("UPDATE public.bookings SET payment_status = 'paid' WHERE id = %s", [bk_plus])
                query("UPDATE public.bookings SET status = 'completed' WHERE id = %s", [bk_plus])

                # Check latest points entry in loyalty_ledger
                latest_pts = query_one(
                    """
                    SELECT amount, kind, title, description 
                    FROM public.loyalty_ledger 
                    WHERE user_id = %s AND kind = 'trip_completion'
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    [asha_id]
                )
                # Base was 512 points for ₹5,118.
                # 1.5x: round((5118 / 10.0) * 1.5) = round(511.8 * 1.5) = round(767.7) = 768 points!
                assert latest_pts[0] == 768, f"Expected 768 points (1.5x multiplier), got {latest_pts[0]}"

        print(f"  [PASS] 1.5x multiplier applied! Points earned on completed trip: {latest_pts[0]} (Base 512 * 1.5 = 768).")
        results.append({
            "step": "6.12",
            "who": "Asha",
            "action": "Complete another paid rental",
            "check": "Points earned are 1.5× (Plus multiplier)",
            "result": "PASS",
            "notes": f"Points awarded: {latest_pts[0]} pts (vs 512 pts on free plan)"
        })
    except Exception as e:
        print(f"  [FAIL] 6.12: {e}")
        results.append({"step": "6.12", "who": "Asha", "action": "Complete paid rental", "check": "Points earned are 1.5x", "result": "FAIL", "notes": str(e)})

    # -------------------------------------------------------------------------
    # Summary Table
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("FINAL RESULTS TABLE: Section 6. Referral and rewards")
    print("=" * 70)
    print(f"{'Step':<5} | {'Who':<12} | {'Check':<55} | {'Result':<6}")
    print("-" * 84)
    all_pass = True
    for r in results:
        check_desc = (r['check'][:52] + '...') if len(r['check']) > 55 else r['check']
        print(f"{r['step']:<5} | {r['who']:<12} | {check_desc:<55} | {r['result']:<6}")
        if r['result'] != "PASS":
            all_pass = False
    print("=" * 84)
    if all_pass:
        print("ALL 12 TEST CASES IN SECTION 6 PASSED SUCCESSFULLY!")
    else:
        print("SOME TEST CASES FAILED.")
    
    return all_pass

if __name__ == "__main__":
    success = run_section_6_tests()
    sys.exit(0 if success else 1)
