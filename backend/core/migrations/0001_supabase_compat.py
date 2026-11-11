"""The few Supabase-provided objects the inherited SQL refers to.

With these in place the files in supabase/migrations load unedited on plain
PostgreSQL. The roles themselves are cluster-wide and come from
scripts/bootstrap_db.sql.
"""

from django.db import migrations

SQL = r"""
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;

-- Identity. Django's user model mirrors each account into auth.users, which
-- keeps the foreign keys and the on_auth_user_created trigger working.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Set per transaction by core/db.py.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- File storage: one row per stored file, so the existing storage.objects
-- policies keep deciding who may upload and read.
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
INSERT INTO storage.buckets (id, name, public) VALUES
  ('vehicle-images', 'vehicle-images', true),
  ('avatars', 'avatars', true),
  ('kyc-docs', 'kyc-docs', false),
  ('verification-docs', 'verification-docs', false),
  ('trip-photos', 'trip-photos', false);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;

-- 'a/b/c.jpg' -> {a,b}
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
$$;

-- The SQL adds tables to this publication; nothing subscribes to it.
CREATE PUBLICATION supabase_realtime;
"""

REVERSE = r"""
DROP PUBLICATION supabase_realtime;
DROP SCHEMA storage CASCADE;
DROP SCHEMA auth CASCADE;
"""


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [migrations.RunSQL(SQL, REVERSE)]
