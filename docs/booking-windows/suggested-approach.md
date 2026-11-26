# Booking windows and dispatch: suggested approach

Decided on 2026-11-20. The step-by-step prompts are in [`antigravity-prompts.md`](antigravity-prompts.md).

## Build status

| Step | Status | Merged in | Migration | Test it with |
| --- | --- | --- | --- | --- |
| 1. Shared foundation and rentals, including late-payment refunds | **Built** | #40 | `0030_rental_booking_windows` | [03 Rental booking](../components/03-rental-booking.md#booking-windows) |
| 2. Hosts: Instant Book, response stats, pausing listings | **Built** | #42 | `0032_instant_book_and_host_accountability` | [02 Hosts and vehicles](../components/02-hosts-and-vehicles.md#instant-book-and-response-rate) |
| 3. Driver hire | **Built** | #43 | `0033_driver_booking_windows` | [05 Driver hire](../components/05-driver-hire.md#booking-windows) |
| 4. Doorstep washes: job board with tiers | **Built** | #44 | `0034_wash_booking_dispatch` | [07 Vehicle wash](../components/07-vehicle-wash.md) |
| 5. Pooling: request windows, 1h cutoff, halfway reminder, response stats | **Built** | #45 | `0035_pool_request_booking_windows` | [06 Car pooling](../components/06-car-pooling.md#booking-windows) |
| 6. Corporate: accounts, policies, parallel approval windows, GST invoicing | **Built** | #49 | `0038_corporate_accounts_and_approval_windows` | [12 Corporate](../components/12-corporate.md#workflows-to-specify-and-test) |

