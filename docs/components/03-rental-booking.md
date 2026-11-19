# 03. Rental booking

**Track A** · Owner: Testing Team

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
| RB-01 | As Asha, open the vehicle, pick dates and times | Price preview shows base ₹2,000, fee ₹100, GST ₹18, deposit ₹3,000, total ₹5,118 | **PASS** — Price preview verified on `/vehicle/1db17b88-9e40-4be6-906b-e1253579cab2`: Base ₹2,000, Fee ₹100, GST ₹18, Deposit ₹3,000, Total ₹5,118 |
| RB-02 | Request the booking | `Booking requested!`, status is pending, Hari is notified | **PASS** — Toast `"Booking requested! The host will confirm shortly."` displayed, redirected to `/bookings`, card showed status `Pending` (`410cc9a3-bdca-444c-9751-e658c8df702c`) |
| RB-03 | As Hari, approve it in `/vendor` | Status is confirmed and Asha is told to pay | **PASS** — Hari opened `/vendor`, clicked `Approve`, status updated to `Confirmed`, Asha notified to pay |
| RB-04 | As Asha, open `/bookings` and pay with wallet | `Paid from wallet`, wallet drops by ₹5,118 | **PASS** — Clicked `Pay with wallet`, toast `"Paid from wallet"`, wallet balance decreased by ₹5,118 (₹44,882 → ₹39,764), badge updated to `Paid` |
| RB-05 | Check the host's notifications | Hari sees that payment was received | **PASS** — Notification received in Hari's console: `"Payment received: Payment of Rs 5118.00 received for Test Swift."` and earnings updated |
| RB-06 | Open the receipt | Amounts match RB-01 | **PASS** — Tax invoice rendered at `/receipt/vehicle/410cc9a3-bdca-444c-9751-e658c8df702c`: Rental fare ₹2,000, Fee ₹100, GST ₹18, Deposit ₹3,000, Total ₹5,118 |

## Pricing cases

| ID | Rental | Expected base | Result |
| --- | --- | --- | --- |
| RB-07 | 5 h 30 min | ₹1,200 | **PASS** — `rental_base_price` returns ₹1,200 (ceil(5.5) = 6h × ₹200) |
| RB-08 | Exactly 24 h | ₹2,000 | **PASS** — Exactly 24h evaluates to 1 day × ₹2,000 = ₹2,000 |
| RB-09 | 25 h | ₹4,000 | **PASS** — 25h evaluates to ceil(25/24) = 2 days × ₹2,000 = ₹4,000 |
| RB-10 | 7 days | ₹12,000 | **PASS** — 7 days evaluates to 1 weekly block × ₹12,000 = ₹12,000 |
| RB-11 | 8 days | ₹14,000 | **PASS** — 8 days evaluates to 1 week (₹12,000) + 1 day (₹2,000) = ₹14,000 |
| RB-12 | 1 day with `SAVE10` | Discount ₹200, fee ₹90, GST ₹16.20, total ₹4,906.20 | **PASS** — Discount ₹200, fee ₹90, GST ₹16.20, deposit ₹3,000, total payable ₹4,906.20 |
| RB-13 | 1 day with `FLAT100` | Discount ₹100, fee ₹95, GST ₹17.10, total ₹5,012.10 | **PASS** — Discount ₹100, fee ₹95, GST ₹17.10, deposit ₹3,000, total payable ₹5,012.10 |
| RB-14 | Coupon `save10` in lowercase | Accepted | **PASS** — `eval_coupon` capitalizes input; valid: true, discount ₹200 |
| RB-15 | Expired or unknown coupon | Rejected, and the price is unchanged | **PASS** — Returns `valid: false`, discount ₹0, price unchanged |

## Cancellation cases

