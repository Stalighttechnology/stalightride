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

describe("driver onboarding and verification (M7 DR-01 to DR-06)", () => {
  test("DR-01: Create a driver profile with licence and ID uploads -> Saved as pending", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const driverId = be.registerCustomer();
    const d = be.enrollDriver(250, 1800, ["airport", "outstation"], "Bengaluru + 50 km");
    be.saveDriverProfile(d.id, {
      full_name: "Ramesh Kumar",
      phone: "+91 9876543210",
      city: "Bengaluru",
      dl_number: "KA05 20200001234",
      dl_expiry: "2030-05-15",
      dl_front_url: "verification-docs/dl_front.jpg",
      dl_back_url: "verification-docs/dl_back.jpg",
      id_document_url: "verification-docs/aadhaar.pdf",
    });

    expect(d.verification_status).toBe("pending");
    expect(d.full_name).toBe("Ramesh Kumar");
    expect(d.dl_number).toBe("KA05 20200001234");
    expect(d.dl_front_url).toBe("verification-docs/dl_front.jpg");
    expect(d.trip_types).toEqual(["airport", "outstation"]);
    expect(d.service_area).toBe("Bengaluru + 50 km");
  });

  test("DR-02: Driver pending -> Look in /drivers -> Not listed and cannot be hired", () => {
    const { be, customer, driver } = setup();
    expect(driver.verification_status).toBe("pending");
    expect(be.searchDrivers()).toHaveLength(0);
    expect(be.getPublicDriver(driver.id)).toBeNull();
    expect(() =>
      be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" }),
    ).toThrow(/not available/);
  });

  test("DR-03: Driver pending -> Admin approves -> Listed. Rejecting hides the driver again with reason", () => {
    const { be, admin, driver } = setup();
    be.saveDriverProfile(driver.id, { full_name: "Suresh Gowda", city: "Bengaluru" });

    // 1. Admin approves
    be.verifyDriver(admin, driver.id, "approved");
    expect(be.searchDrivers().map((d) => d.id)).toEqual([driver.id]);
    expect(be.getPublicDriver(driver.id)?.full_name).toBe("Suresh Gowda");

    // 2. Admin rejects with reason
    be.verifyDriver(admin, driver.id, "rejected");
    expect(be.searchDrivers()).toHaveLength(0);
    expect(be.getPublicDriver(driver.id)).toBeNull();
  });

  test("DR-04: Non-admin -> Try to verify a driver -> Blocked", () => {
    const { be, customer, driver } = setup();
    expect(() => be.verifyDriver(customer, driver.id, "approved")).toThrow(/admins/);
  });

  test("DR-05: Approved driver -> Toggle availability to paused in dashboard -> Hidden from search and offline", () => {
    const { be, admin, driver } = setup();
    be.verifyDriver(admin, driver.id, "approved");
    expect(be.searchDrivers()).toHaveLength(1);

    // Driver toggles status to paused
    be.setDriverStatus(driver.id, "paused");
    expect(be.searchDrivers()).toHaveLength(0);
    expect(be.getPublicDriver(driver.id)).toBeNull(); // /driver/<id> returns null -> shows "This driver is currently offline"

    // Toggle back to active
    be.setDriverStatus(driver.id, "active");
    expect(be.searchDrivers()).toHaveLength(1);
    expect(be.getPublicDriver(driver.id)).not.toBeNull();
  });

  test("DR-06: Open /driver/<id> logged out -> Only public_drivers fields are shown (no phone, dl or id docs)", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const admin = be.registerAdmin();
    const d = be.enrollDriver(200, 1500, ["airport"], "Bengaluru Urban");

    be.saveDriverProfile(d.id, {
      full_name: "Anand Verma",
      phone: "+91 9988776655", // Private sensitive
      city: "Bengaluru",
      bio: "Safe professional chauffeur",
      dl_number: "KA01 20180009876", // Private sensitive
      dl_front_url: "private/dl_front.jpg", // Private sensitive
      dl_back_url: "private/dl_back.jpg", // Private sensitive
      id_document_url: "private/passport.jpg", // Private sensitive
    });
    be.verifyDriver(admin, d.id, "approved");

    const pub = be.getPublicDriver(d.id);
    expect(pub).not.toBeNull();
    expect(pub!.full_name).toBe("Anand Verma");
    expect(pub!.city).toBe("Bengaluru");
    expect(pub!.trip_types).toEqual(["airport"]);
    expect(pub!.service_area).toBe("Bengaluru Urban");

    // Strictly ensure no private or sensitive columns are present in public_drivers
    expect((pub as any).phone).toBeUndefined();
    expect((pub as any).dl_number).toBeUndefined();
    expect((pub as any).dl_front_url).toBeUndefined();
    expect((pub as any).dl_back_url).toBeUndefined();
    expect((pub as any).id_document_url).toBeUndefined();
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

  test("DH-06: driver accepts, customer pays from wallet -> driver wallet credited and notified", () => {
    const { be, customer, driver } = approved();
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    expect(() => be.payDriverBookingWithWallet(customer, b.id)).toThrow(/accepted hires/);
    be.driverDecide(driver.id, b.id, "confirmed");
    be.wallet.topup(customer, 1500);
    be.payDriverBookingWithWallet(customer, b.id);
    expect(be.wallet.balance(customer)).toBe(0);
    expect(be.wallet.balance(driver.id)).toBe(1500);
    expect(be.notifications.some((n) => n.user_id === driver.id && /payment/i.test(n.title))).toBe(true);
    expect(() => be.payDriverBookingWithWallet(customer, b.id)).toThrow(/Already paid/);
  });

  test("DH-07: declining frees the slot and blocks payment", () => {
    const { be, customer, driver } = approved();
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    be.driverDecide(driver.id, b.id, "rejected");
    expect(be.notifications.some((n) => n.user_id === customer && /declined/.test(n.title))).toBe(true);
    expect(
      be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" }).status,
    ).toBe("pending");
  });

  test("DH-08: a driver cannot be double-booked on overlapping dates", () => {
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

  test("DH-09: another driver cannot decide someone else's request", () => {
    const { be, admin, customer, driver } = approved();
    const other = be.enrollDriver();
    be.verifyDriver(admin, other.id, "approved");
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    expect(() => be.driverDecide(other.id, b.id, "confirmed")).toThrow(/Not your hire/);
  });

  test("DH-10: confirmed hire -> pay with Razorpay, replay verify payload -> credited once", () => {
    const { be, customer, driver } = approved();
    const b = be.hireDriver({ customer_id: customer, driver_id: driver.id, start_date: "2026-08-20", end_date: "2026-08-20" });
    be.driverDecide(driver.id, b.id, "confirmed");

    const driverBalBefore = be.wallet.balance(driver.id);
    const res1 = be.payDriverBookingWithRazorpay(customer, b.id, "pay_12345");
    expect(res1.ok).toBe(true);
    expect(res1.replayed).toBe(false);
    expect(be.wallet.balance(driver.id)).toBe(driverBalBefore + b.total_price);

    // Replay verify payload: idempotent, must NOT credit again
    const res2 = be.payDriverBookingWithRazorpay(customer, b.id, "pay_12345");
    expect(res2.ok).toBe(true);
    expect(res2.replayed).toBe(true);
    expect(be.wallet.balance(driver.id)).toBe(driverBalBefore + b.total_price);
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
      end_date: "2026-08-20",
      total_price: 3000,
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
    const { be, customer, b } = paid();
    be.setNow("2026-08-19T06:00:00Z");
    const res = be.cancelDriverBooking(customer, b.id);
    expect(res.percent).toBe(50);
    expect(res.refund).toBe(1500);
    expect(res.booking.payment_status).toBe("refunded");
  });

  test("no refund inside 2h and no double cancellation", () => {
    const { be, customer, b } = paid();
    be.setNow("2026-08-19T23:30:00Z");
    expect(be.cancelDriverBooking(customer, b.id).refund).toBe(0);
    expect(() => be.cancelDriverBooking(customer, b.id)).toThrow(/cannot be cancelled/);
  });

  test("only the hiring customer or driver can cancel", () => {
    const { be, b } = paid();
    const stranger = be.registerCustomer();
    expect(() => be.cancelDriverBooking(stranger, b.id)).toThrow(/Not your hire/);
  });

  test("DC-04: driver cancels a paid hire -> customer gets 100% full refund", () => {
    const { be, customer, driver, b } = paid();
    const res = be.cancelDriverBooking(driver.id, b.id);
    expect(res.percent).toBe(100);
    expect(res.refund).toBe(3000);
    expect(be.wallet.balance(customer)).toBe(3000);
  });
});

describe("driver trip types and service area (Task 2.2)", () => {
  test("DH-11: hiring a driver stores trip_type in its own column on the booking", () => {
    const { be, admin, customer, driver } = setup();
    be.verifyDriver(admin, driver.id, "approved");
    const b = be.hireDriver({
      customer_id: customer,
      driver_id: driver.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      trip_type: "airport",
    });
    expect(b.trip_type).toBe("airport");
  });

  test("DO-03: filtering drivers by trip type returns only drivers supporting it", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const admin = be.registerAdmin();

    const d1 = be.enrollDriver(200, 1500, ["airport", "outstation"], "Bengaluru + 100 km");
    const d2 = be.enrollDriver(250, 1800, ["corporate", "events"], "Electronic City");
    const d3 = be.enrollDriver(220, 1600, ["outstation"], "Whitefield");

    be.verifyDriver(admin, d1.id, "approved");
    be.verifyDriver(admin, d2.id, "approved");
    be.verifyDriver(admin, d3.id, "approved");

    const airportDrivers = be.searchDrivers({ trip_type: "Airport" });
    expect(airportDrivers.map((d) => d.id)).toEqual([d1.id]);

    const outstationDrivers = be.searchDrivers({ trip_type: "outstation" });
    expect(outstationDrivers.map((d) => d.id)).toEqual([d1.id, d3.id]);

    const areaDrivers = be.searchDrivers({ service_area: "Electronic City" });
    expect(areaDrivers.map((d) => d.id)).toEqual([d2.id]);
  });

  test("DO-01: new driver saves profile with trip types and service area", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const driver = be.enrollDriver(250, 2000, ["airport", "outstation"], "Bengaluru + 100 km");
    expect(driver.verification_status).toBe("pending");
    expect(driver.trip_types).toEqual(["airport", "outstation"]);
    expect(driver.service_area).toBe("Bengaluru + 100 km");
  });

  test("DO-02: existing driver edits their bio only with no errors and preserves trip types", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00Z"));
    const driver = be.enrollDriver(250, 2000, ["airport", "outstation"], "Bengaluru + 100 km");

    const updated = be.saveDriverProfile(driver.id, {
      bio: "10+ years commercial driving experience across South India.",
    });

    expect(updated.bio).toBe("10+ years commercial driving experience across South India.");
    expect(updated.trip_types).toEqual(["airport", "outstation"]);
    expect(updated.service_area).toBe("Bengaluru + 100 km");
  });
});
