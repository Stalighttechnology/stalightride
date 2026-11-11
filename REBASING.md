# Rebasing your branch onto the Django + React layout

PR #10 removed Supabase and split the repo into `backend/` (Django + PostgreSQL) and `frontend/` (React SPA). If your branch started before that PR was merged, follow this once. It takes 10 to 30 minutes, depending on how many files you changed.

## What changed, in one table

| Before | After |
|---|---|
| `src/`, `public/`, `package.json`, `vite.config.ts`, ... at the repo root | `frontend/src/`, `frontend/public/`, `frontend/package.json`, ... |
| `import { supabase } from "@/integrations/supabase/client"` | `import { api } from "@/lib/api"` |
| `supabase.from(...)`, `supabase.rpc(...)`, `supabase.auth...`, `supabase.storage...`, `supabase.channel(...)` | `api.from(...)`, `api.rpc(...)`, `api.auth...`, `api.storage...`, `api.channel(...)`: same chain syntax, same `{ data, error }` results |
| `import type { Tables } from "@/integrations/supabase/types"` | `import type { Tables } from "@/lib/db-types"` |
| `import { x } from "@/lib/razorpay.functions"` (and the other `*.functions.ts`) | `import { x } from "@/lib/actions"` |
| `const fn = useServerFn(createRazorpayOrder)` | `const fn = createRazorpayOrder` (delete the `useServerFn` import) |
| Server logic in `src/lib/*.functions.ts` | `backend/payments/views.py` |
| `supabase/migrations/*.sql` | `backend/sql/schema.sql` (all old files squashed) + new Django migrations in `backend/core/migrations/` |
| `src/routes/api/cron/reminders.ts` | `python manage.py send_reminders` |
| `src/server.ts`, `src/start.ts`, `src/router.tsx`, `drizzle/`, `.lovable/` | gone (`frontend/src/main.tsx` + `frontend/index.html` start the app) |
| Root `.env` with `VITE_SUPABASE_*` / `SUPABASE_*` | `backend/.env` and `frontend/.env` (see each `.env.example`) |

## 1. Save your work

```bash
git status                    # nothing uncommitted? good
git add -A && git commit -m "wip"   # otherwise commit it (or: git stash)
git fetch origin
```

Make a safety copy of your branch first. If anything goes wrong you can return to it:

```bash
git branch backup/my-branch
```

## 2. Rebase

```bash
git config merge.renameLimit 20000     # lets git follow 300+ moved files
git rebase origin/main
```

Git follows the move from `src/...` to `frontend/src/...` by itself, so most of your edits land in the right file without conflicts.

**Branch with many commits?** Merging is easier than rebasing, because you resolve conflicts once instead of per commit:

```bash
git merge origin/main
```

## 3. Fix conflicts

`git status` lists the conflicted files. The common cases:

| You see | Do |
|---|---|
| Conflict inside a page or component | Keep your change, then apply the import and `supabase.` to `api.` swap from the table above |
| `deleted by them: src/integrations/supabase/...`, `src/lib/*.functions.ts`, `src/server.ts`, `src/start.ts` | Accept the delete: `git rm <file>`. If you had changed server logic in a `*.functions.ts` file, redo it in `backend/payments/views.py` |
| `deleted by them: supabase/migrations/<your file>.sql` | Your SQL is no longer loaded. Turn it into a Django migration (step 4), then `git rm` the file |
| `src/routeTree.gen.ts` | `git checkout --theirs frontend/src/routeTree.gen.ts`; it is regenerated when you run `npm run dev` |
| `package.json` or `package-lock.json` | Take main's (`git checkout --theirs frontend/package.json frontend/package-lock.json`), then `cd frontend && npm install <your-new-package>` |
| A new file of yours still at `src/...` (git could not tell where it goes) | `git mv src/<path> frontend/src/<path>` |

Then continue:

```bash
git add -A
git rebase --continue          # or, if you merged: git commit
```

### Fix imports in your files in one go

Run from the repo root after the rebase. It only touches files that still mention the old names.

PowerShell:

