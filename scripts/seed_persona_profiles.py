import os
import sys
from pathlib import Path

# Setup Django environment
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection, transaction
from accounts.models import User

PASSWORD = "Test@1234"

PERSONAS = [
    {
        "email": "asha@example.com",
        "name": "Asha Customer",
        "roles": ["customer"],
        "dl_approved": True,
        "dl_number": "KA01-20220001234",
        "wallet_credit": 25000,
        "phone": "+91 98765 43210",
    },
    {
        "email": "hari@example.com",
        "name": "Hari Host",
        "roles": ["vendor", "customer"],
        "is_vendor": True,
        "vendor_name": "Hari Rentals",
        "phone": "+91 98765 43212",
    },
    {
        "email": "ada@example.com",
        "name": "Ada Admin",
        "roles": ["admin", "customer"],
        "phone": "+91 98765 43213",
    },
    {
        "email": "ben@example.com",
        "name": "Ben Customer",
        "roles": ["customer"],
        "dl_approved": True,
        "dl_number": "KA01-20220005678",
        "wallet_credit": 25000,
        "phone": "+91 98765 43211",
    },
    {
        "email": "cara@example.com",
        "name": "Cara Cleaner",
        "roles": ["cleaner", "customer"],
        "is_cleaner": True,
        "phone": "+91 98765 43214",
    },
    {
        "email": "dev@example.com",
        "name": "Dev Driver",
        "roles": ["customer"],
        "is_driver": True,
        "phone": "+91 98765 43215",
    },
    {
        "email": "center@example.com",
        "name": "Wes WashCenter",
        "roles": ["wash_center", "customer"],
        "is_wash_center": True,
        "phone": "+91 98765 43216",
    },
]

print("=== Setting up test personas with password:", PASSWORD, "===")

created_users = {}

