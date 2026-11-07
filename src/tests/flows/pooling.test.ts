import { describe, expect, test } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";
import { matchScore, isMatch, MATCH_THRESHOLD, haversineKm } from "@/lib/pool-match";

function setup(seats = 3) {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const driver = be.registerCustomer();
  const trip = be.createTrip(driver, { depart_at: "2026-08-20T08:00:00Z", seats_total: seats, fare_per_seat: 250 });
  const p1 = be.registerCustomer();
  const p2 = be.registerCustomer();
  return { be, driver, trip, p1, p2 };
}

describe("pooling route matching", () => {
  const trip = { origin_lat: 12.97, origin_lng: 77.59, dest_lat: 13.35, dest_lng: 77.1, route: [] };

  test("points on the corridor in travel order match", () => {
    const m = matchScore(trip, { lat: 12.99, lng: 77.56 }, { lat: 13.3, lng: 77.15 });
    expect(m.sameDirection).toBe(true);
    expect(isMatch(m)).toBe(true);
  });

  test("reversed direction never matches", () => {
    const m = matchScore(trip, { lat: 13.3, lng: 77.15 }, { lat: 12.99, lng: 77.56 });
    expect(m.sameDirection).toBe(false);
    expect(m.score).toBe(0);
    expect(isMatch(m)).toBe(false);
  });

  test("far-off points fall under the threshold", () => {
    const m = matchScore(trip, { lat: 12.97, lng: 78.9 }, { lat: 13.35, lng: 78.6 });
    expect(m.score).toBeLessThan(MATCH_THRESHOLD);
  });

  test("haversine is symmetric and zero for the same point", () => {
    const a = { lat: 12.97, lng: 77.59 };
    const b = { lat: 13.35, lng: 77.1 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe("seat requests", () => {
  test("a passenger cannot request more seats than are free", () => {
    const { be, trip, p1 } = setup(2);
    expect(() => be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 3, match_score: 95 })).toThrow(/Not enough seats/);
  });

  test("low match scores are rejected", () => {
    const { be, trip, p1 } = setup();
    expect(() => be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 60 })).toThrow(/match/);
  });

  test("the driver cannot join their own trip", () => {
    const { be, trip, driver } = setup();
    expect(() => be.requestSeat({ passenger_id: driver, trip_id: trip.id, seats: 1, match_score: 99 })).toThrow(/own trip/);
  });

  test("duplicate active requests are blocked, and allowed again after cancelling", () => {
    const { be, trip, p1 } = setup();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(() => be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 })).toThrow(/already have an active request/);
    be.cancelPoolRequest(p1, r.id);
    expect(be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }).status).toBe("pending");
  });

  test("a rejected passenger may request again", () => {
    const { be, driver, trip, p1 } = setup();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r.id, "rejected");
    expect(be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }).status).toBe("pending");
  });
});

describe("driver accept / decline and seat accounting", () => {
  test("accepting reduces seats, declining does not", () => {
    const { be, driver, trip, p1, p2 } = setup(3);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 92 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 88 });
    expect(be.poolDecide(driver, r1.id, "confirmed").trip.seats_available).toBe(1);
    expect(be.poolDecide(driver, r2.id, "rejected").trip.seats_available).toBe(1);
    expect(be.notifications.filter((n) => n.user_id === p2 && /declined/.test(n.title))).toHaveLength(1);
  });

  test("seats cannot be oversold", () => {
    const { be, driver, trip, p1, p2 } = setup(2);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 95 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 2, match_score: 95 });
    be.poolDecide(driver, r1.id, "confirmed");
    expect(() => be.poolDecide(driver, r2.id, "confirmed")).toThrow(/Not enough seats/);
    expect(be.tables.trips.get(trip.id)!.seats_available).toBe(0);
  });

  test("a full trip rejects new requests", () => {
    const { be, driver, trip, p1, p2 } = setup(1);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 95 });
    be.poolDecide(driver, r1.id, "confirmed");
    expect(() => be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 95 })).toThrow(/Not enough seats/);
  });

  test("only the trip owner can decide, and only once", () => {
    const { be, trip, p1, p2, driver } = setup();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(() => be.poolDecide(p2, r.id, "confirmed")).toThrow(RuleError);
    be.poolDecide(driver, r.id, "confirmed");
    expect(() => be.poolDecide(driver, r.id, "rejected")).toThrow(/no longer pending/);
  });

  test("an accepted rider cancelling returns the seats", () => {
    const { be, driver, trip, p1 } = setup(3);
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 90 });
    be.poolDecide(driver, r.id, "confirmed");
    expect(be.cancelPoolRequest(p1, r.id).trip.seats_available).toBe(3);
  });

  test("direct seat tampering on the trip row is ignored", () => {
    const { be, trip } = setup(3);
    expect(be.tamperSeats(trip.id, 99).seats_available).toBe(3);
  });
});

describe("trip lifecycle", () => {
  test("completing a trip completes accepted riders and rejects pending ones", () => {
    const { be, driver, trip, p1, p2 } = setup(3);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r1.id, "confirmed");
    be.setTripStatus(driver, trip.id, "completed");
    expect(be.tables.poolRequests.get(r1.id)!.status).toBe("completed");
    expect(be.tables.poolRequests.get(r2.id)!.status).toBe("rejected");
  });

  test("cancelling a trip cancels every open rider and closes new requests", () => {
    const { be, driver, trip, p1, p2 } = setup(3);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r1.id, "confirmed");
    be.setTripStatus(driver, trip.id, "cancelled");
    expect(be.tables.poolRequests.get(r1.id)!.status).toBe("cancelled");
    expect(() => be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 95 })).toThrow(/no longer open/);
  });
});

describe("PS-01: pooling cancellation and settlement policy", () => {
  test("PS-01: pooling bookings have no in-app refund promises and return seats freely on cancellation", () => {
    const { be, driver, trip, p1 } = setup(3);
    const balanceBefore = be.wallet.balance(p1);
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 95 });
    be.poolDecide(driver, r.id, "confirmed");

    // Passenger cancels: seats are immediately restored with no in-app wallet charges/refunds
    const res = be.cancelPoolRequest(p1, r.id);
    expect(res.request.status).toBe("cancelled");
    expect(res.trip.seats_available).toBe(3);
    expect(be.wallet.balance(p1)).toBe(balanceBefore);
  });
});
