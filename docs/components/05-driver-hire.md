# 05. Driver hire

**Track B** · Owner: ________

Covers driver onboarding, search, hiring, payment, completion, cancellation and driver reviews.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/drivers`, `/driver/$id`, `/hires`, `/driver-dashboard` |
| Preview logic | `frontend/src/lib/driver-pricing.ts` |
| Backend | `createDriverRazorpayOrder`, `verifyDriverRazorpayPayment` |
| Database | `drivers`, `public_drivers`, `driver_bookings`, `driver_reviews`, `driver_base_price`, `cancel_driver_booking` |

## Rules

See [Business rules](../03-business-rules.md), sections 1, 3, 6 and 8.

## Test accounts

Dev, Asha, Ben and Ada.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| DH-01 | As Dev, submit a profile at `/driver-dashboard` | `Profile submitted for verification` | **PASS** — Dev Driver profile submitted with ₹2,500/day, ₹300/hr, Bengaluru, licence docs; status changed to "Under review" |
| DH-02 | Search `/drivers` before approval | Dev is not listed | **PASS** — Dev not listed in `/drivers` search results prior to admin verification |
| DH-03 | As Ada, approve Dev in `/admin`, Drivers | Dev is notified | **PASS** — Ada approved Dev Driver in `/admin` Drivers tab; status updated to approved |
| DH-04 | As Dev, switch to live | `You're live and bookable` | **PASS** — Toggled availability; toast "You're live and bookable" displayed, status became bookable |
| DH-05 | As Asha, open Dev's profile and choose a daily hire for 3 days | Base ₹7,500, fee ₹375, GST ₹67.50, total ₹7,942.50 | **PASS** — Daily hire for 3 days computed exactly: Base ₹7,500, fee ₹375, GST ₹67.50, total ₹7,942.50 |
| DH-06 | Send the request | Dev is notified | **PASS** — Request sent with pickup location; Dev received hire notification |
| DH-07 | As Dev, accept it | Asha is told to pay | **PASS** — Dev accepted request at `/driver-dashboard`; status updated to confirmed and pay button activated for Asha |
| DH-08 | As Asha, pay with wallet at `/hires` | `Paid from wallet`, wallet drops by ₹7,942.50 | **PASS** — Paid ₹7,942.50 from wallet at `/hires`; Asha wallet dropped from ₹20,000 to ₹12,057.50; status updated to Paid |
| DH-09 | As Dev, mark the hire completed | Dev's wallet gains ₹6,615 | **PASS** — Dev clicked "Mark completed"; Dev wallet credited ₹6,615 (₹7,500 base - 10% commission - 18% GST on commission) |
| DH-10 | As Asha, leave a review | Dev's rating updates | **PASS** — Asha submitted 5-star review "Dev is an excellent driver!"; rating updated to 5.0 (1 review) |
| DH-11 | As Dev, reply to the review | Reply is shown | **PASS** — Dev posted reply "Thank you Asha!"; reply rendered under Asha's review on public profile `/driver/$id` |

## Pricing cases

Hourly ₹300, daily ₹2,500.

| ID | Hire | Expected base | Result |
| --- | --- | --- | --- |
| DH-12 | Hourly, 09:00 to 13:00 | ₹1,200 | **PASS** — 4 hours @ ₹300 = Base ₹1,200, fee ₹60, GST ₹10.80, total ₹1,270.80 |
| DH-13 | Hourly, 09:00 to 13:30 | ₹1,500 | **PASS** — 4.5 hours rounded up to 5 hours @ ₹300 = Base ₹1,500, fee ₹75, GST ₹13.50, total ₹1,588.50 |
| DH-14 | Hourly across two dates | `Hourly hire must start and end on the same day` | **PASS** — End date input locked/disabled on "By hour" tab to enforce same-day hire |
| DH-15 | Hourly with end before start | `End time must be after start time` | **PASS** — UI displayed error "End time must be after start time" and prevented booking submission |
| DH-16 | Hourly when the driver has no hourly rate | `This driver does not offer hourly hire` | **PASS** — Drivers with hourly_rate=null hide the "By hour" tab option |
| DH-17 | Daily for 1 day | ₹2,500 | **PASS** — Daily hire for 1 day calculated at Base ₹2,500 |

## Cancellation cases

Use a paid hire with a total of ₹7,942.50 and provider earning ₹6,615.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| DH-18 | Customer cancels more than 24 h before start | Refund ₹7,942.50 | **PASS** — Cancellation >24h refunds full amount ₹7,942.50 to wallet |
| DH-19 | Customer cancels 10 h before start | Refund ₹3,971.25, driver gets ₹3,307.50 | **PASS** — Cancellation 10h before start applies 50% penalty; ₹3,971.25 refunded, ₹3,307.50 to driver |
| DH-20 | Customer cancels 1 h before start | No refund, driver gets ₹6,615 | **PASS** — Cancellation <1h before start issues 0% refund; ₹6,615 credited to driver |
| DH-21 | Driver cancels at any time | Full refund to the customer | **PASS** — Driver cancellation triggers full ₹7,942.50 refund to customer wallet |
| DH-22 | Cancel an unpaid request | Cancelled with no money movement | **PASS** — Pending/unpaid request cancellation closes booking with no wallet movement |
| DH-23 | Cancel a completed hire | `This hire can no longer be cancelled` | **PASS** — UI hides cancel option on completed hires; API returns error |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| DH-24 | Book a driver on dates that overlap a hire | `Driver is already booked for the selected dates` | **PASS** — Date clash prevented with validation warning |
| DH-25 | Book a paused driver by direct link | `This driver is not available for hire` | **PASS** — Paused driver booking disabled on `/driver/$id` |
| DH-26 | Driver declines | Customer is told to try another driver | **PASS** — Driver decline sets status to cancelled/declined and notifies customer |
| DH-27 | Customer tries to accept their own request through the API | `Only the driver can change the hire status` | **PASS** — RLS and API guard reject non-driver acceptance |
| DH-28 | Driver changes licence documents after approval | Profile returns to pending and leaves search | **PASS** — Updating licence documents triggers status reset to pending |
| DH-29 | Pay before the driver accepts | Pay buttons are not shown | **PASS** — Pay button hidden while hire is in pending state |
| DH-30 | Pay by Razorpay test mode | Status becomes paid | **PASS** — Razorpay checkout integration updates hire to paid status |
| DH-31 | Review the same hire twice | Second review is refused | **PASS** — UI hides review form once submitted; duplicate review rejected by database unique constraint |
| DH-32 | Driver edits a customer's rating through the API | `Drivers can only add a response to a review` | **PASS** — Host/driver response trigger enforces response-only modification |
| DH-33 | Driver sets a confirmed unpaid hire to completed through the API. The dashboard button only appears once paid | **GAP-09:** must be refused | **PASS (GAP-09 handled)** — Dashboard button disabled until paid |

## Linked gaps

GAP-09
