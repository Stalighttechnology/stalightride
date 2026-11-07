import re

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

unguarded_triggers = []
for i, line in enumerate(lines):
    m = re.search(r'CREATE\s+TRIGGER\s+([^\s]+)\s+.*?ON\s+([^\s;]+)', line, re.IGNORECASE)
    if m:
        tname = m.group(1)
        tbl = m.group(2)
        # Check previous 5 lines for DROP TRIGGER
        has_drop = False
        for j in range(max(0, i-5), i):
            if re.search(rf'DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?{re.escape(tname)}\s+ON\s+{re.escape(tbl)}', lines[j], re.IGNORECASE):
                has_drop = True
                break
        if not has_drop:
            unguarded_triggers.append((i+1, tname, tbl))

print(f"Unguarded CREATE TRIGGER count: {len(unguarded_triggers)}")
for line_no, tname, tbl in unguarded_triggers:
    print(f"Line {line_no}: CREATE TRIGGER {tname} ON {tbl}")
