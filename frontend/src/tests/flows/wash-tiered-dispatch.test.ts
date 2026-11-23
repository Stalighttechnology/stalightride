import { describe, it, expect, beforeEach } from "vitest";
import { createBackend, haversineKm } from "../harness/fake-backend";

describe("Wash Booking Dispatch: Tiered Algorithm (First 3, Next / Radius, Open City) & Realtime Distance", () => {
  let b: ReturnType<typeof createBackend>;
  let admin: string;
  let customer: string;

  beforeEach(() => {
    b = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    admin = b.registerAdmin();
    customer = b.registerCustomer("approved", "cust@example.com");
  });

  /* ------------------------------------------------------------------
   * 1. Distance Calculation (Haversine Formula)
   * ------------------------------------------------------------------ */
  it("computes accurate haversine distance between customer booking and washer base pin", () => {
    // Customer location: Koramangala (12.9352, 77.6245)
    // Washer A location: MG Road (12.9716, 77.5946)
    const dist = haversineKm(12.9716, 77.5946, 12.9352, 77.6245);
    // Distance should be approximately 5.2 km
    expect(dist).toBeGreaterThan(5.0);
    expect(dist).toBeLessThan(5.5);
    const rounded = Number(dist.toFixed(1));
    expect(rounded).toBe(5.2);
  });

  /* ------------------------------------------------------------------
   * 2. Tier 1: Top 3 within 5 km based on rating & load
   * ------------------------------------------------------------------ */
  it("Tier 1 limits visibility to the top 3 rated washers within 5 km, rank 4 is excluded", () => {
    // 4 washers in Bengaluru within 5 km of customer location (12.9716, 77.5946)
    // Washer 1: rating 5.0, distance ~1 km
    const w1User = b.registerCustomer("approved", "w1@example.com");
    b.registerCleaner({
      id: w1User,
      full_name: "Washer 1 (Top Star)",
      city: "Bengaluru",
      base_lat: 12.9750,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 5.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 5,
    });
    b.verifyCleaner(admin, w1User, "approved");

    // Washer 2: rating 4.8, distance ~2 km
    const w2User = b.registerCustomer("approved", "w2@example.com");
    b.registerCleaner({
      id: w2User,
      full_name: "Washer 2 (High Star)",
      city: "Bengaluru",
      base_lat: 12.9800,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.8,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 4,
    });
    b.verifyCleaner(admin, w2User, "approved");

    // Washer 3: rating 4.6, distance ~3 km
    const w3User = b.registerCustomer("approved", "w3@example.com");
    b.registerCleaner({
      id: w3User,
      full_name: "Washer 3 (Good Star)",
      city: "Bengaluru",
      base_lat: 12.9850,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.6,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w3User, "approved");

    // Washer 4: rating 4.0, distance ~3.5 km (within 5 km, but rank 4 by rating)
    const w4User = b.registerCustomer("approved", "w4@example.com");
    b.registerCleaner({
      id: w4User,
      full_name: "Washer 4 (Rank 4)",
      city: "Bengaluru",
      base_lat: 12.9900,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 2,
    });
    b.verifyCleaner(admin, w4User, "approved");

    // Customer books and pays for a wash at (12.9716, 77.5946) for 48h ahead
    const w = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "MG Road Central", "10:00", null, 12.9716, 77.5946);
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, w.id);

    // At T=0 (paid): Tier 1 only.
    // Washers 1, 2, 3 (top 3) MUST see the job
    expect(b.canCleanerSeeJob(w1User, w.id)).toBe(true);
    expect(b.canCleanerSeeJob(w2User, w.id)).toBe(true);
    expect(b.canCleanerSeeJob(w3User, w.id)).toBe(true);

    // Washer 4 (rank 4 by rating) MUST NOT see the job in Tier 1
    expect(b.canCleanerSeeJob(w4User, w.id)).toBe(false);
  });

  /* ------------------------------------------------------------------
   * 3. Tier 2: Next cleaners within their own radius_km
   * ------------------------------------------------------------------ */
  it("Tier 2 widens job visibility to washers within their radius, including rank 4", () => {
    const w1User = b.registerCustomer("approved", "w1@example.com");
    b.registerCleaner({
      id: w1User,
      full_name: "Washer 1",
      city: "Bengaluru",
      base_lat: 12.9750,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 5.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 5,
    });
    b.verifyCleaner(admin, w1User, "approved");

    // Washer 4: rating 4.0, 3.5 km away, radius 8 km
    const w4User = b.registerCustomer("approved", "w4@example.com");
    b.registerCleaner({
      id: w4User,
      full_name: "Washer 4",
      city: "Bengaluru",
      base_lat: 12.9900,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 2,
    });
    b.verifyCleaner(admin, w4User, "approved");

    // Washer 5: 12 km away, radius 8 km (exceeds radius)
    const w5User = b.registerCustomer("approved", "w5@example.com");
    b.registerCleaner({
      id: w5User,
      full_name: "Washer 5 (Far Away)",
      city: "Bengaluru",
      base_lat: 13.0800, // ~12 km
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.9,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w5User, "approved");

    const w = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "MG Road Central", "10:00", null, 12.9716, 77.5946);
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, w.id);

    // Fast-forward 4 hours and 5 minutes: enters Tier 2 (for >24h lead time)
    b.setNow("2026-08-15T14:05:00+05:30");

    // Washer 1 still sees it (visibility only widens)
    expect(b.canCleanerSeeJob(w1User, w.id)).toBe(true);

    // Washer 4 (within 8km radius) NOW sees it in Tier 2!
    expect(b.canCleanerSeeJob(w4User, w.id)).toBe(true);

    // Washer 5 (>8km radius) still does NOT see it
    expect(b.canCleanerSeeJob(w5User, w.id)).toBe(false);
  });

  /* ------------------------------------------------------------------
   * 4. Tier 3: Open to whole city
   * ------------------------------------------------------------------ */
  it("Tier 3 opens the job board to all washers across the city regardless of distance", () => {
    const w5User = b.registerCustomer("approved", "w5@example.com");
    b.registerCleaner({
      id: w5User,
      full_name: "Washer 5 (Far Away)",
      city: "Bengaluru",
      base_lat: 13.0800,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.9,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w5User, "approved");

    const w = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "MG Road Central", "10:00", null, 12.9716, 77.5946);
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, w.id);

    // Fast-forward 8 hours and 5 minutes: enters Tier 3 (Open City)
    b.setNow("2026-08-15T18:05:00+05:30");

    // Washer 5 (12 km away) now sees the job in Tier 3!
    expect(b.canCleanerSeeJob(w5User, w.id)).toBe(true);

    const board = b.washJobBoard(w5User);
    expect(board.some((j) => j.id === w.id)).toBe(true);
  });

  /* ------------------------------------------------------------------
   * 5. Distance Field in Wash Job Board Output
   * ------------------------------------------------------------------ */
  it("washJobBoard includes distance_km calculated from washer base coordinates to wash location", () => {
    const wUser = b.registerCustomer("approved", "washer_dist@example.com");
    b.registerCleaner({
      id: wUser,
      full_name: "Washer Distance Tester",
      city: "Bengaluru",
      base_lat: 12.9716,
      base_lng: 77.5946,
      radius_km: 15,
      avg_rating: 4.8,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, wUser, "approved");

    // Wash at Koramangala (12.9352, 77.6245) -> ~5.2 km away
    const w = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "Koramangala 4th Block", "10:00", null, 12.9352, 77.6245);
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, w.id);

    // Advance to Tier 2 so it is visible within washer's 15 km radius
    b.setNow("2026-08-15T14:30:00+05:30");

    const board = b.washJobBoard(wUser);
    const item = board.find((j) => j.id === w.id);
    expect(item).toBeDefined();
    // Verify distance is calculated and present
    expect(item?.distance_km).toBeDefined();
    expect(item?.distance_km).toBeCloseTo(5.2, 1);
  });

  /* ------------------------------------------------------------------
   * 6. Atomic Claim Race Condition
   * ------------------------------------------------------------------ */
  it("first washer to claim wins; second washer receives 'Another partner just claimed this job'", () => {
    const w1 = b.registerCustomer("approved", "w1@example.com");
    b.registerCleaner({
      id: w1,
      full_name: "Washer 1",
      city: "Bengaluru",
      base_lat: 12.9716,
      base_lng: 77.5946,
      radius_km: 8,
      avg_rating: 5.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w1, "approved");

    const w2 = b.registerCustomer("approved", "w2@example.com");
    b.registerCleaner({
      id: w2,
      full_name: "Washer 2",
      city: "Bengaluru",
      base_lat: 12.9720,
      base_lng: 77.5950,
      radius_km: 8,
      avg_rating: 4.9,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w2, "approved");

    const w = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "MG Road Central", "10:00", null, 12.9716, 77.5946);
    b.wallet.topup(customer, 1000);
    b.payWashWithWallet(customer, w.id);

    // Washer 1 claims job
    const claimRes1 = b.claimWashJob(w1, w.id);
    expect(claimRes1.assigned_cleaner_id).toBe(w1);
    expect(claimRes1.progress).toBe("assigned");

    // Washer 2 tries to claim same job -> rejected
    expect(() => b.claimWashJob(w2, w.id)).toThrow("Another partner just claimed this job");
  });

  /* ------------------------------------------------------------------
   * 7. Late Release Strike & Tier 1 Exclusion
   * ------------------------------------------------------------------ */
  it("releasing a job less than 12h before slot records late strike; 2 strikes in 30d excludes washer from Tier 1", () => {
    const w1 = b.registerCustomer("approved", "w1@example.com");
    b.registerCleaner({
      id: w1,
      full_name: "Washer 1",
      city: "Bengaluru",
      base_lat: 12.9716,
      base_lng: 77.5946,
      radius_km: 8,
      avg_rating: 5.0,
      available: true,
      services: ["Doorstep Wash"],
      experience_years: 3,
    });
    b.verifyCleaner(admin, w1, "approved");

    // First booking tomorrow at 10 AM. Current time is 10 PM tonight (11.5h before slot)
    b.setNow("2026-08-15T22:30:00+05:30"); // < 12h before 2026-08-16 10:00 AM
    const j1 = b.bookWash(customer, "2026-08-16", 499, "Bengaluru", "MG Road", "10:00", null, 12.9716, 77.5946);
    b.wallet.topup(customer, 2000);
    b.payWashWithWallet(customer, j1.id);
    b.claimWashJob(w1, j1.id);

    // Washer releases job < 12h before slot -> late strike 1
    const rel1 = b.releaseWashJob(w1, j1.id);
    expect(rel1.late).toBe(true);

    // Second booking
    const j2 = b.bookWash(customer, "2026-08-17", 499, "Bengaluru", "MG Road", "10:00", null, 12.9716, 77.5946);
    b.payWashWithWallet(customer, j2.id);
    b.claimWashJob(w1, j2.id);

    // Washer releases second job < 12h before slot -> late strike 2
    b.setNow("2026-08-17T04:00:00+05:30"); // 6h before slot (< 12h)
    const rel2 = b.releaseWashJob(w1, j2.id);
    expect(rel2.late).toBe(true);

    // Now a new third job is created for 48h ahead
    b.setNow("2026-08-17T10:00:00+05:30");
    const j3 = b.bookWash(customer, "2026-08-19", 499, "Bengaluru", "MG Road", "10:00", null, 12.9716, 77.5946);
    b.payWashWithWallet(customer, j3.id);

    // Washer 1 has 2 late strikes in 30 days -> EXCLUDED from Tier 1!
    expect(b.canCleanerSeeJob(w1, j3.id)).toBe(false);
  });
});
