# Person 2: Services and providers

**Owns:** driver hire and the driver dashboard, vehicle wash, vehicle cleaner role, washing-center role, car pooling.
**Main files:** `routes/{drivers,driver.$id,wash,pooling}.tsx`, `routes/_authenticated/{driver-dashboard,hires,washes,cleaner-dashboard,wash-center-dashboard,pooling.new,pooling.mine,pooling.driver}.tsx`, `lib/{driver-payments,wash-payments}.functions.ts`, `lib/pool-match.ts`.

Source of truth: `local/PROJECT_STATUS.md` (snapshot `0400bd7`, 2026-11-07). The shared rules for all three people are in `person-1-money-and-bookings.md`.

---

## Tasks (in order)

| # | Task | Status file ref | Size |
|---|---|---|---|
| 2.1 | **Urgent: driver onboarding is broken.** Migration: `ALTER TABLE drivers ADD trip_types text[] NOT NULL DEFAULT '{}', ADD service_area text`. Mirror both columns into `public_drivers`. Regenerate the types and remove the `as any` casts. | §2 #1 | S | ✅ Done |
| 2.2 | Hire card: save the trip type in its own `driver_bookings.trip_type` column instead of the `[Trip: X]` prefix in `notes`. Filter `/drivers` by trip type and service area. | §1 Hire | S | ✅ Done |
| 2.3 | **Wash pipeline.** Migration: add a `wash_status` enum (`requested, confirmed, assigned, on_the_way, started, completed, cancelled, rejected`), or a `progress` column alongside `status`. Add an UPDATE policy (or `advance_wash_status` RPC) for the assigned cleaner or center that only allows forward moves. Add a `before_photos` / `after_photos` text[]. | §2 #8 | L | ✅ Done |
| 2.4 | **Roles.** Add `cleaner` and `wash_center` to `app_role` (**announce this, it's a shared enum**). Add `cleaners` and `wash_centers` profile tables with `verification_status`, plus `wash_center_staff` and `wash_center_packages`. Move both dashboards off `localStorage`. Admin verification for both goes in the existing admin page; coordinate the tab with Person 3. | §3 | L | ✅ Done |
| 2.5 | Cleaner job board: a `claim_wash_job(id)` RPC that only lets a verified cleaner in the same city claim an unassigned, confirmed job. It must be atomic, with no double claims. | §3 | M | ✅ Done |
| 2.6 | `wash_reviews` table (one per completed wash, written by the customer) plus a trigger that keeps the cleaner or center average rating up to date. | §2 #7 | M | ✅ Done |
| 2.7 | Pooling: fix the cancellation banner (pooling has **no** refunds today). Either remove it or build pooling payments. Ask the product owner. | §1 Pooling | S | ✅ Done |
| 2.8 | Pooling ratings and reports: `pool_ratings` (both directions, completed trips only) and `user_reports` (shared with Person 3's moderation work, agree on the schema together). Store the emergency contact in its own column. | §3 | M | ✅ Done |
| 2.9 | Fake-backend and flow tests for 2.1–2.8. | §4 | M | ✅ Done |

**Dependencies:** Person 1's payouts (1.4) needs 2.4. Person 3's broadcast targeting "cleaners" needs 2.4.

---

## Test cases: implemented modules (regression)

Legend for the **Auto** column: ✅ covered by vitest · ❌ manual only.

### M7. Driver profiles and verification

| ID | Precondition | Steps | Expected | Auto |
|---|---|---|---|---|
| DR-01 | — | Create a driver profile with licence and ID uploads | Saved as `pending` with trip types and service area | ✅ driver-hire |
| DR-02 | Driver pending | Look in `/drivers` | Not listed and can't be hired | ✅ driver-hire |
| DR-03 | Driver pending | Admin approves | Listed. Rejecting hides the driver again, with the reason shown to them. | ✅ driver-hire |
| DR-04 | Non-admin | Try to verify a driver | Blocked | ✅ driver-hire |
| DR-05 | Approved driver | Toggle availability to paused in the dashboard | Hidden from search. `/driver/<id>` shows "not accepting bookings". | ✅ driver-hire |
| DR-06 | — | Open `/driver/<id>` logged out | Only `public_drivers` fields are shown (no phone or documents) | ✅ driver-hire |

### M8. Driver hire

| ID | Precondition | Steps | Expected | Auto |
|---|---|---|---|---|
| DH-01 | — | Hourly hire 10:00–13:20 on the same day | Billed ceil(3.33) = 4 hours | ✅ |
| DH-02 | — | Hourly hire spanning two days | Rejected | ✅ |
| DH-03 | — | End time before start time | Rejected | ✅ |
| DH-04 | — | Daily hire from the 10th to the 12th | 3 days (inclusive) | ✅ |
| DH-05 | Driver with no rate set | Hire | An error, never a ₹0 hire | ✅ |
| DH-06 | Pending hire | Driver accepts, customer pays from the wallet | Paid. The driver's wallet is credited and the driver notified. | ✅ |
| DH-07 | Pending hire | Driver declines | Customer notified, payment blocked | ✅ |
| DH-08 | Driver booked 10–12 | Another customer hires 11–13 | Rejected as an overlap | ✅ |
| DH-09 | — | Driver B tries to decide driver A's request | Blocked | ✅ |
| DH-10 | Confirmed hire | Pay with Razorpay, then replay the verify payload | Credited once | ✅ |
| DH-11 | — | Choose trip type "Airport" on the hire card | The driver sees the trip type on the request | ✅ |

### M9. Driver hire cancellation

| ID | Steps | Expected | Auto |
|---|---|---|---|
| DC-01 | Paid, start more than 24h away, customer cancels | 100% | ✅ |
| DC-02 | Paid, start inside 24h | 50% | ✅ |
| DC-03 | Paid, start less than 2h away, then cancel again | 0%, and the second cancel is rejected | ✅ |
| DC-04 | The driver cancels a paid hire | Customer gets 100% | ✅ |
| DC-05 | Another customer cancels | Blocked | ✅ |

### M10. Driver dashboard

| ID | Steps | Expected | Auto |
|---|---|---|---|
| DD-01 | Open the Upcoming tab | Lists only confirmed future hires, showing the pickup address and notes | ✅ driver-dashboard |
| DD-02 | Open the History tab | Shows completed and cancelled hires | ✅ driver-dashboard |
| DD-03 | Open the Ratings tab | Shows `driver_reviews` with stars and comments, matching `avg_rating` | ✅ driver-dashboard |
| DD-04 | Check the total-earnings card | Equals the sum of paid and completed hires | ✅ driver-dashboard |

### M11. Vehicle wash (customer and admin)

| ID | Precondition | Steps | Expected | Auto |
|---|---|---|---|---|
| WS-01 | — | Book a wash slot at an address on `/wash` | Created as `pending`, not yet payable | ✅ wash-and-wallet |
| WS-02 | Pending wash | Admin approves without a vendor | Rejected (a vendor is required) | ✅ |
| WS-03 | Pending wash | Admin approves with a vendor | `confirmed`, now payable | ✅ |
| WS-04 | — | Admin decides twice, or a non-admin decides | Blocked | ✅ |
| WS-05 | Rejected wash | Try to pay | Blocked | ✅ |
| WS-06 | Confirmed wash | Pay from the wallet or Razorpay | Paid. Shows under `/washes`, receipt at `/receipt/wash/<id>`. | ✅ (wallet) |
| WS-07 | Paid wash | Cancel at more than 24h, 2–24h, and less than 2h before | 100 / 50 / 0% refund | ✅ |
| WS-08 | — | A stranger pays or cancels someone else's wash | Blocked | ✅ |

### M12. Car pooling

| ID | Precondition | Steps | Expected | Auto |
|---|---|---|---|---|
| PL-01 | — | Offer a ride at `/pooling/new` (route, date and time, seats, price) | The trip is listed on `/pooling` | ✅ pooling-localhost-e2e |
| PL-02 | Trip A→B | Search a pickup and drop on the corridor, in order | Matches | ✅ pooling |
| PL-03 | Trip A→B | Search B→A | No match | ✅ |
| PL-04 | — | Far-off points | Below the threshold, no match | ✅ |
| PL-05 | 2 free seats | Request 3 | Rejected | ✅ |
| PL-06 | — | The driver requests their own trip | Rejected | ✅ |
| PL-07 | Active request | Request again | Blocked. Allowed again after cancelling or being rejected. | ✅ |
| PL-08 | — | Driver accepts | Seats go down. Declining doesn't change them. | ✅ |
| PL-09 | — | Concurrent accepts beyond capacity | Seats never oversold. A full trip rejects new requests. | ✅ |
| PL-10 | — | Edit `seats_available` directly on the trip row | The change is ignored | ✅ |
| PL-11 | Accepted rider | Rider cancels | Seats returned | ✅ |
| PL-12 | Trip with riders | Driver completes the trip | Accepted riders completed, pending ones rejected | ✅ |
| PL-13 | Trip with riders | Driver cancels the trip | All open riders cancelled, no new requests possible | ✅ |
| PL-14 | Departure passed | Request a seat | Rejected | ✅ pooling-localhost-e2e |

---

## Test cases: acceptance for your tasks

| ID | Task | Steps | Expected |
|---|---|---|---|
| DO-01 | 2.1 | New driver saves a profile with trip types `[airport, outstation]` and service area "Bengaluru + 100 km" | Saved. Both show on `/driver/<id>`. |
| DO-02 | 2.1 | Existing driver edits their bio only | Saves with no errors |
| DO-03 | 2.2 | Filter `/drivers` by "Airport" | Only drivers with that trip type are listed |
| WP-01 | 2.3 | Assigned cleaner moves the job confirmed → on_the_way → started → completed | Each step is saved. The customer's stepper updates and they're notified. |
| WP-02 | 2.3 | The cleaner tries to skip back (started → on_the_way), or an unassigned cleaner updates the job | Rejected |
| WP-03 | 2.3 | Complete a job without after photos | Rejected, if photos are made mandatory |
| RL-01 | 2.4 | A user signs up as a cleaner | `cleaners` row is `pending`. The dashboard shows "awaiting verification". |
| RL-02 | 2.4 | Admin approves the cleaner | The cleaner sees the job board. The profile is still there after a browser clear (it's no longer in `localStorage`). |
| RL-03 | 2.4 | A wash center adds staff and packages, then logs in on another device | The data is the same |
| CJ-01 | 2.5 | Two cleaners claim the same job at once | Exactly one succeeds |
| CJ-02 | 2.5 | Unverified cleaner, or a cleaner from another city, claims a job | Rejected |
| WR-01 | 2.6 | Customer reviews a completed wash | Saved. The provider's average updates. |
| WR-02 | 2.6 | Review an uncompleted wash, or review the same wash twice | Rejected |
| PS-01 | 2.7 | Open `/pooling` | No refund promise that the backend doesn't honour |
| PR-01 | 2.8 | Passenger rates the driver after the trip is completed | Saved once. Before completion, rating is blocked. |
| PR-02 | 2.8 | Report a ride with a reason | A `user_reports` row is created and visible to admin moderation (Person 3) |
