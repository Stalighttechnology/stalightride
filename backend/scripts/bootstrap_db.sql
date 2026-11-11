-- One-time local setup. Run as the PostgreSQL superuser:
--   psql -U postgres -f backend/scripts/bootstrap_db.sql
--
-- Creates the three roles the schema's policies and grants are written for,
-- the login role Django connects as, and an empty database. Safe to re-run;
-- it never drops anything. To start over: DROP DATABASE synchoo; then re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  -- CREATEDB lets the test runner create and drop test_synchoo.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'synchoo') THEN
    CREATE ROLE synchoo LOGIN PASSWORD 'synchoo' CREATEDB;
  END IF;
END $$;

-- Django switches into these per request (core/db.py).
GRANT anon, authenticated, service_role TO synchoo;

SELECT 'CREATE DATABASE synchoo OWNER synchoo'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'synchoo') \gexec
