import os
import sys
from pathlib import Path

backend_dir = Path("c:/Users/gchir/stalight_ride/backend").resolve()
sys.path.insert(0, str(backend_dir))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import connection
from accounts.models import User

ACCOUNTS = [
    ("admin@test.synchoo.local", "Ada Admin", "admin"),
    ("customer1@test.synchoo.local", "Asha Customer", "customer"),
    ("customer2@test.synchoo.local", "Ben Customer", "customer"),
    ("host@test.synchoo.local", "Hari Host", "vendor"),
    ("driver@test.synchoo.local", "Dev Driver", "customer"), # driver is a profile in public.drivers, not an app_role
    ("cleaner@test.synchoo.local", "Cara Cleaner", "cleaner"),
    ("center@test.synchoo.local", "Wes WashCenter", "wash_center"),
]

PASSWORD = "Test@1234"

for email, name, role in ACCOUNTS:
    user = User.objects.filter(email=email).first()
    if not user:
        print(f"Creating user {email} ({name})...")
        user = User.objects.create_user(email=email, password=PASSWORD, full_name=name)
        print(f"Created user {email} with id {user.id}")
    else:
        print(f"User {email} exists (id {user.id}). Ensuring password...")
        user.set_password(PASSWORD)
        user.save()

    with connection.cursor() as cur:
        if role:
            cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, %s) ON CONFLICT DO NOTHING;", [user.id, role])

# Grant promo credit / wallet balance to customer1 and customer2
with connection.cursor() as cur:
    for email in ["customer1@test.synchoo.local", "customer2@test.synchoo.local"]:
        cur.execute("SELECT id FROM auth.users WHERE email = %s;", [email])
        row = cur.fetchone()
        if row:
            uid = row[0]
            print(f"Applying wallet credit to {email}...")
            cur.execute("SELECT public.wallet_apply(%s, 20000, 'topup', NULL, 'SEED-CREDIT', 'Test credit for automated testing');", [uid])

print("Test users and roles configured successfully.")
