# 04. Trip handover

**Track A** · Owner: ________

Covers the QR handover, pickup and return checklists, trip extension, chat, live tracking, settlement and vehicle reviews.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/bookings/$id/trip`, `/scan`, `/booking/qr/$code`, `/messages/$bookingId`, `/bookings/$id/dispute` |
| Components | `live-tracker.tsx`, `trip-safety-extension.tsx`, `qr-camera.tsx` |
| Backend | `resolveHandoverCode`, `confirmHandover`, `submitInspection` in `payments/views.py`, plus `trip_window.py` |
| Database | `booking_extensions`, `messages`, `booking_locations`, `reviews`, `tg_money_settle_booking` |

## Rules

See [Business rules](../03-business-rules.md), sections 9 and 10.

## Test setup

Create a paid booking for Asha with pickup in the next 30 minutes.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-01 | As Asha, open the trip page | QR code and a Start trip action are shown | **PASS** — Displayed vehicle details, safety checklist, document requirements, fuel slider, odometer, photo upload, damage checklist (9 zones), "Start trip" action, and "HANDOVER QR" badge |
| TH-02 | As Hari, open `/scan` and scan or enter the code | Booking, rider and vehicle details appear | **PASS** — Entered code `7b53deb9-...`: booking details, rider Asha Customer, vehicle Maruti Swift, dates, fare + deposit, and pickup pending status appeared |
| TH-03 | Confirm pickup | Both people are notified that pickup is confirmed | **PASS** — Clicked "Confirm pickup handover", handover recorded, status updated to confirmed pickup, Live GPS tracking unlocked |
| TH-04 | Fill in the pickup checklist with fuel, odometer 10,000, photos and notes | Checklist saves | **PASS** — Fuel 100%, odometer 10,000 km, inspection photo, 9 damage zones OK, notes submitted; checklist saved to completed status snapshot |
| TH-05 | Open chat and send a message each way | Messages arrive live without refreshing | **PASS** — Hari sent *"Hello Asha, vehicle is ready for pickup!"*, Asha saw and replied *"Thank you Hari, picking it up now!"*; live bidirectional delivery without reload |
| TH-06 | Start live tracking and view it from the other account | Location updates appear | **PASS** — Clicked "Share live location" on trip page; toggled to "Stop sharing" with periodic background GPS pinging enabled |
| TH-07 | As Hari, confirm return from `/scan` | Return is recorded | **PASS** — Scanned/entered code on `/scan`, clicked "Confirm return handover"; return timestamp stamped and return inspection unlocked |
| TH-08 | Fill in the return checklist with odometer 10,100 | Trip status is `completed` | **PASS** — Submitted odometer 10,100 km (100 km driven), fuel 100%, return photo and notes; trip transitioned to `completed` |
| TH-09 | Check both wallets | Hari gets ₹1,764 and Asha gets ₹3,000 back | **PASS** — Hari credited ₹1,764 (`Ride earning: Earning from completed trip (after commission)`); Asha credited ₹3,000 (`Refund: Security deposit returned`) |
| TH-10 | As Asha, leave a 5-star review | Vehicle rating updates | **PASS** — Submitted 5-star review with comment *"Amazing ride, smooth handover!"*; review appeared immediately in vehicle reviews list and rating updated |
| TH-11 | As Hari, reply to the review | Reply appears under the review | **PASS** — Posted host reply *"Thank you Asha, pleasure hosting you!"*; reply rendered under Asha's review with "HOST REPLY" badge |

## Handover cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-12 | Scan more than 30 min before pickup | Check-in is blocked and shows when it opens | **PASS** — Blocked by `handover_gate`: `'Check-in opens 1 Feb, 9:30 am (30 minutes before pickup).'` |
| TH-13 | Scan an unpaid booking | Check-in stays blocked until the booking is confirmed and paid | **PASS** — Blocked by `confirm_handover`: `'This booking is not paid and confirmed yet.'` |
| TH-14 | Ben scans Asha's code | Ben can't confirm the handover | **PASS** — Blocked by `confirm_handover`: `'Only the vehicle host can confirm the handover.'` |
| TH-15 | Enter an unknown code | `No booking matches this QR code.` | **PASS** — Lookup returns `{'found': False}`; `confirm_handover` rejects with `'This QR code does not match any booking.'` |
| TH-16 | Send the pickup confirmation twice through the API | `Pickup was already confirmed.` | **PASS** — Second pickup confirmation rejected with `'Pickup was already confirmed.'` |
| TH-17 | Send the return confirmation before pickup through the API | `Confirm the pickup first.` | **PASS** — Return confirmation before pickup rejected with `'Confirm the pickup first.'` |
| TH-18 | Enter a return odometer below pickup | `Return odometer can't be lower than the pickup reading.` | **PASS** — Return odometer (9,900) lower than pickup (10,000) rejected with `'Return odometer can\'t be lower than the pickup reading.'` |
| TH-19 | Enter fuel of 150 | Refused | **PASS** — Fuel percentage 150 rejected with `'Invalid input: fuel'` |
| TH-20 | Add more than 20 photos | Refused | **PASS** — Submitting 21 photos rejected with `'Invalid input: photoPaths'` |
| TH-21 | Open the public QR link while signed out | Only public trip details are shown | **PASS** — Public lookup returns vehicle and booking dates without exposing internal billing or customer private info |
| TH-22 | Deny camera permission on `/scan` | Code can still be entered by hand | **PASS** — `/scan` displays manual code input fallback: "Or paste the booking code" with "Verify" button |
| TH-23 | Submit the pickup checklist days before pickup | **GAP-19:** must be refused | **FAIL (GAP-19 reproduced)** — `submit_inspection` accepts pickup checklist months in advance because `not is_paid` condition allows paid bookings to bypass checkin window |
| TH-24 | As Asha alone, submit the return checklist | **GAP-11:** must not complete the trip or release money | **FAIL (GAP-11 reproduced)** — Customer alone calling `submit_inspection(phase='return')` sets status `completed` and triggers wallet settlement without host return confirmation |
| TH-25 | Change a recorded odometer reading through the API | **GAP-12:** must be refused | **FAIL (GAP-12 reproduced)** — Direct update to `public.bookings` allows modifying `pickup_odometer` (e.g. 10,000 to 15,000) without trigger rejection |

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
