import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection, transaction
from accounts.models import User

with connection.cursor() as cur:
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (table_name ILIKE '%reward%' OR table_name ILIKE '%loyalty%' OR table_name ILIKE '%voucher%' OR table_name ILIKE '%coupon%');
    """)
    print("Relevant tables:", [r[0] for r in cur.fetchall()])

    # Check claimed_vouchers and coupons
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'coupons';")
    print("Coupons columns:", [r[0] for r in cur.fetchall()])

    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'loyalty_ledger';")
    print("Loyalty ledger columns:", [r[0] for r in cur.fetchall()])

    # Clean up any existing Rio users from prior manual runs to ensure clean signup
    cur.execute("SELECT id, email FROM accounts_user WHERE email ILIKE 'rio%@example.com';")
    rio_users = cur.fetchall()
    print("Existing Rio users:", rio_users)

    # Let's clean up test rio user if exists so Rio can sign up cleanly
    for uid, uemail in rio_users:
        if 'rio_live' in uemail or 'rio_demo' in uemail:
            print(f"Deleting test user {uemail} ({uid})...")
            cur.execute("DELETE FROM bookings WHERE customer_id = %s;", [uid])
            cur.execute("DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = %s);", [uid])
            cur.execute("DELETE FROM wallets WHERE user_id = %s;", [uid])
            cur.execute("DELETE FROM notifications WHERE user_id = %s;", [uid])
            cur.execute("DELETE FROM user_roles WHERE user_id = %s;", [uid])
            cur.execute("DELETE FROM profiles WHERE id = %s;", [uid])
            cur.execute("DELETE FROM accounts_user WHERE id = %s;", [uid])
            print(f"Deleted {uemail}")

    # Ensure Hari has active Test Swift
    cur.execute("SELECT id FROM accounts_user WHERE email = 'hari@example.com';")
    hari_row = cur.fetchone()
    if hari_row:
        hari_id = hari_row[0]
        cur.execute("""
            UPDATE vehicles 
            SET status = 'active', verification_status = 'approved', is_deleted = false, price_daily = 2000, security_deposit = 3000
            WHERE title = 'Test Swift' AND vendor_id = %s;
        """, [hari_id])
        print("Updated Test Swift for Hari.")

    # Check Asha's points balance in loyalty_ledger
    cur.execute("SELECT id FROM accounts_user WHERE email = 'asha@example.com';")
    asha_row = cur.fetchone()
    if asha_row:
        asha_id = asha_row[0]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM loyalty_ledger WHERE user_id = %s;", [asha_id])
        pts = cur.fetchone()[0]
        print(f"Asha's current loyalty points: {pts}")
        # Section 6.8 expects Asha to have 512 points from section 2 rental booking
        if pts != 512:
            print(f"Adjust Asha loyalty points to 512 (currently {pts})...")
            diff = 512 - pts
            cur.execute("""
                INSERT INTO loyalty_ledger (user_id, amount, kind, title, description, created_at)
                VALUES (%s, %s, 'earn', 'Rental Booking Reward', 'Completed rental #BK-RENTAL-DEMO', NOW());
            """, [asha_id, diff])
            print("Asha loyalty points set to 512.")
        
        # Check Asha's wallet balance
        cur.execute("SELECT balance FROM wallets WHERE user_id = %s;", [asha_id])
        wbal = cur.fetchone()[0]
        print(f"Asha's wallet balance: {wbal}")
        if wbal < 5000:
            cur.execute("SELECT public.wallet_apply(%s, %s, 'topup', NULL, 'SEED-CREDIT', 'Asha test funds');", [asha_id, 10000])
            print("Asha wallet topped up.")

    # Reset Asha's membership to standard for step 6.11
    if asha_row:
        cur.execute("""
            UPDATE profiles 
            SET membership_plan = 'standard', membership_cycle = 'monthly', membership_started_at = NULL, membership_expires_at = NULL
            WHERE id = %s;
        """, [asha_row[0]])
        print("Reset Asha's membership to standard.")
