# 02. Hosts and vehicles

**Track A** · Owner: ________

Covers becoming a host, identity checks, listing vehicles, availability, maintenance records and the host dashboard.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/earn`, `/vendor`, `/vendor/vehicles/new`, `/browse`, `/vehicle/$id` |
| Components | `availability-calendar.tsx`, `vendor-maintenance.tsx`, `host-analytics.tsx`, `payouts-card.tsx` |
| Database | `vendors`, `vehicles`, `vehicle_images`, `availability_blocks`, `vehicle_maintenance` |

## Rules

- New vehicles start as `draft` and `pending`. Only an admin can approve them.
- Only `active` and `approved` vehicles appear to customers.
- A host can pause or reactivate an approved vehicle.
- Hosts can see only their own vehicle records and bookings.

## Test accounts

Hari and Ada.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| HV-01 | As Hari, open `/vendor` and create the host profile | Profile is saved and the dashboard loads | |
| HV-02 | Upload an identity document | Status shows pending and admins are notified | |
| HV-03 | As Ada, approve Hari in `/admin`, Hosts | Hari sees verified status | |
| HV-04 | As Hari, add the standard vehicle with photos and documents | Vehicle shows as awaiting review | |
| HV-05 | Search `/browse` while it is pending | Vehicle is not listed | |
| HV-06 | As Ada, approve it in `/admin`, Vehicles | Hari is notified | |
| HV-07 | Search `/browse` for Bengaluru | Vehicle is listed with the correct price | |
| HV-08 | Open the vehicle page signed out | Details, price and photos are visible | |

## Other cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| HV-09 | Submit the vehicle form with required fields empty | Clear validation messages | |
| HV-10 | Admin rejects a vehicle with a reason | Host sees the reason | |
| HV-11 | Pause an active vehicle | It disappears from `/browse` | |
| HV-12 | Reactivate it | It returns to `/browse` | |
| HV-13 | Block two future dates on the calendar | Customers can't book those dates | |
| HV-14 | Remove the block | Dates can be booked again | |
| HV-15 | Block dates that overlap a confirmed booking | **GAP-10:** this must be refused | |
| HV-16 | Add a maintenance record with a cost and date | Record is listed and saved after refresh | |
| HV-17 | Enter a negative maintenance cost | Save is refused | |
| HV-18 | Delete a vehicle with no bookings | It is removed | |
| HV-19 | Delete a vehicle with past bookings, then sign in on another browser | **GAP-29:** it must stay hidden | |
| HV-20 | Open a pending vehicle's URL as Ben | Vehicle is not available | |
| HV-21 | Upload a photo over 20 MB | Upload is refused with a clear error | |
| HV-22 | Open `/vendor` as a user with no host profile | **GAP-30:** no sample data or "Verified" badge | |
| HV-23 | Check dashboard earnings after a completed trip | Matches the provider earning, not the customer total | |

## Linked gaps

GAP-10, GAP-29, GAP-30
