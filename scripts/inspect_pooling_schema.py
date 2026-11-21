import os, sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection

with connection.cursor() as cur:
    # Find pooling-related tables
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%%pool%%' ORDER BY table_name;")
    tables = [r[0] for r in cur.fetchall()]
    print("Pool tables:", tables)

    for t in tables:
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}' ORDER BY ordinal_position;")
        cols = cur.fetchall()
        print(f"\n{t}:")
        for c in cols:
            print(f"  {c[0]} ({c[1]})")

    # Also check for functions related to pooling
    cur.execute("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name ILIKE '%%pool%%';")
    print("\nPool functions:", [r[0] for r in cur.fetchall()])
