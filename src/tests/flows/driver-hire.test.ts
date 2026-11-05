import { describe, expect, test } from "vitest";
import { createBackend } from "../harness/fake-backend";
import { calculateDriverPrice, driverDays, driverHours } from "@/lib/driver-pricing";

function setup() {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const admin = be.registerAdmin();
  const customer = be.registerCustomer();
  const driver = be.enrollDriver(200, 1500);
  return { be, admin, customer, driver };
}

describe("driver onboarding and verification", () => {
  test("an unverified driver is not listed and cannot be hired", () => {
    const { be, customer, driver } = setup();
    expect(driver.verification_status).toBe("pending");
    expect(be.searchDrivers()).toHaveLength(0);
    expect(() =>
      be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" }),
    ).toThrow(/not available/);
  });

  test("approval lists the driver; rejection hides them again", () => {
    const { be, admin, driver } = setup();
    be.verifyDriver(admin, driver.id, "approved");
    expect(be.searchDrivers().map((d) => d.id)).toEqual([driver.id]);
    be.verifyDriver(admin, driver.id, "rejected");
    expect(be.searchDrivers()).toHaveLength(0);
  });

  test("non-admins cannot verify drivers", () => {
    const { be, customer, driver } = setup();
    expect(() => be.verifyDriver(customer, driver.id, "approved")).toThrow(/admins/);
  });
});

describe("driver pricing", () => {
  test("hourly hire bills ceil(hours) on the same day", () => {
    const p = calculateDriverPrice({
      rateType: "hourly",
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      startTime: "09:00",
      endTime: "12:30",
      hourlyRate: 200,
      dailyRate: 1500,
    });
    expect(p.hours).toBe(4);
    expect(p.subtotal).toBe(800);
    expect(p.error).toBeUndefined();
  });

  test("hourly hire spanning days is rejected", () => {
    const p = calculateDriverPrice({
      rateType: "hourly",
      startDate: "2026-08-20",
      endDate: "2026-08-21",
      startTime: "09:00",
      endTime: "12:00",
      hourlyRate: 200,
      dailyRate: 1500,
    });
    expect(p.error).toMatch(/same day/);
    expect(p.subtotal).toBe(0);
  });

  test("end time before start time is rejected", () => {
    const p = calculateDriverPrice({
      rateType: "hourly",
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      startTime: "12:00",
      endTime: "09:00",
      hourlyRate: 200,
      dailyRate: 1500,
    });
    expect(p.error).toMatch(/after start/);
  });

  test("daily hire counts both end days inclusively", () => {
    expect(driverDays("2026-08-20", "2026-08-22")).toBe(3);
    expect(driverDays("2026-08-22", "2026-08-20")).toBe(0);
    expect(driverHours("2026-08-20", "2026-08-20", "09:00", "10:30")).toBe(1.5);
    const p = calculateDriverPrice({
      rateType: "daily",
      startDate: "2026-08-20",
      endDate: "2026-08-22",
      startTime: "09:00",
      endTime: "18:00",
      hourlyRate: 0,
      dailyRate: 1500,
    });
    expect(p.days).toBe(3);
    expect(p.subtotal).toBe(4500);
  });

  test("missing rate surfaces an error instead of a zero-rupee hire", () => {
    const p = calculateDriverPrice({
      rateType: "hourly",
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      startTime: "09:00",
      endTime: "11:00",
      hourlyRate: 0,
      dailyRate: 1500,
    });
    expect(p.error).toMatch(/hourly/);
  });
});

describe("driver hire accept / decline", () => {
  const approved = () => {
    const s = setup();
    s.be.verifyDriver(s.admin, s.driver.id, "approved");
    return s;
  };

  test("driver accepts, customer pays from wallet", () => {
    const { be, customer, driver } = approved();
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    expect(() => be.payDriverBookingWithWallet(customer, b.id)).toThrow(/accepted hires/);
    be.driverDecide(driver.id, b.id, "confirmed");
    be.wallet.topup(customer, 1500);
    be.payDriverBookingWithWallet(customer, b.id);
    expect(be.wallet.balance(customer)).toBe(0);
    expect(() => be.payDriverBookingWithWallet(customer, b.id)).toThrow(/Already paid/);
  });

  test("declining frees the slot and blocks payment", () => {
    const { be, customer, driver } = approved();
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    be.driverDecide(driver.id, b.id, "rejected");
    expect(be.notifications.some((n) => n.user_id === customer && /declined/.test(n.title))).toBe(true);
    expect(
      be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" }).status,
    ).toBe("pending");
  });

  test("a driver cannot be double-booked on overlapping dates", () => {
    const { be, customer, driver } = approved();
    const other = be.registerCustomer();
    be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-23" });
    expect(() =>
      be.hireDriver({ customer_id: other, driver_id: driver.id, start_date: "2026-08-22", end_date: "2026-08-25" }),
    ).toThrow(/already booked/);
    expect(
      be.hireDriver({ customer_id: other, driver_id: driver.id, start_date: "2026-08-24", end_date: "2026-08-25" }).status,
    ).toBe("pending");
  });

  test("another driver cannot decide someone else's request", () => {
    const { be, admin, customer, driver } = approved();
    const other = be.enrollDriver();
    be.verifyDriver(admin, other.id, "approved");
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    expect(() => be.driverDecide(other.id, b.id, "confirmed")).toThrow(/Not your hire/);
  });
});

describe("driver hire cancellation refunds", () => {
  const paid = () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const admin = be.registerAdmin();
    const customer = be.registerCustomer();
    const driver = be.enrollDriver(200, 1500);
    be.verifyDriver(admin, driver.id, "approved");
    const b = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-20",
      end_date: "2026-08-21",
      total_price: 1, // ignored: repriced to 2 days x 1500
    });
    be.driverDecide(driver.id, b.id, "confirmed");
    be.wallet.topup(customer, 3000);
    be.payDriverBookingWithWallet(customer, b.id);
    return { be, customer, driver, b };
  };

  test("full refund more than 24h ahead", () => {
    const { be, customer, b } = paid();
    be.setNow("2026-08-18T00:00:00Z");
    expect(be.cancelDriverBooking(customer, b.id).refund).toBe(3000);
    expect(be.wallet.balance(customer)).toBe(3000);
  });

  test("half refund inside 24h", () => {
    const { be, customer, driver, b } = paid();
    be.setNow("2026-08-19T06:00:00Z");
    const res = be.cancelDriverBooking(customer, b.id);
    expect(res.percent).toBe(50);
    expect(res.refund).toBe(1500);
    expect(res.booking.payment_status).toBe("partially_refunded");
    expect(be.wallet.balance(driver.id)).toBe(1500);
  });

  test("no refund inside 2h and no double cancellation", () => {
    const { be, customer, b } = paid();
    be.setNow("2026-08-19T23:30:00Z");
    expect(be.cancelDriverBooking(customer, b.id).refund).toBe(0);
    expect(() => be.cancelDriverBooking(customer, b.id)).toThrow(/cannot be cancelled/);
  });

  test("only the hiring customer can cancel", () => {
    const { be, b } = paid();
    const stranger = be.registerCustomer();
    expect(() => be.cancelDriverBooking(stranger, b.id)).toThrow(/Not your hire/);
  });
});
