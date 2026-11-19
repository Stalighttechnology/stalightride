# Automated tests

These checks run without clicking through the app. Manual workflows are in the [component docs](README.md#who-owns-what).

## Run everything

| Check | Run from | Command | Latest result |
| --- | --- | --- | --- |
| Backend API and database | `backend/` | `.venv/Scripts/python -m pytest` | 41 passed |
| Frontend rules and pricing | `frontend/` | `npm run test` | 209 passed in 14 files |
| Type check | `frontend/` | `npx tsc --noEmit` | No errors |
| Production build | `frontend/` | `npm run build` | Builds successfully |
| Migration check | `backend/` | `.venv/Scripts/python manage.py makemigrations --check --dry-run` | No changes detected |
| **Launch gates** | `backend/` | See below | **9 failed, 7 passed** |

GitHub Actions runs everything except the launch gates on each pull request. See `.github/workflows/ci.yml`.

## Launch gates

[`automated/test_launch_gates.py`](automated/test_launch_gates.py) describes the correct behaviour for the gaps that can be tested at database and API level. **A failing gate means the gap is still open.** The gates are kept out of CI so they don't block every pull request until the fixes are made.

Git Bash:

```bash
cd backend
PYTHONPATH=. .venv/Scripts/python -m pytest -c pytest.ini --rootdir=. ../docs/automated/test_launch_gates.py -q
```

PowerShell:

```powershell
cd backend
$env:PYTHONPATH = "."
.venv\Scripts\python -m pytest -c pytest.ini --rootdir=. ..\docs\automated\test_launch_gates.py -q
```

The gates use the throwaway `test_synchoo` database and don't touch your local data.

| Gate | Gap |
| --- | --- |
| `test_gap01_membership_needs_verified_payment` | GAP-01 |
| `test_gap04_replayed_payment_cannot_undo_a_refund` | GAP-04 |
| `test_gap08_uploaded_html_is_never_served_as_a_web_page` | GAP-08 |
| `test_gap09_host_cannot_complete_an_unpaid_booking` | GAP-09 |
| `test_gap09_cleaner_cannot_complete_an_unpaid_wash` | GAP-09 |
| `test_gap11_customer_alone_cannot_close_the_trip` | GAP-11 |
| `test_gap12_recorded_inspection_cannot_be_rewritten` | GAP-12 |
| `test_gap16_admin_can_save_platform_settings` | GAP-16 |
| `test_gap19_pickup_checklist_waits_for_the_check_in_window` | GAP-19 |
| `test_gap20_cancelled_pool_trip_closes_and_notifies_passengers` | GAP-20 |

The 7 `test_ok_*` tests protect rules that work today: price breakdown, the refund table, settlement, same-day conflicts and referral bonuses. They must always pass.

GAP-02, 03, 10, 18 and 21 are fixed; their gates now live in `backend/tests/test_booking_integrity.py` and `backend/tests/test_api.py`, including a real two-connection race for GAP-02.

When you fix a gap, run its gate, confirm it passes, then move the test into `backend/tests/` so CI protects the fix.

## What the existing tests cover

| File | Covers |
| --- | --- |
| `backend/tests/test_api.py` | Sign-up, sign-in, tokens, password reset, queries, functions, files, payment actions |
| `backend/tests/test_db_roles.py` | Database roles, row-level security, schema counts, guards |
| `backend/tests/test_realtime.py` | WebSocket live updates |
| `frontend/src/tests/flows/rental-booking.test.ts` | Rental rules |
| `frontend/src/tests/flows/driver-hire.test.ts` | Driver hire rules |
| `frontend/src/tests/flows/pooling.test.ts` | Pooling rules |
| `frontend/src/tests/flows/wash-and-wallet.test.ts` | Wash and wallet rules |
| `frontend/src/tests/flows/money.test.ts` | Charges, refunds and settlement |
| `frontend/src/tests/flows/admin-platform-safety.test.ts` | Admin and safety rules |
| `frontend/src/tests/unit/` | Charges and rental pricing |
| `frontend/src/lib/trip-window.test.ts` | Check-in window |

**Flow tests use an in-memory copy of the rules** in `frontend/src/tests/harness/fake-backend.ts`, not the real database. They can pass while the real database behaves differently, which is why the launch gates run against PostgreSQL.

The `*-localhost-e2e.test.ts` files call `http://localhost:8080` and pass automatically when the app isn't running. Treat them as real checks only when the app is up.

## Database health checks

Run these against a database that has test data. **Each query should return no rows.**

```sql
-- Wallet balance differs from its ledger
SELECT w.user_id, w.balance, COALESCE(SUM(t.amount), 0) AS ledger
FROM public.wallets w LEFT JOIN public.wallet_transactions t ON t.user_id = w.user_id
GROUP BY w.user_id, w.balance HAVING w.balance <> COALESCE(SUM(t.amount), 0);

-- Confirmed rentals that overlap on the same vehicle
SELECT a.id, b.id FROM public.bookings a JOIN public.bookings b
  ON a.vehicle_id = b.vehicle_id AND a.id < b.id
 AND a.start_date <= b.end_date AND a.end_date >= b.start_date
WHERE a.status = 'confirmed' AND b.status = 'confirmed';

-- Completed paid rentals with no settlement
SELECT id FROM public.bookings
WHERE status = 'completed' AND payment_status = 'paid' AND earning_credited_at IS NULL;

-- Completed work that was never paid
SELECT 'rental' AS kind, id FROM public.bookings WHERE status = 'completed' AND payment_status = 'unpaid'
UNION ALL SELECT 'hire', id FROM public.driver_bookings WHERE status = 'completed' AND payment_status = 'unpaid'
UNION ALL SELECT 'wash', id FROM public.wash_bookings WHERE status = 'completed' AND payment_status = 'unpaid';

-- Cancelled bookings marked as paid
SELECT id FROM public.bookings WHERE status = 'cancelled' AND payment_status = 'paid';

-- Pool seat counts outside their limits
SELECT id FROM public.pool_trips WHERE seats_available < 0 OR seats_available > seats_total;

-- Paid withdrawals with no bank reference
SELECT id FROM public.withdrawals WHERE status = 'paid' AND COALESCE(reference, '') = '';
```

## Tests still to add

| Area | Test needed |
| --- | --- |
| Payments | Razorpay webhook handling once GAP-05 is built |
| Payments | Two simultaneous top-up confirmations credit the wallet once (GAP-07) |
| Payments | Failed verification never shows success (GAP-06) |
| Browser | Playwright journey for each main workflow |
| Time | Reminders on a UTC database (GAP-25) |
| Permissions | Each table tested for each role |
