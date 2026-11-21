import os, sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    # Check pool_request status enum
    cur.execute("""
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'pool_requests' AND column_name = 'status';
    """)
    print("pool_requests.status type:", cur.fetchone())

    cur.execute("""
        SELECT e.enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'pool_request_status'
        ORDER BY e.enumsortorder;
    """)
    print("pool_request_status enum:", [r[0] for r in cur.fetchall()])

    # Check pool_trips.status is text, get existing values
    cur.execute("SELECT DISTINCT status FROM pool_trips;")
    print("pool_trips statuses:", [r[0] for r in cur.fetchall()])

    # Check if Asha, Ben, Dev have driver roles or customer roles
    from accounts.models import User
    for email in ['dev@example.com', 'asha@example.com', 'ben@example.com']:
        u = User.objects.filter(email=email).first()
        if u:
            cur.execute("SELECT role FROM user_roles WHERE user_id = %s;", [u.id])
            roles = [r[0] for r in cur.fetchall()]
            print(f"{email} ({u.id}): roles={roles}")
