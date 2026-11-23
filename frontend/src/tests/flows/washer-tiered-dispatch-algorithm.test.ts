import { describe, it, expect, beforeEach } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";

describe("Washer Tiered Dispatch Algorithm: First 3, Next 5, Then Open", () => {
  let b: ReturnType<typeof createBackend>;
  let admin: string;
  let customer: string;

  beforeEach(() => {
    b = createBackend(new Date("2026-08-20T08:00:00+05:30"));
    admin = b.registerAdmin();
    customer = b.registerCustomer("approved", "cust@example.com");
  });

  /* ------------------------------------------------------------------
   * Test 1: Tier 1 - Top 3 washers within 5 km exclusively see the job
   * ------------------------------------------------------------------ */
  it("Tier 1: strictly top 3 ranked washers within 5 km see the job; washer #4 and washers >5 km are excluded", () => {
    // Register 5 cleaners in Bangalore all within 5 km of customer location (12.9716, 77.5946)
    // Ranked by rating: 5.0, 4.9, 4.8, 4.7, 4.6
    const cleaners: string[] = [];
    const ratings = [5.0, 4.9, 4.8, 4.7, 4.6];

    for (let i = 0; i < 5; i++) {
      const u = b.registerCustomer("approved", `cleaner${i + 1}@example.com`);
      b.registerCleaner({
        id: u,
        full_name: `Washer ${i + 1}`,
        city: "Bangalore",
        experience_years: 5 - i,
        available: true,
        services: ["Doorstep Car Wash"],
        base_lat: 12.9716 + i * 0.005, // all within 0 to 2.5 km (< 5 km)
        base_lng: 77.5946,
        radius_km: 8,
        avg_rating: ratings[i],
      });
      b.verifyCleaner(admin, u, "approved");
      cleaners.push(u);
    }

    // Register cleaner 6: 7 km away (> 5 km), radius 10 km, rating 5.0
    const u6 = b.registerCustomer("approved", "cleaner6@example.com");
    b.registerCleaner({
      id: u6,
      full_name: "Washer 6 (7km away)",
      city: "Bangalore",
      experience_years: 4,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 13.035, // ~7 km away
      base_lng: 77.5946,
      radius_km: 10,
      avg_rating: 5.0,
    });
    b.verifyCleaner(admin, u6, "approved");

    // Book wash for 48 hours later (lead time > 24h: Tier 1 lasts 4 hours)
    const wash = b.bookWash(
      customer,
      "2026-08-22",
      499,
      "Bangalore",
      "MG Road, Central",
      "10:00",
      null,
      12.9716,
      77.5946,
    );
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, wash.id);

    // At T = 0 (paid_at), we are in Tier 1:
    // Only top 3 rated cleaners within 5 km should see the job on their job board:
    // Cleaner 1 (5.0), Cleaner 2 (4.9), Cleaner 3 (4.8) -> CAN SEE
    // Cleaner 4 (4.7) -> CANNOT SEE (ranked #4)
    // Cleaner 5 (4.6) -> CANNOT SEE (ranked #5)
    // Cleaner 6 (5.0, but 7 km away) -> CANNOT SEE (> 5 km)

    expect(b.canCleanerSeeJob(cleaners[0], wash.id)).toBe(true);
    expect(b.canCleanerSeeJob(cleaners[1], wash.id)).toBe(true);
    expect(b.canCleanerSeeJob(cleaners[2], wash.id)).toBe(true);
    expect(b.canCleanerSeeJob(cleaners[3], wash.id)).toBe(false);
    expect(b.canCleanerSeeJob(cleaners[4], wash.id)).toBe(false);
    expect(b.canCleanerSeeJob(u6, wash.id)).toBe(false);

    // Verify job board contents
    expect(b.washJobBoard(cleaners[0]).some((j) => j.id === wash.id)).toBe(true);
    expect(b.washJobBoard(cleaners[3]).some((j) => j.id === wash.id)).toBe(false);
    expect(b.washJobBoard(u6).some((j) => j.id === wash.id)).toBe(false);
  });

  /* ------------------------------------------------------------------
   * Test 2: Tier 2 - Next eligible washers within their radius (Next 5 / radius expansion)
   * ------------------------------------------------------------------ */
  it("Tier 2: after Tier 1 window elapses, next washers within their operating radius can now see the job", () => {
    // Cleaner A: 2 km away, radius 5 km
    const uA = b.registerCustomer("approved", "washerA@example.com");
    b.registerCleaner({
      id: uA,
      full_name: "Washer A (2km)",
      city: "Bangalore",
      experience_years: 5,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 12.98,
      base_lng: 77.5946,
      radius_km: 5,
      avg_rating: 4.9,
    });
    b.verifyCleaner(admin, uA, "approved");

    // Cleaner B: 6.5 km away, radius 8 km (cannot see in Tier 1, but can in Tier 2)
    const uB = b.registerCustomer("approved", "washerB@example.com");
    b.registerCleaner({
      id: uB,
      full_name: "Washer B (6.5km)",
      city: "Bangalore",
      experience_years: 4,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 13.03,
      base_lng: 77.5946,
      radius_km: 8,
      avg_rating: 4.8,
    });
    b.verifyCleaner(admin, uB, "approved");

    // Cleaner C: 12 km away, radius 8 km (beyond radius, cannot see in Tier 2)
    const uC = b.registerCustomer("approved", "washerC@example.com");
    b.registerCleaner({
      id: uC,
      full_name: "Washer C (12km)",
      city: "Bangalore",
      experience_years: 3,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 13.08,
      base_lng: 77.5946,
      radius_km: 8,
      avg_rating: 4.7,
    });
    b.verifyCleaner(admin, uC, "approved");

    // Book wash 48 hours later (Tier 1 is 4 hours)
    b.setNow("2026-08-20T08:00:00+05:30");
    const wash = b.bookWash(
      customer,
      "2026-08-22",
      499,
      "Bangalore",
      "MG Road, Central",
      "10:00",
      null,
      12.9716,
      77.5946,
    );
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, wash.id);

    // In Tier 1 (T = +1 hour):
    b.setNow("2026-08-20T09:00:00+05:30");
    expect(b.canCleanerSeeJob(uA, wash.id)).toBe(true);
    expect(b.canCleanerSeeJob(uB, wash.id)).toBe(false);
    expect(b.canCleanerSeeJob(uC, wash.id)).toBe(false);

    // In Tier 2 (T = +4h1m, elapsed > 4h):
    b.setNow("2026-08-20T12:01:00+05:30");
    // Cleaner B (6.5km <= 8km radius) CAN now see the job!
    expect(b.canCleanerSeeJob(uB, wash.id)).toBe(true);
    // Cleaner C (12km > 8km radius) STILL cannot see
    expect(b.canCleanerSeeJob(uC, wash.id)).toBe(false);
  });

  /* ------------------------------------------------------------------
   * Test 3: Tier 3 - Then Open to whole city
   * ------------------------------------------------------------------ */
  it("Tier 3: when Tier 2 window elapses, the job is open to all washers in the city regardless of radius", () => {
    // Cleaner Far: 16 km away, radius 5 km
    const uFar = b.registerCustomer("approved", "washerFar@example.com");
    b.registerCleaner({
      id: uFar,
      full_name: "Washer Far (16km)",
      city: "Bangalore",
      experience_years: 2,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 13.115,
      base_lng: 77.5946,
      radius_km: 5,
      avg_rating: 4.5,
    });
    b.verifyCleaner(admin, uFar, "approved");

    b.setNow("2026-08-20T08:00:00+05:30");
    const wash = b.bookWash(
      customer,
      "2026-08-22",
      499,
      "Bangalore",
      "MG Road, Central",
      "10:00",
      null,
      12.9716,
      77.5946,
    );
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, wash.id);

    // Tier 1 (0-4h): Far cleaner cannot see
    b.setNow("2026-08-20T09:00:00+05:30");
    expect(b.canCleanerSeeJob(uFar, wash.id)).toBe(false);

    // Tier 2 (4-8h): Far cleaner cannot see (16km > 5km radius)
    b.setNow("2026-08-20T13:00:00+05:30");
    expect(b.canCleanerSeeJob(uFar, wash.id)).toBe(false);

    // Tier 3 (>8h): Job opens to the entire city! Far cleaner CAN see and claim!
    b.setNow("2026-08-20T16:05:00+05:30");
    expect(b.canCleanerSeeJob(uFar, wash.id)).toBe(true);

    const board = b.washJobBoard(uFar);
    expect(board.some((j) => j.id === wash.id)).toBe(true);

    // Cleaner Far claims job
    b.claimWashJob(uFar, wash.id);
    expect(wash.assigned_cleaner_id).toBe(uFar);
    expect(wash.progress).toBe("assigned");
  });

  /* ------------------------------------------------------------------
   * Test 4: Distance calculation & Realtime Visibility in Job Board
   * ------------------------------------------------------------------ */
  it("computes exact haversine distance in km and provides it for realtime cleaner dashboard display", () => {
    // Cleaner at (12.9716, 77.5946)
    const u = b.registerCustomer("approved", "washer_dist@example.com");
    b.registerCleaner({
      id: u,
      full_name: "Washer Distance",
      city: "Bangalore",
      experience_years: 5,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 12.9716,
      base_lng: 77.5946,
      radius_km: 10,
      avg_rating: 5.0,
    });
    b.verifyCleaner(admin, u, "approved");

    // Customer job at (12.9986, 77.5946) -> ~3.0 km north
    b.setNow("2026-08-20T08:00:00+05:30");
    const wash = b.bookWash(
      customer,
      "2026-08-22",
      499,
      "Bangalore",
      "Sadashivanagar, Bangalore",
      "11:00",
      null,
      12.9986,
      77.5946,
    );
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, wash.id);

    // Query job board
    const board = b.washJobBoard(u);
    const item = board.find((j) => j.id === wash.id);
    expect(item).toBeDefined();

    // Verify distance is around 3.0 km (rounded)
    expect(item?.distance_km).toBeGreaterThanOrEqual(2.8);
    expect(item?.distance_km).toBeLessThanOrEqual(3.2);

    // Verify metadata matching UI display
    expect(item?.service_name).toBe("Doorstep Vehicle Wash");
    expect(item?.slot_date).toBe("2026-08-22");
    expect(item?.slot_time).toMatch(/^11:00/);
  });

  /* ------------------------------------------------------------------
   * Test 5: Immediate open on job release with late strike
   * ------------------------------------------------------------------ */
  it("when an assigned cleaner releases a job, it immediately opens to Tier 3 (whole city) so another washer claims it", () => {
    const u1 = b.registerCustomer("approved", "washer1@example.com");
    b.registerCleaner({
      id: u1,
      full_name: "Washer 1",
      city: "Bangalore",
      experience_years: 5,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 12.9716,
      base_lng: 77.5946,
      radius_km: 8,
      avg_rating: 5.0,
    });
    b.verifyCleaner(admin, u1, "approved");

    // Cleaner 2 is 14 km away (would normally have to wait 8 hours for Tier 3)
    const u2 = b.registerCustomer("approved", "washer2_far@example.com");
    b.registerCleaner({
      id: u2,
      full_name: "Washer 2",
      city: "Bangalore",
      experience_years: 3,
      available: true,
      services: ["Doorstep Car Wash"],
      base_lat: 13.10,
      base_lng: 77.5946,
      radius_km: 5,
      avg_rating: 4.8,
    });
    b.verifyCleaner(admin, u2, "approved");

    // Booking created
    b.setNow("2026-08-20T08:00:00+05:30");
    const wash = b.bookWash(
      customer,
      "2026-08-22",
      499,
      "Bangalore",
      "Indiranagar",
      "14:00",
      null,
      12.9716,
      77.5946,
    );
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, wash.id);

    // Cleaner 1 claims the job in Tier 1
    b.claimWashJob(u1, wash.id);
    expect(wash.assigned_cleaner_id).toBe(u1);

    // Cleaner 1 releases the job later
    b.setNow("2026-08-20T10:00:00+05:30");
    b.releaseWashJob(u1, wash.id);

    // Job is unassigned and immediately set to tier_notified = 3 (whole city)
    expect(wash.assigned_cleaner_id).toBeNull();
    expect(wash.tier_notified).toBe(3);

    // Cleaner 2 (far away) can immediately see and claim it without waiting 8 hours!
    expect(b.canCleanerSeeJob(u2, wash.id)).toBe(true);
    b.claimWashJob(u2, wash.id);
    expect(wash.assigned_cleaner_id).toBe(u2);
  });
});
