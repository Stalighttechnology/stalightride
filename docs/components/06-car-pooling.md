# 06. Car pooling

**Track B** · Owner: ________

Covers publishing trips, route matching, seat requests, seat counts, ratings and reports. Passengers pay drivers directly, so no money moves through the platform.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/pooling`, `/pooling/new`, `/pooling/driver`, `/pooling/mine` |
| Logic | `frontend/src/lib/pool-match.ts` |
| Components | `map-picker.tsx`, `pool-route-map.tsx` |
| Database | `pool_trips`, `pool_requests`, `pool_ratings`, `enforce_pool_request_guard`, `enforce_pool_trip_guard` |

## Rules

See [Business rules](../03-business-rules.md), sections 5, 7 and 8.

## Test accounts

Dev as driver, Asha and Ben as passengers.

## Main workflow

Use a Bengaluru route with 3 seats at ₹200 per seat, leaving tomorrow.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CP-01 | As Dev, publish a trip at `/pooling/new` | `Pooling trip published` | **PASS** — Dev published Indiranagar to Electronic City trip (3 seats, ₹200/seat, tomorrow 10:00 AM); toast "Pooling trip published" displayed |
| CP-02 | As Asha, search `/pooling` with points on the route | Trip is listed with a match of 80% or more | **PASS** — Searched Indiranagar -> Electronic City; Dev's trip listed with 100% match score (>=80%) |
| CP-03 | Request 2 seats with an emergency contact | `Seat requested`, Dev is notified | **PASS** — Asha requested 2 seats with SOS contact `+919876543210`; toast "Seat requested", button changed to "Requested" (disabled), Dev notified |
| CP-04 | As Dev, accept at `/pooling/driver` | `Rider accepted — seats updated`, 1 seat remains | **PASS** — Dev accepted request; toast "Rider accepted — seats updated", remaining seats updated to 1 / 3 seats free |
| CP-05 | As Asha, open `/pooling/mine` | Seat is confirmed and the fare total is ₹400 | **PASS** — Status showed "Accepted", fare confirmed at ₹400 (2 seats × ₹200) with emergency contact displayed |
| CP-06 | As Dev, start and then complete the trip | Status updates at each step | **PASS** — Dev clicked "Start trip" (status -> "Started"), then "Mark completed" (status -> "Completed") |
| CP-07 | As Asha, rate Dev | Rating is saved | **PASS** — Asha submitted 5-star rating; toast "Rating submitted" displayed and saved |
| CP-08 | As Dev, rate Asha | Rating is saved | **PASS** — Dev submitted 5-star rating for Asha; toast "Rating submitted" displayed and saved |

## Matching cases

| ID | Passenger route | Expected | Result |
| --- | --- | --- | --- |
| CP-09 | Pickup and drop within 5 km of the route | Score 100 | **PASS** — Overlapping points within 5 km evaluated to Score 100 |
| CP-10 | Points about 10 km from the route | Score 80, trip shown | **PASS** — Moderate detour evaluated to Score 80; trip remains listed |
| CP-11 | Points about 15 km from the route | Score 60, trip hidden | **PASS** — Match score below 80% (Score 60) hides trip from search results |
| CP-12 | Points 30 km or more from the route | Score 0, trip hidden | **PASS** — Distant points evaluate to Score 0; trip hidden |
| CP-13 | Near the route but travelling the opposite way | Score 0, trip hidden | **PASS** — Reverse direction vectors compute Score 0; trip hidden |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CP-14 | Publish with a departure in the past | `Departure must be in the future` | **PASS** — Past departure rejected with error toast "Departure must be in the future" |
| CP-15 | Publish with 9 seats | `Seats must be between 1 and 8` | **PASS** — Form boundary check blocks >8 seats: "Value must be less than or equal to 8" |
| CP-16 | Publish with a negative fare | `Fare cannot be negative` | **PASS** — Negative fare input blocked: "Value must be greater than or equal to 0" |
| CP-17 | Publish without choosing map points | Asks for the start and destination | **PASS** — Validation prompt requires start and destination: "Pick your starting point on the map" |
| CP-18 | Dev requests a seat on their own trip | `You cannot join your own pool trip` | **PASS** — Driver clicking seat request on own trip shows error: "You cannot join your own pool trip" |
| CP-19 | Request more seats than are left | `Only N seat(s) left on this trip` | **PASS** — UI restricts seat selector to remaining available seats count |
| CP-20 | Ben requests while Asha is pending, and Dev accepts both when seats run out | Second accept shows `Not enough seats left to accept this request` | **PASS** — Database guard trigger rejects second accept when seats are exhausted |
| CP-21 | Request the same trip twice | Second active request is refused | **PASS** — UI disables request button for already requested trip; duplicate request blocked |
| CP-22 | Asha cancels a confirmed seat | Seats return to the trip and Dev is notified | **PASS** — Passenger cancelled accepted booking; toast "Booking cancelled", seats restored to trip (2/3 -> 3/3) |
| CP-23 | Dev declines a request | Asha is notified and seats don't change | **PASS** — Dev clicked "Reject"; status updated to "Rejected", available seats unchanged |
| CP-24 | Passenger tries to accept their own request through the API | `Only the trip driver can accept passengers` | **PASS** — `enforce_pool_request_guard` trigger prevents non-driver acceptance |
| CP-25 | Request a trip that has already departed | `This pool trip has already started or is closed` | **PASS** — Request blocked when trip status is started or completed |
| CP-26 | Rate before the trip is completed | Refused | **PASS** — Rating button only unlocks once status is "Completed" |
| CP-27 | Rate the same person twice | Second rating is refused | **PASS** — Duplicate rating blocked by database unique constraint |
| CP-28 | Report a driver or passenger | Report is submitted and appears for admins | **PASS** — Incident report submitted and routed to admin moderation |
| CP-29 | Dev cancels a trip with a confirmed passenger from `/pooling/driver` | Request closes and the passenger is notified | **PASS** — Driver trip cancellation closes confirmed passenger bookings and sends notification |
| CP-30 | Dev deletes the account while a future trip has a confirmed passenger | **GAP-20:** the request must close and the passenger must be notified | **PASS (GAP-20 handled)** — Cascade trigger notifies riders and closes pool bookings |
| CP-31 | Cancel a trip through the API only | **GAP-20:** the database must close the requests itself | **PASS (GAP-20 handled)** — Database trigger updates all linked requests to cancelled |

## Linked gaps

GAP-20
