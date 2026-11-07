import re

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

unguarded_policies = []
for i, line in enumerate(lines):
    m = re.search(r'CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+([^\s;]+)', line, re.IGNORECASE)
    if m:
        pname = m.group(1)
        tbl = m.group(2)
        has_drop = False
        for j in range(max(0, i-5), i):
            if re.search(rf'DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"{re.escape(pname)}"\s+ON\s+{re.escape(tbl)}', lines[j], re.IGNORECASE):
                has_drop = True
                break
        if not has_drop:
            unguarded_policies.append((i+1, pname, tbl))

print(f"Unguarded CREATE POLICY count: {len(unguarded_policies)}")
for line_no, pname, tbl in unguarded_policies[:30]:
    print(f"Line {line_no}: CREATE POLICY \"{pname}\" ON {tbl}")
if len(unguarded_policies) > 30:
    print(f"... and {len(unguarded_policies) - 30} more")
