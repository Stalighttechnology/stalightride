## Project architecture decisions

- Keep executive pitch copy in `src/content/pitch.json` so the public pitch page and downloadable deck remain factually aligned.
- Generate the PDF and its public-route embedded bytes together with `scripts/generate-pitch.py`; one generation step prevents the downloadable copies from drifting.

## Database changes: checklist

Business rules live in Postgres (triggers, RPCs, RLS). For every schema change:

1. **Write a new migration** in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Never edit one that may already be applied; add a new file. Keep it re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`).
2. **Watch the two classic traps:**
   - A guard trigger that checks `current_user` (or `is_end_user_request()`) must be `SECURITY INVOKER`. Inside `SECURITY DEFINER`, `current_user` is the owner and the guard silently never runs.
   - In plpgsql, `IF NOT (x = auth.uid())` does nothing when `x` is NULL. Use `COALESCE(x = auth.uid(), false)`.
3. **Update `src/integrations/supabase/types.ts`** with the new tables, columns and RPCs. No Supabase CLI is linked, so edit it by hand in the generated format.
4. **Mirror the rule in `src/tests/harness/fake-backend.ts`** and assert it in `src/tests/flows/*.test.ts`. Run `npm test`.
5. **Replay it on real Postgres:** `npm run db:replay`. This applies every migration on PGlite and runs `scripts/db-replay/scenarios/*.sql`. Add a scenario covering the new RPCs and policies, including the calls that must fail (`-- @expect-error`).
6. **Check the app:** `npx tsc --noEmit` and `npm run build`.
7. **Bundle for production:** `npm run db:replay -- --bundle local/supabase/<name>.sql <migration files>`. This writes one transactional file and verifies it, including running it twice.

**Apply before merge.** Nothing applies migrations automatically any more; Lovable sync is gone. Run the bundle in Supabase → SQL Editor **before** merging the PR whose code needs it. If the code reaches `main` first, the live app breaks on columns that don't exist yet. Put the migration list and their run order in the PR description.
