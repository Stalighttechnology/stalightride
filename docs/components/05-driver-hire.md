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
| DH-01 | As Dev, submit a profile at `/driver-dashboard` | `Profile submitted for verification` | |
| DH-02 | Search `/drivers` before approval | Dev is not listed | |
| DH-03 | As Ada, approve Dev in `/admin`, Drivers | Dev is notified | |
| DH-04 | As Dev, switch to live | `You're live and bookable` | |
| DH-05 | As Asha, open Dev's profile and choose a daily hire for 3 days | Base ₹7,500, fee ₹375, GST ₹67.50, total ₹7,942.50 | |
| DH-06 | Send the request | Dev is notified | |
| DH-07 | As Dev, accept it | Asha is told to pay | |
| DH-08 | As Asha, pay with wallet at `/hires` | `Paid from wallet`, wallet drops by ₹7,942.50 | |
| DH-09 | As Dev, mark the hire completed | Dev's wallet gains ₹6,615 | |
| DH-10 | As Asha, leave a review | Dev's rating updates | |
| DH-11 | As Dev, reply to the review | Reply is shown | |

## Pricing cases

Hourly ₹300, daily ₹2,500.

| ID | Hire | Expected base | Result |
| --- | --- | --- | --- |
| DH-12 | Hourly, 09:00 to 13:00 | ₹1,200 | |
| DH-13 | Hourly, 09:00 to 13:30 | ₹1,500 | |
| DH-14 | Hourly across two dates | `Hourly hire must start and end on the same day` | |
| DH-15 | Hourly with end before start | `End time must be after start time` | |
| DH-16 | Hourly when the driver has no hourly rate | `This driver does not offer hourly hire` | |
| DH-17 | Daily for 1 day | ₹2,500 | |

## Cancellation cases

Use a paid hire with a total of ₹7,942.50 and provider earning ₹6,615.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| DH-18 | Customer cancels more than 24 h before start | Refund ₹7,942.50 | |
| DH-19 | Customer cancels 10 h before start | Refund ₹3,971.25, driver gets ₹3,307.50 | |
| DH-20 | Customer cancels 1 h before start | No refund, driver gets ₹6,615 | |
| DH-21 | Driver cancels at any time | Full refund to the customer | |
| DH-22 | Cancel an unpaid request | Cancelled with no money movement | |
| DH-23 | Cancel a completed hire | `This hire can no longer be cancelled` | |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| DH-24 | Book a driver on dates that overlap a hire | `Driver is already booked for the selected dates` | |
| DH-25 | Book a paused driver by direct link | `This driver is not available for hire` | |
| DH-26 | Driver declines | Customer is told to try another driver | |
| DH-27 | Customer tries to accept their own request through the API | `Only the driver can change the hire status` | |
| DH-28 | Driver changes licence documents after approval | Profile returns to pending and leaves search | |
| DH-29 | Pay before the driver accepts | Pay buttons are not shown | |
| DH-30 | Pay by Razorpay test mode | Status becomes paid | |
| DH-31 | Review the same hire twice | Second review is refused | |
| DH-32 | Driver edits a customer's rating through the API | `Drivers can only add a response to a review` | |
| DH-33 | Driver sets a confirmed unpaid hire to completed through the API. The dashboard button only appears once paid | **GAP-09:** must be refused | |

## Linked gaps

GAP-09
