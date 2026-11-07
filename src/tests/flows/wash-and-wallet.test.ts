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

describe("wash pipeline: cleaners and washing centers", () => {
  /** A paid, admin-approved wash in Bengaluru assigned to a platform partner (no owner). */
  function paidWash() {
    const s = setup();
    const w = s.be.bookWash(s.customer, "2026-08-20", 499);
    s.be.adminDecideWash(s.admin, w.id, "confirmed", s.vendor);
    s.be.wallet.topup(s.customer, w.price);
    s.be.payWashWithWallet(s.customer, w.id);
    return { ...s, w };
  }

  test("only verified, online cleaners in the same city see and claim the job", () => {
    const { be, admin, w } = paidWash();
    const ravi = be.registerCleaner("bengaluru ");
    const anil = be.registerCleaner("Mumbai");
    expect(be.jobBoard(ravi)).toHaveLength(0);
    expect(() => be.claimWashJob(ravi, w.id)).toThrow(/verified cleaners/);
    expect(() => be.verifyCleaner(ravi, ravi, "approved")).toThrow(/Admins only/);

    be.verifyCleaner(admin, ravi, "approved");
    be.verifyCleaner(admin, anil, "approved");
    expect(be.jobBoard(anil)).toHaveLength(0);
    expect(() => be.claimWashJob(anil, w.id)).toThrow(/outside your city/);

    be.setCleanerAvailable(ravi, false);
    expect(be.jobBoard(ravi)).toHaveLength(0);
    expect(() => be.claimWashJob(ravi, w.id)).toThrow(/Go online/);
    be.setCleanerAvailable(ravi, true);
    expect(be.jobBoard(ravi).map((j) => j.id)).toEqual([w.id]);
  });

  test("a job can be claimed once; the board empties", () => {
    const { be, admin, w } = paidWash();
    const a = be.registerCleaner();
    const b = be.registerCleaner();
    be.verifyCleaner(admin, a, "approved");
    be.verifyCleaner(admin, b, "approved");
    be.claimWashJob(a, w.id);
    expect(() => be.claimWashJob(b, w.id)).toThrow(/already taken/);
    expect(be.jobBoard(b)).toHaveLength(0);
  });

  test("unpaid jobs are not claimable", () => {
    const { be, admin, customer, vendor } = setup();
    const w = be.bookWash(customer, "2026-08-20", 499);
    be.adminDecideWash(admin, w.id, "confirmed", vendor);
    const c = be.registerCleaner();
    be.verifyCleaner(admin, c, "approved");
    expect(be.jobBoard(c)).toHaveLength(0);
    expect(() => be.claimWashJob(c, w.id)).toThrow(/not open yet/);
  });

  test("steps advance strictly in order and only by the job's cleaner; completion pays the cleaner", () => {
    const { be, admin, w } = paidWash();
    const c = be.registerCleaner();
    const stranger = be.registerCleaner();
    be.verifyCleaner(admin, c, "approved");
    expect(() => be.advanceWashJob(c, w.id, "on_the_way")).toThrow(/not your job/);
    be.claimWashJob(c, w.id);
    expect(() => be.advanceWashJob(stranger, w.id, "on_the_way")).toThrow(/not your job/);
    expect(() => be.advanceWashJob(c, w.id, "completed")).toThrow(/Next step must be on_the_way/);

    be.advanceWashJob(c, w.id, "on_the_way");
    be.advanceWashJob(c, w.id, "started");
    be.advanceWashJob(c, w.id, "completed");

    expect(w).toMatchObject({ status: "completed", progress: null });
    expect(be.wallet.txns(c)).toEqual([{ user_id: c, amount: w.provider_earning, kind: "wash_earning", balance_after: w.provider_earning }]);
    expect(be.withdrawable(c)).toBe(w.provider_earning);
    expect(() => be.advanceWashJob(c, w.id, "completed")).toThrow(/paid, confirmed/);
  });

  test("a center's jobs stay off the cleaner board; the center runs them and is paid", () => {
    const { be, admin, customer } = setup();
    const owner = be.registerCustomer();
    const center = be.registerWashCenter(owner);
    const w = be.bookWash(customer, "2026-08-20", 499);
    be.adminDecideWash(admin, w.id, "confirmed", center);
    be.wallet.topup(customer, w.price);
    be.payWashWithWallet(customer, w.id);

    const c = be.registerCleaner();
    be.verifyCleaner(admin, c, "approved");
    expect(be.jobBoard(c)).toHaveLength(0);
    expect(() => be.claimWashJob(c, w.id)).toThrow(/washing center/);

    for (const step of ["assigned", "on_the_way", "started", "completed"] as const) be.advanceWashJob(owner, w.id, step);
    expect(be.wallet.txns(owner).map((t) => t.kind)).toEqual(["wash_earning"]);
    expect(be.withdrawable(owner)).toBe(w.provider_earning);
  });
});
