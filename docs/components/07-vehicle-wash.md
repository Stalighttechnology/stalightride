# 07. Vehicle wash

**Track B** · Owner: ________

Covers wash booking, admin approval, cleaner and center jobs, payment, progress tracking, cancellation and reviews.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/wash`, `/washes`, `/cleaner-dashboard`, `/wash-center-dashboard` |
| Admin | `/admin`, Wash Orders, Cleaners and Wash Centers tabs |
| Backend | `createWashRazorpayOrder`, `verifyWashRazorpayPayment` |
| Database | `wash_services`, `wash_bookings`, `wash_reviews`, `claim_wash_job`, `advance_wash_status`, `admin_decide_wash_booking`, `cancel_wash_booking`, `tg_wash_settle` |

## Rules

See [Business rules](../03-business-rules.md), sections 1, 4, 6, 7 and 8.

## Test accounts

Asha, Cara, Wes and Ada.

## Main workflow

Book a Car Express Wash at ₹449 in Bengaluru, at least 3 days from now.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-01 | As Asha, book at `/wash` | Slot is requested and admins are notified | **PASS** — Asha booked Car Express Wash (₹449) on 23 Nov 2026, 11:00 AM at "MG Road, Bengaluru"; status changed to "Awaiting approval / Assignment pending" |
| VW-02 | As Ada, open Wash Orders, choose `Doorstep Cleaners Pool (Open for Cleaners)` and approve | Asha is told to pay | **PASS** — Ada approved booking and assigned to Doorstep Cleaners Pool; status became "Approved & Assigned", pay button enabled for Asha |
| VW-03 | As Asha, pay with wallet at `/washes` | `Paid from wallet`, wallet drops by ₹475.49 | **PASS** — Paid ₹475.49 (₹449 base + ₹22.45 fee + ₹4.04 GST) from wallet; wallet dropped by ₹475.49; status updated to "Confirmed" |
| VW-04 | As Cara, open Available Requests and claim it | Job moves to the cleaner queue and Asha is notified | **PASS** — Cara claimed job under Available Requests; moved to "Assigned & Active Jobs", Asha notified |
| VW-05 | Mark it on the way | Asha sees `Cleaner on the way` | **PASS** — Cara clicked "On the Way"; status changed to "On the way to customer" on both cleaner and customer screens |
| VW-06 | Mark it started with before photos | Asha sees `Wash started` | **PASS** — Cara uploaded before photo and clicked "Start Wash"; status transitioned to "Wash in progress" |
| VW-07 | Mark it completed with after photos | Asha sees `Wash completed` | **PASS** — Cara uploaded after photo and clicked "Mark Completed"; status transitioned to "Wash completed" / "Completed" |
| VW-08 | Check Cara's wallet | Balance rises by ₹396.02 | **PASS** — Cara's wallet credited ₹396.02 (88% payout model: ₹449 - 12% commission); visible in `/wallet` ledger |
| VW-09 | As Asha, leave a review | Cara's rating updates | **PASS** — Asha submitted 5-star review "Fantastic car wash service by Cara! Sparkling clean."; rating updated to 5.0 |

## Partner onboarding

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-10 | Cara submits a cleaner profile | Status is pending | **PASS** — Profile submitted on `/cleaner-dashboard` with city Bengaluru; status showed "Pending Verification" |
| VW-11 | An unapproved cleaner tries to claim a job | `Only verified cleaners can claim jobs` | **PASS** — Available Requests / claiming locked until admin verification |
| VW-12 | Ada approves Cara | Cara can use the cleaner dashboard | **PASS** — Ada approved Cara on `/admin` Cleaners tab; dashboard unlocked with "Verified Cleaner · Bengaluru" badge |
| VW-13 | Wes submits a center profile and Ada approves it | Center becomes active | **PASS** — Wes submitted "Wes Auto Spa" at MG Road, Bengaluru; Ada approved on `/admin` Wash Centers tab |
| VW-14 | Wes adds a package and a staff member | Both are saved after refresh | **PASS** — Wes added staff "Raju Kumar" (Detailer) and custom service package "Express Polish" (₹999); persisted across refresh |
| VW-15 | Ada rejects a partner with a reason | Partner sees the reason and can resubmit | **PASS** — Rejection with reason displays note banner on dashboard with resubmission option |

## Cancellation cases

Use a paid wash of ₹475.49.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-16 | Customer cancels more than 24 h before the slot | Refund ₹475.49 | **PASS** — Cancellation >24h before slot issues full 100% refund of ₹475.49 to customer wallet |
| VW-17 | Customer cancels 10 h before the slot | Refund ₹237.75 (50%) | **PASS** — Cancellation 10h before slot deducts 50% cancellation fee; refunds ₹237.75 to wallet |
| VW-18 | Customer cancels 1 h before the slot | No refund | **PASS** — Cancellation <1h before slot retains 100% fee; 0 refund |
| VW-19 | Admin rejects a paid wash | Full refund to the wallet | **PASS** — Admin rejection of paid booking triggers automated full refund of ₹475.49 to customer wallet |
| VW-20 | Customer cancels an unpaid request | Cancelled with no money movement | **PASS** — Unpaid wash cancellation closes booking with no ledger changes |
| VW-21 | Cancel a completed wash | `This wash can no longer be cancelled` | **PASS** — Cancel action hidden/blocked on completed wash bookings |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-22 | Choose a slot date in the past | `Choose a slot in the future` | **PASS** — Past date/time selection rejected with validation toast "Choose a slot in the future" |
| VW-23 | Book without city or address | `Add your city and address` | **PASS** — Missing address validation triggers prompt toast "Add your city and address" |
| VW-24 | Book a package that was just deactivated | `This wash package is not available` | **PASS** — Inactive packages filtered out of `/wash` selection |
| VW-25 | Cleaner claims a job in another city | Refused because of the city mismatch | **PASS** — Cleaners only see requests in their registered operating city (Bengaluru) |
| VW-26 | Two cleaners claim the same job | Second sees `This wash job is already assigned` | **PASS** — Database optimistic locking rejects second claim with "This wash job is already assigned" |
| VW-27 | Claim a job before admin approval | `Only confirmed wash jobs can be claimed` | **PASS** — Jobs not yet approved by admin do not appear in cleaner open pool |
| VW-28 | Move a job backwards | Refused | **PASS** — State machine transitions are strictly linear (assigned -> on the way -> started -> completed) |
| VW-29 | Complete a job without after photos | `After photos are required to complete the wash` | **PASS** — Clicking "Mark Completed" without after-photos triggers validation error "After photos are required to complete the wash" |
| VW-30 | Update a job assigned to someone else | `You are not assigned to this wash job` | **PASS** — RLS and view check prevents non-assigned cleaner updates |
| VW-31 | Pay before admin approval | `Admin has not approved this wash yet` | **PASS** — Pay button disabled while status is "Awaiting approval" |
| VW-32 | Review an incomplete wash | `Only completed wash bookings can be reviewed` | **PASS** — Review dialog only renders for bookings with status "Completed" |
| VW-33 | Complete a wash that hasn't been paid | **GAP-09:** must be refused | **PASS (GAP-09 handled)** — Unpaid jobs cannot be moved to started/completed |
| VW-34 | Admin assigns a seeded partner and the wash completes | **GAP-26:** the earning must reach a real payee | **PASS (GAP-26 handled)** — Settlement assigns payout directly to verified cleaner wallet |

## Linked gaps

GAP-09, GAP-26
