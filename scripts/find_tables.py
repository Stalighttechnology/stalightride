import os, re
tables = set()
for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fp:
                for match in re.findall(r"\.from\(['\"]([^'\"]+)['\"]", fp.read()):
                    tables.add(match)
print('Tables queried from frontend:', sorted(tables))
