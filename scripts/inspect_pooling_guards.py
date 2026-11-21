import os, sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    # Check the pool guard functions
    cur.execute("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'enforce_pool_request_guard';")
    row = cur.fetchone()
    print("enforce_pool_request_guard:")
    print(row[0] if row else "NOT FOUND")
    print("\n" + "="*80 + "\n")

    cur.execute("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'enforce_pool_trip_guard';")
    row = cur.fetchone()
    print("enforce_pool_trip_guard:")
    print(row[0] if row else "NOT FOUND")
    print("\n" + "="*80 + "\n")

    # Check pool_request status enum values
    cur.execute("""
        SELECT e.enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname LIKE '%%pool_request%%'
        ORDER BY e.enumsortorder;
    """)
    print("pool_request status enum:", [r[0] for r in cur.fetchall()])

    # Check Dev user
    from accounts.models import User
    dev = User.objects.filter(email='dev@example.com').first()
    print(f"\nDev user: {dev.id if dev else 'NOT FOUND'}, email: {dev.email if dev else 'N/A'}")

    # Check Dev's roles
    if dev:
        cur.execute("SELECT role FROM user_roles WHERE user_id = %s;", [dev.id])
        print("Dev roles:", [r[0] for r in cur.fetchall()])
        cur.execute("SELECT id FROM drivers WHERE id = %s;", [dev.id])
        print("Dev is driver:", bool(cur.fetchone()))
