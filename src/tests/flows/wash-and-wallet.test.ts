import { describe, expect, test } from "vitest";
import { createBackend, refundPercent } from "../harness/fake-backend";

function setup() {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const admin = be.registerAdmin();
  const customer = be.registerCustomer();
  return { be, admin, customer, vendor: "washvendor_1" };
}

describe("vehicle wash approval flow", () => {
  test("a wash request waits for admin approval before payment", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 499);
    expect(w.status).toBe("pending");
    be.wallet.topup(customer, 499);
    expect(() => be.payWashWithWallet(customer, w.id)).toThrow(/admin approval/);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);
    be.payWashWithWallet(customer, w.id);
    expect(be.wallet.balance(customer)).toBe(0);
    expect(be.tables.washes.get(w.id)!.assigned_vendor_id).toBe(vendor);
  });

  test("approval requires a wash vendor to be assigned", () => {
    const { be, admin, customer } = setup();
    const w = be.bookWash(customer, "2026-08-20");
    expect(() => be.adminDecideWash(admin, w.id, "confirmed")).toThrow(/Assign a wash vendor/);
  });

  test("only admins decide, and only once", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20");
    expect(() => be.adminDecideWash(customer, w.id, "confirmed", vendor)).toThrow(/admins/);
    be.adminDecideWash(admin, w.id, "rejected");
    expect(() => be.adminDecideWash(admin, w.id, "confirmed", vendor)).toThrow(/Already decided/);
  });

  test("rejected washes are never payable", () => {
    const { be, admin, customer } = setup();
    const w = be.bookWash(customer, "2026-08-20");
    be.adminDecideWash(admin, w.id, "rejected");
    be.wallet.topup(customer, 499);
    expect(() => be.payWashWithWallet(customer, w.id)).toThrow(/admin approval/);
    expect(be.wallet.balance(customer)).toBe(499);
  });

  test("wash cancellation follows the same refund tiers", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 1000);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);
    be.wallet.topup(customer, 1000);
    be.payWashWithWallet(customer, w.id);
    be.setNow("2026-08-19T12:00:00Z");
    const res = be.cancelWash(customer, w.id);
    expect(res.percent).toBe(50);
    expect(res.refund).toBe(500);
    expect(be.wallet.balance(customer)).toBe(500);
  });

  test("a stranger cannot pay or cancel someone else's wash", () => {
    const { be, admin, customer, vendor } = setup();
    const stranger = be.registerCustomer();
    const w = be.bookWash(customer, "2026-08-20");
    be.adminDecideWash(admin, w.id, "confirmed", vendor);
    expect(() => be.payWashWithWallet(stranger, w.id)).toThrow(/Not your wash/);
    expect(() => be.cancelWash(stranger, w.id)).toThrow(/Not your wash/);
  });
});

describe("wash status pipeline (Task 2.3)", () => {
  test("WP-01: assigned cleaner moves job confirmed -> on_the_way -> started -> completed", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 500);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);

    // Step 1: confirmed -> on_the_way
    const s1 = be.advanceWashStatus(vendor, w.id, "on_the_way");
    expect(s1.progress).toBe("on_the_way");
    expect(s1.status).toBe("on_the_way");

    // Step 2: on_the_way -> started (with before photos)
    const s2 = be.advanceWashStatus(vendor, w.id, "started", ["https://photos.example.com/before1.jpg"]);
    expect(s2.progress).toBe("started");
    expect(s2.before_photos).toContain("https://photos.example.com/before1.jpg");

    // Step 3: started -> completed (with after photos)
    const s3 = be.advanceWashStatus(vendor, w.id, "completed", ["https://photos.example.com/after1.jpg"]);
    expect(s3.progress).toBe("completed");
    expect(s3.status).toBe("completed");
    expect(s3.after_photos).toContain("https://photos.example.com/after1.jpg");
  });

  test("WP-02: cleaner cannot move status backwards and unassigned cleaner is rejected", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 500);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);

    const strangerCleaner = "random_cleaner_999";
    expect(() => be.advanceWashStatus(strangerCleaner, w.id, "on_the_way")).toThrow(/not assigned/);

    be.advanceWashStatus(vendor, w.id, "on_the_way");
    be.advanceWashStatus(vendor, w.id, "started", ["https://photos.example.com/before.jpg"]);

    // Cannot move backwards: started -> on_the_way
    expect(() => be.advanceWashStatus(vendor, w.id, "on_the_way")).toThrow(/cannot be moved backwards/);
  });

  test("WP-03: completing a wash without after photos is rejected", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 500);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);
    be.advanceWashStatus(vendor, w.id, "on_the_way");
    be.advanceWashStatus(vendor, w.id, "started");

    // Try completing without after photos
    expect(() => be.advanceWashStatus(vendor, w.id, "completed", [])).toThrow(/After photos are required/);
  });
});

