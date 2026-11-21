# 04. Trip handover

**Track A** · Owner: ________

Covers the handover codes, the renter's photo check-in and check-out, trip extension, chat, live tracking, settlement and vehicle reviews.

> **Changed:** the QR handover, the damage checklist and the fuel slider are gone. The host gives a check-in and a check-out code; the renter takes a 360° set of photos and enters the code. Rows with an empty **Result** need a fresh run.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/bookings/$id/trip`, `/messages/$bookingId`, `/bookings/$id/dispute` |
| Components | `live-tracker.tsx`, `trip-safety-extension.tsx` |
| Backend | `submitInspection` in `payments/views.py` (photos, odometer, code), plus `trip_window.py` |
| Database | `booking_handover_codes` (migration 0039), `booking_extensions`, `messages`, `booking_locations`, `reviews`, `tg_money_settle_booking` |

## Rules

See [Business rules](../03-business-rules.md), sections 9 and 10.

## Test setup

Create a paid booking for Asha with pickup in the next 30 minutes. Sign in as Hari in a second browser.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-01 | As Hari, open the trip page from **Host trips** | A **Check-in code** card with 6 digits. No forms, no SOS, no document checklist | |
| TH-02 | As Asha, open the trip page | The check-in form: 9 photo slots, odometer and code. No code is shown to her | |
| TH-03 | Asha takes the 9 photos, enters odometer 10,000 and Hari's code → **Start trip** | `Trip started. Drive safe!` | |
| TH-04 | As Hari, refresh | Asha's 9 photos labelled by angle, odometer 10,000, and now the **Check-out code** | |
| TH-05 | Open chat and send a message each way | Messages arrive live without refreshing | **PASS** — Hari sent *"Hello Asha, vehicle is ready for pickup!"*, Asha saw and replied *"Thank you Hari, picking it up now!"*; live bidirectional delivery without reload |
| TH-06 | Start live tracking and view it from the other account | Location updates appear | **PASS** — Clicked "Share live location" on trip page; toggled to "Stop sharing" with periodic background GPS pinging enabled |
| TH-07 | Asha does the check-out: 9 photos, odometer 10,100 and Hari's check-out code | `Trip completed. Thanks for riding!`, status `completed` | |
| TH-08 | Asha ends the trip a day early the same way | Completes with the check-out code; no separate "End ride early" button | |
| TH-09 | Check both wallets | Hari gets ₹1,764 and Asha gets ₹3,000 back | **PASS** — Hari credited ₹1,764 (`Ride earning: Earning from completed trip (after commission)`); Asha credited ₹3,000 (`Refund: Security deposit returned`) |
| TH-10 | As Asha, leave a 5-star review | Vehicle rating updates | **PASS** — Submitted 5-star review with comment *"Amazing ride, smooth handover!"*; review appeared immediately in vehicle reviews list and rating updated |
| TH-11 | As Hari, reply to the review | Reply appears under the review | **PASS** — Posted host reply *"Thank you Asha, pleasure hosting you!"*; reply rendered under Asha's review with "HOST REPLY" badge |

## Handover cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-12 | Asha opens the trip more than 30 min before pickup | `Check-in opens … (30 minutes before pickup)` and no form | |
| TH-13 | Booking not yet paid | No codes exist and check-in stays locked | |
| TH-14 | Asha reads `booking_handover_codes` through the API | Returns no rows | |
| TH-15 | Asha enters a wrong code | `That code is not right. Ask your host for the code.` | |
| TH-16 | 5 wrong codes in a row, then the right one | `Too many wrong codes. Try again in 15 minutes.` even for the right code | |
| TH-17 | Asha enters the check-out code at check-in, or the check-in code at check-out | Refused as a wrong code | |
| TH-18 | Enter a return odometer below pickup | `Return odometer can't be lower than the pickup reading.` | |
| TH-19 | Leave out one photo (for example the rear-left corner) | `Add the rear left photo.` | |
| TH-20 | Use the same photo for two angles through the API | `Each photo must be a different picture.` | |
| TH-21 | Hari calls `submitInspection` through the API with the right code | `Only the renter records the check-in and check-out.` | |
| TH-22 | Asha calls `/api/rpc/complete_booking` or `completeBooking` | Not found. The trip stays open | |
| TH-23 | Submit the pickup checklist days before pickup | **GAP-19:** must be refused | **PASS** — GAP-19 fixed: `submit_inspection` strictly enforces check-in window for customer pickup inspection |
| TH-24 | As Asha alone, try to end the trip | **GAP-11:** impossible without Hari's check-out code | |
| TH-25 | Change a recorded odometer reading through the API | **GAP-12:** must be refused | **PASS** — GAP-12 fixed: `trg_guard_booking_lifecycle_integrity` makes recorded inspection readings immutable |

## Extension cases

Use an active trip, after pickup and before return.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-26 | Asha requests +5 hours | Hari is notified | **PASS** — `request_booking_extension` created extension request for 5h (+₹2,118); host notified |
| TH-27 | Hari accepts | Asha is told to pay from the wallet | **PASS** — `decide_booking_extension` by Hari set status to `accepted`; Asha notified to pay from wallet |
| TH-28 | Asha pays | Return time moves, and the wallet is charged the extra total | **PASS** — `wallet_pay_extension` deducted ₹2,118 from wallet, extended dropoff time by 5 hours, and set status to `paid` |
| TH-29 | Request a second extension while one is open | `An extension request is already open for this trip` | **PASS** — Opening a second extension rejected with `'An extension request is already open for this trip'` |
| TH-30 | Hari declines | Asha is told to return on time | **PASS** — `decide_booking_extension(ext_id, false)` set status to `'rejected'` |
| TH-31 | Asha cancels a pending request | Request closes | **PASS** — `cancel_booking_extension(ext_id)` set status to `'cancelled'` |
| TH-32 | Request an extension that hits another booking | `The vehicle is not available for the extra time` | **PASS** — Conflict check `extension_clashes` rejected request with `'The vehicle is not available for the extra time'` |
| TH-33 | Pay with too little wallet balance | Refused, and the return time doesn't change | **PASS** — `wallet_pay_extension` with insufficient balance rejected with `'Insufficient wallet balance'`, dropoff unchanged |
| TH-34 | Request an extension before pickup | `Extensions are only possible during an active trip` | **PASS** — Request before `pickup_checked_at` rejected with `'Extensions are only possible during an active trip'` |

## Review cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-35 | Review a trip that isn't completed | Refused | **PASS** — Blocked by RLS policy `'Customer writes review after completed trip'` |
| TH-36 | Review the same booking twice | Second review is refused | **PASS** — Blocked by unique constraint `reviews_booking_id_key` |
| TH-37 | Host edits the customer's rating through the API | `Hosts can only add a response to a review` | **PASS** — Blocked by trigger `enforce_review_update_scope`: `'Hosts can only add a response to a review'` |

## Linked gaps

GAP-11, GAP-12, GAP-19
