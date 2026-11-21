-

# 02. Hosts and vehicles

**Track A** · Owner: ________

Covers becoming a host, identity checks, listing vehicles, availability, maintenance records and the host dashboard.

## Where it lives

| Part       | Location                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Pages      | `/earn`, `/vendor`, `/vendor/vehicles/new`, `/browse`, `/vehicle/$id`                         |
| Components | `availability-calendar.tsx`, `vendor-maintenance.tsx`, `host-analytics.tsx`, `payouts-card.tsx` |
| Database   | `vendors`, `vehicles`, `vehicle_images`, `availability_blocks`, `vehicle_maintenance`, `host_response_stats`, `reactivate_vendor_listings`, `host_dashboard_stats` |

## Rules

- New vehicles start as `draft` and `pending`. Only an admin can approve them.
- Only `active` and `approved` vehicles appear to customers.
- A host can pause or reactivate an approved vehicle.
- Hosts can see only their own vehicle records and bookings.
- Instant Book, response rate and listing pauses follow [Business rules §17](../03-business-rules.md#host-accountability) (added in #42).

## Test accounts

Hari and Ada.

## Main workflow

| ID    | Steps                                                       | Expected                                     | Result |
| ----- | ----------------------------------------------------------- | -------------------------------------------- | ------ |
| HV-01 | As Hari, open `/vendor` and create the host profile       | Profile is saved and the dashboard loads     | Pass — Hari profile created ("Hari Rentals"), vendor role granted, dashboard loaded. |
| HV-02 | Upload an identity document                                 | Status shows pending and admins are notified | Pass — ID doc uploaded to `kyc-docs`, status updated to pending, admin notification queued. |
| HV-03 | As Ada, approve Hari in `/admin`, Hosts                   | Hari sees verified status                    | Pass — Ada approved Hari in Admin Hosts tab; status updated to "approved" / "Verified host". |
| HV-04 | As Hari, add the standard vehicle with photos and documents | Vehicle shows as awaiting review             | Pass — Created "Test Swift" with RC/Insurance/PUC; status shown as "Pending review". |
| HV-05 | Search `/browse` while it is pending                      | Vehicle is not listed                        | Pass — "Test Swift" not returned in `/browse?city=Bengaluru` while pending. |
| HV-06 | As Ada, approve it in `/admin`, Vehicles                  | Hari is notified                             | Pass — Ada approved vehicle in Admin console; status set to approved, notifications sent. |
| HV-07 | Search `/browse` for Bengaluru                            | Vehicle is listed with the correct price     | Pass — "Test Swift" listed with photo, badges, ₹2,000/day, ₹200/hr. |
| HV-08 | Open the vehicle page signed out                            | Details, price and photos are visible        | Pass — `/vehicle/$id` loads public pricing (₹2,000/day), features, specs, and "Sign in to book" CTA. |

## Other cases

| ID    | Steps                                                                | Expected                                             | Result |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| HV-09 | Submit the vehicle form with required fields empty                   | Clear validation messages                            | Pass — Browser required attributes and form validation stop empty submission. |
| HV-10 | Admin rejects a vehicle with a reason                                | Host sees the reason                                 | Pass — Admin prompts for rejection reason; vehicle page renders `Listing rejected: <reason>`. |
| HV-11 | Pause an active vehicle                                              | It disappears from `/browse`                       | Pass — Pause action button in `VehiclesGrid` toggles status to 'paused', hidden from `/browse` |
| HV-12 | Reactivate it                                                        | It returns to `/browse`                            | Pass — Reactivate action button in `VehiclesGrid` toggles status back to 'active' |
| HV-13 | Block two future dates on the calendar                               | Customers can't book those dates                     | Pass — Future blackout block added via Availability Calendar; dates marked as blocked. |
| HV-14 | Remove the block                                                     | Dates can be booked again                            | Pass — Clicked "Remove block"; blackout removed and calendar immediately shows dates available. |
| HV-15 | Block dates that overlap a confirmed booking                         | **GAP-10:** this must be refused               | Pass (GAP-10 fixed: `trg_prevent_availability_block_conflict` blocks blackout over active bookings) |
| HV-16 | Add a maintenance record with a cost and date                        | Record is listed and saved after refresh             | Pass — Maintenance record saved (₹1,500 Oil change & detailing) and persisted after refresh. |
| HV-17 | Enter a negative maintenance cost                                    | Save is refused                                      | Pass — Form validation blocks negative costs and DB check constraint `vehicle_maintenance_cost_check` refuses. |
| HV-18 | Delete a vehicle with no bookings                                    | It is removed                                        | Pass — Vehicle and storage assets deleted cleanly from database. |
| HV-19 | Delete a vehicle with past bookings, then sign in on another browser | **GAP-29:** it must stay hidden                | Pass (GAP-29 fixed: DB soft-deletion column `is_deleted = true` permanently filters vehicle) |
| HV-20 | Open a pending vehicle's URL as Ben                                  | Vehicle is not available                             | Pass — Postgres RLS policy restricts unapproved vehicles to the owner; non-owners get 404 / error. |
| HV-21 | Upload a photo over 20 MB                                            | Upload is refused with a clear error                 | Pass — Upload rejected with HTTP 413 `EntityTooLarge` (max file size exceeded). |
| HV-22 | Open `/vendor` as a user with no host profile                      | **GAP-30:** no sample data or "Verified" badge | Pass (GAP-30 fixed: Non-hosts see real empty state and onboarding prompt to /earn, no fake fleet) |
| HV-23 | Check dashboard earnings after a completed trip                      | Matches the provider earning, not the customer total | Pass — Aggregate revenue uses `provider_earning` (net host payout minus platform fees). |

## Instant Book and response rate

Added in #42 (migration 0032). See [doc 02 §6](../02-local-setup-and-test-data.md#6-testing-time-based-rules) for how to make a deadline pass without waiting.

| ID    | Steps | Expected | Result |
| ----- | ----- | -------- | ------ |
| HV-24 | As Hari, switch **Instant Book** on for Test Swift in `/vendor` | Toast `Instant Book enabled`, and the card shows an **Instant** badge | |
| HV-25 | Add a new vehicle with the **Instant Book** switch on, then get it approved | The vehicle is saved with Instant Book on | |
| HV-26 | Search `/browse` for Bengaluru with one Instant Book car and one normal car | The Instant Book car is listed first, with the **Instant** badge | |
| HV-27 | As Asha, request the Instant Book car | Toast `Booking confirmed instantly! Please complete payment by …`. Hari is notified and has no Approve or Decline buttons | |
| HV-28 | Open Test Swift's page after Hari has answered some requests | Host card shows the response rate and typical response time | |
| HV-29 | Check the **Response Rate** tile on `/vendor` | Matches the share of the last 90 days' requests answered before their deadline | |
| HV-30 | Let 3 requests expire unanswered within 30 days, then run `send_reminders` | All Hari's vehicles become paused, Hari is notified, and `/vendor` shows **Your listings are paused** | |
| HV-31 | Click **Re-activate listings** | Toast `Listings re-activated! Your vehicles are live.` The vehicles return to `/browse` | |
| HV-32 | After reactivating, let one more request expire and run `send_reminders` | Listings stay live, because the count was reset | |

## Linked gaps

GAP-10, GAP-29, GAP-30
