import os, sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    cur.execute("""
        SELECT e.enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'booking_status'
        ORDER BY e.enumsortorder;
    """)
    print("booking_status enum:", [r[0] for r in cur.fetchall()])

    # Check the RLS policies on pool_trips and pool_requests
    cur.execute("""
        SELECT schemaname, tablename, policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE tablename IN ('pool_trips', 'pool_requests')
        ORDER BY tablename, policyname;
    """)
    for row in cur.fetchall():
        print(f"\n{row[1]}.{row[2]} ({row[3]}):")
        print(f"  USING: {row[4]}")
        print(f"  CHECK: {row[5]}")
