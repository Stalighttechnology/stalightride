import re
from parse_sql import split_sql

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    text = f.read()

stmts = split_sql(text)

types = set(['text', 'uuid', 'timestamptz', 'timestamp', 'int', 'integer', 'smallint', 'bigint', 'numeric', 'boolean', 'jsonb', 'date', 'time', 'interval', 'bytea'])
tables = {}  # table_name -> set(columns)
functions = set()
policies = set()  # (policy_name, table_name)
triggers = set()   # (trigger_name, table_name)
indexes = set()

# Pre-populate known Postgres/Supabase objects
tables['auth.users'] = {'id', 'email', 'created_at', 'raw_user_meta_data'}
tables['storage.buckets'] = {'id', 'name', 'owner', 'created_at', 'updated_at', 'public', 'avif_autodetection', 'file_size_limit', 'allowed_mime_types', 'owner_id'}
tables['storage.objects'] = {'id', 'bucket_id', 'name', 'owner', 'created_at', 'updated_at', 'last_accessed_at', 'metadata', 'path_tokens', 'version', 'owner_id'}

warnings = []

for idx, stmt in enumerate(stmts):
    clean_lines = [l for l in stmt.splitlines() if not l.strip().startswith('--')]
    clean = " ".join(clean_lines).strip()
    if not clean:
        continue
    
    # 1. CREATE TYPE
    m_type = re.match(r'CREATE\s+TYPE\s+([^\s]+)\s+AS\s+ENUM', clean, re.IGNORECASE)
    if m_type:
        tname = m_type.group(1).lower().replace('public.', '')
        if tname in types:
            warnings.append((idx, f"CREATE TYPE {tname} already exists (will fail if not guarded)"))
        types.add(tname)
        types.add('public.' + tname)
        continue

    # 2. CREATE TABLE
    m_tbl = re.match(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\((.*)\)', clean, re.IGNORECASE | re.DOTALL)
    if m_tbl:
        tbl_name = m_tbl.group(1).lower().replace('public.', '')
        body = m_tbl.group(2)
        if tbl_name in tables:
            warnings.append((idx, f"CREATE TABLE {tbl_name} already exists!"))
        # extract columns (rough)
        cols = set()
        for col_def in body.split(','):
            col_def = col_def.strip()
            if not col_def or col_def.upper().startswith(('CONSTRAINT', 'PRIMARY KEY', 'FOREIGN KEY', 'CHECK', 'UNIQUE')):
                continue
            col_first = col_def.split()[0].replace('"', '')
            cols.add(col_first.lower())
        tables[tbl_name] = cols
        tables['public.' + tbl_name] = cols
        continue

    # 3. ALTER TABLE
    m_alt = re.match(r'ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+(.*)', clean, re.IGNORECASE | re.DOTALL)
    if m_alt:
        tbl_name = m_alt.group(1).lower().replace('public.', '')
        action = m_alt.group(2).strip()
        if tbl_name not in tables:
            warnings.append((idx, f"ALTER TABLE on unknown table {tbl_name}: {action[:60]}"))
        else:
            # check ADD COLUMN
            m_add = re.findall(r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s]+)', action, re.IGNORECASE)
            for col in m_add:
                col_name = col.replace('"', '').lower()
                tables[tbl_name].add(col_name)
                tables['public.' + tbl_name].add(col_name)
        continue

    # 4. CREATE POLICY
    m_pol = re.match(r'CREATE\s+POLICY\s+"?([^"\s]+(?:\s+[^"\s]+)*)"?\s+ON\s+([^\s]+)', clean, re.IGNORECASE)
    if m_pol:
        pol_name = m_pol.group(1)
        tbl_name = m_pol.group(2).lower().replace('public.', '')
        key = (pol_name, tbl_name)
        if key in policies:
            warnings.append((idx, f"CREATE POLICY '{pol_name}' on {tbl_name} already exists without drop!"))
        policies.add(key)
        continue

    # 5. DROP POLICY
    m_dpol = re.match(r'DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([^"\s]+(?:\s+[^"\s]+)*)"?\s+ON\s+([^\s]+)', clean, re.IGNORECASE)
    if m_dpol:
        pol_name = m_dpol.group(1)
        tbl_name = m_dpol.group(2).lower().replace('public.', '')
        key = (pol_name, tbl_name)
        policies.discard(key)
        continue

    # 6. CREATE TRIGGER
    m_trig = re.match(r'CREATE\s+TRIGGER\s+([^\s]+)\s+.*?\s+ON\s+([^\s]+)', clean, re.IGNORECASE)
    if m_trig:
        trig_name = m_trig.group(1).lower()
        tbl_name = m_trig.group(2).lower().replace('public.', '')
        key = (trig_name, tbl_name)
        if key in triggers:
            warnings.append((idx, f"CREATE TRIGGER {trig_name} on {tbl_name} already exists without drop!"))
        triggers.add(key)
        continue

    # 7. DROP TRIGGER
    m_dtrig = re.match(r'DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s]+)', clean, re.IGNORECASE)
    if m_dtrig:
        trig_name = m_dtrig.group(1).lower()
        tbl_name = m_dtrig.group(2).lower().replace('public.', '')
        key = (trig_name, tbl_name)
        triggers.discard(key)
        continue

print(f"Total warnings: {len(warnings)}")
for w in warnings:
    print(f"Stmt #{w[0]}: {w[1]}")