describe("wallet ledger", () => {
  test("top-ups must be positive and balances never go negative", () => {
    const { be, customer } = setup();
    expect(() => be.wallet.topup(customer, 0)).toThrow(/positive/);
    be.wallet.topup(customer, 500);
    expect(() => be.wallet.apply(customer, -600, "booking")).toThrow(/Insufficient/);
    expect(be.wallet.balance(customer)).toBe(500);
  });

  test("every movement is recorded with the running balance", () => {
    const { be, customer } = setup();
    be.wallet.topup(customer, 1000);
    be.wallet.apply(customer, -400, "wash_booking");
    be.wallet.apply(customer, 200, "refund");
    expect(be.wallet.txns(customer).map((t) => t.balance_after)).toEqual([1000, 600, 800]);
    expect(be.wallet.balance(customer)).toBe(800);
  });

  test("wallets are isolated per user", () => {
    const { be, customer } = setup();
    const other = be.registerCustomer();
    be.wallet.topup(customer, 300);
    expect(be.wallet.balance(other)).toBe(0);
    expect(be.wallet.txns(other)).toHaveLength(0);
  });
});

describe("refund tier boundaries", () => {
  const start = new Date("2026-08-20T12:00:00Z");
  test("exactly 24h ahead is still a full refund", () => {
    expect(refundPercent(start, new Date("2026-08-19T12:00:00Z"))).toBe(100);
  });
  test("just under 24h drops to half", () => {
    expect(refundPercent(start, new Date("2026-08-19T12:00:01Z"))).toBe(50);
  });
  test("exactly 2h ahead is still half", () => {
    expect(refundPercent(start, new Date("2026-08-20T10:00:00Z"))).toBe(50);
  });
  test("under 2h and past start give nothing", () => {
    expect(refundPercent(start, new Date("2026-08-20T10:00:01Z"))).toBe(0);
    expect(refundPercent(start, new Date("2026-08-21T00:00:00Z"))).toBe(0);
  });
});

