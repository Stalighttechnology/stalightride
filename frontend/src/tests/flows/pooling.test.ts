import { describe, expect, test } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";
import {
  matchScore,
  isMatch,
  MATCH_THRESHOLD,
  haversineKm,
  isFourPointRoute,
  getFourPointRoute,
  getRouteStops,
} from "@/lib/pool-match";

function setup(seats = 3) {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const driver = be.registerCustomer();
  const trip = be.createTrip(driver, {
    depart_at: "2026-08-20T08:00:00Z",
    seats_total: seats,
    fare_per_seat: 250,
  });
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

describe("4-point route corridor matching", () => {
  // Bangalore route corridor: Rajajinagar -> Majestic -> Lalbagh -> Jayanagar
  const bangalore4PointTrip = {
    origin_label: "Rajajinagar",
    origin_lat: 12.9982,
    origin_lng: 77.553,
    dest_label: "Jayanagar",
    dest_lat: 12.925,
    dest_lng: 77.5938,
    route: [
      { lat: 12.9767, lng: 77.5713, label: "Majestic", order: 1 },
      { lat: 12.9507, lng: 77.5848, label: "Lalbagh", order: 2 },
    ],
  };

  test("validates 4-point routes correctly", () => {
    expect(isFourPointRoute(bangalore4PointTrip)).toBe(true);
    expect(isFourPointRoute({ ...bangalore4PointTrip, route: [] })).toBe(false);
    expect(
      isFourPointRoute({
        ...bangalore4PointTrip,
        route: [{ lat: 12.9767, lng: 77.5713, label: "Majestic", order: 1 }],
      }),
    ).toBe(false);

    const stops = getRouteStops(bangalore4PointTrip);
    expect(stops).toHaveLength(4);
    expect(stops[0]?.label).toBe("Rajajinagar");
    expect(stops[1]?.label).toBe("Majestic");
    expect(stops[2]?.label).toBe("Lalbagh");
    expect(stops[3]?.label).toBe("Jayanagar");

    const fourPoint = getFourPointRoute(bangalore4PointTrip);
    expect(fourPoint).not.toBeNull();
    expect(fourPoint![0].lat).toBe(12.9982);
    expect(fourPoint![3].lat).toBe(12.925);
  });

  test("passenger from Rajajinagar to South End Circle matches on the 4-point corridor", () => {
    // South End Circle (lat 12.9363, lng 77.5802) is situated on the 3rd leg between Lalbagh and Jayanagar
    const passengerPickup = { lat: 12.9982, lng: 77.553 }; // Rajajinagar
    const passengerDrop = { lat: 12.9363, lng: 77.5802 }; // South End Circle

    const result = matchScore(bangalore4PointTrip, passengerPickup, passengerDrop);

    expect(result.sameDirection).toBe(true);
    expect(result.pickupDistanceKm).toBeLessThan(1.0);
    expect(result.dropDistanceKm).toBeLessThan(1.5);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(isMatch(result)).toBe(true);
    expect(result.pickupLegIndex).toBe(0);
    expect(result.dropLegIndex).toBe(2);
  });

  test("intermediate sub-trip (Majestic to Lalbagh) matches on leg 1 of the corridor", () => {
    const passengerPickup = { lat: 12.9767, lng: 77.5713 }; // Majestic
    const passengerDrop = { lat: 12.9507, lng: 77.5848 }; // Lalbagh

    const result = matchScore(bangalore4PointTrip, passengerPickup, passengerDrop);

    expect(result.sameDirection).toBe(true);
    expect(result.pickupDistanceKm).toBeLessThan(0.1);
    expect(result.dropDistanceKm).toBeLessThan(0.1);
    expect(result.score).toBe(100);
    expect(isMatch(result)).toBe(true);
  });

  test("reversed travel direction along corridor fails (South End Circle to Rajajinagar)", () => {
    const passengerPickup = { lat: 12.9363, lng: 77.5802 }; // South End Circle
    const passengerDrop = { lat: 12.9982, lng: 77.553 }; // Rajajinagar

    const result = matchScore(bangalore4PointTrip, passengerPickup, passengerDrop);

    expect(result.sameDirection).toBe(false);
    expect(result.score).toBe(0);
    expect(isMatch(result)).toBe(false);
  });

  test("off-corridor passenger search does not match", () => {
    // Whitefield to Electronic City is perpendicular/off the Rajajinagar-Jayanagar corridor
    const passengerPickup = { lat: 12.9698, lng: 77.75 };
    const passengerDrop = { lat: 12.8452, lng: 77.6602 };

    const result = matchScore(bangalore4PointTrip, passengerPickup, passengerDrop);

    expect(result.score).toBeLessThan(MATCH_THRESHOLD);
    expect(isMatch(result)).toBe(false);
  });
});

describe("seat requests", () => {
  test("a passenger cannot request more seats than are free", () => {
    const { be, trip, p1 } = setup(2);
    expect(() =>
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 3, match_score: 95 }),
    ).toThrow(/Not enough seats/);
  });

  test("low match scores are rejected", () => {
    const { be, trip, p1 } = setup();
    expect(() =>
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 60 }),
    ).toThrow(/match/);
  });

  test("the driver cannot join their own trip", () => {
    const { be, trip, driver } = setup();
    expect(() =>
      be.requestSeat({ passenger_id: driver, trip_id: trip.id, seats: 1, match_score: 99 }),
    ).toThrow(/own trip/);
  });

  test("duplicate active requests are blocked, and allowed again after cancelling", () => {
    const { be, trip, p1 } = setup();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(() =>
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }),
    ).toThrow(/already have an active request/);
    be.cancelPoolRequest(p1, r.id);
    expect(
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }).status,
    ).toBe("pending");
  });

  test("a rejected passenger may request again", () => {
    const { be, driver, trip, p1 } = setup();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r.id, "rejected");
    expect(
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }).status,
    ).toBe("pending");
  });
});

