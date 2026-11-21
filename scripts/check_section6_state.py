import os
import sys
import django

sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.db import connection
from accounts.models import User

with connection.cursor() as cur:
    users = {u.email: u.id for u in User.objects.filter(email__in=['asha@example.com', 'hari@example.com', 'ada@example.com', 'ben@example.com'])}
    print("USERS:", users)

    cur.execute("""
        SELECT id, title, vendor_id, price_daily, status, verification_status 
        FROM vehicles 
        WHERE title = 'Test Swift';
    """)
    swift = cur.fetchall()
    print("TEST SWIFT:", swift)

    if not swift and 'hari@example.com' in users:
        hari_id = users['hari@example.com']
        cur.execute("""
            INSERT INTO vehicles (
                id, vendor_id, title, category, brand, model, year, fuel, transmission,
                mileage_kmpl, seats, city, address, lat, lng, description,
                price_hourly, price_daily, price_weekly, security_deposit,
                status, verification_status, verified_at, is_deleted, instant_book
            ) VALUES (
                gen_random_uuid(), %s, 'Test Swift', 'hatchback', 'Maruti', 'Swift', 2023, 'petrol', 'manual',
                22.0, 5, 'Bengaluru', 'Indiranagar, Bengaluru', 12.9716, 77.5946, 'Well-maintained Maruti Swift',
                150, 2000, 12000, 3000,
                'active', 'approved', NOW(), false, false
            ) RETURNING id;
        """, [hari_id])
        print("Created Test Swift:", cur.fetchone())

    # Check Asha's points
    asha_id = users.get('asha@example.com')
    if asha_id:
        cur.execute("SELECT points, tier FROM loyalty_profiles WHERE user_id = %s;", [asha_id])
        print("Asha Loyalty:", cur.fetchall())
        cur.execute("SELECT balance FROM wallets WHERE user_id = %s;", [asha_id])
        print("Asha Wallet:", cur.fetchall())
