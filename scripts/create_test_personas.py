import os
import sys
import uuid
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import connection, transaction
from accounts.models import User

PASSWORD = "Test@1234"

PERSONAS = [
    {
        "email": "ada@example.com",
        "name": "Ada Admin",
        "phone": "+919876543203",
        "role": "admin",
    },
    {
        "email": "asha@example.com",
        "name": "Asha Customer",
        "phone": "+919876543201",
        "role": "customer",
        "wallet_balance": 50000,
        "dl_approved": True,
        "dl_number": "KA0120220001234",
    },
    {
        "email": "hari@example.com",
        "name": "Hari Host",
        "phone": "+919876543202",
        "role": "vendor",
        "is_host": True,
    },
    {
        "email": "ben@example.com",
        "name": "Ben Customer",
        "phone": "+919876543204",
        "role": "customer",
        "wallet_balance": 50000,
        "dl_approved": True,
        "dl_number": "KA0220220005678",
    },
    {
        "email": "cara@example.com",
        "name": "Cara Cleaner",
        "phone": "+919876543205",
        "role": "cleaner",
        "is_cleaner": True,
    },
    {
        "email": "dev@example.com",
        "name": "Dev Driver",
        "phone": "+919876543206",
        "role": "customer",
        "is_driver": True,
        "dl_approved": True,
        "dl_number": "DL0420200009999",
    },
]

print("=== Starting Persona Creation and Verification ===")

# First ensure Ada Admin exists so we have an admin UID for guards
ada_user = User.objects.filter(email="ada@example.com").first()
if not ada_user:
    ada_user = User.objects.create_user(email="ada@example.com", password=PASSWORD, full_name="Ada Admin")
else:
    ada_user.set_password(PASSWORD)
    ada_user.is_active = True
    ada_user.save()

ada_id = ada_user.id
with connection.cursor() as cur:
    cur.execute("""
        INSERT INTO public.user_roles (user_id, role)
        VALUES (%s, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
    """, [ada_id])

for p in PERSONAS:
    email = p["email"]
    name = p["name"]
    user = User.objects.filter(email=email).first()
    if not user:
        print(f"Creating user: {email} ({name})...")
        user = User.objects.create_user(email=email, password=PASSWORD, full_name=name)
    else:
        print(f"User exists: {email} ({user.id}). Updating password...")
        user.set_password(PASSWORD)
        user.is_active = True
        user.save()

    uid = user.id

    with connection.cursor() as cur:
        # Act as admin for all updates
        cur.execute("SELECT set_config('request.jwt.claim.sub', %s, false);", [str(ada_id)])

        # 1. Profile updates
        cur.execute("""
            UPDATE public.profiles
            SET full_name = %s, phone = %s, city = 'Bengaluru'
            WHERE id = %s;
        """, [name, p.get("phone"), uid])

        # DL approval if applicable
        if p.get("dl_approved"):
            cur.execute("""
                UPDATE public.profiles
                SET dl_status = 'approved',
                    dl_number = %s,
                    dl_expiry = '2030-01-01',
                    dl_front_url = 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                    dl_back_url = 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                    dl_verified_at = now()
                WHERE id = %s;
            """, [p["dl_number"], uid])

        # 2. Roles
        role = p.get("role")
        if role:
            cur.execute("""
                INSERT INTO public.user_roles (user_id, role)
                VALUES (%s, %s)
                ON CONFLICT (user_id, role) DO NOTHING;
            """, [uid, role])

        # 3. Wallet Balance
        target_bal = p.get("wallet_balance", 0)
        if target_bal > 0:
            cur.execute("SELECT balance FROM public.wallets WHERE user_id = %s;", [uid])
            row = cur.fetchone()
            curr_bal = float(row[0]) if row else 0.0
            if curr_bal < target_bal:
                diff = target_bal - curr_bal
                print(f"Crediting ₹{diff:,.2f} to {email}'s wallet...")
                cur.execute("""
                    SELECT public.wallet_apply(
                        %s, %s, 'topup', NULL, 'SEED-CREDIT', 'Initial test wallet credit'
                    );
                """, [uid, diff])

        # 4. Host (Vendor) profile & vehicle
        if p.get("is_host"):
            cur.execute("""
                INSERT INTO public.vendors (id, business_name, bio, id_document_url, kyc_status, payout_email, created_at, updated_at)
                VALUES (%s, %s, %s, 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957', 'approved', %s, now(), now())
                ON CONFLICT (id) DO UPDATE SET
                    business_name = EXCLUDED.business_name,
                    id_document_url = EXCLUDED.id_document_url,
                    kyc_status = 'approved',
                    payout_email = EXCLUDED.payout_email,
                    updated_at = now();
            """, [uid, f"{name} Rentals", "Verified premium vehicle host in Bengaluru", email])

            # Ensure Test Swift vehicle exists for Hari
            cur.execute("SELECT id FROM public.vehicles WHERE vendor_id = %s AND title = 'Test Swift';", [uid])
            v_row = cur.fetchone()
            if not v_row:
                print(f"Creating 'Test Swift' vehicle for {email}...")
                v_id = uuid.uuid4()
                cur.execute("""
                    INSERT INTO public.vehicles (
                        id, vendor_id, title, category, brand, model, year,
                        fuel, transmission, mileage_kmpl, seats, city, address,
                        lat, lng, description, price_hourly, price_daily, price_weekly,
                        security_deposit, status, avg_rating, review_count,
                        verification_status, verified_at, created_at, updated_at
                    ) VALUES (
                        %s, %s, 'Test Swift', 'car', 'Maruti', 'Swift', 2024,
                        'petrol', 'manual', 22.0, 5, 'Bengaluru', 'Indiranagar, Bengaluru',
                        12.9716, 77.5946, 'Standard demo Swift in mint condition, clean and fully fueled.',
                        200, 2000, 12000, 3000, 'active', 4.9, 15,
                        'approved', now(), now(), now()
                    );
                """, [v_id, uid])
                cur.execute("""
                    INSERT INTO public.vehicle_images (id, vehicle_id, url, sort_order, created_at)
                    VALUES (%s, %s, 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341', 0, now())
                    ON CONFLICT DO NOTHING;
                """, [uuid.uuid4(), v_id])
            else:
                print(f"'Test Swift' vehicle already exists (id: {v_row[0]}). Ensuring active and approved...")
                cur.execute("""
                    UPDATE public.vehicles
                    SET status = 'active', verification_status = 'approved', is_deleted = false
                    WHERE id = %s;
                """, [v_row[0]])

        # 5. Cleaner profile
        if p.get("is_cleaner"):
            cur.execute("""
                INSERT INTO public.cleaners (
                    id, full_name, phone, city, service_area, bio,
                    experience_years, available, verification_status, services,
                    avg_rating, review_count, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, 'Bengaluru', 'Bengaluru Central & East',
                    'Professional doorstep vehicle detailing & eco wash specialist.',
                    5, true, 'approved', ARRAY['basic', 'interior', 'deep_clean', 'exterior'],
                    4.9, 28, now(), now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    phone = EXCLUDED.phone,
                    city = 'Bengaluru',
                    available = true,
                    verification_status = 'approved',
                    updated_at = now();
            """, [uid, name, p.get("phone")])

        # 6. Driver profile
        if p.get("is_driver"):
            cur.execute("""
                INSERT INTO public.drivers (
                    id, full_name, phone, city, bio, experience_years,
                    languages, vehicle_types, trip_types, hourly_rate, daily_rate,
                    status, verification_status, dl_number, dl_expiry,
                    dl_front_url, dl_back_url, id_document_url,
                    avg_rating, review_count, service_area, verified_at, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, 'Bengaluru',
                    'Professional chauffeur with 8+ years commercial driving experience.',
                    8, ARRAY['English', 'Hindi', 'Kannada'], ARRAY['Sedan', 'SUV', 'Hatchback'],
                    ARRAY['city', 'airport', 'outstation'], 300, 2500,
                    'active', 'approved', %s, '2030-01-01',
                    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                    4.9, 42, 'Bengaluru Metro Area', now(), now(), now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    phone = EXCLUDED.phone,
                    city = 'Bengaluru',
                    status = 'active',
                    verification_status = 'approved',
                    updated_at = now();
            """, [uid, name, p.get("phone"), p.get("dl_number")])