describe("driver accept / decline and seat accounting", () => {
  test("accepting reduces seats, declining does not", () => {
    const { be, driver, trip, p1, p2 } = setup(3);
    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 2, match_score: 92 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 88 });
    expect(be.poolDecide(driver, r1.id, "confirmed").trip.seats_available).toBe(1);
    expect(be.poolDecide(driver, r2.id, "rejected").trip.seats_available).toBe(1);
    expect(
      be.notifications.filter((n) => n.user_id === p2 && /declined/.test(n.title)),
    ).toHaveLength(1);
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
    expect(() =>
      be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 95 }),
    ).toThrow(/Not enough seats/);
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
    expect(() =>
      be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 95 }),
    ).toThrow(/no longer open/);
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

describe("pooling ratings and reports (PR-01, PR-02, Task 2.8)", () => {
  test("PR-01: Passenger rates the driver after trip completion, blocked before completion and on duplicates", () => {
    const { be, driver, trip, p1 } = setup(3);
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    be.poolDecide(driver, r.id, "confirmed");

    // 1. Attempt to rate while trip is still scheduled
    expect(() =>
      be.ratePoolTrip(p1, {
        trip_id: trip.id,
        request_id: r.id,
        ratee_id: driver,
        role: "passenger_to_driver",
        rating: 5,
        comment: "Great driving!",
      }),
    ).toThrow(/completed trips/);

    // Start trip
    be.setTripStatus(driver, trip.id, "started");
    expect(() =>
      be.ratePoolTrip(p1, {
        trip_id: trip.id,
        request_id: r.id,
        ratee_id: driver,
        role: "passenger_to_driver",
        rating: 5,
      }),
    ).toThrow(/completed trips/);

    // Complete trip
    be.setTripStatus(driver, trip.id, "completed");

    // 2. Rate driver after completion -> saved
    const ratingRow = be.ratePoolTrip(p1, {
      trip_id: trip.id,
      request_id: r.id,
      ratee_id: driver,
      role: "passenger_to_driver",
      rating: 5,
      comment: "Smooth highway drive, very polite!",
    });

    expect(ratingRow.rating).toBe(5);
    expect(ratingRow.role).toBe("passenger_to_driver");
    expect(be.tables.poolRatings.get(ratingRow.id)).toBeDefined();

    // 3. Attempt to rate second time for the same trip -> rejected
    expect(() =>
      be.ratePoolTrip(p1, {
        trip_id: trip.id,
        request_id: r.id,
        ratee_id: driver,
        role: "passenger_to_driver",
        rating: 4,
      }),
    ).toThrow(/already submitted/);

    // 4. Reverse direction: driver rates passenger -> saved once
    const driverRating = be.ratePoolTrip(driver, {
      trip_id: trip.id,
      request_id: r.id,
      ratee_id: p1,
      role: "driver_to_passenger",
      rating: 5,
      comment: "On time at pickup point.",
    });
    expect(driverRating.role).toBe("driver_to_passenger");
    expect(driverRating.ratee_id).toBe(p1);

    // Driver rating same passenger again -> rejected
    expect(() =>
      be.ratePoolTrip(driver, {
        trip_id: trip.id,
        request_id: r.id,
        ratee_id: p1,
        role: "driver_to_passenger",
        rating: 4,
      }),
    ).toThrow(/already submitted/);
  });

  test("PR-02: Report a ride with a reason -> user_reports row created and visible to admin moderation", () => {
    const { be, driver, trip, p1 } = setup(3);
    const admin = be.registerAdmin();

    const r = be.requestSeat({
      passenger_id: p1,
      trip_id: trip.id,
      seats: 1,
      match_score: 92,
      emergency_contact: "+91 9876543210",
    });
    expect(r.emergency_contact).toBe("+91 9876543210");

    be.poolDecide(driver, r.id, "confirmed");

    // Passenger reports driver / trip
    const report = be.reportUser(p1, {
      reported_user_id: driver,
      target_type: "pooling_trip",
      target_id: trip.id,
      reason: "Reckless driving over speed limit",
      details: "Driver was speeding at 130 km/h in monsoon weather",
    });

    expect(report.status).toBe("pending");
    expect(report.reason).toBe("Reckless driving over speed limit");
    expect(be.tables.userReports.get(report.id)).toBeDefined();

    // Admin moderates report
    const resolved = be.adminDecideUserReport(
      admin,
      report.id,
      "resolved",
      "Driver issued speed warning",
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.admin_notes).toBe("Driver issued speed warning");

    // Non-admin cannot moderate
    expect(() => be.adminDecideUserReport(p1, report.id, "dismissed")).toThrow(/admins/);
  });
});

