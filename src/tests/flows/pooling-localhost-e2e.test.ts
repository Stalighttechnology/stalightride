import { describe, expect, test } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";
import { matchScore, isMatch, MATCH_THRESHOLD, haversineKm } from "@/lib/pool-match";

describe("M12: Car pooling localhost integration and acceptance tests (PL-01 to PL-14)", () => {
  function setup(seats = 3, departAt = "2026-08-20T08:00:00Z") {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: departAt,
      seats_total: seats,
      fare_per_seat: 250,
      origin_label: "Majestic, Bengaluru",
      origin_lat: 12.9767,
      origin_lng: 77.5713,
      dest_label: "Tumakuru Bus Stand",
      dest_lat: 13.3422,
      dest_lng: 77.1017,
      vehicle_label: "Maruti Ertiga (KA04 AB 1234)",
      notes: "AC ride, non-smoking, light luggage only",
    });
    const p1 = be.registerCustomer();
    const p2 = be.registerCustomer();
    const p3 = be.registerCustomer();
    return { be, driver, trip, p1, p2, p3 };
  }

  // 1. Verify localhost dev server endpoints are active
  test("localhost server is running and responding on port 8080 with pooling routes", async () => {
    const endpoints = [
      { path: "/pooling", label: "Pooling Directory & Search", pattern: /pooling|share a ride|route/i },
      { path: "/pooling/new", label: "Offer a Ride Page", pattern: /offer|route|seats|vehicle/i },
      { path: "/pooling/driver", label: "Driver Pooling Dashboard", pattern: /pooling|trip|passenger/i },
      { path: "/pooling/mine", label: "Passenger My Rides", pattern: /pooling|booking|ride/i },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`http://localhost:8080${ep.path}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.length).toBeGreaterThan(1000);
      expect(html).toMatch(ep.pattern);
    }
  });

  // PL-01: Offer a ride at /pooling/new (route, date and time, seats, price) -> Trip is listed on /pooling
  test("PL-01: Offer a ride at /pooling/new -> Trip is scheduled and listed for public search", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const driver = be.registerCustomer();

    // Driver offers a ride
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T09:00:00Z",
      seats_total: 4,
      fare_per_seat: 300,
      vehicle_label: "Honda City (KA01 MG 9999)",
      origin_label: "Silk Board, Bengaluru",
      origin_lat: 12.9177,
      origin_lng: 77.6238,
      dest_label: "Electronic City Phase 1",
      dest_lat: 12.8452,
      dest_lng: 77.6602,
      notes: "Daily office commute ride",
    });

    expect(trip.id).toBeDefined();
    expect(trip.status).toBe("scheduled");
    expect(trip.seats_available).toBe(4);
    expect(trip.fare_per_seat).toBe(300);
    expect(trip.vehicle_label).toBe("Honda City (KA01 MG 9999)");

    // Listed in public scheduled trips query for /pooling
    const publicTrips = be.getPublicScheduledTrips();
    expect(publicTrips.map((t) => t.id)).toContain(trip.id);
  });

  // PL-02: Trip A->B -> Search a pickup and drop on the corridor, in order -> Matches
  test("PL-02: Trip A->B -> Search pickup and drop on the corridor in order -> Matches", () => {
    const tripCorridor = {
      origin_lat: 12.97,
      origin_lng: 77.59,
      dest_lat: 13.35,
      dest_lng: 77.1,
      route: [],
    };

    // Passenger travels in the same direction along corridor
    const passengerPickup = { lat: 12.99, lng: 77.56 };
    const passengerDrop = { lat: 13.3, lng: 77.15 };

    const m = matchScore(tripCorridor, passengerPickup, passengerDrop);
    expect(m.sameDirection).toBe(true);
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(isMatch(m)).toBe(true);
  });

  // PL-03: Trip A->B -> Search B->A (reversed direction) -> No match
  test("PL-03: Trip A->B -> Search reversed direction B->A -> No match", () => {
    const tripCorridor = {
      origin_lat: 12.97,
      origin_lng: 77.59,
      dest_lat: 13.35,
      dest_lng: 77.1,
      route: [],
    };

    // Passenger travels in reverse direction
    const reversedPickup = { lat: 13.3, lng: 77.15 };
    const reversedDrop = { lat: 12.99, lng: 77.56 };

    const m = matchScore(tripCorridor, reversedPickup, reversedDrop);
    expect(m.sameDirection).toBe(false);
    expect(m.score).toBe(0);
    expect(isMatch(m)).toBe(false);
  });

  // PL-04: Far-off points -> Below the threshold, no match
  test("PL-04: Far-off points -> Below threshold, no match", () => {
    const tripCorridor = {
      origin_lat: 12.97,
      origin_lng: 77.59,
      dest_lat: 13.35,
      dest_lng: 77.1,
      route: [],
    };

    // Far-off coordinates (e.g. Kolar / Chennai highway instead of Tumakuru)
    const farPickup = { lat: 12.97, lng: 78.9 };
    const farDrop = { lat: 13.35, lng: 78.6 };

    const m = matchScore(tripCorridor, farPickup, farDrop);
    expect(m.score).toBeLessThan(MATCH_THRESHOLD);
    expect(isMatch(m)).toBe(false);
  });

  // PL-05: 2 free seats -> Request 3 -> Rejected
  test("PL-05: 2 free seats -> Request 3 -> Rejected", () => {
    const { be, trip, p1 } = setup(2);
    expect(trip.seats_available).toBe(2);

    expect(() =>
      be.requestSeat({
        passenger_id: p1,
        trip_id: trip.id,
        seats: 3,
        match_score: 95,
      }),
    ).toThrow(/Not enough seats available/i);
  });

  // PL-06: The driver requests their own trip -> Rejected
  test("PL-06: Driver requests their own trip -> Rejected", () => {
    const { be, trip, driver } = setup();

    expect(() =>
      be.requestSeat({
        passenger_id: driver,
        trip_id: trip.id,
        seats: 1,
        match_score: 99,
      }),
    ).toThrow(/You cannot join your own trip/i);
  });

  // PL-07: Active request -> Request again -> Blocked. Allowed again after cancelling or being rejected
  test("PL-07: Duplicate active request blocked; allowed after cancelling or being rejected", () => {
    const { be, driver, trip, p1 } = setup(3);

    // Initial request
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(r1.status).toBe("pending");

    // Duplicate request while active is blocked
    expect(() =>
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }),
    ).toThrow(/You already have an active request/i);

    // Cancel request -> allowed again
    be.cancelPoolRequest(p1, r1.id);
    const r2 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(r2.status).toBe("pending");

    // Driver rejects -> allowed again
    be.poolDecide(driver, r2.id, "rejected");
    const r3 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(r3.status).toBe("pending");
  });

  // PL-08: Driver accepts -> Seats go down. Declining doesn't change them
  test("PL-08: Driver accepts -> Seats go down; declining does not change seats", () => {
    const { be, driver, trip, p1, p2 } = setup(3);

    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 92 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 88 });

    // Accept r1 (2 seats): 3 - 2 = 1 seat left
    const acceptRes = be.poolDecide(driver, r1.id, "confirmed");
    expect(acceptRes.trip.seats_available).toBe(1);

    // Decline r2 (1 seat): seats remain 1
    const declineRes = be.poolDecide(driver, r2.id, "rejected");
    expect(declineRes.trip.seats_available).toBe(1);
  });

  // PL-09: Concurrent accepts beyond capacity -> Seats never oversold. A full trip rejects new requests
  test("PL-09: Seats never oversold beyond capacity; full trip rejects new requests", () => {
    const { be, driver, trip, p1, p2, p3 } = setup(2);

    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 95 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 2, match_score: 95 });

    // Driver accepts r1: takes all 2 seats
    be.poolDecide(driver, r1.id, "confirmed");
    expect(trip.seats_available).toBe(0);

    // Attempting to accept r2 beyond capacity is rejected
    expect(() => be.poolDecide(driver, r2.id, "confirmed")).toThrow(
      /Not enough seats left to accept this rider/i,
    );

    // A full trip rejects new seat requests
    expect(() =>
      be.requestSeat({ passenger_id: p3, trip_id: trip.id, seats: 1, match_score: 95 }),
    ).toThrow(/Not enough seats available/i);
  });

  // PL-10: Edit seats_available directly on the trip row -> The change is ignored
  test("PL-10: Direct seat tampering on the trip row is ignored", () => {
    const { be, trip } = setup(3);
    expect(trip.seats_available).toBe(3);

    // Malicious direct update / tampering
    const tampered = be.tamperSeats(trip.id, 99);
    expect(tampered.seats_available).toBe(3);
    expect(be.tables.trips.get(trip.id)!.seats_available).toBe(3);
  });

  // PL-11: Accepted rider cancels -> Seats returned
  test("PL-11: Accepted rider cancels -> Seats returned to the pool", () => {
    const { be, driver, trip, p1 } = setup(3);

    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 90 });
    be.poolDecide(driver, r.id, "confirmed");
    expect(trip.seats_available).toBe(1);

    // Rider cancels: 2 seats returned
    const cancelRes = be.cancelPoolRequest(p1, r.id);
    expect(cancelRes.request.status).toBe("cancelled");
    expect(cancelRes.trip.seats_available).toBe(3);
  });

  // PL-12: Trip with riders -> Driver completes the trip -> Accepted riders completed, pending ones rejected
  test("PL-12: Driver completes trip -> Accepted riders marked completed, pending rejected", () => {
    const { be, driver, trip, p1, p2 } = setup(3);

    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 90 });

    be.poolDecide(driver, r1.id, "confirmed"); // r1 accepted, r2 left pending

    // Driver completes the trip
    be.setTripStatus(driver, trip.id, "completed");

    expect(be.tables.trips.get(trip.id)!.status).toBe("completed");
    expect(be.tables.poolRequests.get(r1.id)!.status).toBe("completed");
    expect(be.tables.poolRequests.get(r2.id)!.status).toBe("rejected");
  });

  // PL-13: Trip with riders -> Driver cancels the trip -> All open riders cancelled, no new requests possible
  test("PL-13: Driver cancels trip -> All open riders cancelled, new requests closed", () => {
    const { be, driver, trip, p1, p2, p3 } = setup(3);

    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r1.id, "confirmed");

    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 90 });

    // Driver cancels the trip
    be.setTripStatus(driver, trip.id, "cancelled");

    expect(be.tables.trips.get(trip.id)!.status).toBe("cancelled");
    expect(be.tables.poolRequests.get(r1.id)!.status).toBe("cancelled");
    expect(be.tables.poolRequests.get(r2.id)!.status).toBe("cancelled");

    // No new requests can be made to a cancelled trip
    expect(() =>
      be.requestSeat({ passenger_id: p3, trip_id: trip.id, seats: 1, match_score: 95 }),
    ).toThrow(/This trip is no longer open/i);
  });

  // PL-14: Departure passed -> Request a seat -> Rejected
  test("PL-14: Departure passed -> Requesting a seat is strictly rejected", () => {
    const { be, trip, p1 } = setup(3, "2026-08-20T08:00:00Z");

    // Fast-forward clock past the departure time: 2026-08-20T08:05:00Z
    be.setNow("2026-08-20T08:05:00Z");

    // Attempting to request a seat after departure time
    expect(() =>
      be.requestSeat({
        passenger_id: p1,
        trip_id: trip.id,
        seats: 1,
        match_score: 95,
      }),
    ).toThrow(/This trip has already departed/i);
  });
});

