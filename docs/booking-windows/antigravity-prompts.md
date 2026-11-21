# Booking windows: Antigravity prompts

One prompt for each piece of work. Run them **in order**, one branch and one pull request each. Every prompt stands alone: paste it into the Antigravity agent, review the diff, run the checks, then move on to the next.

The design and reasoning are in [`suggested-approach.md`](suggested-approach.md). Every prompt tells the agent to read it.

| # | Prompt | Depends on | Status |
|---|---|---|---|
| 1 | Shared foundation and rentals | none | Done (#40, migration 0030) |
| 2 | Hosts: Instant Book and accountability | 1 | Done (#42, migration 0032) |
| 3 | Driver hire | 1 | Done (#43, migration 0033) |
| 4 | Doorstep washes: job board | 1 | Done (#44, migration 0034) |
| 5 | Pooling | 1 | **Next.** Use migration `0035` |
| 6a | Corporate: record the design | none | Not started |
| 6b | Corporate: build | 6a, plus the business decisions in the corporate doc | Not started |

The prompts below still say "the next free number" for migrations. The latest is `0034_wash_booking_dispatch`, so prompt 5 creates `0035` and depends on `0034`.

Rules every prompt repeats, because the agent doesn't remember earlier runs:
- Business rules live in PostgreSQL.
- Schema changes are new `RunSQL` migrations in `backend/core/migrations/`, using the next free number.
- Mirror every rule in `frontend/src/tests/harness/fake-backend.ts` and the flow tests.
- Never edit `src/routeTree.gen.ts`.

---

## Prompt 1: Shared foundation and rentals

````text
You are working in the stalightride repo (Synchoo: Django + PostgreSQL backend in backend/, React SPA in frontend/).
First read CLAUDE.md, AGENTS.md and docs/booking-windows/suggested-approach.md (sections "Shared rule" and "1. Rentals").

GOAL
Rental requests and unpaid approved rentals must expire, so they stop blocking a car's dates forever.
The flow stays approve-then-pay: request → host approves → customer pays.

THE RULE
deadline(from, start, buffer) = earliest of: from + 12h, from + (start − from)/2, start − buffer.
- Rental start = (start_date + pickup_time) AT TIME ZONE 'Asia/Kolkata'. Default pickup_time to 10:00 as the existing code does.
- Host respond_by = deadline(created_at, start, 1 hour).
- Customer pay_by = deadline(confirmed_at, start, 30 minutes).
- Requests with pickup less than 2h away are refused. This is a fixed rule, NOT a per-vehicle setting.

DATABASE: one new migration in backend/core/migrations/ (next free number; RunSQL with a reverse)
1. Function public.booking_deadline(_from timestamptz, _start timestamptz, _buffer interval, _cap interval DEFAULT '12 hours') RETURNS timestamptz, IMMUTABLE.
2. Add to public.bookings: respond_by, pay_by, confirmed_at, respond_reminded_at, pay_reminded_at (all timestamptz, nullable). Reuse the existing cancellation_reason column. Backfill:
   - pending rows: respond_by from now()
   - confirmed unpaid rows: pay_by from now()
3. CREATE OR REPLACE public.prevent_booking_conflict(). Start from the version in migration 0025 and keep everything it does. In the customer-insert branch:
   a. Refuse when the start is less than 2h from now(): 'Pickup must be at least 2 hours from now'.
   b. Set NEW.respond_by.
   c. After the existing vehicle row lock and BEFORE the overlap check, mark expired bookings for the same vehicle as cancelled, with cancellation_reason 'host_no_response' or 'payment_timeout' and cancelled_at = now():
      - status = 'pending' AND respond_by < now()
      - status = 'confirmed' AND payment_status <> 'paid' AND pay_by < now()
4. New BEFORE UPDATE trigger trg_zz_booking_windows on public.bookings. The name must sort after trg_enforce_booking_update_scope and trg_money_*, because Postgres fires BEFORE triggers alphabetically.
   - pending → confirmed when now() > OLD.respond_by: RAISE 'This request has expired'.
   - pending → confirmed otherwise: set confirmed_at = now() and pay_by.
5. In public.enforce_booking_update_scope() (schema.sql:1193), add respond_by, pay_by, confirmed_at, respond_reminded_at and pay_reminded_at to the columns end users cannot change.
6. public.wallet_pay_booking: RAISE 'Payment window has closed' when now() > pay_by.
7. New public.expire_booking_windows() RETURNS jsonb, SECURITY DEFINER, granted to service_role only. For bookings it:
   - cancels expired rows exactly as in 3c;
   - inserts into public.notifications (user_id, title, body, link) for the customer and the vendor;
   - sends ONE halfway reminder per window to the vendor (respond) or the customer (pay), tracked through respond_reminded_at / pay_reminded_at;
   - returns counts.
   Later prompts extend this function to other tables, so keep it organised by table.
8. Copy the final function bodies into backend/sql/schema.sql, the same way commit 35afee5 did for 0025.

BACKEND (Python)
- backend/core/management/commands/send_reminders.py: also call SELECT public.expire_booking_windows(), and change the help text to "every 5 minutes".
- backend/payments/views.py:
  - create_razorpay_order (~line 117): refuse when pay_by has passed or is less than 5 minutes away.
  - verify_razorpay_payment (~line 135) and the rentals branch of the Razorpay webhook (~line 1011): today they return ok and do nothing when the booking is cancelled. Instead, when the booking status is 'cancelled' or 'rejected' and this payment has not been recorded yet, refund the amount to the customer's wallet using public.wallet_apply(customer_id, amount, 'refund', booking_id, payment_id, 'Refund: payment arrived after booking closed') under db_role("service_role"), set payment_status = 'refunded', and notify the customer. Copy how the existing cancel functions in schema.sql (~line 718) refund. It must be idempotent: running it twice refunds once.

FRONTEND
- src/routes/vehicle.$id.tsx: don't allow a pickup less than 2h away; after the request, show "Host will respond by <time>".
- src/routes/_authenticated/bookings.index.tsx:
  - pending: "Waiting for host, responds by <time>" with a countdown;
  - confirmed unpaid: "Pay by <time>";
  - cancelled with host_no_response / payment_timeout: a friendly reason and a "Find similar cars" link to /browse with the same city and dates (browse already accepts search params);
  - the pay buttons are disabled after pay_by.
- src/routes/_authenticated/vendor.index.tsx (decideBooking ~line 260): show "Respond within <time left>", sort pending requests by respond_by, disable Approve/Decline once it has passed.
- src/lib/db-types.ts: add the new columns.
Display the stored respond_by / pay_by values; do NOT recompute the formula in TypeScript. Format times with the existing helpers.

TESTS
- New backend/tests/test_booking_windows.py, against the real test database like test_booking_integrity.py:
  - the formula cases: 3pm→6pm gives 4:30pm; approve at 4pm gives pay_by 5:00pm; next week gives created + 12h; under 2h is refused;
  - approving after respond_by fails;
  - wallet payment after pay_by fails;
  - a new request for the same car succeeds once the old one's respond_by is in the past (set it in the past as the owner);
  - expire_booking_windows cancels both kinds of expired booking and sends each reminder once;
  - a late Razorpay verify refunds to the wallet exactly once.
- frontend/src/tests/harness/fake-backend.ts: model the same rules.
- frontend/src/tests/flows/rental-booking.test.ts: add the matching flows.

DONE WHEN
cd backend && .venv/Scripts/python -m pytest passes; cd frontend && npm run test and npx tsc --noEmit pass.
Do not touch driver_bookings, wash_bookings or pool_requests in this change.
````

---

## Prompt 2: Hosts (Instant Book and accountability)

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md and docs/booking-windows/suggested-approach.md (sections "1. Rentals" and "2. Hosts").
Prompt 1 is merged: bookings has respond_by / pay_by / confirmed_at, and public.booking_deadline() and public.expire_booking_windows() exist. Check this before starting.

GOAL
Hosts can switch on Instant Book. Hosts who let requests expire become visible and, if it keeps happening, their listings are paused.

DATABASE: new migration (next free number), mirrored into backend/sql/schema.sql
1. public.vehicles.instant_book boolean NOT NULL DEFAULT false. Only the vehicle's vendor (and admins) may change it; check the vehicles row-level-security policies.
2. In public.prevent_booking_conflict(), customer insert branch: when the vehicle has instant_book = true, set NEW.status = 'confirmed', NEW.confirmed_at = now(), NEW.pay_by = booking_deadline(now(), start, '30 minutes') and leave respond_by NULL.
   Make sure tg_notify_booking() tells both sides on INSERT of a confirmed booking (today it may only handle UPDATE).
3. New public.host_response_stats(_vendor_id uuid) RETURNS jsonb: STABLE, SECURITY DEFINER, granted to anon and authenticated.
   Over the vendor's bookings created in the last 90 days that needed a response, return:
   - response_rate: confirmed or rejected before respond_by, divided by all;
   - median_response_minutes;
   - request_count.
   Return only these aggregates, never rows.
4. Extend public.expire_booking_windows(): when a vendor reaches 3 or more bookings cancelled with cancellation_reason 'host_no_response' in the last 30 days, set all their active vehicles to status 'paused' and notify the vendor:
   "Your listings are paused because 3 requests expired without a response. Turn them back on from your dashboard."
   Do it only once per breach: store vendors.listings_paused_at, or similar, and only count expiries after the last re-activation.

FRONTEND
- src/routes/_authenticated/vendor.vehicles.new.tsx, and wherever hosts edit a vehicle: an "Instant Book" switch (shadcn Switch) with one line of help: "Guests are confirmed immediately; you can't decline."
- src/routes/browse.tsx: list instant_book vehicles first (today it orders by created_at), and add an "Instant" badge on the card.
- src/routes/vehicle.$id.tsx:
  - an "Instant Book" badge;
  - the request button reads "Book now" for Instant Book cars;
  - the host card shows "Responds to X% of requests, usually within Y" from host_response_stats.
- src/routes/_authenticated/vendor.index.tsx: show the host their own response rate, and a banner with a "Re-activate listings" button when their vehicles were paused for expiries.
- src/lib/db-types.ts: add instant_book.

TESTS
- backend/tests/test_booking_windows.py:
  - an Instant Book insert lands as confirmed with pay_by;
  - host_response_stats numbers;
  - 3 expiries pause the listings once.
- fake-backend.ts and frontend/src/tests/flows/rental-booking.test.ts: the same.

DONE WHEN pytest, npm run test and npx tsc --noEmit pass.
````

---

## Prompt 3: Driver hire

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md and docs/booking-windows/suggested-approach.md (sections "Shared rule" and "3. Driver hire").
Prompt 1 is merged; reuse public.booking_deadline() and extend public.expire_booking_windows(). Copy the rental pattern from that migration exactly.

GOAL
Driver hires get the same windows as rentals. Start = (start_date + start_time) AT TIME ZONE 'Asia/Kolkata'.
- respond_by = deadline(created_at, start, 1 hour)
- pay_by = deadline(confirmed_at, start, 1 hour)
- 2h minimum notice
When a driver declines or doesn't respond, the customer is offered similar drivers.

DATABASE: new migration (next free number), mirrored into backend/sql/schema.sql
1. public.driver_bookings: respond_by, pay_by, confirmed_at, respond_reminded_at, pay_reminded_at. Reuse cancellation_reason. Backfill as in prompt 1.
2. public.prevent_driver_booking_conflict(): latest version in migration 0022; its trigger trg_prevent_driver_booking_conflict is BEFORE INSERT. In the customer branch:
   - 2h minimum notice;
   - set respond_by;
   - after the drivers row lock, cancel this driver's expired pending/unpaid bookings before the overlap check.
3. New BEFORE UPDATE trigger trg_zz_driver_booking_windows: refuse approval after respond_by; on approval set confirmed_at and pay_by.
   Add the new columns to public.enforce_driver_booking_update_scope().
   The pending-only status-change guard lives in public.tg_money_guard_driver_booking() (migration 0021); leave it in place.
4. public.wallet_pay_driver_booking: refuse after pay_by.
5. public.expire_booking_windows(): add the driver_bookings section (cancel, reminders, notifications), the same as rentals.
6. New public.similar_drivers(_driver_booking_id uuid) RETURNS SETOF the public driver card fields: SECURITY DEFINER, granted to authenticated, and the caller must be that hire's customer.
   It returns drivers that are verification_status 'approved' and status 'active', in the same city as the original driver, excluding the original driver, with no pending/confirmed driver_booking overlapping the same dates, ordered by rating. LIMIT 5.
7. Hires linked to a rental (driver_bookings.booking_id): first check whether cancelling, rejecting or expiring a rental already cancels its linked driver hire.
   If not, add an AFTER UPDATE trigger on bookings that does it, refunding to the wallet if the hire was paid (copy the existing driver cancel refund in schema.sql ~line 816: kind 'driver_refund', _booking_id NULL, reference = the driver booking id), and notifies the driver and the customer.

BACKEND (Python), backend/payments/views.py
- create_driver_razorpay_order: refuse when pay_by has passed or is less than 5 minutes away.
- verify_driver_razorpay_payment and the webhook's driver_booking_id branch (~line 1022): the same late-payment wallet refund as prompt 1 added for rentals, with the same idempotency, but use kind 'driver_refund' with the driver booking id as the reference, as the existing driver refunds do.

FRONTEND
- src/routes/driver.$id.tsx: 2h minimum notice; "Driver responds by <time>" after the request. Accept prefill search params (dates, times, rate type) so "book similar" can open it ready to submit.
- src/routes/_authenticated/hires.tsx: countdowns ("Driver responds by", "Pay by"); on an expired or declined hire, a "Book a similar driver" section listing similar_drivers(...) results, each opening driver.$id with the same details prefilled.
- src/routes/_authenticated/driver-dashboard.tsx (decide, ~line 249): time left on each request, sorted by respond_by, buttons disabled after it.
- src/lib/db-types.ts: add the new fields.

TESTS
- New backend tests (copy the style of test_booking_windows.py): windows, approval after the deadline fails, wallet payment after the deadline fails, expiry frees the driver's dates, similar_drivers excludes busy drivers, the linked-rental cascade, the late-payment refund.
- fake-backend.ts and frontend/src/tests/flows/driver-hire.test.ts.

DONE WHEN pytest, npm run test and npx tsc --noEmit pass.
````

---

## Prompt 4: Doorstep washes (job board with tiers)

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md and docs/booking-windows/suggested-approach.md (section "4. Doorstep washes").
Prompt 1 is merged; extend public.expire_booking_windows().

TODAY
- src/routes/wash.tsx inserts a wash_bookings row (pending).
- An admin approves it (confirmed).
- The customer pays (create_wash_razorpay_order requires confirmed).
- Any cleaner in the same city claims it with public.claim_wash_job (schema.sql ~925).
- Then public.advance_wash_status (migration 0021).
Every wash_bookings row is a doorstep job; there's no customer drop-off flow (out of scope).

GOAL
No admin approval. The customer pays when booking. Paid jobs go onto a job board that cleaners claim.
Who can see a job is decided by tiers, worked out from paid_at when a cleaner reads the board. Nothing runs on a timer.
No PostGIS, no per-offer timers, no 45-second dispatch.

TIERS (L = slot start − paid_at; slot start = (slot_date + slot_time) AT TIME ZONE 'Asia/Kolkata')
| L         | Tier 1 (top 3 within 5 km) | Tier 2 (within own radius) | Tier 3 (whole city) | Admin alert  | Auto-cancel + refund |
| > 24h     | paid_at → +4h              | +4h → +8h                  | +8h → slot−12h      | slot−12h     | slot−2h              |
| 6–24h     | paid_at → +1h              | +1h → +2h                  | +2h → slot−3h       | slot−3h      | slot−1h              |
| 2–6h      | paid_at → +15m             | +15m → +30m                | +30m → slot−1h      | slot−1h      | slot−30m             |
- Visibility only widens: once a tier opens, earlier tiers still see the job, and after Tier 3 ends the job stays visible to the whole city until it is cancelled.
- Tier 1 = the 3 best eligible cleaners within 5 km of the job, ranked by avg_rating desc, then fewest jobs that day. Cleaners with 2 or more late releases in 30 days are excluded.
- Eligible = verification_status 'approved', available = true, same city (case-insensitive), the job inside their radius_km (Tier 2 and up), and no clash with their other active jobs.

DATABASE: new migration (next free number), mirrored into backend/sql/schema.sql
1. public.haversine_km(lat1, lng1, lat2, lng2) RETURNS double precision, IMMUTABLE.
2. public.cleaners: base_lat, base_lng (double precision), radius_km numeric NOT NULL DEFAULT 8.
3. public.wash_bookings: pay_by timestamptz, tier_notified smallint NOT NULL DEFAULT 0, admin_alerted_at timestamptz.
4. New table public.wash_job_releases (id, cleaner_id, wash_booking_id, released_at, late boolean), with row-level security: a cleaner reads their own rows, admins read all.
5. Insert guard public.enforce_wash_booking_guard() (trigger wash_bookings_guard):
   - require lat and lng;
   - require the slot at least 2h ahead;
   - set pay_by = now() + 15 minutes.
6. Payment:
   - public.wallet_pay_wash_booking and the wash Razorpay functions must accept a pending, unpaid booking before pay_by (instead of requiring confirmed);
   - once paid, set status 'confirmed', progress 'confirmed' and paid_at.
   Find where admins approve washes today and remove that step for these bookings. Keep admin cancel/refund.
7. New public.wash_job_board() RETURNS SETOF jobs (id, service name, duration, slot, area/address summary, distance_km, payout = provider_earning). SECURITY DEFINER; the caller must be a cleaner.
   It returns confirmed, paid, unassigned, not-cancelled jobs the caller can see now under the tier rules, ordered by slot.
   Never return the customer's phone or the exact address before the job is claimed; show the area only.
8. Change public.claim_wash_job:
   - the caller must currently see the job (the same visibility rule; put it in a helper function both use);
   - the job must be inside their radius;
   - no time clash with their other assigned/on_the_way/started jobs, counting [slot, slot + duration_minutes + 30 min];
   - keep the existing FOR UPDATE lock;
   - when the job is already taken, raise 'Another partner just claimed this job'.
9. New public.release_wash_job(_wash_booking_id):
   - only the assigned cleaner;
   - clears assigned_cleaner_id, sets progress back to 'confirmed', logs to wash_job_releases with late = (slot − now() < 12h);
   - sets tier_notified to 3 so it reopens to the whole city, and alerts admins.
   public.enforce_wash_booking_forward_progress() blocks moving backwards, so allow exactly this assigned → confirmed change when it comes from release_wash_job (use a set_config flag, like the app.pool_seat_sync pattern in migration 0021).
10. public.expire_booking_windows(), new wash section:
   a. cancel pending, unpaid washes past pay_by;
   b. when a job enters a new tier (compare against tier_notified), send ONE summary notification per newly eligible cleaner ("N new wash jobs near you"), then update tier_notified;
   c. at the admin-alert time, notify every admin once (admin_alerted_at);
   d. at the auto-cancel time with no cleaner: status 'cancelled', cancellation_reason 'no_washer', refund to the wallet (copy the wash cancel refund in schema.sql ~line 871: kind 'wash_refund', _booking_id NULL, reference = the wash booking id), notify the customer.

BACKEND (Python), backend/payments/views.py
- Wash order/verify functions: allow a pending, unpaid booking before pay_by.
- verify_wash_razorpay_payment and the webhook's wash_booking_id branch (~line 1033): the late-payment wallet refund as in prompt 1, using kind 'wash_refund' with the wash booking id as the reference.

FRONTEND
- src/routes/wash.tsx:
  - address pin required (reuse components/map-picker);
  - only slots at least 2h ahead;
  - after the insert, go straight to payment (wallet or Razorpay, as washes.tsx does today);
  - replace the copy "Our team confirms a washer partner for your slot, then you pay" with "Pay now; we'll assign a nearby washer and notify you".
- src/routes/_authenticated/washes.tsx: statuses "Payment pending (pay by <time>)", "Finding a washer", "Washer assigned"; the refund message for no_washer.
- src/routes/_authenticated/cleaner-dashboard.tsx:
  - an "Available jobs" tab using wash_job_board(), refreshed live through api.channel on wash_bookings;
  - a Claim button;
  - base location (map-picker) and radius in the profile form;
  - a "Release job" button on claimed jobs, warning that a release less than 12h before the slot counts as a strike.
- src/components/admin/BookingsMonitorTab (and any wash approval UI): remove the wash approval step; add an "At risk: no washer" list (admin alert sent, unassigned) with manual assignment to a cleaner.
- src/lib/db-types.ts: add the new fields.

TESTS
- New backend/tests/test_wash_dispatch.py:
  - board visibility per tier and band (move paid_at and the slot in time instead of waiting);
  - the radius and clash checks;
  - two claims of the same job: exactly one succeeds;
  - release, its strike, and Tier 1 exclusion;
  - an unpaid wash expires;
  - auto-cancel with refund;
  - one summary notification per tier.
- fake-backend.ts and frontend/src/tests/flows/wash-and-wallet.test.ts.

DONE WHEN pytest, npm run test and npx tsc --noEmit pass.
````

---

## Prompt 5: Pooling

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md and docs/booking-windows/suggested-approach.md (section "5. Pooling").
Prompt 1 is merged; reuse public.booking_deadline() and extend public.expire_booking_windows().

GOAL
Pool seat requests expire when the trip driver doesn't answer. Pooling has no online payment, so there is no payment window.
- respond_by = booking_deadline(created_at, pool_trips.depart_at, '30 minutes')
- Requests less than 1h before departure are refused.

DATABASE: new migration (next free number), mirrored into backend/sql/schema.sql
1. public.pool_requests: respond_by timestamptz, respond_reminded_at timestamptz.
2. public.enforce_pool_request_guard() (latest in migration 0021; trigger pool_requests_guard):
   - INSERT: refuse when depart_at − now() < 1 hour ('Requests close 1 hour before departure'); set NEW.respond_by;
   - UPDATE to 'confirmed' when now() > OLD.respond_by: RAISE 'This request has expired';
   - the "only the trip driver can reject" check must not block the system: skip it when public.is_end_user_request() is false;
   - make respond_by and respond_reminded_at unchangeable by end users.
3. public.expire_booking_windows(), new pool section:
   - pending requests past respond_by, or whose trip has departed or is cancelled: status 'rejected', cancellation_reason 'Driver didn''t respond' (or 'Trip departed');
   - notify the passenger (link /pooling/mine) through the existing pool notification trigger or a direct insert, without sending two notifications;
   - one halfway reminder to the trip driver.
4. New public.pool_driver_response_stats(_driver_id uuid) RETURNS jsonb (response_rate, request_count over 90 days). SECURITY DEFINER, aggregates only, granted to anon and authenticated.

FRONTEND
- src/routes/_authenticated/pooling.mine.tsx: "Driver responds by <time>" countdown; the reason for expired requests.
- src/routes/_authenticated/pooling.driver.tsx (decide, ~line 120): time left per request, sorted by respond_by, buttons disabled after it.
- src/routes/pooling.tsx: show "Responds to X% of requests" on trip cards.
- src/lib/db-types.ts: add the fields.

TESTS
- Backend tests: the 1h cut-off, respond_by, accepting after the deadline fails, expiry rejects with the reason, departure closes pending requests, seats unchanged.
- fake-backend.ts and frontend/src/tests/flows/pooling.test.ts.

DONE WHEN pytest, npm run test and npx tsc --noEmit pass.
````

---

## Prompt 6a: Corporate (record the design, docs only)

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md, docs/components/12-corporate.md and docs/booking-windows/suggested-approach.md (section "6. Corporate").

Change docs only, no code. Update docs/components/12-corporate.md with a new "Approval and payment design" section, in the same style as the doc:
1. Policy is checked at booking time (allowed services, price cap, monthly limit).
   - In policy: approval_status 'auto', no manager approval.
   - Out of policy: manager approval, or the employee pays personally (the employee chooses).
2. The manager and the provider approve in parallel, with the same respond_by from public.booking_deadline().
   - Confirmed only when both approve.
   - Either a decline or a missed deadline expires the booking.
   - The provider sees "Awaiting company approval" and may approve early.
3. The company pays automatically on confirmation (company wallet or credit line, decision 1 in the doc). Company trips have no pay_by.
4. In-policy trips are reviewed afterwards: a weekly summary to managers with a "flag trip" action.
5. company_trips gets approval_status, manager_id, manager_decided_at and respond_by.
Add workflow rows CO-18 to CO-21 to the "Workflows to specify and test" table, covering parallel approval, manager expiry, auto-approval within policy, and the personal-payment fallback.
Keep the existing "Decisions needed before building" list and note that these must be answered before prompt 6b.
````

## Prompt 6b: Corporate (build; only after 6a and the business decisions)

````text
You are working in the stalightride repo. Read CLAUDE.md, AGENTS.md and docs/components/12-corporate.md, including its "Approval and payment design" section and the answered "Decisions needed before building".
If any of those decisions is still unanswered, STOP and list what is missing instead of guessing.

Build the corporate feature as specified in that doc:
- Tables companies, company_members, company_policies, company_trips and company_invoices, each through a new migration with row-level security so each company sees only its own data.
- The policy check at booking (rentals, driver hire, washes); parallel manager/provider approval reusing public.booking_deadline() and an extension of public.expire_booking_windows(); the company payment on confirmation; the weekly manager summary.
- Replace the demo content in src/routes/corporate.tsx with the real flows.
- Tests for every CO-xx workflow in the doc: backend tests, fake-backend.ts, and a new frontend/src/tests/flows/corporate.test.ts.

DONE WHEN pytest, npm run test and npx tsc --noEmit pass.
````