for p in PERSONAS:
    email = p["email"].lower()
    name = p["name"]
    user = User.objects.filter(email=email).first()
    if not user:
        print(f"Creating user: {email} ({name})...")
        user = User.objects.create_user(email=email, password=PASSWORD, full_name=name)
        print(f"  -> Created id: {user.id}")
    else:
        print(f"User exists: {email} ({user.id}), resetting password and activating...")
        user.set_password(PASSWORD)
        user.is_active = True
        user.save()

    created_users[email] = user

    # Roles
    with connection.cursor() as cur:
        for r in p.get("roles", []):
            cur.execute(
                "INSERT INTO public.user_roles (user_id, role) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
                [user.id, r]
            )

        # Profile updates (phone, city, full_name)
        cur.execute(
            """
            UPDATE public.profiles
            SET full_name = %s,
                phone = COALESCE(phone, %s),
                city = 'Bengaluru',
                updated_at = NOW()
            WHERE id = %s;
            """,
            [name, p.get("phone", "+91 98765 43200"), user.id]
        )

        # Driving licence approval
        if p.get("dl_approved"):
            cur.execute(
                """
                UPDATE public.profiles
                SET dl_number = %s,
                    dl_expiry = '2030-12-31',
                    dl_front_url = 'dl-front.jpg',
                    dl_back_url = 'dl-back.jpg',
                    dl_status = 'approved',
                    dl_verified_at = NOW()
                WHERE id = %s;
                """,
                [p["dl_number"], user.id]
            )
            print(f"  -> DL approved for {email} ({p['dl_number']})")

        # Wallet credit
        credit = p.get("wallet_credit")
        if credit:
            cur.execute("SELECT balance FROM public.wallets WHERE user_id = %s;", [user.id])
            wrow = cur.fetchone()
            curr_bal = float(wrow[0]) if wrow else 0.0
            if curr_bal < credit:
                topup = credit - curr_bal
                cur.execute(
                    "SELECT public.wallet_apply(%s, %s, 'topup', NULL, 'SEED-CREDIT', 'Test credit for demo walkthrough');",
                    [user.id, topup]
                )
                print(f"  -> Added ₹{topup} wallet credit to {email} (new balance ₹{credit})")
            else:
                print(f"  -> Wallet balance is already ₹{curr_bal} for {email}")

        # Vendor setup
        if p.get("is_vendor"):
            cur.execute(
                """
                INSERT INTO public.vendors (id, business_name, bio, kyc_status, payout_email, updated_at)
                VALUES (%s, %s, 'Premium rental fleet in Bengaluru', 'approved', %s, NOW())
                ON CONFLICT (id) DO UPDATE
                SET business_name = EXCLUDED.business_name,
                    kyc_status = 'approved',
                    payout_email = EXCLUDED.payout_email,
                    updated_at = NOW();
                """,
                [user.id, p.get("vendor_name", "Hari Rentals"), email]
            )
            print(f"  -> Vendor profile approved for {email}")

            # Only Hari's own "Test Swift": taking another host's car orphans its bookings
            # (their vendor_id keeps the old host), see create_test_personas.py for creating one.
            cur.execute(
                """
                UPDATE public.vehicles
                SET status = 'active', verification_status = 'approved', is_deleted = false
                WHERE title = 'Test Swift' AND vendor_id = %s;
                """,
                [user.id]
            )
            if cur.rowcount:
                print(f"  -> 'Test Swift' for Hari ({user.id}) is active and approved")
            else:
                print(f"  -> Hari ({user.id}) has no 'Test Swift'; run create_test_personas.py to add one")

        # Cleaner setup
        if p.get("is_cleaner"):
            cur.execute(
                """
                INSERT INTO public.cleaners (id, full_name, phone, city, service_area, bio, experience_years, available, verification_status, services, updated_at)
                VALUES (%s, %s, %s, 'Bengaluru', 'Bengaluru', 'Professional doorstep vehicle cleaning specialist.', 5, true, 'approved', ARRAY['express', 'deep', 'interior'], NOW())
                ON CONFLICT (id) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    available = true,
                    verification_status = 'approved',
                    updated_at = NOW();
                """,
                [user.id, name, p["phone"]]
            )
            print(f"  -> Cleaner profile approved for {email}")

        # Driver setup
        if p.get("is_driver"):
            cur.execute(
                """
                INSERT INTO public.drivers (id, full_name, phone, city, bio, experience_years, languages, vehicle_types, hourly_rate, daily_rate, status, verification_status, avg_rating, review_count, trip_types, service_area, updated_at)
                VALUES (%s, %s, %s, 'Bengaluru', 'Professional verified driver with 6+ years experience across Bengaluru.', 6, ARRAY['English', 'Hindi', 'Kannada'], ARRAY['Sedan', 'SUV', 'Hatchback'], 300, 2500, 'active', 'approved', 5.0, 1, ARRAY['city', 'outstation', 'airport'], 'Bengaluru', NOW())
                ON CONFLICT (id) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    status = 'active',
                    verification_status = 'approved',
                    updated_at = NOW();
                """,
                [user.id, name, p["phone"]]
            )
            print(f"  -> Driver profile approved for {email}")

        # Wash Center setup
        if p.get("is_wash_center"):
            cur.execute(
                """
                INSERT INTO public.wash_centers (id, name, city, address, contact_phone, contact_email, daily_capacity, opening_time, closing_time, active, verification_status, updated_at)
                VALUES (%s, %s, 'Bengaluru', 'Indiranagar, 100ft Road, Bengaluru', %s, %s, 20, '08:00', '20:00', true, 'approved', NOW())
                ON CONFLICT (id) DO UPDATE
                SET name = EXCLUDED.name,
                    active = true,
                    verification_status = 'approved',
                    updated_at = NOW();
                """,
                [user.id, name, p["phone"], email]
            )
            print(f"  -> Wash Center profile approved for {email}")

print("\n=== All Test Persona Profiles Setup Completed Successfully ===")
