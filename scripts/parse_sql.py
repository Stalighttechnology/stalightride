import re

with open("supabase/full_setup.sql", "r", encoding="utf-8") as f:
    text = f.read()

# Let's split into statements (handling $$ blocks and comments)
def split_sql(sql):
    statements = []
    current = []
    in_dollar = False
    dollar_tag = ""
    in_single_quote = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    n = len(sql)
    
    while i < n:
        c = sql[i]
        
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            current.append(c)
            i += 1
            continue
            
        if in_block_comment:
            if sql[i:i+2] == '*/':
                in_block_comment = False
                current.append('*/')
                i += 2
                continue
            current.append(c)
            i += 1
            continue
            
        if not in_dollar and not in_single_quote:
            if sql[i:i+2] == '--':
                in_line_comment = True
                current.append('--')
                i += 2
                continue
            if sql[i:i+2] == '/*':
                in_block_comment = True
                current.append('/*')
                i += 2
                continue

        # Check dollar quote
        if not in_single_quote:
            m = re.match(r'(\$[a-zA-Z0-9_]*\$)', sql[i:])
            if m:
                tag = m.group(1)
                if not in_dollar:
                    in_dollar = True
                    dollar_tag = tag
                elif dollar_tag == tag:
                    in_dollar = False
                    dollar_tag = ""
                current.append(tag)
                i += len(tag)
                continue

        if not in_dollar:
            if c == "'":
                if in_single_quote and i + 1 < n and sql[i+1] == "'":
                    current.append("''")
                    i += 2
                    continue
                in_single_quote = not in_single_quote
                current.append(c)
                i += 1
                continue
            if c == ';' and not in_single_quote:
                stmt = "".join(current).strip()
                if stmt:
                    statements.append(stmt)
                current = []
                i += 1
                continue

        current.append(c)
        i += 1

    if current:
        stmt = "".join(current).strip()
        if stmt:
            statements.append(stmt)
    return statements

stmts = split_sql(text)
print(f"Total statements parsed: {len(stmts)}")

# Check for potential errors
# 1. Statements without valid prefix
for idx, stmt in enumerate(stmts):
    # strip comments
    clean_lines = [l for l in stmt.splitlines() if not l.strip().startswith('--')]
    clean = " ".join(clean_lines).strip()
    if not clean:
        continue
    first_word = clean.split()[0].upper()
    if first_word not in ['CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE', 'DO', 'SET', 'COMMENT', 'SELECT', 'BEGIN', 'COMMIT']:
        print(f"Unusual statement {idx}: {first_word} -> {clean[:80]}...")
