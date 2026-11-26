# Synchoo team docs

Use these docs to split the work between three people, test each part by hand, and agree on when the product is ready to launch.

## Read in this order

| Step | Doc | Why |
| --- | --- | --- |
| 1 | [Architecture](01-architecture.md) | How the product fits together |
| 2 | [Local setup and test data](02-local-setup-and-test-data.md) | Get it running and create the test accounts |
| 3 | [Business rules](03-business-rules.md) | Every price, refund, status and fallback, with worked examples |
| 4 | Your component docs (below) | The manual workflows you own |
| 5 | [Launch gaps](04-launch-gaps.md) | Known defects that must be fixed before launch |
| 6 | [Automated tests](05-automated-tests.md) | Database, API and unit checks that CI runs on every pull request |
| 7 | [Demo walkthrough](06-demo-walkthrough.md) | Click-by-click GUI journeys across customer, provider and admin windows, for demos and full passes |
| 8 | [Booking windows](booking-windows/suggested-approach.md) | Approval and payment deadlines, wash dispatch, pooling request windows, and corporate approval flows. Steps 1 to 6 are all built. Prompts in [antigravity-prompts.md](booking-windows/antigravity-prompts.md) |

## Testing what's merged so far (booking windows)

All booking windows steps 1 to 6 are on `main` (#40, #42, #43, #44, #45, #49).

1. Pull `main`, then run `.venv/Scripts/python manage.py migrate` in `backend/`. The latest migration is `0040_review_reply_and_booking_host_integrity`. If `migrate` fails on an old migration name, recreate the database ([doc 02 §8](02-local-setup-and-test-data.md#8-start-again-with-a-clean-database)).
2. Create the second cleaner, Cleo, and give both cleaners a base pin ([doc 02 §3 and §4](02-local-setup-and-test-data.md#3-create-the-test-accounts)).
3. Run `manage.py send_reminders` by hand whenever a case says so. To make deadlines pass without waiting, use the SQL shortcuts in [doc 02 §6](02-local-setup-and-test-data.md#booking-windows-deadlines).
4. Run the new and changed cases:

| Area | Cases | Doc |
| --- | --- | --- |
| Rental deadlines and late payments | RB-40 to RB-52 | [03 Rental booking](components/03-rental-booking.md#booking-windows) |
| Instant Book, response rate, listing pauses | HV-24 to HV-32 | [02 Hosts and vehicles](components/02-hosts-and-vehicles.md#instant-book-and-response-rate) |
| Driver hire deadlines and similar drivers | DH-34 to DH-44 | [05 Driver hire](components/05-driver-hire.md#booking-windows) |
| Wash payment, job board, tiers, releases, auto-cancel | Every row with an empty **Result** | [07 Vehicle wash](components/07-vehicle-wash.md) |
| Pooling request deadlines and driver response stats | CP-32 to CP-38 | [06 Car pooling](components/06-car-pooling.md#booking-windows) |
| Corporate accounts, policies and approval windows | CO-06 to CO-21 | [12 Corporate](components/12-corporate.md#workflows-to-specify-and-test) |
| Admin wash rescue | AD-11, AD-38, AD-39 | [09 Admin console](components/09-admin-console.md) |
| Click-through demo | Sections 2, 2b, 5, 7, 8 | [06 Demo walkthrough](06-demo-walkthrough.md) |

Trip handover now uses codes instead of the QR: the host gives a check-in and a check-out code, the renter enters them with a 360° set of photos. Retest [04 Trip handover](components/04-trip-handover.md).

## Who owns what

Write a name in each track. Each track has four components.

| Track | Owner | Components |
| --- | --- | --- |
| **A. Rentals** | ________ | [01 Accounts and licence](components/01-accounts-and-licence.md), [02 Hosts and vehicles](components/02-hosts-and-vehicles.md), [03 Rental booking](components/03-rental-booking.md), [04 Trip handover](components/04-trip-handover.md) |
| **B. Services and growth** | Likith | [05 Driver hire](components/05-driver-hire.md), [06 Car pooling](components/06-car-pooling.md), [07 Vehicle wash](components/07-vehicle-wash.md), [11 Membership, rewards, referrals](components/11-membership-rewards-referrals.md) |
| **C. Money and platform** | Likith | [08 Wallet and payments](components/08-wallet-and-payments.md), [09 Admin console](components/09-admin-console.md), [10 Safety and support](components/10-safety-and-support.md), [12 Corporate](components/12-corporate.md) |

## How to validate your part

1. Set up the app and test accounts from [doc 02](02-local-setup-and-test-data.md).
2. Open your component doc and run each test case in order.
3. Mark each case in the **Result** column:

   | Mark | Meaning |
   | --- | --- |
   | `PASS` | The app did exactly what **Expected** says |
   | `FAIL` | It did something else. Add the bug details below |
   | `BLOCKED` | Something else stopped you from testing it |

4. For every `FAIL`, record the test ID, the steps, what you saw, a screenshot, and the browser console or server error.
5. Fix the bug on a branch, or hand it to the track owner, then run the case again.
6. Your component is done when it meets the sign-off rule below.

Cases marked **GAP-xx** are expected to fail today. They link to a known defect in [Launch gaps](04-launch-gaps.md). Once the defect is fixed, the case must pass.

## Sign-off rule

A component is ready when all of these are true:

- Every test case in its doc is `PASS`.
- Every **GAP** linked to it is fixed.
- The automated tests in [doc 05](05-automated-tests.md) pass.
- A second team member has repeated the main workflow, the first section of test cases.

## Sign-off tracker

| # | Component | Track | Tester | Reviewer | Date | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Accounts and licence | A | | | | Not started |
| 02 | Hosts and vehicles | A | | | | Not started (new cases HV-24 to HV-32) |
| 03 | Rental booking | A | | | | Not started (new cases RB-40 to RB-52) |
| 04 | Trip handover | A | | | | Not started |
| 05 | Driver hire | B | | | | Not started (new cases DH-34 to DH-44) |
| 06 | Car pooling | B | | | | Not started |
| 07 | Vehicle wash | B | | | | Not started (flow rewritten in #44) |
| 08 | Wallet and payments | C | | | | Not started |
| 09 | Admin console | C | Likith | Claude | 2026-11-19 | Retest AD-11, AD-38, AD-39 (wash changes in #44) |
| 10 | Safety and support | C | Likith | Claude | 2026-11-19 | Signed off (27 Pass, 0 Open Gaps) |
| 11 | Membership, rewards, referrals | B | Likith | Claude | 2026-11-19 | Signed off (26 Pass, 0 Open Gaps) |
| 12 | Corporate | C | Likith | Claude | 2026-11-19 | Signed off (5 Pass / Underwriting Suite) |

## Out of scope for now

Hosting, scaling, server monitoring and backups come later. [Launch gaps](04-launch-gaps.md) lists the few hosting settings that affect how the product behaves.
