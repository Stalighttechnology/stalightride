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
| TH-01 | As Asha, open the trip page | QR code and a Start trip action are shown | |
| TH-02 | As Hari, open `/scan` and scan or enter the code | Booking, rider and vehicle details appear | |
| TH-03 | Confirm pickup | Both people are notified that pickup is confirmed | |
| TH-04 | Fill in the pickup checklist with fuel, odometer 10,000, photos and notes | Checklist saves | |
| TH-05 | Open chat and send a message each way | Messages arrive live without refreshing | |
| TH-06 | Start live tracking and view it from the other account | Location updates appear | |
| TH-07 | As Hari, confirm return from `/scan` | Return is recorded | |
| TH-08 | Fill in the return checklist with odometer 10,100 | Trip status is `completed` | |
| TH-09 | Check both wallets | Hari gets ₹1,764 and Asha gets ₹3,000 back | |
| TH-10 | As Asha, leave a 5-star review | Vehicle rating updates | |
| TH-11 | As Hari, reply to the review | Reply appears under the review | |

## Handover cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-12 | Scan more than 30 min before pickup | Check-in is blocked and shows when it opens | |
| TH-13 | Scan an unpaid booking | Check-in stays blocked until the booking is confirmed and paid | |
| TH-14 | Ben scans Asha's code | Ben can't confirm the handover | |
| TH-15 | Enter an unknown code | `No booking matches this QR code.` | |
| TH-16 | Send the pickup confirmation twice through the API | `Pickup was already confirmed.` | |
| TH-17 | Send the return confirmation before pickup through the API | `Confirm the pickup first.` | |
| TH-18 | Enter a return odometer below pickup | `Return odometer can't be lower than the pickup reading.` | |
| TH-19 | Enter fuel of 150 | Refused | |
| TH-20 | Add more than 20 photos | Refused | |
| TH-21 | Open the public QR link while signed out | Only public trip details are shown | |
| TH-22 | Deny camera permission on `/scan` | Code can still be entered by hand | |
| TH-23 | Submit the pickup checklist days before pickup | **GAP-19:** must be refused | |
| TH-24 | As Asha alone, submit the return checklist | **GAP-11:** must not complete the trip or release money | |
| TH-25 | Change a recorded odometer reading through the API | **GAP-12:** must be refused | |

## Extension cases

Use an active trip, after pickup and before return.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-26 | Asha requests +5 hours | Hari is notified | |
| TH-27 | Hari accepts | Asha is told to pay from the wallet | |
| TH-28 | Asha pays | Return time moves, and the wallet is charged the extra total | |
| TH-29 | Request a second extension while one is open | `An extension request is already open for this trip` | |
| TH-30 | Hari declines | Asha is told to return on time | |
| TH-31 | Asha cancels a pending request | Request closes | |
| TH-32 | Request an extension that hits another booking | `The vehicle is not available for the extra time` | |
| TH-33 | Pay with too little wallet balance | Refused, and the return time doesn't change | |
| TH-34 | Request an extension before pickup | `Extensions are only possible during an active trip` | |

## Review cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| TH-35 | Review a trip that isn't completed | Refused | |
| TH-36 | Review the same booking twice | Second review is refused | |
| TH-37 | Host edits the customer's rating through the API | `Hosts can only add a response to a review` | |

## Linked gaps

GAP-11, GAP-12, GAP-19
