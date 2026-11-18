# Launch gaps

**The product is not ready for real customers or real money yet.** The main flows work, but the defects below can lose money, expose users or give wrong results.

**Evidence** shows how each gap was checked:

- **Reproduced**: the behaviour was observed on a real test database. Most have an automated gate in [`automated/test_launch_gates.py`](automated/test_launch_gates.py).
- **Code review**: found by reading the code, not run end to end.

## Blockers: fix before any real payment

| ID | Problem | Impact | Evidence | Track |
| --- | --- | --- | --- | --- |
| GAP-01 | Membership activates with a made-up Razorpay payment ID. The signature is optional and the order amount is never checked | Anyone gets paid plans free | Reproduced | B |
| GAP-02 | Two customers can request the same vehicle and dates. The overlap check can't see other customers' bookings. The host then can't accept either request | Double bookings and stuck requests | Reproduced | A |
| GAP-03 | A customer can create a booking that is already `confirmed`, skipping host approval | Host approval can be bypassed | Reproduced | A |
| GAP-04 | Re-sending a valid payment confirmation changes a refunded booking back to `paid` | Wrong payment records and reports | Reproduced | C |
| GAP-05 | There is no Razorpay webhook. If the browser closes after payment, the booking stays unpaid | Customer is charged with no booking | Code review | C |
| GAP-06 | If payment verification fails, the app shows "Payment successful". Its fallback write is silently discarded by the database | Customer believes an unpaid booking is paid | Code review | C |
| GAP-07 | Two simultaneous top-up confirmations can both credit the wallet. The code notes this as a shortcut | Free wallet money | Code review | C |
| GAP-08 | Uploaded HTML files are served as web pages from public buckets. Sign-in tokens are kept in browser storage, so a malicious page could steal them | Account takeover | Reproduced | A |
| GAP-09 | A cleaner can complete an unpaid wash in the app. The database also lets hosts and drivers complete unpaid work through the API | Service is delivered with no payment | Reproduced | A, B |
| GAP-10 | A host can block dates over a confirmed booking. After that, the booking can't be cancelled or refunded | Customer money is stuck | Reproduced | A |
| GAP-11 | The customer alone can submit the return checklist, which completes the trip and releases the host's money and the deposit | Host loses the chance to inspect the vehicle | Reproduced | A |
| GAP-12 | Customers and hosts can rewrite inspection readings after they are recorded | Dispute evidence can't be trusted | Reproduced | A |
| GAP-13 | The deposit is always returned on completion, and resolving a dispute moves no money | Hosts can't recover damage costs | Code review | C |
| GAP-14 | The Corporate portal is a demo with sample data, including an approved credit line and "official" GST invoices. Nothing is saved | Misleading claims and false tax documents | Code review | C |

## High priority: fix before public launch

| ID | Problem | Impact | Evidence | Track |
| --- | --- | --- | --- | --- |
| GAP-15 | Membership benefits such as 0% fees and discounts aren't applied to prices. Auto-renew has no renewal job | Paying members don't get what was promised | Code review | B |
| GAP-16 | Saving Admin Platform Settings fails because the form writes columns that don't exist | Admin can't change fees from the app | Reproduced | C |
| GAP-17 | Rewards points live only in the browser. They are not linked to real trips or the wallet | Points can be lost or faked | Code review | B |
| GAP-18 | The database accepts bookings for past dates and paused vehicles. The app's date picker hides the past-date case, but the API doesn't | Invalid bookings | Reproduced | A |
| GAP-19 | The pickup checklist can be submitted days before the 30-minute check-in window | Trip can start early | Reproduced | A |
| GAP-20 | The driver page closes passenger requests in separate follow-up calls, but the database doesn't. Account deletion or a failed follow-up leaves passengers `confirmed` and not notified | Passengers can be left stranded | Reproduced | B |
| GAP-21 | After account deletion, the user can still sign in | Deletion promise isn't kept | Reproduced | A |
| GAP-22 | City surge and category rules can be edited in Admin but are never applied | Admin settings have no effect | Code review | C |
| GAP-23 | Revenue reports ignore coupon discounts, and total volume includes refundable deposits | Finance numbers are overstated | Code review | C |
| GAP-24 | Sign-in has no attempt limit, passwords can be 6 characters, emails aren't verified, and sign-in logs email addresses | Weak account security | Code review | A |

## Medium priority and decisions

| ID | Problem or decision | Evidence | Track |
| --- | --- | --- | --- |
| GAP-25 | Reminders compare trip times using the database server's time zone. They work when it is `Asia/Kolkata`, as on local machines. **Set this time zone on the production database** or fix the function | Code review, local behaviour tested | C |
| GAP-26 | Wash jobs assigned to the seeded partners have no payee, so the provider's earning isn't credited to anyone | Code review | B |
| GAP-27 | **Decision:** all refunds go to the wallet, even for card payments. Confirm this is acceptable or add refunds to the original payment method | Code review | C |
| GAP-28 | **Decision:** an hourly rental under 24 hours can cost more than a full day. 23 hours at ₹200 is ₹4,600 against a ₹2,000 daily price. Decide whether to cap it | Code review | A |
| GAP-29 | A deleted vehicle with past bookings is hidden using browser storage, so it reappears on another device | Code review | A |
| GAP-30 | Non-hosts see sample fleet data and a "Verified" badge on `/vendor` | Code review | A |
| GAP-31 | Lists return at most 1000 rows, so large admin lists are cut off with no paging | Code review | C |

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
- [ ] `test_launch_gates.py` fully passes
- [ ] All 12 component docs signed off
- [ ] One full payment cycle tested with Razorpay test mode, including a failed payment and a closed browser
- [ ] Wallet ledger check in [doc 02](02-local-setup-and-test-data.md) returns no rows
- [ ] Terms, privacy, refund and tax wording reviewed by a qualified person
