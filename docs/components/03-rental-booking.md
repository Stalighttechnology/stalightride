# 03. Rental booking

**Track A** · Owner: ________

Covers searching, pricing, requesting, host approval, payment and cancellation.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/browse`, `/vehicle/$id`, `/bookings`, `/receipt/$kind/$id` |
| Preview logic | `frontend/src/lib/format.ts`, `charges.ts` |
| Database | `bookings`, `rental_base_price`, `compute_charges`, `tg_price_booking`, `cancel_booking`, `prevent_booking_conflict` |

## Rules

Pricing and refunds are in [Business rules](../03-business-rules.md), sections 1, 2, 6 and 8.

## Test accounts

Asha, Ben, Hari, and the standard vehicle. Asha and Ben each need wallet credit.

## Main workflow

Use a 1-day rental starting at least 3 days from now.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| RB-01 | As Asha, open the vehicle, pick dates and times | Price preview shows base ₹2,000, fee ₹100, GST ₹18, deposit ₹3,000, total ₹5,118 | |
| RB-02 | Request the booking | `Booking requested!`, status is pending, Hari is notified | |
| RB-03 | As Hari, approve it in `/vendor` | Status is confirmed and Asha is told to pay | |
| RB-04 | As Asha, open `/bookings` and pay with wallet | `Paid from wallet`, wallet drops by ₹5,118 | |
| RB-05 | Check the host's notifications | Hari sees that payment was received | |
| RB-06 | Open the receipt | Amounts match RB-01 | |

## Pricing cases

| ID | Rental | Expected base | Result |
| --- | --- | --- | --- |
| RB-07 | 5 h 30 min | ₹1,200 | |
| RB-08 | Exactly 24 h | ₹2,000 | |
| RB-09 | 25 h | ₹4,000 | |
| RB-10 | 7 days | ₹12,000 | |
| RB-11 | 8 days | ₹14,000 | |
| RB-12 | 1 day with `SAVE10` | Discount ₹200, fee ₹90, GST ₹16.20, total ₹4,906.20 | |
| RB-13 | 1 day with `FLAT100` | Discount ₹100, fee ₹95, GST ₹17.10, total ₹5,012.10 | |
| RB-14 | Coupon `save10` in lowercase | Accepted | |
| RB-15 | Expired or unknown coupon | Rejected, and the price is unchanged | |

## Cancellation cases

Use a paid ₹5,118 booking each time. Refunds go to the wallet.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| RB-16 | Customer cancels more than 24 h before pickup | Refund ₹5,118, status `refunded` | |
| RB-17 | Customer cancels 10 h before pickup | Refund ₹4,059, host gets ₹882, status `partially_refunded` | |
| RB-18 | Customer cancels 1 h before pickup | Refund ₹3,000, host gets ₹1,764 | |
| RB-19 | Host cancels a paid booking 1 h before pickup | Full refund ₹5,118, host gets nothing | |
| RB-20 | Customer cancels an unpaid pending booking | Cancelled with no wallet movement | |
| RB-21 | Try cancelling a completed booking | `This booking can no longer be cancelled` | |
| RB-22 | Try cancelling after pickup is recorded | `The trip has started — raise a dispute instead` | |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| RB-23 | Book without an approved licence | Sent to `/profile` | |
| RB-24 | Set drop-off before pickup | `Drop-off must be after pickup` | |
| RB-25 | Asha requests dates that overlap an existing booking on the same account | `Vehicle not available for selected dates` | |
| RB-26 | Asha books a trip starting on the day the previous trip ends | Refused, because dates are compared by day | |
| RB-27 | Request dates blocked by the host | `Vehicle is blocked on selected dates` | |
| RB-28 | Host declines a request | Status `rejected`, customer is notified, dates free up | |
| RB-29 | Pay before the host confirms | Pay buttons are not shown | |
| RB-30 | Pay with too little wallet balance | `Insufficient wallet balance`, nothing is charged | |
| RB-31 | Double-click Pay with wallet | Charged once only | |
| RB-32 | Close the Razorpay popup without paying | Booking stays unpaid and can be paid again | |
| RB-33 | Pay by Razorpay test mode | Status becomes paid | |
| RB-34 | Asha and Ben request the same dates | **GAP-02:** the second request must be refused | |
| RB-35 | Send a booking directly with status `confirmed` | **GAP-03:** it must start as pending | |
| RB-36 | Send a booking with past dates through the API. The date picker already blocks this in the app | **GAP-18:** must be refused | |
| RB-37 | Send a booking for a paused vehicle through the API | **GAP-18:** must be refused | |
| RB-38 | Host sets an unpaid confirmed booking to completed through the API | **GAP-09:** must be refused | |
| RB-39 | Rent for 23 hours | **GAP-28:** agree whether ₹4,600 is acceptable against a ₹2,000 daily price | |

## Linked gaps

GAP-02, GAP-03, GAP-09, GAP-18, GAP-28
