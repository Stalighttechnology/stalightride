# Automated tests

These checks run without clicking through the app. Manual workflows are in the [component docs](README.md#who-owns-what).

## Run everything

| Check | Run from | Command | Latest result |
| --- | --- | --- | --- |
| Backend API and database | `backend/` | `.venv/Scripts/python -m pytest` | 103 passed in 14 test suites |
| Frontend rules and pricing | `frontend/` | `npm run test` | 272 passed in 18 files |
| Type check | `frontend/` | `npx tsc --noEmit` | No errors |
| Production build | `frontend/` | `npm run build` | Builds successfully |
| Migration check | `backend/` | `.venv/Scripts/python manage.py makemigrations --check --dry-run` | No changes detected |
GitHub Actions runs the backend and frontend checks on each pull request. See `.github/workflows/ci.yml`.

## Protecting fixed gaps

The old launch-gate file (`docs/automated/`) has been removed. Each fixed gap needs a test in `backend/tests/` so CI catches a regression. GAP-11 shows why: it was fixed, reopened by #39 without CI noticing, and is now guarded by `test_trip_handover.py`. When you fix or reopen a gap, add or update its test in the file that covers that area (table below).

## What the existing tests cover

| File | Covers |
| --- | --- |
| `backend/tests/test_api.py` | Sign-up, sign-in, tokens, password reset, queries, functions, files, payment actions |
| `backend/tests/test_db_roles.py` | Database roles, row-level security, schema counts (update them in every migration), single latest migration, guards |
| `backend/tests/test_booking_integrity.py` | Double booking (including a real two-connection race), forced pending status, blocked dates, past dates, account deletion |
| `backend/tests/test_booking_windows.py` | Rental deadlines, 2-hour notice, lazy expiry, Instant Book, host response stats, listing pauses |
| `backend/tests/test_driver_windows.py` | Driver hire deadlines, similar drivers, linked rental cancellation |
| `backend/tests/test_wash_dispatch.py` | Wash payment window, dispatch tiers, radius and clash checks, claim races, releases and strikes, auto-cancel refunds, tier notifications |
| `backend/tests/test_trip_handover.py` | Handover codes: host-only visibility, renter-only check-in/out, the 360° photo set, wrong-code lockout, no completion without the check-out code |
| `backend/tests/test_dashboard_stats.py` | Host, driver and wash center dashboard totals |
| `backend/tests/test_pooling_windows.py` | Pool request deadlines, 1h cutoff, halfway reminder, request expiry, departure closures, driver response stats |
| `backend/tests/test_corporate.py` | Corporate accounts, policies, parallel approval windows, company wallet billing, and GST invoicing |
| `backend/tests/test_vehicle_location.py` | Private pickup location: exact address and pin hidden until host confirms |
| `backend/tests/test_provider_amounts.py` | Provider privacy: hosts and drivers see only their earnings in payment notifications |
| `backend/tests/test_review_and_booking_host.py` | Host review reply scope, booking host locked to vehicle owner |
| `backend/tests/test_realtime.py` | WebSocket live updates |
| `frontend/src/tests/flows/rental-booking.test.ts` | Rental rules |
| `frontend/src/tests/flows/driver-hire.test.ts` | Driver hire rules |
| `frontend/src/tests/flows/pooling.test.ts` | Pooling rules |
| `frontend/src/tests/flows/wash-and-wallet.test.ts` | Wash and wallet rules |
| `frontend/src/tests/flows/money.test.ts` | Charges, refunds and settlement |
| `frontend/src/tests/flows/corporate.test.ts` | Corporate accounts, policies, monthly limits, parallel approvals and billing |
| `frontend/src/tests/flows/admin-platform-safety.test.ts` | Admin and safety rules |
| `frontend/src/tests/unit/` | Charges, rental pricing, vehicle availability, notification routing, confirm dialog |
| `frontend/src/lib/trip-window.test.ts` | Check-in window |

**Flow tests use an in-memory copy of the rules** in `frontend/src/tests/harness/fake-backend.ts`, not the real database. They can pass while the real database behaves differently, which is why every rule also needs a backend test against PostgreSQL.

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

-- Requests past their response deadline that are still pending (send_reminders isn't running)
SELECT 'rental' AS kind, id FROM public.bookings WHERE status = 'pending' AND respond_by < now() - interval '10 minutes'
UNION ALL SELECT 'hire', id FROM public.driver_bookings WHERE status = 'pending' AND respond_by < now() - interval '10 minutes';

-- Paid washes past their slot with no washer and no refund
SELECT id FROM public.wash_bookings
WHERE status = 'confirmed' AND payment_status = 'paid' AND assigned_cleaner_id IS NULL
  AND (slot_date + slot_time) AT TIME ZONE 'Asia/Kolkata' < now();
```

## Tests still to add

| Area | Test needed |
| --- | --- |
| Payments | Two simultaneous top-up confirmations credit the wallet once (GAP-07) |
| Payments | Failed verification never shows success (GAP-06) |
| Browser | Playwright journey for each main workflow |
| Time | Reminders on a UTC database (GAP-25) |
| Payments | Razorpay webhook: signature check, late-payment refund (GAP-05) |
| Wash | Admin manual assignment (`admin_assign_wash_cleaner`) |
| Permissions | Each table tested for each role |