print("\n=== Ledger Check ===")
with connection.cursor() as cur:
    cur.execute("""
        SELECT w.user_id, u.email, w.balance, COALESCE(SUM(t.amount), 0) AS ledger
        FROM public.wallets w
        JOIN auth.users u ON u.id = w.user_id
        LEFT JOIN public.wallet_transactions t ON t.user_id = w.user_id
        GROUP BY w.user_id, u.email, w.balance
        HAVING w.balance <> COALESCE(SUM(t.amount), 0);
    """)
    mismatches = cur.fetchall()
    if mismatches:
        print("WARNING: Wallet ledger mismatches found:", mismatches)
    else:
        print("SUCCESS: All wallet balances match transaction ledgers exactly (0 mismatches).")

print("\n=== Personas Summary ===")
with connection.cursor() as cur:
    cur.execute("""
        SELECT u.email, p.full_name, array_agg(DISTINCT ur.role) as roles,
               COALESCE(w.balance, 0) as wallet_balance,
               p.dl_status,
               v.kyc_status as vendor_kyc,
               c.verification_status as cleaner_status,
               d.verification_status as driver_status,
               d.status as driver_avail
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.user_roles ur ON ur.user_id = u.id
        LEFT JOIN public.wallets w ON w.user_id = u.id
        LEFT JOIN public.vendors v ON v.id = u.id
        LEFT JOIN public.cleaners c ON c.id = u.id
        LEFT JOIN public.drivers d ON d.id = u.id
        WHERE u.email IN (
            'asha@example.com', 'hari@example.com', 'ada@example.com',
            'ben@example.com', 'cara@example.com', 'dev@example.com'
        )
        GROUP BY u.email, p.full_name, w.balance, p.dl_status, v.kyc_status, c.verification_status, d.verification_status, d.status
        ORDER BY u.email;
    """)
    rows = cur.fetchall()
    for r in rows:
        print(f"Email: {r[0]:<20} | Name: {r[1]:<16} | Roles: {str(r[2]):<25} | Wallet: ₹{r[3]:<8} | DL: {r[4]} | Host KYC: {r[5]} | Cleaner: {r[6]} | Driver: {r[7]} ({r[8]})")

print("\n=== Completed Successfully! ===")