describe("roles, cleaner onboarding and wash centers (RL-01, RL-02, RL-03)", () => {
  test("RL-01: User signs up as cleaner -> cleaners row created as pending, awaiting verification", () => {
    const { be, customer } = setup();
    const cleanerUser = be.registerCustomer();

    const cleaner = be.registerCleaner({
      id: cleanerUser,
      full_name: "Santosh Cleaner",
      phone: "+91 98888 77777",
      city: "Bangalore",
      service_area: "Koramangala, HSR Layout",
      experience_years: 3,
      available: true,
      services: ["Doorstep Car Wash", "Interior Detailing"],
    });

    expect(cleaner.verification_status).toBe("pending");
    expect(cleaner.rejection_reason).toBeNull();
    // Cleaner does not yet have cleaner app_role
    expect(be.hasRole(cleanerUser, "cleaner")).toBe(false);

    // Profile is retrieved directly from database store
    const stored = be.getCleaner(cleanerUser);
    expect(stored).toBeDefined();
    expect(stored?.verification_status).toBe("pending");
  });

  test("RL-02: Admin approves cleaner -> cleaner sees job board, profile persists without localStorage", () => {
    const { be, admin, customer } = setup();
    const cleanerUser = be.registerCustomer();

    be.registerCleaner({
      id: cleanerUser,
      full_name: "Ravi Detailing Pro",
      phone: "+91 97777 66666",
      city: "Bangalore",
      experience_years: 4,
      available: true,
      services: ["Doorstep Car Wash"],
    });

    // Stranger cannot verify cleaner
    expect(() => be.verifyCleaner(customer, cleanerUser, "approved")).toThrow(/Only admins/);

    // Admin approves
    const verified = be.verifyCleaner(admin, cleanerUser, "approved");
    expect(verified.verification_status).toBe("approved");
    expect(be.hasRole(cleanerUser, "cleaner")).toBe(true);

    // Cleaner profile persists in DB and is loaded without localStorage
    const persistentCleaner = be.getCleaner(cleanerUser);
    expect(persistentCleaner?.verification_status).toBe("approved");
    expect(persistentCleaner?.full_name).toBe("Ravi Detailing Pro");

    // Admin can also reject with reason
    const anotherCleaner = be.registerCustomer();
    be.registerCleaner({
      id: anotherCleaner,
      full_name: "Unverified Person",
      city: "Bangalore",
      experience_years: 0,
      available: true,
      services: [],
    });
    const rejected = be.verifyCleaner(admin, anotherCleaner, "rejected", "Invalid contact number and zero experience");
    expect(rejected.verification_status).toBe("rejected");
    expect(rejected.rejection_reason).toBe("Invalid contact number and zero experience");
    expect(be.hasRole(anotherCleaner, "cleaner")).toBe(false);
  });

  test("RL-03: Wash center adds staff and packages, then logs in on another device -> data is identical", () => {
    const { be, admin } = setup();
    const centerUser = be.registerCustomer();

    // 1. Center registers
    const center = be.registerWashCenter({
      id: centerUser,
      name: "AutoShine Prime Spa",
      city: "Bangalore",
      address: "100ft Road, Indiranagar",
      contact_phone: "+91 91234 56789",
      contact_email: "autoshine@synchoo.com",
      daily_capacity: 20,
    });
    expect(center.verification_status).toBe("pending");
    expect(center.active).toBe(false);

    // Admin approves center
    be.verifyWashCenter(admin, centerUser, "approved");
    expect(be.getWashCenter(centerUser)?.verification_status).toBe("approved");
    expect(be.getWashCenter(centerUser)?.active).toBe(true);
    expect(be.hasRole(centerUser, "wash_center")).toBe(true);

    // 2. Wash center adds staff
    const s1 = be.addWashCenterStaff(centerUser, {
      name: "Ramesh Kumar",
      phone: "+91 98801 23456",
      role: "Lead Washer",
      active: true,
    });
    const s2 = be.addWashCenterStaff(centerUser, {
      name: "Sunil Gowda",
      phone: "+91 97412 34567",
      role: "Detailer",
      active: true,
    });

    // 3. Wash center adds packages
    const p1 = be.addWashCenterPackage(centerUser, {
      name: "Express Exterior Foam Wash",
      category: "car",
      price: 399,
      duration: 40,
    });
    const p2 = be.addWashCenterPackage(centerUser, {
      name: "Superbike Deep Foam Wash",
      category: "bike",
      price: 299,
      duration: 30,
    });

    // 4. Simulate login on another device: query database directly by center_id
    const device2Staff = be.getWashCenterStaff(centerUser);
    const device2Packages = be.getWashCenterPackages(centerUser);
    const device2Profile = be.getWashCenter(centerUser);

    expect(device2Profile?.name).toBe("AutoShine Prime Spa");
    expect(device2Staff).toHaveLength(2);
    expect(device2Staff.map((s) => s.name)).toEqual(["Ramesh Kumar", "Sunil Gowda"]);
    expect(device2Packages).toHaveLength(2);
    expect(device2Packages.map((p) => p.name)).toEqual(["Express Exterior Foam Wash", "Superbike Deep Foam Wash"]);
    expect(device2Packages.map((p) => p.price)).toEqual([399, 299]);
  });
});