```powershell
Get-ChildItem frontend/src -Recurse -Include *.ts,*.tsx | Where-Object { Select-String -Path $_ -Quiet -Pattern 'integrations/supabase|useServerFn|\.functions"' } | ForEach-Object {
  (Get-Content $_ -Raw) `
    -replace 'import \{ supabase \} from "@/integrations/supabase/client";', 'import { api } from "@/lib/api";' `
    -replace '"@/integrations/supabase/types"', '"@/lib/db-types"' `
    -replace 'from "@/lib/[a-z-]+\.functions"', 'from "@/lib/actions"' `
    -replace 'import \{ useServerFn \} from "@tanstack/react-start";\r?\n', '' `
    -replace 'useServerFn\((\w+)\)', '$1' `
    -replace '(?<![/@\w-])supabase(?![/\w-])', 'api' |
  Set-Content $_ -NoNewline
}
```

Git Bash or macOS/Linux:

```bash
grep -rlE 'integrations/supabase|useServerFn|\.functions"' frontend/src | xargs perl -0pi -e '
  s#import \{ supabase \} from "\@/integrations/supabase/client";#import { api } from "\@/lib/api";#g;
  s#"\@/integrations/supabase/types"#"\@/lib/db-types"#g;
  s#from "\@/lib/[a-z-]+\.functions"#from "\@/lib/actions"#g;
  s#import \{ useServerFn \} from "\@tanstack/react-start";\r?\n##g;
  s#useServerFn\((\w+)\)#$1#g;
  s#(?<![/\@\w-])supabase(?![/\w-])#api#g;'
```

Then check that nothing is left: `git grep -n -i supabase -- frontend/src` should print nothing.

## 4. Database changes from your branch

New SQL now goes into a Django migration, not a `.sql` file in `supabase/migrations/`.

1. Find the latest migration number: `ls backend/core/migrations/`.
2. Create `backend/core/migrations/0004_<short_name>.py` (next number):

   ```python
   from django.db import migrations

   SQL = r"""
   -- paste the SQL from your old supabase/migrations/<file>.sql here
   """

   class Migration(migrations.Migration):
       dependencies = [("core", "0003_admin_read_booking_locations")]   # the previous migration's name
       operations = [migrations.RunSQL(SQL)]
   ```

3. Apply it: `cd backend && .venv/Scripts/python manage.py migrate`.
4. If the rule also exists in `frontend/src/tests/harness/fake-backend.ts`, update it and the flow test there.

Do not edit `backend/sql/schema.sql`; it is only the starting point.

## 5. Set up your machine again (once)

1. Delete the old root `node_modules/` folder; it is no longer used.
2. Install PostgreSQL 17 if you have not, then follow "First-time setup" in `README.md`: bootstrap the database, create the backend venv, `migrate`, then `cd frontend && npm install`.
3. Create `backend/.env` and `frontend/.env` from their `.env.example` files. Your old root `.env` with Supabase keys is no longer read; delete it.
4. Run both servers (`README.md`, "Run it").

## 6. Check before you push

```bash
cd backend && .venv/Scripts/python -m pytest -q && cd ..
cd frontend && npx tsc --noEmit && npm run test && npm run build && cd ..
git grep -n -i supabase                # should print nothing
```

Then push. A rebased branch needs a force push:

```bash
git push --force-with-lease
```

`--force-with-lease` refuses to overwrite the remote if someone else pushed to your branch in the meantime. If the result is wrong, `git reset --hard backup/my-branch` returns you to where you started.

## Things that work differently now

- **No Lovable.** The Lovable editor and preview can no longer run this app. Work locally with both servers.
- **No server rendering.** Pages render in the browser; `head()` in routes still sets titles and meta tags.
- **Sign-in sessions** are Django tokens. Existing Supabase accounts do not carry over; sign up again locally.
- **Google sign-in** needs `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend), with `http://localhost:8080/auth` as an authorised redirect URI in the Google Cloud console.
- **Uploaded files** are stored in `backend/media/` on your machine and are not shared between developers.