Migration `0031_dashboard_stats` (#41) is unrelated and sits between steps 1 and 2. The rules as built are in [Business rules §17](../03-business-rules.md#17-booking-windows).

**Where the build differs from the plan below:**

- Tier 2 of the wash board uses each cleaner's own `radius_km`, not a fixed 8 km. The default radius is 8 km, so the result is the same until a cleaner changes it.
- A cleaner with no base location set only ever sees Tier 3 (whole-city) jobs.
- The admin can still **reject** or **complete** a wash from **Wash Orders**. The approve step is gone.
- `expire_booking_windows()` must run every 5 minutes through `manage.py send_reminders`. Without it, expired requests are still cancelled lazily when a new request overlaps them, but nobody is notified and washes are never auto-cancelled.
- Expiry reasons stored in `cancellation_reason`: `host_no_response`, `driver_no_response`, `payment_timeout`, `no_washer`.

## The problem

Every booking that needs someone to approve it can stall, and today nothing ever expires:

- A `pending` rental or driver hire blocks the car's or driver's dates. The overlap check and the `bookings_no_overlap` / `driver_bookings_no_overlap` constraints treat `pending` as taken.
- An approved booking that is never paid blocks the dates in the same way.
- A paid doorstep wash can sit with no washer assigned.
- A pool seat request can go unanswered until the trip leaves.
- If a Razorpay payment arrives after its booking was cancelled, `verify_*_razorpay_payment` and the webhook reply `ok` and change nothing. The customer is charged and has no booking.

## Research summary

| Company | What it does |
|---|---|
| Airbnb | Host has 24h. Most respond within 12h. An expired request means no charge |
| Turo | Host has 8h. On expiry Turo helps the guest rebook, otherwise a full refund. Instant Book listings rank higher, and Turo is making Book Instantly the standard. 58% of trips are booked less than 2 days before the start |
| Zoomcar | Hosts must serve allocated bookings. Not handing over the car costs a 30% penalty, a first cancellation gives a 1-star rating, and repeat offenders are delisted |
| Uber Reserve / DriveU | If a driver drops out, the trip goes to another nearby driver. DriveU confirms scheduled drives 1h before pickup |
| Poparide (carpooling) | Requests expire after 1 to 24h. Expiries lower the driver's quality score |
| Uber for Business | Policy is applied when booking. Managers review trips afterwards; out-of-policy rides go on personal payment |
| Urban Company / Spiffy | Jobs are assigned automatically by location, time, availability and rating. Professionals have acceptance-rate rules |

The lesson: remove the approval wait wherever possible (Instant Book, automatic assignment). Where approval stays, keep it short and penalise providers who let requests lapse.

## Shared rule: the deadline formula

```
deadline(from, start, buffer) = earliest of:
    from + 12h                   ← cap
    from + (start − from) ÷ 2    ← the customer keeps half the remaining time to rebook
    start − buffer               ← must close before the start
```

- **Start time** is the stored date and time read as India time: `(date + time) AT TIME ZONE 'Asia/Kolkata'`. For pooling it is `depart_at`.
- **Deadlines are stored on the row** (`respond_by`, `pay_by`), so the frontend displays them and never recomputes them.
- **Expiry happens in two places:**
  1. Lazily, inside the insert trigger: a new request first cancels expired requests it overlaps, so a dead request never blocks a new customer.
  2. In `expire_booking_windows()`, called by `send_reminders` every 5 minutes, which sends the notifications.
- **Late payments:** if a payment arrives for a cancelled or expired booking, it goes back to the customer's wallet. This app has no Razorpay refund code; all refunds go to the wallet through `wallet_apply(..., 'refund', ...)`. The Razorpay fee on that payment is lost. That's rare and accepted.
- **Reminders:** the provider gets one reminder at the halfway point of the window. It is sent once, tracked with a `*_reminded_at` column, because `notifications` has no type column.
- **Night-time deadlines are accepted.** For pickups 12 to 30 hours away, the deadline can fall at night; the halfway reminder covers it.

| Service | Who approves | Approver's buffer | Payment window | Minimum notice |
|---|---|---|---|---|
| Car rental | Host (or Instant Book) | 1h | after approval, 30m buffer | 2h (fixed rule, not a setting) |
| Driver hire | Driver | 1h | after approval, 1h buffer | 2h |
| Doorstep wash | Nobody (job board) | n/a | pay within 15 min of booking | 2h |
| Pooling | Trip driver | 30m | none (cash) | 1h |
| Corporate | Manager and provider at the same time | same as the service booked | none (company pays) | same as the service booked |

---

## 1. Rentals

**Flow:** request → host approves (or Instant Book confirms straight away) → customer pays → check-in opens 30 min before pickup (`trip_window.py`, unchanged).

| Request made | Pickup | Host responds by | If approved at | Customer pays by |
|---|---|---|---|---|
| Today 3 pm | Today 6 pm | 4:30 pm | 4:00 pm | 5:00 pm |
| Today 3 pm | Tomorrow 3 pm | 3:00 am | 10:00 pm | 6:30 am |
| Today 3 pm | Next week | 3:00 am tomorrow (12h cap) | Tomorrow 10 am | Tomorrow 10 pm (12h cap) |
| Today 3 pm, Instant Book car | Today 6 pm | already confirmed | 3:00 pm | 4:30 pm |
| Today 3 pm | Today 4:30 pm | refused (less than 2h) | | |

**Changes:**

1. **New columns on `bookings`:** `respond_by`, `pay_by`, `confirmed_at`, `respond_reminded_at`, `pay_reminded_at`. Reuse the existing `cancellation_reason` column.
2. **`prevent_booking_conflict()`** (latest version in migration `0025`), on a customer insert:
   - Refuse a pickup less than 2h away.
   - Set `respond_by`.
   - Cancel expired requests that overlap, before the overlap check.
   - If the vehicle has Instant Book on, insert the booking as `confirmed` and set `confirmed_at` and `pay_by`.
3. **New trigger `trg_zz_booking_windows`, BEFORE UPDATE:**
   - Refuse a `pending` → `confirmed` change after `respond_by`.
   - On approval, set `confirmed_at` and `pay_by`.
   - Postgres runs BEFORE triggers in alphabetical order, and the `zz` name makes this one run after `trg_enforce_booking_update_scope`.
   - Also add the new columns to the list that `enforce_booking_update_scope()` protects from end users.
4. **Payment checks:**
   - `wallet_pay_booking` refuses after `pay_by`.
   - `create_razorpay_order` (`backend/payments/views.py:117`) refuses when the deadline is less than 5 minutes away.
5. **Late payments:** `verify_razorpay_payment` (`views.py:135`) and the webhook rentals branch (`views.py:~1011`) refund to the wallet when the booking is cancelled or rejected.
6. **`expire_booking_windows()`:**
   - Cancels with reason `host_no_response` or `payment_timeout`.
   - Sends the halfway reminders.
   - Notifies both people.
7. **Frontend:**
   - `vehicle.$id.tsx`: no pickup times less than 2h away; show "Host responds by …".
   - `_authenticated/bookings.index.tsx`: countdowns, "Pay by …", the expiry reason, and a "Find similar cars" link to `/browse` with the same city and dates.
   - `_authenticated/vendor.index.tsx` (`decideBooking`): show the time left, sort requests by deadline, disable the buttons once it has passed.
   - `lib/db-types.ts`: add the new fields.
8. **Tests:**
   - New `backend/tests/test_booking_windows.py`.
   - `frontend/src/tests/harness/fake-backend.ts`.
   - `frontend/src/tests/flows/rental-booking.test.ts`.

## 2. Hosts (Instant Book and accountability)

1. **`vehicles.instant_book`** (boolean, default false):
   - Switch in `vendor.vehicles.new.tsx` and wherever hosts edit a vehicle.
   - "Instant" badge on cards.
   - `browse.tsx` lists Instant Book cars first (today it sorts by `created_at`).
2. **Response stats**, from the host's requests in the last 90 days:
   - Response rate (answered before `respond_by`).
   - Median response time.
   - Shown on the host card in `vehicle.$id.tsx`.
   - Exposed through a read-only database function (RPC) that runs with owner rights, so it can count bookings the viewer can't see.
3. **Pausing listings:**
   - 3 `host_no_response` expiries in 30 days set the host's vehicles to `status = 'paused'` and notify the host.
   - The host can turn them back on, and that resets the count.
   - Done inside `expire_booking_windows()`.
4. **Expired requests:** the customer sees similar cars. This is the link from section 1.

## 3. Driver hire

**Flow:** the same as rentals, using `start_date + start_time` and 1h buffers for both windows.

1. **New columns on `driver_bookings`:** `respond_by`, `pay_by`, `confirmed_at`, `respond_reminded_at`, `pay_reminded_at`. Reuse `cancellation_reason`.
2. **`prevent_driver_booking_conflict()`** (latest in `0022`; trigger `trg_prevent_driver_booking_conflict`, insert only): 2h minimum notice, set `respond_by`, cancel overlapping expired requests.
3. **New trigger `trg_zz_driver_booking_windows`, BEFORE UPDATE:** same rules as rentals. Add the new columns to `enforce_driver_booking_update_scope()`.
4. **Payment checks:** `wallet_pay_driver_booking` and the driver order/verify functions in `views.py`. Add the same late-payment refund to the webhook's driver branch.
5. **Similar drivers:**
   - A new database function `similar_drivers(_driver_booking_id)` returns verified, active drivers in the same city with no overlapping booking for those dates, sorted by rating.
   - It runs with owner rights, so it sees every driver's bookings when checking availability.
   - On an expired or declined hire in `hires.tsx`, show "Book a similar driver"; one tap prefills `driver.$id.tsx`.
6. **Hires linked to a rental** (`driver_bookings.booking_id`): when the rental is cancelled, rejected or expired, cancel the linked driver hire and refund it if it was paid. Check whether this already happens before adding it.
7. **Frontend:**
   - `driver.$id.tsx`: 2h minimum and the "responds by" label.
   - `hires.tsx`: countdowns and similar drivers.
   - `driver-dashboard.tsx` (`decide`, line ~249): time left, buttons disabled after the deadline.
8. **Tests:** `driver-hire.test.ts`, the fake backend, and backend tests.

## 4. Doorstep washes: job board with tiers

**Before #44:** `wash.tsx` created a pending booking → an admin approves it → the customer pays → any cleaner in the same city claims it (`claim_wash_job`, `schema.sql:925`) → `advance_wash_status`. Customers can't book drop-off at a wash center yet; every `wash_bookings` row is a doorstep job.

**New flow:**

1. **The customer books and pays.**
   - Address pin (latitude and longitude) required.
   - Slot at least 2h ahead.
   - `pay_by` = 15 minutes after booking; an unpaid booking is cancelled after that.
   - No admin approval.
2. **Once paid, the booking becomes `confirmed`** (progress `confirmed`) and appears on the job board.
3. **Who sees the job depends on the time from payment to slot.** It's worked out whenever a washer opens the board, so no timers run:

| Time from payment to slot | Tier 1: top 3 within 5 km | Tier 2: all within 8 km | Tier 3: whole city | Admin alerted | Auto-cancel and refund |
|---|---|---|---|---|---|
| More than 24h | first 4h | next 4h | until 12h before the slot | 12h before | 2h before |
| 6 to 24h | first 1h | next 1h | until 3h before | 3h before | 1h before |
| 2 to 6h | first 15m | next 15m | until 1h before | 1h before | 30m before |

   - Tier 1 ranking: rating first, then fewest jobs that day.
   - Cleaners with 2 or more late releases in the last 30 days are left out of Tier 1.
   - A cleaner's radius is their own `radius_km` (default 8). Tier 1 also requires being within 5 km.
4. **Claiming** uses `claim_wash_job`, with new checks:
   - The cleaner can see the job (tier and radius).
   - No overlap with their other jobs, counting the slot, the wash duration and a 30-minute travel buffer.
   - Friendly message if someone else got it first: "Another partner just claimed this job". The function already locks the row, so `SKIP LOCKED` isn't needed.
5. **Releasing a job:** a new `release_wash_job` puts a claimed job back on the board at Tier 3 and alerts the admin. A release less than 12h before the slot counts as a strike, logged in `wash_job_releases`.
   - `enforce_wash_booking_forward_progress` normally blocks moving backwards, so it needs an exception for this one change, `assigned` → `confirmed`.
6. **Notifications from `expire_booking_windows()`:**
   - One summary per cleaner when jobs enter their tier ("3 new jobs near you"), not one per job.
   - The admin alert.
   - The auto-cancel, with a wallet refund and a message to the customer.
7. **Distance:** a SQL `haversine_km()` function. No PostGIS, which isn't installed. Filter cleaners by city first.

**New data:**
- `cleaners.base_lat`, `cleaners.base_lng`, `cleaners.radius_km` (default 8).
- A `wash_job_releases` table: cleaner, booking, time, late yes/no.
- On `wash_bookings`: `pay_by`, `tier_notified`, `admin_alerted_at`.
- Vendor companies with vans sign each van in as a cleaner account to start with.

**Frontend:**
- `wash.tsx`: map pin required, 2h minimum, pay straight after booking. Its text currently says "Our team confirms a washer partner for your slot, then you pay", which must change.
- `washes.tsx`: statuses "Finding a washer" / "Washer assigned", and the refund message.
- `cleaner-dashboard.tsx`:
  - "Available jobs" tab using the new `wash_job_board()` function, refreshed live over the existing WebSocket (`api.channel`).
  - Base location and radius in the profile.
  - Release button.
- Admin `BookingsMonitorTab`: jobs at risk of having no washer, and manual assignment.
- Remove the admin approval step for washes.

**Tests:** `wash-and-wallet.test.ts`, the fake backend, and a new `backend/tests/test_wash_dispatch.py`.

## 5. Pooling

1. **`pool_requests.respond_by`** = `deadline(created, depart_at, 30m)`. It is set in the insert branch of `enforce_pool_request_guard()` (latest in `0021`). Refuse requests less than 1h before departure.
2. **Accepting after `respond_by` is refused.**
3. **Expiry:**
   - An expired request becomes `rejected` with `cancellation_reason = 'Driver didn't respond'`.
   - Requests still pending at departure are rejected the same way.
   - The guard only lets the driver reject. Allow the system to do it too by skipping that check when `is_end_user_request()` is false.
4. **The driver's response rate** is shown on trip cards in `pooling.tsx`.
5. **Frontend:**
   - `pooling.mine.tsx`: countdown and expiry reason.
   - `pooling.driver.tsx` (`decide`, line ~120): time left, buttons disabled after the deadline.
6. **Tests:** `pooling.test.ts`, the fake backend, and backend tests.

## 6. Corporate

Not built: `/corporate` is a demo (GAP-14). The design to build when the corporate feature starts:

1. **Policy is checked when the employee books:** allowed services, price cap, monthly limit.
   - Within policy: no manager approval (`approval_status = 'auto'`).
   - Outside policy: the manager's approval is needed, or the employee pays personally.
2. **The manager and the provider approve at the same time**, both with the same `respond_by`.
   - The booking is confirmed only when both say yes.
   - Either a decline or a missed deadline expires it.
   - The provider sees "Awaiting company approval" and can approve early.
3. **The company pays automatically on confirmation** from its wallet or credit line, so a company trip has no `pay_by`.
4. **Managers review in-policy trips afterwards:** a weekly summary with a flag button.
5. **Before building:** record this design in `docs/components/12-corporate.md` and answer that doc's five open decisions.

## Build order

1. Shared foundation and rentals (one change)
2. Hosts
3. Driver hire
4. Doorstep washes
5. Pooling
6. Corporate (doc now, build later)

Each step ships on its own. Run `pytest`, `npm run test` and `npx tsc --noEmit` after each one.

## Sources

- [Airbnb: respond to a request](https://www.airbnb.com/help/article/28/respond-to-a-request) · [Airbnb: request declined or expired](https://www.airbnb.com/help/article/315)
- [Turo guest guide (8h)](https://ecommerceportal.freshdesk.com/en/support/solutions/articles/25000024540-guide-for-turo-guests) · [Turo: Book Instantly standard](https://turo.com/blog/news/book-instantly-will-be-the-standard-for-all-bookings/) · [Turo getting started (58%)](https://explore.turo.com/getting-started-guide)
- [Zoomcar fees and penalties](https://policy.zoomcar.com/support/solutions/articles/16000146256-here-is-a-comprehensive-list-of-fees-and-penalties-for-certain-scenarios-after-you-have-created-your-) · [Zoomcar host obligations](https://policy.zoomcar.com/support/solutions/articles/16000146863-host-s-obligations)
- [Uber scheduled rides](https://www.uber.com/gb/en/ride/how-it-works/scheduled-rides) · [Uber trip reviewers](https://www.uber.com/en-GB/blog/trip-reviewers)
- [DriveU favourite drivers](https://medium.com/driveu-blog/everyone-has-their-favourite-do-you-b7322a95043) · [DriveU Insta Driver](https://medium.com/driveu-blog/introducing-insta-driver-90637cdf285a)
- [Poparide: driver doesn't respond](https://support.poparide.com/en/articles/13641576-what-happens-if-a-driver-doesn-t-respond-to-my-booking-request)
- [Urban Company capacity engine](https://medium.com/uc-engineering/migration-from-an-offline-to-a-real-time-capacity-engine-f1307c725760) · [Urban Company worker rules](https://privacyinternational.org/examples/5320/indian-gig-workers-suffer-job-requirements-tighten) · [Spiffy FAQ](https://getspiffy.com/faqs)
