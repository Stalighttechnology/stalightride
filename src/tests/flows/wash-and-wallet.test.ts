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
