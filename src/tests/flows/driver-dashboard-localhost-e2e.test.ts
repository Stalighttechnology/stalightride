import { describe, expect, test } from "vitest";
import { createBackend } from "../harness/fake-backend";

describe("M10: Driver dashboard localhost and acceptance tests (DD-01 to DD-04)", () => {
  // Helper to initialize driver and backend
  function setupDriver() {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const admin = be.registerAdmin();
    const customer = be.registerCustomer();
    const customer2 = be.registerCustomer();
    const driver = be.enrollDriver(250, 1500, ["city", "airport", "outstation"], "Bengaluru Metro");
    be.verifyDriver(admin, driver.id, "approved");
    return { be, admin, customer, customer2, driver };
  }

  // 1. Verify localhost server is active and driver-dashboard renders
  test("localhost server is running and /driver-dashboard responds on port 8080", async () => {
    const res = await fetch("http://localhost:8080/driver-dashboard");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toMatch(/Driver dashboard/i);
    expect(html).toMatch(/Upcoming|History|Ratings/i);
    expect(html).toMatch(/Earnings|Rating|Hires/i);
  });

  // DD-01: Open the Upcoming tab -> Lists only confirmed future hires, showing pickup address and notes
  test("DD-01: Upcoming tab lists only confirmed future hires, showing pickup address and notes", () => {
    const { be, customer, driver } = setupDriver();

    // 1. Confirmed future hire with pickup address and notes
    const hireFutureConfirmed = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      start_time: "10:00:00",
      end_time: "18:00:00",
      total_price: 3000,
      trip_type: "airport",
      pickup_address: "Terminal 2, Kempegowda International Airport",
      notes: "Flight AI-502 arrival, carrying two large suitcases",
    });
    be.driverDecide(driver.id, hireFutureConfirmed.id, "confirmed");

    // 2. Pending future hire (not yet confirmed)
    const hireFuturePending = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-22",
      end_date: "2026-08-22",
      total_price: 1500,
      trip_type: "city",
    });

    // 3. Past confirmed hire (start date before today)
    const hirePastConfirmed = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-10",
      end_date: "2026-08-10",
      total_price: 1500,
    });
    be.driverDecide(driver.id, hirePastConfirmed.id, "confirmed");

    // 4. Cancelled future hire
    const hireFutureCancelled = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-25",
      end_date: "2026-08-25",
      total_price: 2000,
    });
    be.driverDecide(driver.id, hireFutureCancelled.id, "confirmed");
    be.cancelDriverBooking(customer, hireFutureCancelled.id);

    // Query Upcoming hires as of "2026-08-15"
    const upcoming = be.getDriverUpcomingHires(driver.id, "2026-08-15");

    // Must contain ONLY confirmed future hires
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe(hireFutureConfirmed.id);
    expect(upcoming[0].status).toBe("confirmed");
    expect(upcoming[0].start_date).toBe("2026-08-20");

    // Must show pickup address and notes
    expect(upcoming[0].pickup_address).toBe("Terminal 2, Kempegowda International Airport");
    expect(upcoming[0].notes).toBe("Flight AI-502 arrival, carrying two large suitcases");

    // Must NOT contain pending, past, or cancelled hires
    const upcomingIds = upcoming.map((h) => h.id);
    expect(upcomingIds).not.toContain(hireFuturePending.id);
    expect(upcomingIds).not.toContain(hirePastConfirmed.id);
    expect(upcomingIds).not.toContain(hireFutureCancelled.id);
  });

  // DD-02: Open the History tab -> Shows completed and cancelled hires
  test("DD-02: History tab shows completed and cancelled hires", () => {
    const { be, customer, driver } = setupDriver();

    // 1. Completed hire
    const hireCompleted = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-10",
      end_date: "2026-08-10",
      total_price: 3500,
      trip_type: "outstation",
      notes: "Trip to Nandi Hills completed smoothly",
    });
    be.driverDecide(driver.id, hireCompleted.id, "confirmed");
    be.wallet.topup(customer, 3500);
    be.payDriverBookingWithWallet(customer, hireCompleted.id);
    be.completeDriverBooking(driver.id, hireCompleted.id);
    expect(hireCompleted.status).toBe("completed");

    // 2. Cancelled hire
    const hireCancelled = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-12",
      end_date: "2026-08-12",
      total_price: 2000,
    });
    be.driverDecide(driver.id, hireCancelled.id, "confirmed");
    be.cancelDriverBooking(customer, hireCancelled.id);
    expect(hireCancelled.status).toBe("cancelled");

    // 3. Active confirmed future hire (belongs in Upcoming, not History)
    const hireActive = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      total_price: 3000,
    });
    be.driverDecide(driver.id, hireActive.id, "confirmed");

    // 4. Pending request (belongs in Pending requests, not History)
    const hirePending = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-22",
      end_date: "2026-08-22",
      total_price: 1500,
    });

    // Query History hires
    const history = be.getDriverHistoryHires(driver.id);

    // Must contain exactly the completed and cancelled hires
    expect(history).toHaveLength(2);
    const historyIds = history.map((h) => h.id);
    expect(historyIds).toContain(hireCompleted.id);
    expect(historyIds).toContain(hireCancelled.id);

    // Must not contain active or pending hires
    expect(historyIds).not.toContain(hireActive.id);
    expect(historyIds).not.toContain(hirePending.id);

    // Verify all history entries are strictly completed or cancelled
    for (const h of history) {
      expect(["completed", "cancelled"]).toContain(h.status);
    }
  });

  // DD-03: Open the Ratings tab -> Shows driver_reviews with stars and comments, matching avg_rating
  test("DD-03: Ratings tab shows driver_reviews with stars and comments, matching avg_rating", () => {
    const { be, customer, customer2, driver } = setupDriver();

    // Setup completed hire 1 for Customer 1
    const hire1 = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-10",
      end_date: "2026-08-10",
      total_price: 3000,
    });
    be.driverDecide(driver.id, hire1.id, "confirmed");
    be.completeDriverBooking(driver.id, hire1.id);

    // Setup completed hire 2 for Customer 2
    const hire2 = be.hireDriver({
      customer_id: customer2,
      driver_id: driver.id,
      start_date: "2026-08-12",
      end_date: "2026-08-12",
      total_price: 2500,
    });
    be.driverDecide(driver.id, hire2.id, "confirmed");
    be.completeDriverBooking(driver.id, hire2.id);

    // Customer 1 writes a 5-star review
    const rev1 = be.reviewDriver(
      customer,
      hire1.id,
      5,
      "Excellent, on-time driving and very polite chauffeur!",
    );
    expect(rev1.rating).toBe(5);
    expect(rev1.comment).toBe("Excellent, on-time driving and very polite chauffeur!");

    // Check driver rating recomputed after review 1: avg = 5.0, count = 1
    expect(driver.review_count).toBe(1);
    expect(driver.avg_rating).toBe(5);

    // Customer 2 writes a 4-star review
    const rev2 = be.reviewDriver(
      customer2,
      hire2.id,
      4,
      "Good driving, knows Bengaluru routes well.",
    );
    expect(rev2.rating).toBe(4);
    expect(rev2.comment).toBe("Good driving, knows Bengaluru routes well.");

    // Check driver rating recomputed after review 2: avg = (5+4)/2 = 4.5, count = 2
    expect(driver.review_count).toBe(2);
    expect(driver.avg_rating).toBe(4.5);

    // Fetch driver reviews list for Ratings tab
    const reviews = be.getDriverReviews(driver.id);
    expect(reviews).toHaveLength(2);
    expect(reviews.map((r) => r.rating)).toEqual([5, 4]);
    expect(reviews.map((r) => r.comment)).toEqual([
      "Excellent, on-time driving and very polite chauffeur!",
      "Good driving, knows Bengaluru routes well.",
    ]);

    // Attempting to review the same hire again must be rejected (one review per hire)
    expect(() => be.reviewDriver(customer, hire1.id, 5, "Duplicate")).toThrow(
      /already been reviewed/i,
    );

    // Attempting to review an uncompleted hire must be rejected
    const hireUncompleted = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-25",
      end_date: "2026-08-25",
    });
    expect(() => be.reviewDriver(customer, hireUncompleted.id, 5)).toThrow(
      /Only completed hires/i,
    );
  });

  // DD-04: Check the total-earnings card -> Equals the sum of paid and completed hires
  test("DD-04: Total-earnings card equals the sum of paid and completed hires", () => {
    const { be, customer, driver } = setupDriver();

    // 1. Confirmed and paid hire (₹3,000) -> counted in earnings
    const hirePaid = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      total_price: 3000,
    });
    be.driverDecide(driver.id, hirePaid.id, "confirmed");
    be.wallet.topup(customer, 3000);
    be.payDriverBookingWithWallet(customer, hirePaid.id);
    expect(hirePaid.payment_status).toBe("paid");

    // 2. Completed hire (₹4,500) -> counted in earnings
    const hireCompleted = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-10",
      end_date: "2026-08-12",
      total_price: 4500,
    });
    be.driverDecide(driver.id, hireCompleted.id, "confirmed");
    be.wallet.topup(customer, 4500);
    be.payDriverBookingWithWallet(customer, hireCompleted.id);
    be.completeDriverBooking(driver.id, hireCompleted.id);
    expect(hireCompleted.status).toBe("completed");

    // 3. Unpaid pending hire (₹1,500) -> NOT counted in earnings
    be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-25",
      end_date: "2026-08-25",
      total_price: 1500,
    });

    // 4. Cancelled hire (₹2,000) -> NOT counted in earnings (refunded)
    const hireCancelled = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-28",
      end_date: "2026-08-28",
      total_price: 2000,
    });
    be.driverDecide(driver.id, hireCancelled.id, "confirmed");
    be.wallet.topup(customer, 2000);
    be.payDriverBookingWithWallet(customer, hireCancelled.id);
    be.cancelDriverBooking(customer, hireCancelled.id);
    expect(hireCancelled.status).toBe("cancelled");

    // Total earnings must be ₹3,000 + ₹4,500 = ₹7,500
    const totalEarnings = be.getDriverEarnings(driver.id);
    expect(totalEarnings).toBe(7500);

    // Verify UI component formula matches:
    // (hires ?? []).filter((h) => h.status !== "cancelled" && (h.payment_status === "paid" || h.status === "completed")).reduce((s, h) => s + Number(h.total_price), 0)
    const hiresList = [hirePaid, hireCompleted, hireCancelled];
    const uiEarnings = hiresList
      .filter((h) => h.status !== "cancelled" && (h.payment_status === "paid" || h.status === "completed"))
      .reduce((s, h) => s + Number(h.total_price), 0);

    expect(uiEarnings).toBe(7500);
  });
});

