# 09. Admin console

**Track C** · Owner: ________

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
| AD-01 | Open `/admin` as Ada | All tabs load | |
| AD-02 | Open `/admin` as Asha | Access is denied | |
| AD-03 | Call `admin_grant_credit` as Asha through the API | `Admins only` | |

## Verification queues

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-04 | Vehicles | Approve a pending vehicle | It goes live and the host is notified | |
| AD-05 | Vehicles | Reject with a reason | Host sees the reason | |
| AD-06 | Hosts (KYC) | Approve and reject identity documents | Host status and notification update | |
| AD-07 | Drivers | Approve and reject a driver | Driver status and notification update | |
| AD-08 | Licences | Approve and reject a licence | Customer status and notification update | |
| AD-09 | Cleaners | Approve and reject a cleaner | Cleaner role is granted on approval | |
| AD-10 | Wash Centers | Approve and reject a center | Center role is granted on approval | |
| AD-11 | Wash Orders | Approve, reject and complete a wash | Status and refund are correct | |

## Operations

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-12 | Customers | Search for a customer | Correct details are shown | |
| AD-13 | Bookings Monitor | Filter bookings and open one | Status and amounts match the database | |
| AD-14 | Disputes | Resolve a dispute with notes | Raiser is notified with the resolution | |
| AD-15 | Disputes | Resolve a dispute that needs compensation | **GAP-13:** money outcome must be recorded | |
| AD-16 | Payouts | Mark a withdrawal paid with a reference | Provider is notified | |
| AD-17 | Payouts | Reject a withdrawal | Money returns to the provider | |
| AD-18 | Payments & Refunds | Refund ₹100 to a customer with a reason | Wallet rises by ₹100 | |
| AD-19 | Payments & Refunds | Refund with no reason | `A reason is required` | |
| AD-20 | Promo credit | Grant ₹500 | Wallet rises by ₹500 as promo credit | |
| AD-21 | Promo credit | Grant to an unknown email | `No user with that email` | |
| AD-22 | Promo credit | Grant ₹1,00,001 | `Amount must be between 1 and 100000` | |

## Revenue

Complete one rental with `SAVE10`: customer pays ₹4,906.20 and host earns ₹1,764.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AD-23 | Open Revenue & Fees | Rental volume includes the booking | |
| AD-24 | Compare platform revenue with cash kept | **GAP-23:** revenue must allow for the ₹200 discount | |
| AD-25 | Check whether total volume includes the ₹3,000 deposit | **GAP-23:** refundable deposits must be excluded | |

## Configuration

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-26 | Coupons | Create percent and fixed coupons | Both work at checkout | |
| AD-27 | Coupons | Deactivate a coupon | It no longer works | |
| AD-28 | Cities & Categories | Add a city and turn it off | City picker updates | |
| AD-29 | Cities & Categories | Set Mumbai surge to 1.5 and price a Mumbai vehicle | **GAP-22:** price must change, or the setting must be removed | |
| AD-30 | Cities & Categories | Raise a category minimum deposit and list a vehicle below it | **GAP-22:** listing must be refused, or the setting must be removed | |
| AD-31 | Fees & settings | Change GST and save | **GAP-16:** must save without an error | |

## Moderation and messaging

| ID | Tab | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| AD-32 | Reviews | Remove a reported review | Review disappears and the rating is recalculated | |
| AD-33 | Reviews | Dismiss a report | Review stays and the report clears | |
| AD-34 | Reviews | Update a user report | Status is saved | |
| AD-35 | Broadcasts | Send a broadcast | Target users receive a notification | |
| AD-36 | Support Tickets | Reply to and resolve a ticket | User is notified each time | |

## Scale

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AD-37 | Load more than 1000 bookings and open Bookings Monitor | **GAP-31:** all records must be reachable | |

## Linked gaps

GAP-13, GAP-16, GAP-22, GAP-23, GAP-31