describe("pooling booking windows and driver response stats", () => {
  test("requests less than 1 hour before departure are refused", () => {
    const be = createBackend(new Date("2026-08-20T07:15:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z", // 45 mins away (< 1h)
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();

    expect(() =>
      be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 }),
    ).toThrow(/Requests close 1 hour before departure/);
  });

  test("respond_by is set to booking deadline on insert", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z", // 4h away
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();

    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    expect(r.respond_by).toBeDefined();
    // 4h away with 30m buffer -> halfway is 2h -> 06:00:00Z
    expect(new Date(r.respond_by!).getTime()).toBe(new Date("2026-08-20T06:00:00Z").getTime());
  });

  test("accepting after respond_by deadline fails", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z",
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });

    // Advance clock past respond_by (06:00Z)
    be.setNow(new Date("2026-08-20T07:00:00Z"));

    expect(() => be.poolDecide(driver, r.id, "confirmed")).toThrow(/This request has expired/);
  });

  test("expireBookingWindows cancels expired requests with Driver didn't respond", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z",
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });

    be.setNow(new Date("2026-08-20T07:00:00Z")); // past 06:00Z respond_by
    const res = be.expireBookingWindows();
    expect(res.pool_expired_pending).toBe(1);

    const updated = be.tables.poolRequests.get(r.id)!;
    expect(updated.status).toBe("rejected");
    expect(updated.cancellation_reason).toBe("Driver didn't respond");
    expect(
      be.notifications.some(
        (n) => n.user_id === p1 && n.title === "Request expired" && n.body?.includes("did not respond"),
      ),
    ).toBe(true);
  });

  test("departure closes pending requests with Trip departed", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z",
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });

    // Advance clock past departure
    be.setNow(new Date("2026-08-20T09:00:00Z"));
    const res = be.expireBookingWindows();
    expect(res.pool_expired_pending).toBe(1);

    const updated = be.tables.poolRequests.get(r.id)!;
    expect(updated.status).toBe("rejected");
    expect(updated.cancellation_reason).toBe("Trip departed");
  });

  test("halfway reminder sent to driver once", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z",
      seats_total: 3,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();
    const r = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    // respond_by is 06:00Z, halfway is 05:00Z

    be.setNow(new Date("2026-08-20T05:30:00Z")); // past halfway, before respond_by
    const res1 = be.expireBookingWindows();
    expect(res1.pool_reminded_respond).toBe(1);

    const updated = be.tables.poolRequests.get(r.id)!;
    expect(updated.respond_reminded_at).toBeDefined();

    // Second call does not send duplicate reminder
    const res2 = be.expireBookingWindows();
    expect(res2.pool_reminded_respond).toBe(0);
  });

  test("pool driver response stats calculates rate correctly", () => {
    const be = createBackend(new Date("2026-08-20T04:00:00Z"));
    const driver = be.registerCustomer();
    const trip = be.createTrip(driver, {
      depart_at: "2026-08-20T08:00:00Z",
      seats_total: 4,
      fare_per_seat: 200,
    });
    const p1 = be.registerCustomer();
    const p2 = be.registerCustomer();

    const r1 = be.requestSeat({ passenger_id: p1, trip_id: trip.id, seats: 1, match_score: 90 });
    const r2 = be.requestSeat({ passenger_id: p2, trip_id: trip.id, seats: 1, match_score: 90 });

    // Driver accepts r1 in time
    be.poolDecide(driver, r1.id, "confirmed");

    // r2 expires without response
    be.setNow(new Date("2026-08-20T07:00:00Z"));
    be.expireBookingWindows();

    const stats = be.poolDriverResponseStats(driver);
    expect(stats.request_count).toBe(2);
    expect(stats.response_rate).toBe(0.5);
  });
});
