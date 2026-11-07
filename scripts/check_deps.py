import re
from parse_sql import split_sql

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    text = f.read()

stmts = split_sql(text)

defined_funcs = set([
    'now', 'gen_random_uuid', 'auth.uid', 'storage.foldername', 'uuid_generate_v4',
    'count', 'coalesce', 'left', 'greatest', 'least', 'round', 'avg', 'sum', 'min', 'max',
    'concat', 'lower', 'upper', 'trim', 'length', 'replace', 'substring', 'date_trunc',
    'timezone', 'current_timestamp', 'current_date', 'current_time', 'nullif', 'array_agg',
    'jsonb_build_object', 'json_build_object', 'to_jsonb', 'to_json', 'exists'
])

defined_tables = set(['auth.users', 'storage.buckets', 'storage.objects'])

errors = []

for idx, stmt in enumerate(stmts, 1):
    clean = re.sub(r'--.*', '', stmt)
    clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.DOTALL).strip()
    
    # Track CREATE FUNCTION
    m_func = re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([^\s(]+)', clean, re.IGNORECASE)
    if m_func:
        fname = m_func.group(1).lower()
        defined_funcs.add(fname)
        defined_funcs.add(fname.replace('public.', ''))
        defined_funcs.add('public.' + fname.replace('public.', ''))
        
    # Track CREATE TABLE
    m_tbl = re.search(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)', clean, re.IGNORECASE)
    if m_tbl:
        tname = m_tbl.group(1).lower()
        defined_tables.add(tname)
        defined_tables.add(tname.replace('public.', ''))
        defined_tables.add('public.' + tname.replace('public.', ''))
        
    # Check CREATE TRIGGER ... EXECUTE FUNCTION fn()
    m_trig_fn = re.search(r'EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([^\s(]+)', clean, re.IGNORECASE)
    if m_trig_fn:
        fn_called = m_trig_fn.group(1).lower()
        if fn_called not in defined_funcs:
            errors.append((idx, f"Trigger references function '{fn_called}' before definition:\n  {stmt[:100]}"))
            
    # Check REFERENCES tbl(col)
    m_refs = re.findall(r'REFERENCES\s+([^\s(]+)', clean, re.IGNORECASE)
    for ref_tbl in m_refs:
        ref_clean = ref_tbl.lower().strip()
        if ref_clean not in defined_tables:
            errors.append((idx, f"Foreign key references table '{ref_clean}' before table is defined:\n  {stmt[:100]}"))

print(f"Total dependency errors: {len(errors)}")
for err in errors[:25]:
    print(f"Stmt {err[0]}: {err[1]}")
