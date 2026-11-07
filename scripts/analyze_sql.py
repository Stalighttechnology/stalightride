import re

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Check triggers
triggers_seen = {}
trigger_errors = []

for line_no, line in enumerate(lines, 1):
    m_trig = re.search(r'CREATE\s+TRIGGER\s+([^\s]+)\s+.*?\s+ON\s+([^\s;]+)', line, re.IGNORECASE)
    if m_trig:
        t_name, tbl_name = m_trig.group(1), m_trig.group(2)
        key = (t_name, tbl_name)
        if key in triggers_seen:
            dropped = False
            for prev_idx in range(triggers_seen[key], line_no - 1):
                prev_line = lines[prev_idx]
                if re.search(rf'DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?{re.escape(t_name)}\s+ON\s+{re.escape(tbl_name)}', prev_line, re.IGNORECASE):
                    dropped = True
                    break
            if not dropped:
                trigger_errors.append(f"Line {line_no}: CREATE TRIGGER {t_name} ON {tbl_name} without preceding DROP TRIGGER! (previously at line {triggers_seen[key]})")
        triggers_seen[key] = line_no

print(f"Trigger errors ({len(trigger_errors)}):")
for err in trigger_errors:
    print(" ", err)
