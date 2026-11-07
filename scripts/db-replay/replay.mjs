#!/usr/bin/env node
/**
 * Replays every supabase/migrations/*.sql file, in order, on an in-memory
 * Postgres (PGlite) with minimal Supabase stubs, then runs SQL scenarios
 * against the result. Catches what the vitest fake backend can't: syntax
 * errors, trigger order, SECURITY DEFINER/INVOKER mistakes, RLS gaps.
 *
 *   npm run db:replay                         replay + every scenario in scenarios/
 *   npm run db:replay -- <scenario.sql>       replay + one scenario
 *   npm run db:replay -- --bundle <out.sql> <migration.sql>...
 *        write one transactional file for the Supabase SQL editor, then
 *        verify it: replay everything else, apply the bundle twice
 *        (re-runs must be safe), run every scenario on top.
 *
 * Scenario format: blocks separated by "-- @step <name>" or
 * "-- @expect-error <text in the error message>". Each block runs in its own
 * transaction on a fresh database per scenario file. Act as a user with:
 *   SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','<uuid>',true);
 * Not covered: storage, realtime, pg_cron, Edge Functions, auth flows.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const migrationsDir = path.join(repo, "supabase/migrations");
const scenariosDir = path.join(here, "scenarios");

// Just enough of Supabase for the migrations to apply.
const STUBS = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE supabase_auth_admin NOLOGIN; CREATE ROLE supabase_storage_admin NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE PUBLICATION supabase_realtime;
  CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
  GRANT USAGE ON SCHEMA auth, storage, extensions TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, phone text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb, raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(), email_confirmed_at timestamptz);
  -- Migration 20260811151118 seeds data for this Lovable QA account.
  INSERT INTO auth.users (email) VALUES ('qa.cust1@example.com');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now());
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
    owner uuid, metadata jsonb, created_at timestamptz DEFAULT now());
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
`;

const allMigrations = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(migrationsDir, f));

const listScenarios = () =>
  fs.existsSync(scenariosDir)
    ? fs
        .readdirSync(scenariosDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => path.join(scenariosDir, f))
    : [];

/** Fresh database with the stubs and the given SQL files applied in order. */
async function freshDb(files) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(f, "utf8"));
    } catch (e) {
      throw new Error(`migration failed: ${path.relative(repo, f)}\n  ${e.message}`);
    }
  }
  return db;
}

/** Runs one scenario file; returns the number of failed blocks. */
async function runScenario(db, file) {
  console.log(`\n▸ ${path.relative(repo, file)}`);
  const blocks = fs
    .readFileSync(file, "utf8")
    .split(/^-- @/m)
    .filter((b) => b.trim() && /^(step|expect-error)/.test(b));
  let failed = 0;
  for (const raw of blocks) {
    const [head, ...rest] = raw.split("\n");
    const expectErr = head.startsWith("expect-error")
      ? head.slice("expect-error".length).trim()
      : null;
    try {
      const res = await db.exec(`BEGIN; ${rest.join("\n")}; COMMIT;`);
      const last = res.filter((r) => r.rows?.length).at(-1);
      if (expectErr) {
        failed++;
        console.log(`  FAIL  ${head}  (no error raised)`);
      } else console.log(`  ok    ${head}${last ? "  " + JSON.stringify(last.rows) : ""}`);
    } catch (e) {
      await db.exec("ROLLBACK;").catch(() => {});
      if (expectErr && e.message.includes(expectErr)) console.log(`  ok    ${head}`);
      else {
        failed++;
        console.log(`  FAIL  ${head}\n        ${e.message}`);
      }
    }
  }
  return failed;
}

/** Applies `files`, then runs each scenario on its own fresh copy. */
async function check(files, scenarios) {
  await (await freshDb(files)).close();
  console.log(`applied ${files.length} files`);
  let failed = 0;
  for (const s of scenarios) {
    const db = await freshDb(files);
    failed += await runScenario(db, s);
    await db.close();
  }
  return failed;
}

function bundle(out, names) {
  const files = names
    .map((n) => {
      const p = fs.existsSync(n) ? path.resolve(n) : path.join(migrationsDir, n);
      if (!fs.existsSync(p)) throw new Error(`no such migration: ${n}`);
      return p;
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  for (const f of files) {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;|CONCURRENTLY|ADD VALUE/im.test(fs.readFileSync(f, "utf8")))
      throw new Error(`${path.basename(f)} can't run inside a transaction; apply it on its own`);
  }
  const ids = files.map((f) => path.basename(f).split("_")[0]).join(" ");
  const body = files
    .map(
      (f) =>
        `\n-- ${"#".repeat(69)}\n-- ${path.basename(f)}\n-- ${"#".repeat(69)}\n\n${fs.readFileSync(f, "utf8")}\n`,
    )
    .join("");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(
    out,
    `-- Generated by scripts/db-replay/replay.mjs --bundle. Run once in the Supabase SQL editor.\n` +
      `-- Contains, in order:\n${files.map((f) => `--   ${path.basename(f)}`).join("\n")}\n` +
      `-- All-or-nothing (one transaction). The editor doesn't record migration history; before a later\n` +
      `-- \`supabase db push\`, run: supabase migration repair --status applied ${ids}\n\nBEGIN;\n${body}\nCOMMIT;\n`,
  );
  return files;
}

const args = process.argv.slice(2);
try {
  let failed;
  if (args[0] === "--bundle") {
    const [, out, ...names] = args;
    if (!out || !names.length) throw new Error("usage: --bundle <out.sql> <migration.sql>...");
    const included = new Set(bundle(out, names));
    console.log(`wrote ${out} (${included.size} migrations); verifying, bundle applied twice…`);
    const base = allMigrations().filter((f) => !included.has(f));
    failed = await check([...base, out, out], listScenarios());
  } else {
    failed = await check(
      allMigrations(),
      args.length ? args.map((a) => path.resolve(a)) : listScenarios(),
    );
  }
  console.log(failed ? `\n✗ ${failed} failed` : "\n✓ all passed");
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
