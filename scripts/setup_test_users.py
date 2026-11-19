import psycopg

conn = psycopg.connect("dbname=synchoo user=synchoo password=synchoo host=localhost port=5432")
cur = conn.cursor()

# Check auth.users columns
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
    ORDER BY ordinal_position;
""")
print("Columns in auth.users:")
for col, dtype in cur.fetchall():
    print(f"  {col}: {dtype}")

# Check sample users
cur.execute("""
    SELECT id, email, encrypted_password, raw_user_meta_data 
    FROM auth.users 
    WHERE email LIKE '%synchoo.local' OR email LIKE 'c3-%';
""")
users = cur.fetchall()
print("\nExisting test users:")
for u in users:
    print(u)

conn.close()
