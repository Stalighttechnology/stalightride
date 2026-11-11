# Synchoo

A marketplace for vehicle rentals, driver hire, ride pooling and car washes, with a wallet and Razorpay (INR) payments.

| Part | Folder | Stack | Port |
|---|---|---|---|
| Backend | `backend/` | Django 5.2, PostgreSQL 17, Django REST framework, Channels (WebSockets) | 8000 |
| Frontend | `frontend/` | React 19, Vite, TanStack Router, Tailwind v4, shadcn/ui | 8080 |

The business rules (pricing, wallet ledger, refunds, verification gates, row-level security) live in PostgreSQL, in `backend/sql/schema.sql`. Django runs every request as one of three database roles, `anon` (signed out), `authenticated` (signed in) or `service_role` (server actions), with `auth.uid()` set to the signed-in user. Each table's policies then decide what that user may see and change.

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Git | any | `git --version` |
| Node.js | 22 or newer | `node --version` |
| Python | 3.13 | `python --version` |
| PostgreSQL | 17 (16 works) | `psql --version` |

Windows: `winget install PostgreSQL.PostgreSQL.17`, then add `C:\Program Files\PostgreSQL\17\bin` to PATH. Remember the password you give the `postgres` superuser.

## First-time setup

```bash
git clone https://github.com/Stalighttechnology/stalightride.git
cd stalightride

# 1. Database roles and an empty database (asks for the postgres password)
psql -U postgres -f backend/scripts/bootstrap_db.sql

# 2. Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # macOS/Linux: .venv/bin/pip
cp .env.example .env                               # then fill in the values you have
.venv/Scripts/python manage.py migrate
cd ..

# 3. Frontend
cd frontend
npm install
cp .env.example .env
cd ..
```

On Windows PowerShell, use `copy` instead of `cp` and `.venv\Scripts\...` paths.

## Run it (two terminals)

```bash
# Terminal 1
cd backend && .venv/Scripts/python manage.py runserver 8000

# Terminal 2
cd frontend && npm run dev
```

Open http://localhost:8080. The Vite dev server forwards `/api` and `/ws` to Django, so the browser only ever talks to one address.

Create an admin: sign up in the app, then run:

```bash
psql -U synchoo -h localhost -d synchoo -c "INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';"
```

(password `synchoo`).

## Tests

| Command (from its folder) | What |
|---|---|
| `backend`: `.venv/Scripts/python -m pytest` | API, database rules, auth, files, payments, live updates (uses a throwaway `test_synchoo` database) |
| `frontend`: `npm run test` | Business-rule flows against an in-memory model, pricing, trip window |
| `frontend`: `npx tsc --noEmit` | Type check |
| `frontend`: `npm run build` | Production build into `frontend/dist` |

## Trip reminders

`python manage.py send_reminders` creates the "trip starts in 24 h / 2 h" notifications. Run it every 15 minutes: cron on a server, or Windows Task Scheduler locally.

## Start the database over

```bash
psql -U postgres -c "DROP DATABASE IF EXISTS synchoo"
psql -U postgres -f backend/scripts/bootstrap_db.sql
cd backend && .venv/Scripts/python manage.py migrate
```

## How the pieces fit

| Frontend | Backend | Notes |
|---|---|---|
| `api.from("bookings").select("*, vehicles(title)").eq("id", id)` | `POST /api/query/` (`core/query.py`) | Runs as the signed-in user's role |
| `api.rpc("cancel_booking", {...})` | `POST /api/rpc/<name>/` | Database functions; their grants decide who may call them |
| `api.auth.*` | `/api/auth/...` (`accounts/`) | Email and password, Google, password reset; JWT access and refresh tokens |
| `api.storage.from(bucket)` | `/api/storage/...` (`files/`) | Files on disk under `backend/media/`; the bucket policies apply |
| `api.channel(...).on("postgres_changes", ...)` | `ws://.../ws/` (`realtime/`) | Live chat, notifications, location, wallet |
| `src/lib/actions.ts` | `POST /api/fn/<name>/` (`payments/`) | Razorpay, wallet top-up, QR, handover, inspection |

Schema changes: add a migration in `backend/core/migrations/` containing the SQL (`migrations.RunSQL`). Never edit `backend/sql/schema.sql`, which is the starting point only. Update `frontend/src/tests/harness/fake-backend.ts` and its flow tests when a rule changes.
