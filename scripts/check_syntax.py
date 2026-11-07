import re
from parse_sql import split_sql

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    text = f.read()

stmts = split_sql(text)
print(f"Checking {len(stmts)} statements for syntax anomalies...")

syntax_errors = []

for idx, stmt in enumerate(stmts, 1):
    # remove single line comments
    lines = [re.sub(r'--.*', '', l) for l in stmt.splitlines()]
    clean = "\n".join(lines).strip()
    if not clean:
        continue

    # remove $$ blocks
    clean_no_dollar = re.sub(r'\$[a-zA-Z0-9_]*\$.*?\$[a-zA-Z0-9_]*\$', "''", clean, flags=re.DOTALL)
    
    # remove string literals
    clean_no_strings = re.sub(r"'(''|[^'])*'", "''", clean_no_dollar)
    
    # Check parenthesis balance
    open_p = clean_no_strings.count('(')
    close_p = clean_no_strings.count(')')
    if open_p != close_p:
        syntax_errors.append((idx, f"Unbalanced parentheses: {open_p} '(' vs {close_p} ')'", clean[:120]))
        
    # Check bracket balance
    open_b = clean_no_strings.count('[')
    close_b = clean_no_strings.count(']')
    if open_b != close_b:
        syntax_errors.append((idx, f"Unbalanced brackets: {open_b} '[' vs {close_b} ']'", clean[:120]))

print(f"Syntax anomaly count: {len(syntax_errors)}")
for err in syntax_errors:
    print(f"Stmt {err[0]}: {err[1]}")
    print(f"   Snippet: {err[2]}")