describe("cleaner job board & atomic job claim (CJ-01, CJ-02)", () => {
  test("CJ-01: Two cleaners claim the same job at once -> exactly one succeeds", () => {
    const { be, admin, customer } = setup();

    // Register & approve cleaner 1 (Bangalore)
    const c1 = be.registerCustomer();
    be.registerCleaner({
      id: c1,
      full_name: "Cleaner Alpha",
      city: "Bangalore",
      experience_years: 2,
      available: true,
      services: ["Doorstep Car Wash"],
    });
    be.verifyCleaner(admin, c1, "approved");

    // Register & approve cleaner 2 (Bangalore)
    const c2 = be.registerCustomer();
    be.registerCleaner({
      id: c2,
      full_name: "Cleaner Beta",
      city: "Bangalore",
      experience_years: 3,
      available: true,
      services: ["Doorstep Car Wash"],
    });
    be.verifyCleaner(admin, c2, "approved");

    // Unassigned confirmed wash job in Bangalore
    const job = be.createConfirmedWash(customer, "2026-08-22", "Bangalore", 499);
    expect(job.status).toBe("confirmed");
    expect(job.assigned_cleaner_id).toBeNull();

    // Cleaner 1 claims the job -> succeeds
    const claimed = be.claimWashJob(c1, job.id);
    expect(claimed.assigned_cleaner_id).toBe(c1);
    expect(claimed.progress).toBe("assigned");

    // Cleaner 2 tries to claim the same job -> rejected (already assigned)
    expect(() => be.claimWashJob(c2, job.id)).toThrow(/already assigned/);

    // Cleaner 1 can now move it forward in pipeline
    be.advanceWashStatus(c1, job.id, "on_the_way");
    expect(job.progress).toBe("on_the_way");
  });

  test("CJ-02: Unverified cleaner, or a cleaner from another city, claims a job -> rejected", () => {
    const { be, admin, customer } = setup();

    // Unverified cleaner
    const unverifiedId = be.registerCustomer();
    be.registerCleaner({
      id: unverifiedId,
      full_name: "Unverified Worker",
      city: "Bangalore",
      experience_years: 1,
      available: true,
      services: ["Doorstep Car Wash"],
    });

    const job = be.createConfirmedWash(customer, "2026-08-22", "Bangalore", 499);

    // Unverified cleaner claim is rejected
    expect(() => be.claimWashJob(unverifiedId, job.id)).toThrow(/Only verified cleaners/);

    // Verified cleaner from Mumbai tries to claim job in Bangalore
    const mumbaiId = be.registerCustomer();
    be.registerCleaner({
      id: mumbaiId,
      full_name: "Mumbai Cleaner",
      city: "Mumbai",
      experience_years: 2,
      available: true,
      services: ["Doorstep Car Wash"],
    });
    be.verifyCleaner(admin, mumbaiId, "approved");

    // Rejected due to different city
    expect(() => be.claimWashJob(mumbaiId, job.id)).toThrow(/outside their operating city/);

    // Cannot claim unconfirmed job
    const unconfirmed = be.bookWash(customer, "2026-08-23", 499, "Mumbai");
    expect(() => be.claimWashJob(mumbaiId, unconfirmed.id)).toThrow(/Only confirmed wash jobs can be claimed/);
  });
});

