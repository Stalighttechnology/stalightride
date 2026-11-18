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
| VW-01 | As Asha, book at `/wash` | Slot is requested and admins are notified | |
| VW-02 | As Ada, open Wash Orders, choose `Doorstep Cleaners Pool (Open for Cleaners)` and approve | Asha is told to pay | |
| VW-03 | As Asha, pay with wallet at `/washes` | `Paid from wallet`, wallet drops by ₹475.49 | |
| VW-04 | As Cara, open Available Requests and claim it | Job moves to the cleaner queue and Asha is notified | |
| VW-05 | Mark it on the way | Asha sees `Cleaner on the way` | |
| VW-06 | Mark it started with before photos | Asha sees `Wash started` | |
| VW-07 | Mark it completed with after photos | Asha sees `Wash completed` | |
| VW-08 | Check Cara's wallet | Balance rises by ₹396.02 | |
| VW-09 | As Asha, leave a review | Cara's rating updates | |

## Partner onboarding

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-10 | Cara submits a cleaner profile | Status is pending | |
| VW-11 | An unapproved cleaner tries to claim a job | `Only verified cleaners can claim jobs` | |
| VW-12 | Ada approves Cara | Cara can use the cleaner dashboard | |
| VW-13 | Wes submits a center profile and Ada approves it | Center becomes active | |
| VW-14 | Wes adds a package and a staff member | Both are saved after refresh | |
| VW-15 | Ada rejects a partner with a reason | Partner sees the reason and can resubmit | |

## Cancellation cases

Use a paid wash of ₹475.49.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-16 | Customer cancels more than 24 h before the slot | Refund ₹475.49 | |
| VW-17 | Customer cancels 10 h before the slot | Refund ₹237.75 (50%) | |
| VW-18 | Customer cancels 1 h before the slot | No refund | |
| VW-19 | Admin rejects a paid wash | Full refund to the wallet | |
| VW-20 | Customer cancels an unpaid request | Cancelled with no money movement | |
| VW-21 | Cancel a completed wash | `This wash can no longer be cancelled` | |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| VW-22 | Choose a slot date in the past | `Choose a slot in the future` | |
| VW-23 | Book without city or address | `Add your city and address` | |
| VW-24 | Book a package that was just deactivated | `This wash package is not available` | |
| VW-25 | Cleaner claims a job in another city | Refused because of the city mismatch | |
| VW-26 | Two cleaners claim the same job | Second sees `This wash job is already assigned` | |
| VW-27 | Claim a job before admin approval | `Only confirmed wash jobs can be claimed` | |
| VW-28 | Move a job backwards | Refused | |
| VW-29 | Complete a job without after photos | `After photos are required to complete the wash` | |
| VW-30 | Update a job assigned to someone else | `You are not assigned to this wash job` | |
| VW-31 | Pay before admin approval | `Admin has not approved this wash yet` | |
| VW-32 | Review an incomplete wash | `Only completed wash bookings can be reviewed` | |
| VW-33 | Complete a wash that hasn't been paid | **GAP-09:** must be refused | |
| VW-34 | Admin assigns a seeded partner and the wash completes | **GAP-26:** the earning must reach a real payee | |

## Linked gaps

GAP-09, GAP-26
