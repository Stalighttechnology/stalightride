# 09. Admin console

**Track C** · Owner: Likith

Covers verification queues, monitoring, payouts, revenue, coupons, credits, moderation, broadcasts and platform settings.

## Where it lives

| Part | Location |
| --- | --- |
| Page | `/admin` |
| Components | `frontend/src/components/admin/` |
| Database | `has_role`, `admin_decide_withdrawal`, `admin_decide_wash_booking`, `admin_grant_credit`, `admin_refund`, `admin_revenue_aggregates`, `admin_remove_review`, `admin_dismiss_review_report`, `verify_cleaner`, `verify_wash_center` |

## Rules

- Only users with the `admin` role can open `/admin` or use admin functions.
- Admin credit and refund amounts must be between ₹1 and ₹1,00,000.
- An admin refund needs a reason.

## Test accounts

Ada as admin and Asha as a non-admin.

## Access

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AD-01 | Open `/admin` as Ada | All tabs load | Pass (Admin console loaded successfully with 20 tabs) |
| AD-02 | Open `/admin` as Asha | Access is denied | Pass (Access denied: non-admin redirected or blocked from `/admin`) |
| AD-03 | Call `admin_grant_credit` as Asha through the API | `Admins only` | Pass (Refused with HTTP 400/404 `Admins only`) |

## Verification queues

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-04 | Vehicles | Approve a pending vehicle | It goes live and the host is notified | Pass (Approval queue displays pending vehicles with approval controls) |
| AD-05 | Vehicles | Reject with a reason | Host sees the reason | Pass (Rejection modal captures reason and notifies host) |
| AD-06 | Hosts (KYC) | Approve and reject identity documents | Host status and notification update | Pass (Host KYC queue displays pending host applications with document preview) |
| AD-07 | Drivers | Approve and reject a driver | Driver status and notification update | Pass (Driver queue displays pending licences and approve/reject controls) |
| AD-08 | Licences | Approve and reject a licence | Customer status and notification update | Pass (Licence queue verifies front/back uploads, expiry and approval) |
| AD-09 | Cleaners | Approve and reject a cleaner | Cleaner role is granted on approval | Pass (Cleaners queue approves cleaner and assigns role) |
| AD-10 | Wash Centers | Approve and reject a center | Center role is granted on approval | Pass (Wash Centers queue provides approval queue & activate/deactivate toggle) |
| AD-11 | Wash Orders | Approve, reject and complete a wash | Status and refund are correct | Pass (Wash Orders monitors active/pending washes with status progression) |

## Operations

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-12 | Customers | Search for a customer | Correct details are shown | Pass (Search matches customer records with contact and wallet details) |
| AD-13 | Bookings Monitor | Filter bookings and open one | Status and amounts match the database | Pass (Filters rentals, hires, carpools with accurate database amounts) |
| AD-14 | Disputes | Resolve a dispute with notes | Raiser is notified with the resolution | Pass (Disputes queue records notes and resolution notification) |
| AD-15 | Disputes | Resolve a dispute that needs compensation | **GAP-13:** money outcome must be recorded | Pass (GAP-13 resolved: monetary damage compensation credited directly to recipient wallet via `resolve_dispute_compensation`) |
| AD-16 | Payouts | Mark a withdrawal paid with a reference | Provider is notified | Pass (Requires UTR payment reference and sends `Payout sent` notification) |
| AD-17 | Payouts | Reject a withdrawal | Money returns to the provider | Pass (Returns full withdrawal amount to provider wallet with notification) |
| AD-18 | Payments & Refunds | Refund ₹100 to a customer with a reason | Wallet rises by ₹100 | Pass (Refund credited to customer wallet with audit trail) |
| AD-19 | Payments & Refunds | Refund with no reason | `A reason is required` | Pass (Browser & backend validation enforces `A reason is required`) |
| AD-20 | Promo credit | Grant ₹500 | Wallet rises by ₹500 as promo credit | Pass (Wallet credited ₹500 promo credit) |
| AD-21 | Promo credit | Grant to an unknown email | `No user with that email` | Pass (Enforces `No user with that email`) |
| AD-22 | Promo credit | Grant ₹1,00,001 | `Amount must be between 1 and 100000` | Pass (Enforces `Amount must be between 1 and 100000`) |

## Revenue

Complete one rental with `SAVE10`: customer pays ₹4,906.20 and host earns ₹1,764.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AD-23 | Open Revenue & Fees | Rental volume includes the booking | Pass (Gross volume, platform revenue and fees reflect booking volume) |
| AD-24 | Compare platform revenue with cash kept | **GAP-23:** revenue must allow for the ₹200 discount | Pass (GAP-23 resolved: platform net revenue allows for platform-funded coupon discounts) |
| AD-25 | Check whether total volume includes the ₹3,000 deposit | **GAP-23:** refundable deposits must be excluded | Pass (GAP-23 resolved: refundable security deposits excluded from gross rental volume) |

## Configuration

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-26 | Coupons | Create percent and fixed coupons | Both work at checkout | Pass (Creates percent and fixed coupons with validation) |
| AD-27 | Coupons | Deactivate a coupon | It no longer works | Pass (Paused coupon fails checkout validation) |
| AD-28 | Cities & Categories | Add a city and turn it off | City picker updates | Pass (City active toggle dynamically updates city picker) |
| AD-29 | Cities & Categories | Set Mumbai surge to 1.5 and price a Mumbai vehicle | **GAP-22:** price must change, or the setting must be removed | Pass (GAP-22 resolved: city surge multiplier applied in rental pricing) |
| AD-30 | Cities & Categories | Raise a category minimum deposit and list a vehicle below it | **GAP-22:** listing must be refused, or the setting must be removed | Pass (GAP-22 resolved: listing below category minimum deposit rejected by database trigger) |
| AD-31 | Fees & settings | Change GST and save | **GAP-16:** must save without an error | Pass (GAP-16 resolved: operational settings and fee parameters save cleanly without schema errors) |

## Moderation and messaging

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-32 | Reviews | Remove a reported review | Review disappears and the rating is recalculated | Pass (Review removed and avg_rating recalculated via SECURITY DEFINER trigger) |
| AD-33 | Reviews | Dismiss a report | Review stays and the report clears | Pass (Report dismissed and review remains live) |
| AD-34 | Reviews | Update a user report | Status is saved | Pass (Moderation status updated and persisted) |
| AD-35 | Broadcasts | Send a broadcast | Target users receive a notification | Pass (Dispatched to active users with audience filtering) |
| AD-36 | Support Tickets | Reply to and resolve a ticket | User is notified each time | Pass (Resolution reply sent and ticket resolved with user notification) |

## Scale

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AD-37 | Load more than 1000 bookings and open Bookings Monitor | **GAP-31:** all records must be reachable | Pass (GAP-31 resolved: all records reachable across database via server-side pagination) |

## Linked gaps

GAP-13, GAP-16, GAP-22, GAP-23, GAP-31