describe("wash reviews & rating trigger (WR-01, WR-02)", () => {
  test("WR-01: Customer reviews a completed wash -> saved and provider average rating updates", () => {
    const { be, admin, customer } = setup();

    // 1. Setup cleaner
    const cleanerId = be.registerCustomer();
    be.registerCleaner({
      id: cleanerId,
      full_name: "Expert Cleaner",
      city: "Bangalore",
      experience_years: 3,
      available: true,
      services: ["Doorstep Car Wash"],
    });
    be.verifyCleaner(admin, cleanerId, "approved");
    expect(be.getCleaner(cleanerId)?.avg_rating).toBe(0);
    expect(be.getCleaner(cleanerId)?.review_count).toBe(0);

    // First completed wash
    const w1 = be.createConfirmedWash(customer, "2026-08-21", "Bangalore", 499);
    be.claimWashJob(cleanerId, w1.id);
    be.advanceWashStatus(cleanerId, w1.id, "on_the_way");
    be.advanceWashStatus(cleanerId, w1.id, "started");
    be.advanceWashStatus(cleanerId, w1.id, "completed", ["https://example.com/clean.jpg"]);

    // Customer reviews first wash: 5 stars
    const rev1 = be.reviewWash(customer, w1.id, 5, "Sparkling clean, punctual and professional!");
    expect(rev1.rating).toBe(5);
    expect(rev1.cleaner_id).toBe(cleanerId);

    // Cleaner average rating updated
    expect(be.getCleaner(cleanerId)?.avg_rating).toBe(5);
    expect(be.getCleaner(cleanerId)?.review_count).toBe(1);

    // Second completed wash by a second customer
    const customer2 = be.registerCustomer();
    const w2 = be.createConfirmedWash(customer2, "2026-08-22", "Bangalore", 499);
    be.claimWashJob(cleanerId, w2.id);
    be.advanceWashStatus(cleanerId, w2.id, "on_the_way");
    be.advanceWashStatus(cleanerId, w2.id, "started");
    be.advanceWashStatus(cleanerId, w2.id, "completed", ["https://example.com/clean2.jpg"]);

    // Customer 2 reviews second wash: 4 stars
    be.reviewWash(customer2, w2.id, 4, "Good job, minor spot on rim.");

    // Cleaner average rating updated to (5 + 4) / 2 = 4.5
    expect(be.getCleaner(cleanerId)?.avg_rating).toBe(4.5);
    expect(be.getCleaner(cleanerId)?.review_count).toBe(2);

    // 2. Setup wash center
    const centerId = be.registerCustomer();
    be.registerWashCenter({
      id: centerId,
      name: "AutoShine Express Bay",
      city: "Bangalore",
      daily_capacity: 15,
    });
    be.verifyWashCenter(admin, centerId, "approved");

    const w3 = be.bookWash(customer, "2026-08-23", 699, "Bangalore");
    be.adminDecideWash(admin, w3.id, "confirmed", centerId);
    be.wallet.topup(customer, 699);
    be.payWashWithWallet(customer, w3.id);
    be.advanceWashStatus(centerId, w3.id, "on_the_way");
    be.advanceWashStatus(centerId, w3.id, "started");
    be.advanceWashStatus(centerId, w3.id, "completed", ["https://example.com/center_clean.jpg"]);

    // Customer reviews wash center: 4 stars
    be.reviewWash(customer, w3.id, 4, "Fast bay turnaround and great foam wash");
    expect(be.getWashCenter(centerId)?.avg_rating).toBe(4);
    expect(be.getWashCenter(centerId)?.review_count).toBe(1);
  });

  test("WR-02: Review an uncompleted wash, or review the same wash twice -> rejected", () => {
    const { be, admin, customer } = setup();

    const cleanerId = be.registerCustomer();
    be.registerCleaner({
      id: cleanerId,
      full_name: "Pro Cleaner",
      city: "Bangalore",
      experience_years: 2,
      available: true,
      services: ["Doorstep Car Wash"],
    });
    be.verifyCleaner(admin, cleanerId, "approved");

    const w = be.createConfirmedWash(customer, "2026-08-21", "Bangalore", 499);
    be.claimWashJob(cleanerId, w.id);

    // Try reviewing before completion (currently in "assigned" progress)
    expect(() => be.reviewWash(customer, w.id, 5)).toThrow(/Only completed wash bookings can be reviewed/);

    be.advanceWashStatus(cleanerId, w.id, "on_the_way");
    expect(() => be.reviewWash(customer, w.id, 5)).toThrow(/Only completed wash bookings can be reviewed/);

    be.advanceWashStatus(cleanerId, w.id, "started");
    expect(() => be.reviewWash(customer, w.id, 5)).toThrow(/Only completed wash bookings can be reviewed/);

    // Complete the wash
    be.advanceWashStatus(cleanerId, w.id, "completed", ["https://example.com/proof.jpg"]);

    // Stranger tries to review customer's wash
    const stranger = be.registerCustomer();
    expect(() => be.reviewWash(stranger, w.id, 5)).toThrow(/Only the booking customer can write a review/);

    // Customer reviews successfully
    be.reviewWash(customer, w.id, 5, "Great experience!");

    // Customer tries to review the same wash twice -> rejected (one per completed wash)
    expect(() => be.reviewWash(customer, w.id, 4, "Trying to review again")).toThrow(/already been reviewed/);
  });
});
