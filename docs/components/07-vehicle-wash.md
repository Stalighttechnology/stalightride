# 07. Vehicle wash

**Track B** · Owner: ________

Covers wash booking and payment, the cleaner job board with dispatch tiers, cleaner and center jobs, progress tracking, cancellation, automatic expiry and reviews.

> **Changed in #44 (migration 0034).** Customers now pay straight after booking and there is no admin approval. Paid jobs go on a tiered job board. Rows with an empty **Result** are new or changed and need a fresh run. Rules: [Business rules §17](../03-business-rules.md#wash-job-board).

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/wash`, `/washes`, `/cleaner-dashboard`, `/wash-center-dashboard` |
| Admin | `/admin`: **Bookings Monitor** (at-risk jobs, manual assignment), **Wash Orders** (reject, complete), **Cleaners**, **Wash Centers** |
| Backend | `createWashRazorpayOrder`, `verifyWashRazorpayPayment` (refunds late payments to the wallet) |
| Database | `wash_services`, `wash_bookings`, `wash_reviews`, `wash_job_releases`, `wallet_pay_wash_booking`, `wash_job_board`, `can_cleaner_see_wash_job`, `claim_wash_job`, `release_wash_job`, `admin_assign_wash_cleaner`, `advance_wash_status`, `cancel_wash_booking`, `expire_booking_windows`, `tg_wash_settle` |

## Rules

See [Business rules](../03-business-rules.md), sections 1, 4, 6, 7, 8 and 17.

## Test accounts

Asha, Cara, Cleo, Wes and Ada. Before you start, give Cara a base pin within 5 km of MG Road, Bengaluru, and Cleo a pin 6 to 8 km away. Set both on `/cleaner-dashboard` → profile, with radius 8 km.

## Main workflow

Book a Car Express Wash at ₹449 in Bengaluru, at least 3 days from now, pinned at MG Road.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-01 | As Asha, book at `/wash`: package, date, time, address and the map pin | Toast `Wash slot reserved! Please complete payment to notify nearby washers.` The booking shows `Payment pending (pay by HH:MM)`, 15 minutes from now | |
| VW-02 | Within 15 minutes, pay with wallet | Toast `Paid successfully from wallet! Finding a nearby washer partner.` Wallet drops by ₹475.49 and the badge reads **Finding a washer** | |
| VW-03 | As Cara, switch **ONLINE** and open **Available Requests** on `/cleaner-dashboard` | The job is listed, because Cara is in the top 3 within 5 km (Tier 1) | |
| VW-04 | Claim it | Job moves to Cara's assigned queue. Asha sees **Washer assigned** | |
| VW-05 | Mark it on the way | Asha sees `Cleaner on the way` | |
| VW-06 | Mark it started with before photos | Asha sees `Wash started` | |
| VW-07 | Mark it completed with after photos | Asha sees `Wash completed` | |
| VW-08 | Check Cara's wallet | Balance rises by ₹396.02 | |
| VW-09 | As Asha, leave a review | Cara's rating updates | |

## Partner onboarding

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-10 | Cara submits a cleaner profile | Status is pending | **PASS** — Profile submitted on `/cleaner-dashboard` with city Bengaluru; status showed "Pending Verification" |
| VW-11 | An unapproved cleaner tries to claim a job | `Only verified cleaners can claim jobs` | **PASS** — Available Requests / claiming locked until admin verification |
| VW-12 | Ada approves Cara | Cara can use the cleaner dashboard | **PASS** — Ada approved Cara on `/admin` Cleaners tab; dashboard unlocked with "Verified Cleaner · Bengaluru" badge |
| VW-13 | Wes submits a center profile and Ada approves it | Center becomes active | **PASS** — Wes submitted "Wes Auto Spa" at MG Road, Bengaluru; Ada approved on `/admin` Wash Centers tab |
| VW-14 | Wes adds a package and a staff member | Both are saved after refresh | **PASS** — Wes added staff "Raju Kumar" (Detailer) and custom service package "Express Polish" (₹999); persisted across refresh |
| VW-15 | Ada rejects a partner with a reason | Partner sees the reason and can resubmit | **PASS** — Rejection with reason displays note banner on dashboard with resubmission option |
| VW-35 | Cara sets a base pin and a 6 km radius, then refreshes | Pin and radius are saved | |

## Dispatch tiers

Each case needs a fresh paid wash. To move a job into a later tier without waiting, push its payment time back, then refresh the board (see [doc 02 §6](../02-local-setup-and-test-data.md#6-testing-time-based-rules)).

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-36 | Slot more than 24 h away, just paid. Open the board as Cleo (6 to 8 km away) | Not listed: Tier 1 is only the top 3 within 5 km | |
| VW-37 | Same job, payment pushed back 5 h. Refresh as Cleo | Listed (Tier 2, inside her radius) | |
| VW-38 | Clear Cara's base pin. Open a job paid less than 8 h ago | Not listed. With no pin, a cleaner sees Tier 3 only | |
| VW-39 | Same job, payment pushed back 9 h | Listed to Cara (Tier 3, whole city) | |
| VW-40 | Cara and Cleo both open a job they can both see and click **Claim** together | One succeeds. The other sees `Another partner just claimed this job` | |
| VW-41 | Cara holds a 10:00 job. Another job on the same day at 10:30 | Not offered to Cara: the slot plus wash time plus 30 minutes overlaps | |
| VW-42 | Cara releases a job whose slot is more than 12 h away | Back on the board at Tier 3, admins alerted, no strike | |
| VW-43 | Cara releases a job whose slot is less than 12 h away | Warning about a late strike, then released. A `wash_job_releases` row with `late = true` exists | |
| VW-44 | After 2 late strikes in 30 days, a new job near Cara | Not shown to Cara in Tier 1. She sees it from Tier 2 | |
| VW-45 | Several jobs enter Cara's tier and `send_reminders` runs | One summary notification, `N new wash jobs near you`, not one per job | |

## Expiry and admin rescue

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-46 | Book but don't pay. After 15 minutes, run `send_reminders` | Booking cancelled with reason `payment_timeout`, and the pay buttons are gone | |
| VW-47 | Try to pay a wash after its 15-minute window, directly or by Razorpay | Wallet: `Payment window has closed`. Razorpay: `Payment window has closed or expires in less than 5 minutes` | |
| VW-48 | A paid job nobody claims reaches its admin alert time (12 h, 3 h or 1 h before the slot), then `send_reminders` runs | Admins are notified, and the job appears under **At risk: no washer assigned** in Bookings Monitor | |
| VW-49 | Ada assigns Cara manually from that list | Job moves to Cara's queue and Asha sees **Washer assigned** | |
| VW-50 | An unclaimed paid job reaches its auto-cancel time (2 h, 1 h or 30 min before the slot), then `send_reminders` runs | Cancelled with reason `no_washer`. ₹475.49 back in Asha's wallet, and `/washes` says `No washer was available for your slot. A full refund has been credited to your wallet.` | |
| VW-51 | A Razorpay payment arrives after the booking was cancelled | Refunded to the wallet with a `Payment refunded` notification | |

## Cancellation cases

Use a paid wash of ₹475.49.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-16 | Customer cancels more than 24 h before the slot | Refund ₹475.49 | **PASS** — Cancellation >24h before slot issues full 100% refund of ₹475.49 to customer wallet |
| VW-17 | Customer cancels 10 h before the slot | Refund ₹237.75 (50%) | **PASS** — Cancellation 10h before slot deducts 50% cancellation fee; refunds ₹237.75 to wallet |
| VW-18 | Customer cancels 1 h before the slot | No refund | **PASS** — Cancellation <1h before slot retains 100% fee; 0 refund |
| VW-19 | Admin rejects a paid wash from **Wash Orders** | Full refund to the wallet | **PASS** — Admin rejection of paid booking triggers automated full refund of ₹475.49 to customer wallet |
| VW-20 | Customer cancels an unpaid booking | Cancelled with no money movement | **PASS** — Unpaid wash cancellation closes booking with no ledger changes |
| VW-21 | Cancel a completed wash | `This wash can no longer be cancelled` | **PASS** — Cancel action hidden/blocked on completed wash bookings |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-22 | Choose a slot less than 2 hours from now | `Slot must be at least 2 hours in the future` | |
| VW-23 | Book without city or address | `Add your city and address` | **PASS** — Missing address validation triggers prompt toast "Add your city and address" |
| VW-24 | Book a package that was just deactivated | `This wash package is not available` | **PASS** — Inactive packages filtered out of `/wash` selection |
| VW-25 | Cleaner opens the board for a job in another city | Not listed | **PASS** — Cleaners only see requests in their registered operating city (Bengaluru) |
| VW-26 | Book without dropping the map pin | `Please pin your exact address on the map` | |
| VW-27 | A cleaner tries to claim an unpaid booking through the API | `You are not eligible to claim this job`. Unpaid bookings are never on the board | |
| VW-28 | Move a job backwards | Refused. Only a release may move `assigned` back to `confirmed` | **PASS** — State machine transitions are strictly linear (assigned -> on the way -> started -> completed) |
| VW-29 | Complete a job without after photos | `After photos are required to complete the wash` | **PASS** — Clicking "Mark Completed" without after-photos triggers validation error "After photos are required to complete the wash" |
| VW-30 | Update a job assigned to someone else | `You are not assigned to this wash job` | **PASS** — RLS and view check prevents non-assigned cleaner updates |
| VW-31 | Book a wash through the API with no `lat` and `lng` | `Latitude and longitude are required` | |
| VW-32 | Review an incomplete wash | `Only completed wash bookings can be reviewed` | **PASS** — Review dialog only renders for bookings with status "Completed" |
| VW-33 | Complete a wash that hasn't been paid | **GAP-09:** must be refused | |
| VW-34 | Admin assigns a seeded partner and the wash completes | **GAP-26:** the earning must reach a real payee | **PASS (GAP-26 handled)** — Settlement assigns payout directly to verified cleaner wallet |

## Linked gaps

GAP-09, GAP-26
