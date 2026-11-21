# Launch gaps

**The product is not ready for real customers or real money yet.** The main flows work, but the defects below can lose money, expose users or give wrong results.

**Evidence** shows how each gap was checked:

- **Reproduced**: the behaviour was observed on a real test database. Fixed gaps are protected by tests in `backend/tests/` (see [Automated tests](05-automated-tests.md)).
- **Code review**: found by reading the code, not run end to end.

## Blockers: fix before any real payment

| ID | Problem | Impact | Evidence | Track | Status |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | Membership activates with a made-up Razorpay payment ID. The signature is optional and the order amount is never checked | Anyone gets paid plans free | Reproduced | B | **Fixed** (verified signature & order check) |
| GAP-02 | Two customers can request the same vehicle and dates. The overlap check can't see other customers' bookings. The host then can't accept either request | Double bookings and stuck requests | Reproduced | A | **Fixed** (Migration 0020 & 0021: `prevent_booking_conflict` `SECURITY DEFINER` + row lock + EXCLUDE constraint) |
| GAP-03 | A customer can create a booking that is already `confirmed`, skipping host approval | Host approval can be bypassed | Reproduced | A | **Fixed** (Migration 0020 & 0021: customer requests are forced to `pending`) |
| GAP-04 | Re-sending a valid payment confirmation changes a refunded booking back to `paid` | Wrong payment records and reports | Reproduced | C | **Fixed** (Migration 0020 `trg_guard_booking_lifecycle_integrity` + backend check) |
| GAP-05 | There is no Razorpay webhook. If the browser closes after payment, the booking stays unpaid | Customer is charged with no booking | Code review | C | Open. A webhook now exists at `/api/payments/webhook/` (`razorpay_webhook`) and refunds payments that arrive after a booking closed. It has no test yet and must be registered in the Razorpay dashboard before this can close |
| GAP-06 | If payment verification fails, the app shows "Payment successful". Its fallback write is silently discarded by the database | Customer believes an unpaid booking is paid | Code review | C | Open |
| GAP-07 | Two simultaneous top-up confirmations can both credit the wallet. The code notes this as a shortcut | Free wallet money | Code review | C | **Fixed** (`verify_wallet_topup`: the top-up is credited only by the call that flips it from `created` to `paid`) |
| GAP-08 | Uploaded HTML files are served as web pages from public buckets. Sign-in tokens are kept in browser storage, so a malicious page could steal them | Account takeover | Reproduced | A | **Fixed** (HTML rejected on upload, served as octet-stream download with `nosniff`) |
| GAP-09 | A cleaner can complete an unpaid wash in the app. The database also lets hosts and drivers complete unpaid work through the API | Service is delivered with no payment | Reproduced | A, B | **Fixed** (Migration 0020 triggers block `completed` status if unpaid. Since #44, unpaid washes never reach the job board. Retest VW-33) |
| GAP-10 | A host can block dates over a confirmed booking. After that, the booking can't be cancelled or refunded | Customer money is stuck | Reproduced | A | **Fixed** (Migration 0020 `trg_prevent_availability_block_conflict` & Migration 0021) |
| GAP-11 | The customer alone can submit the return checklist, which completes the trip and releases the host's money and the deposit | Host loses the chance to inspect the vehicle | Reproduced | A | **Reopened** (fixed earlier, but since #39 any return checklist sets `completed` in `submit_inspection`, `backend/payments/views.py`. Reproduced on 2026-11-21) |
| GAP-12 | Customers and hosts can rewrite inspection readings after they are recorded | Dispute evidence can't be trusted | Reproduced | A | **Fixed** (Migration 0020 prevents mutating odometer/fuel/photos once recorded) |
| GAP-13 | The deposit is always returned on completion, and resolving a dispute moves no money | Hosts can't recover damage costs | Code review | C | **Fixed** (Dispute monetary compensation recorded via `resolve_dispute_compensation` and credited to recipient wallet) |
| GAP-14 | The Corporate portal is a demo with sample data, including an approved credit line and "official" GST invoices. Nothing is saved | Misleading claims and false tax documents | Code review | C | **Fixed** (Corporate portal underwriting workflow) |

## High priority: fix before public launch

| ID | Problem | Impact | Evidence | Track | Status |
| --- | --- | --- | --- | --- | --- |
| GAP-15 | Membership benefits such as 0% fees and discounts aren't applied to prices. Auto-renew has no renewal job | Paying members don't get what was promised | Code review | B | **Fixed** (Exclusive Starlight Mobility perks, renewal command `renew_memberships.py`) |
| GAP-16 | Saving Admin Platform Settings fails because the form writes columns that don't exist | Admin can't change fees from the app | Reproduced | C | **Fixed** (Schema columns aligned) |
| GAP-17 | Rewards points live only in the browser. They are not linked to real trips or the wallet | Points can be lost or faked | Code review | B | **Fixed** (`starlight_rewards` points ledger & service-scoped redemption) |
| GAP-18 | The database accepts bookings for past dates and paused vehicles. The app's date picker hides the past-date case, but the API doesn't | Invalid bookings | Reproduced | A | **Fixed** (Migration 0020 & 0021: validates start date & paused/deleted state) |
| GAP-19 | The pickup checklist can be submitted days before the 30-minute check-in window | Trip can start early | Reproduced | A | **Fixed** (30-minute window enforced in API) |
| GAP-20 | The driver page closes passenger requests in separate follow-up calls, but the database doesn't. Account deletion or a failed follow-up leaves passengers `confirmed` and not notified | Passengers can be left stranded | Reproduced | B | **Fixed** (Migration 0020 `handle_pool_trip_cancellation` trigger) |
| GAP-21 | After account deletion, the user can still sign in | Deletion promise isn't kept | Reproduced | A | **Fixed** (Migration 0020 disables `accounts_user.is_active` & cleans data) |
| GAP-22 | City surge and category rules can be edited in Admin but are never applied | Admin settings have no effect | Code review | C | Open |
| GAP-23 | Revenue reports ignore coupon discounts, and total volume includes refundable deposits | Finance numbers are overstated | Code review | C | Open |
| GAP-24 | Sign-in has no attempt limit, passwords can be 6 characters, emails aren't verified, and sign-in logs email addresses | Weak account security | Code review | A | **Partly fixed** (5 failed sign-ins per email and address lock for 15 min; reset emails rate limited; sign-in no longer logs emails) |

## Medium priority and decisions

| ID | Problem or decision | Evidence | Track | Status |
| --- | --- | --- | --- | --- |
| GAP-25 | Reminders compare trip times using the database server's time zone. They work when it is `Asia/Kolkata`, as on local machines. **Set this time zone on the production database** or fix the function. The booking-window deadlines (#40 to #44) already convert to India time explicitly | Code review, local behaviour tested | C | Open |
| GAP-26 | Wash jobs assigned to the seeded partners have no payee, so the provider's earning isn't credited to anyone | Code review | B | Open |
| GAP-27 | **Decision:** all refunds go to the wallet, even for card payments. Confirm this is acceptable or add refunds to the original payment method | Code review | C | Open |
| GAP-28 | **Decision:** an hourly rental under 24 hours can cost more than a full day. 23 hours at ₹200 is ₹4,600 against a ₹2,000 daily price. Decide whether to cap it | Code review | A | **Fixed** (Capped at daily price in DB function & frontend format) |
| GAP-29 | A deleted vehicle with past bookings is hidden using browser storage, so it reappears on another device | Code review | A | **Fixed** (`is_deleted` column added to `vehicles`, soft-delete in UI & DB) |
| GAP-30 | Non-hosts see sample fleet data and a "Verified" badge on `/vendor` | Code review | A | **Fixed** (Real empty state + onboarding banner on `/vendor` for non-hosts) |
| GAP-31 | Lists return at most 1000 rows, so large admin lists are cut off with no paging | Code review | C | **Fixed** (Server-side paging on admin, wallet and trip lists; migration 0022 for the bookings feed and broadcasts; remaining lists and database-backed dashboard totals in #41) |
| GAP-32 | Pool seat requests never expire. A request nobody answers stays pending until the trip leaves | Code review | B | Open (booking windows step 5, not built) |
| GAP-33 | `send_reminders` must run every 5 minutes in production, or expiries, reminders and wash auto-refunds never happen | Code review | C | Open (hosting setting) |

## Suggested fix order

| Order | Gaps | Why first |
| --- | --- | --- |
| 1 | GAP-01, 03, 04, 06, 07, 08 | Stops direct money and security abuse |
| 2 | GAP-02, 09, 10, 18, 19 | Makes booking states reliable |
| 3 | GAP-05, 11, 12, 13 | Makes payments, handover and disputes trustworthy |
| 4 | GAP-14, 15, 16, 17, 20, 21, 22, 23, 24 | Removes false promises and closes the remaining product gaps |
| 5 | GAP-25 to GAP-31 | Decisions and polish |

Corporate, membership benefits and rewards need product decisions before they can be built. Until then, label them clearly as coming soon or hide them.

## Launch checklist

- [ ] All blockers fixed
- [ ] All high priority gaps fixed or formally accepted
- [ ] GAP-11 fixed again, with a test in `backend/tests/`
- [ ] `send_reminders` scheduled every 5 minutes
- [ ] All 12 component docs signed off
- [ ] One full payment cycle tested with Razorpay test mode, including a failed payment and a closed browser
- [ ] Wallet ledger check in [doc 02](02-local-setup-and-test-data.md) returns no rows
- [ ] Terms, privacy, refund and tax wording reviewed by a qualified person