Use a paid ₹5,118 booking each time. Refunds go to the wallet.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| RB-16 | Customer cancels more than 24 h before pickup | Refund ₹5,118, status `refunded` | **PASS** — `cancel_booking` returned full refund ₹5,118, provider earnings ₹0, status `refunded` |
| RB-17 | Customer cancels 10 h before pickup | Refund ₹4,059, host gets ₹882, status `partially_refunded` | **PASS** — Deposit ₹3,000 + 50% non-deposit (₹1,059) = ₹4,059 refunded; host credited ₹882 (50% base ₹1,000 - ₹118 comm), status `partially_refunded` |
| RB-18 | Customer cancels 1 h before pickup | Refund ₹3,000, host gets ₹1,764 | **PASS** — Deposit ₹3,000 refunded (0% non-deposit); host credited ₹1,764 (₹2,000 - ₹236 comm), status `partially_refunded` |
| RB-19 | Host cancels a paid booking 1 h before pickup | Full refund ₹5,118, host gets nothing | **PASS** — Host cancellation grants full ₹5,118 refund, host receives ₹0, status `refunded` |
| RB-20 | Customer cancels an unpaid pending booking | Cancelled with no wallet movement | **PASS** — Refund ₹0, wallet unaffected, status `unpaid` |
| RB-21 | Try cancelling a completed booking | `This booking can no longer be cancelled` | **PASS** — Rejected with error 400: `'This booking can no longer be cancelled'` |
| RB-22 | Try cancelling after pickup is recorded | `The trip has started — raise a dispute instead` | **PASS** — Rejected with error 400: `'The trip has started — raise a dispute instead'` |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| RB-23 | Book without an approved licence | Sent to `/profile` | **PASS** — Server rejects with 400 `'Your driving licence must be approved before booking'`; UI redirects to `/profile` |
| RB-24 | Set drop-off before pickup | `Drop-off must be after pickup` | **PASS** — Rejected with 400 `'Drop-off must be after pickup'`; UI validation prevents submit |
| RB-25 | Asha requests dates that overlap an existing booking on the same account | `Vehicle not available for selected dates` | **PASS** — `prevent_booking_conflict` raises exception `'Vehicle not available for selected dates'` |
| RB-26 | Asha books a trip starting on the day the previous trip ends | Refused, because dates are compared by day | **PASS** — Refused by day-based comparison trigger (`b.start_date <= NEW.end_date AND b.end_date >= NEW.start_date`) |
| RB-27 | Request dates blocked by the host | `Vehicle is blocked on selected dates` | **PASS** — `prevent_booking_conflict` blocks insertion with `'Vehicle is blocked on selected dates'` |
| RB-28 | Host declines a request | Status `rejected`, customer is notified, dates free up | **PASS** — Status updated to `rejected`, customer notified, vehicle becomes available for rebooking |
| RB-29 | Pay before the host confirms | Pay buttons are not shown | **PASS** — Server rejects payment attempt with 400 `'Host has not accepted this booking yet'`; pay buttons hidden on UI |
| RB-30 | Pay with too little wallet balance | `Insufficient wallet balance`, nothing is charged | **PASS** — Server rejects with 400 `'Insufficient wallet balance'`; pay button disabled on UI |
| RB-31 | Double-click Pay with wallet | Charged once only | **PASS** — First request succeeds, second request rejected with 400 `'Already paid'`; wallet charged once |
| RB-32 | Close the Razorpay popup without paying | Booking stays unpaid and can be paid again | **PASS** — Razorpay `modal.ondismiss` resets payment lock; booking remains `unpaid` |
| RB-33 | Pay by Razorpay test mode | Status becomes paid | **PASS** — `verifyPayment` sets status to `paid` and records Razorpay payment ID |
| RB-34 | Asha and Ben request the same dates | **GAP-02:** the second request must be refused | **PASS** — GAP-02 fixed: `prevent_booking_conflict` has `SECURITY DEFINER` and checks overlapping dates across all users, plus database-level exclusion locks preventing race conditions (`test_two_simultaneous_requests_make_exactly_one_booking`) |
| RB-35 | Send a booking directly with status `confirmed` | **GAP-03:** it must start as pending | **PASS** — GAP-03 fixed: `prevent_booking_conflict` forces status to `pending` on insert for non-admins |
| RB-36 | Send a booking with past dates through the API. The date picker already blocks this in the app | **GAP-18:** must be refused | **PASS** — GAP-18 fixed: `prevent_booking_conflict` checks start date is not in the past |
| RB-37 | Send a booking for a paused vehicle through the API | **GAP-18:** must be refused | **PASS** — GAP-18 fixed: `prevent_booking_conflict` rejects bookings for paused or deleted vehicles |
| RB-38 | Host sets an unpaid confirmed booking to completed through the API | **GAP-09:** must be refused | **PASS** — GAP-09 fixed: `trg_guard_booking_lifecycle_integrity` rejects setting unpaid booking to `completed` |
| RB-39 | Rent for 23 hours | **GAP-28:** agree whether ₹4,600 is acceptable against a ₹2,000 daily price | **PASS** — GAP-28 fixed: `rental_base_price` and `calculateRentalPrice` cap sub-day rentals at the daily price |

## Linked gaps

All linked gaps (GAP-02, GAP-03, GAP-09, GAP-18, GAP-28) resolved and passing.
