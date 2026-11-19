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
| 6 | [Automated tests](05-automated-tests.md) | Database, API and unit checks, kept separate from manual testing |

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
| 02 | Hosts and vehicles | A | | | | Not started |
| 03 | Rental booking | A | | | | Not started |
| 04 | Trip handover | A | | | | Not started |
| 05 | Driver hire | B | | | | Not started |
| 06 | Car pooling | B | | | | Not started |
| 07 | Vehicle wash | B | | | | Not started |
| 08 | Wallet and payments | C | | | | Not started |
| 09 | Admin console | C | Likith | Claude | 2026-11-19 | Tested (31 Pass, 6 Open Gaps) |
| 10 | Safety and support | C | Likith | Claude | 2026-11-19 | Tested (26 Pass, 1 Open Gap) |
| 11 | Membership, rewards, referrals | B | Likith | Claude | 2026-11-19 | Tested (21 Pass, 5 Open Gaps) |
| 12 | Corporate | C | Likith | Claude | 2026-11-19 | Tested (GAP-14 verified / Demo) |

## Out of scope for now

Hosting, scaling, server monitoring and backups come later. [Launch gaps](04-launch-gaps.md) lists the few hosting settings that affect how the product behaves.
