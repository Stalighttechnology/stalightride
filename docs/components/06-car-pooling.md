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
| CP-01 | As Dev, publish a trip at `/pooling/new` | `Pooling trip published` | |
| CP-02 | As Asha, search `/pooling` with points on the route | Trip is listed with a match of 80% or more | |
| CP-03 | Request 2 seats with an emergency contact | `Seat requested`, Dev is notified | |
| CP-04 | As Dev, accept at `/pooling/driver` | `Rider accepted — seats updated`, 1 seat remains | |
| CP-05 | As Asha, open `/pooling/mine` | Seat is confirmed and the fare total is ₹400 | |
| CP-06 | As Dev, start and then complete the trip | Status updates at each step | |
| CP-07 | As Asha, rate Dev | Rating is saved | |
| CP-08 | As Dev, rate Asha | Rating is saved | |

## Matching cases

| ID | Passenger route | Expected | Result |
| --- | --- | --- | --- |
| CP-09 | Pickup and drop within 5 km of the route | Score 100 | |
| CP-10 | Points about 10 km from the route | Score 80, trip shown | |
| CP-11 | Points about 15 km from the route | Score 60, trip hidden | |
| CP-12 | Points 30 km or more from the route | Score 0, trip hidden | |
| CP-13 | Near the route but travelling the opposite way | Score 0, trip hidden | |

## Edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CP-14 | Publish with a departure in the past | `Departure must be in the future` | |
| CP-15 | Publish with 9 seats | `Seats must be between 1 and 8` | |
| CP-16 | Publish with a negative fare | `Fare cannot be negative` | |
| CP-17 | Publish without choosing map points | Asks for the start and destination | |
| CP-18 | Dev requests a seat on their own trip | `You cannot join your own pool trip` | |
| CP-19 | Request more seats than are left | `Only N seat(s) left on this trip` | |
| CP-20 | Ben requests while Asha is pending, and Dev accepts both when seats run out | Second accept shows `Not enough seats left to accept this request` | |
| CP-21 | Request the same trip twice | Second active request is refused | |
| CP-22 | Asha cancels a confirmed seat | Seats return to the trip and Dev is notified | |
| CP-23 | Dev declines a request | Asha is notified and seats don't change | |
| CP-24 | Passenger tries to accept their own request through the API | `Only the trip driver can accept passengers` | |
| CP-25 | Request a trip that has already departed | `This pool trip has already started or is closed` | |
| CP-26 | Rate before the trip is completed | Refused | |
| CP-27 | Rate the same person twice | Second rating is refused | |
| CP-28 | Report a driver or passenger | Report is submitted and appears for admins | |
| CP-29 | Dev cancels a trip with a confirmed passenger from `/pooling/driver` | Request closes and the passenger is notified | |
| CP-30 | Dev deletes the account while a future trip has a confirmed passenger | **GAP-20:** the request must close and the passenger must be notified | |
| CP-31 | Cancel a trip through the API only | **GAP-20:** the database must close the requests itself | |

## Linked gaps

GAP-20
