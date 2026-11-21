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

PASSWORD = "Test@1234"

with transaction.atomic():
    for email, name in [
        ("dev@example.com", "Dev Driver"),
        ("asha@example.com", "Asha Customer"),
        ("ben@example.com", "Ben Customer")
    ]:
        u = User.objects.filter(email=email).first()
        if not u:
            u = User.objects.create_user(email, PASSWORD, full_name=name)
            print(f"Created {email}")
        else:
            u.set_password(PASSWORD)
            u.is_active = True
            u.save()
            print(f"Reset password for {email}")

        with connection.cursor() as cur:
            cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer') ON CONFLICT DO NOTHING;", [u.id])

    dev = User.objects.get(email="dev@example.com")
    with connection.cursor() as cur:
        # Clean up any pending or test trips from Dev to start fresh for Section 8
        cur.execute("SELECT id FROM public.pool_trips WHERE driver_id = %s;", [dev.id])
        trip_ids = [r[0] for r in cur.fetchall()]
        if trip_ids:
            cur.execute("DELETE FROM public.pool_ratings WHERE trip_id = ANY(%s);", [trip_ids])
            cur.execute("DELETE FROM public.pool_requests WHERE trip_id = ANY(%s);", [trip_ids])
            cur.execute("DELETE FROM public.pool_trips WHERE id = ANY(%s);", [trip_ids])
            print(f"Cleaned up {len(trip_ids)} old pooling trips for Dev.")

print("Section 8 test environment ready!")
