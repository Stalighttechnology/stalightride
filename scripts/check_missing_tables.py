import re
from find_tables import tables as frontend_tables

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    sql = f.read()

# tables and views created
created_tables = set(re.findall(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([^\s(]+)', sql, re.IGNORECASE))
created_views = set(re.findall(r'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([^\s(]+)', sql, re.IGNORECASE))
storage_buckets = set(['vehicle-images', 'avatars', 'kyc-docs', 'verification-docs', 'trip-photos'])

all_db_objects = created_tables.union(created_views).union(storage_buckets)

missing = [t for t in frontend_tables if t not in all_db_objects]
print("Frontend tables missing from full_setup.sql:", missing)
