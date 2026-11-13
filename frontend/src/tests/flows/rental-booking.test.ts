import { describe, expect, test } from "vitest";
import { createBackend, DAY_MS, RuleError } from "../harness/fake-backend";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function setup() {
  const be = createBackend(new Date("2026-08-15T10:00:00Z"));
  const admin = be.registerAdmin();
  const host = be.registerCustomer();
  const customer = be.registerCustomer("approved");
  const vehicle = be.listVehicle(host);
  be.verifyVehicle(admin, vehicle.id, "approved");
  return { be, admin, host, customer, vehicle };
}

const range = (fromDays: number, toDays: number, now = new Date("2026-08-15T10:00:00Z")) => ({
  start_date: iso(new Date(now.getTime() + fromDays * DAY_MS)),
  end_date: iso(new Date(now.getTime() + toDays * DAY_MS)),
});

describe("vehicle listing + admin verification", () => {
  test("a new listing is pending and invisible to the public until approved", () => {
    const be = createBackend();
    const admin = be.registerAdmin();
    const host = be.registerCustomer();
    const v = be.listVehicle(host);
    expect(v.verification_status).toBe("pending");
    expect(be.browse()).toHaveLength(0);
    be.verifyVehicle(admin, v.id, "approved");
    expect(be.browse().map((x) => x.id)).toEqual([v.id]);
  });

  test("rejected vehicles stay hidden and cannot be booked", () => {
    const { be, admin, customer, vehicle } = setup();
    be.verifyVehicle(admin, vehicle.id, "rejected");
    expect(be.browse()).toHaveLength(0);
    expect(() =>
      be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) }),
    ).toThrow(RuleError);
  });

  test("only admins may verify", () => {
    const { be, host, vehicle } = setup();
    expect(() => be.verifyVehicle(host, vehicle.id, "approved")).toThrow(/admins/);
  });

  test("host can delete their own vehicle listing after adding", () => {
    const be = createBackend();
    const host = be.registerCustomer();
    const v = be.listVehicle(host);
    expect(be.tables.vehicles.has(v.id)).toBe(true);
    be.deleteVehicle(host, v.id);
    expect(be.tables.vehicles.has(v.id)).toBe(false);
  });

  test("non-owner cannot delete another host's vehicle", () => {
    const be = createBackend();
    const host = be.registerCustomer();
    const other = be.registerCustomer();
    const v = be.listVehicle(host);
    expect(() => be.deleteVehicle(other, v.id)).toThrow(/host or admin/);
  });

  test("host cannot delete vehicle with active bookings", () => {
    const { be, host, customer, vehicle } = setup();
    be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 4) });
    expect(() => be.deleteVehicle(host, vehicle.id)).toThrow(
      /Cannot delete vehicle with active or upcoming bookings/,
    );
  });
});

describe("booking gates", () => {
  test("licence must be approved before booking", () => {
    const { be, customer, vehicle } = setup();
    be.setDl(customer, "pending");
    expect(() =>
      be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) }),
    ).toThrow(/licence/);
    be.setDl(customer, "approved");
    expect(
      be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) }).status,
    ).toBe("pending");
  });

  test("a host cannot book their own vehicle", () => {
    const { be, host, vehicle } = setup();
    be.setDl(host, "approved");
    expect(() =>
      be.createBooking({ customer_id: host, vehicle_id: vehicle.id, ...range(2, 3) }),
    ).toThrow(/own vehicle/);
  });
});

describe("overbooking edge cases", () => {
  test("overlapping dates are rejected and the vehicle disappears from browse", () => {
    const { be, customer, vehicle } = setup();
    const other = be.registerCustomer("approved");
    be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 5) });
    const overlap = range(4, 6);
    expect(() =>
      be.createBooking({ customer_id: other, vehicle_id: vehicle.id, ...overlap }),
    ).toThrow(/already booked/);
    expect(be.browse(overlap.start_date, overlap.end_date)).toHaveLength(0);
  });

  test("touching the same single day still counts as a clash", () => {
    const { be, customer, vehicle } = setup();
    const other = be.registerCustomer("approved");
    be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 4) });
    expect(() =>
      be.createBooking({ customer_id: other, vehicle_id: vehicle.id, ...range(4, 4) }),
    ).toThrow(/already booked/);
  });

  test("non-overlapping dates are allowed and stay bookable in browse", () => {
    const { be, customer, vehicle } = setup();
    const other = be.registerCustomer("approved");
    be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 4) });
    const later = range(6, 7);
    expect(be.createBooking({ customer_id: other, vehicle_id: vehicle.id, ...later }).status).toBe(
      "pending",
    );
    expect(be.browse(iso(new Date("2026-08-30")), iso(new Date("2026-08-31")))).toHaveLength(1);
  });

  test("cancelling frees the dates for another customer", () => {
    const { be, customer, vehicle } = setup();
    const other = be.registerCustomer("approved");
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(3, 5) });
    be.cancelBooking(customer, b.id);
    expect(
      be.createBooking({ customer_id: other, vehicle_id: vehicle.id, ...range(3, 5) }).status,
    ).toBe("pending");
  });

  test("ten simultaneous attempts on the same dates produce exactly one booking", () => {
    const { be, vehicle } = setup();
    const dates = range(9, 10);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const u = be.registerCustomer("approved");
      try {
        be.createBooking({ customer_id: u, vehicle_id: vehicle.id, ...dates });
        ok++;
      } catch {
        /* expected for all but the first */
      }
    }
    expect(ok).toBe(1);
  });
});

describe("host accept / decline and payment", () => {
  test("only the host decides, and only once", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) });
    expect(() => be.hostDecide(customer, b.id, "confirmed")).toThrow(/host/);
    be.hostDecide(host, b.id, "confirmed");
    expect(() => be.hostDecide(host, b.id, "rejected")).toThrow(/no longer pending/);
    expect(be.notifications.some((n) => n.user_id === customer && /confirmed/.test(n.title))).toBe(
      true,
    );
  });

  test("declined bookings free the dates and cannot be paid", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) });
    be.hostDecide(host, b.id, "rejected");
    be.wallet.topup(customer, 100000);
    expect(() => be.payBookingWithWallet(customer, b.id)).toThrow(/confirmed/);
    expect(
      be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) }).status,
    ).toBe("pending");
  });

  test("wallet payment debits exactly once and blocks on insufficient balance", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(2, 3) });
    be.hostDecide(host, b.id, "confirmed");
    expect(() => be.payBookingWithWallet(customer, b.id)).toThrow(/Insufficient/);
    be.wallet.topup(customer, b.total_price);
    be.payBookingWithWallet(customer, b.id);
    expect(be.wallet.balance(customer)).toBe(0);
    expect(() => be.payBookingWithWallet(customer, b.id)).toThrow(/Already paid/);
    expect(be.wallet.txns(customer).filter((t) => t.kind === "booking_payment")).toHaveLength(1);
  });
});

describe("handover, completion and reviews", () => {
  test("check-in is gated on payment and the 30-minute window, then check-out completes the trip", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      start_date: "2026-08-20",
      end_date: "2026-08-22",
      pickup_time: "10:00",
      dropoff_time: "18:00",
    });
    expect(() => be.checkIn(customer, b.id, 80)).toThrow(/acceptance and payment/);
    be.hostDecide(host, b.id, "confirmed");
    be.wallet.topup(customer, b.total_price);
    be.payBookingWithWallet(customer, b.id);
    expect(() => be.checkIn(customer, b.id, 80)).toThrow(/not open yet/);

    be.setNow("2026-08-20T09:45:00Z");
    expect(() => be.checkOut(customer, b.id, 50)).toThrow(/check-in first/);
    be.checkIn(customer, b.id, 80);
    expect(() => be.checkIn(customer, b.id, 80)).toThrow(/Already checked in/);
    expect(be.canReview(b.id)).toBe(false);

    be.setNow("2026-08-22T17:30:00Z");
    const done = be.checkOut(customer, b.id, 45);
    expect(done.status).toBe("completed");
    expect(done.pickup_fuel_pct).toBe(80);
    expect(done.return_fuel_pct).toBe(45);
    expect(be.canReview(b.id)).toBe(true);
    expect(() => be.cancelBooking(customer, b.id)).toThrow(/cannot be cancelled/);
  });

  test("a started trip can no longer be cancelled", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      start_date: "2026-08-20",
      end_date: "2026-08-21",
      pickup_time: "10:00",
    });
    be.hostDecide(host, b.id, "confirmed");
    be.wallet.topup(customer, b.total_price);
    be.payBookingWithWallet(customer, b.id);
    be.setNow("2026-08-20T10:05:00Z");
    be.checkIn(customer, b.id, 90);
    expect(() => be.cancelBooking(customer, b.id)).toThrow(/already started/);
  });
});

describe("rental cancellation refunds", () => {
  const paid = () => {
    const s = setup();
    const b = s.be.createBooking({
      customer_id: s.customer,
      vehicle_id: s.vehicle.id,
      start_date: "2026-08-20",
      end_date: "2026-08-21",
      pickup_time: "12:00",
      total_price: 1, // ignored: the backend reprices to 2 days x 1200 + 2000 deposit
    });
    s.be.hostDecide(s.host, b.id, "confirmed");
    s.be.wallet.topup(s.customer, b.total_price);
    s.be.payBookingWithWallet(s.customer, b.id);
    return { ...s, b };
  };

  test("full refund more than 24h before pickup", () => {
    const { be, customer, b } = paid();
    be.setNow("2026-08-18T12:00:00Z");
    const { refund, percent } = be.cancelBooking(customer, b.id);
    expect(b.total_price).toBe(4400);
    expect(percent).toBe(100);
    expect(refund).toBe(4400);
    expect(be.wallet.balance(customer)).toBe(4400);
  });

  test("half refund between 2 and 24 hours", () => {
    const { be, customer, host, b } = paid();
    be.setNow("2026-08-20T02:00:00Z");
    const { refund, percent } = be.cancelBooking(customer, b.id);
    expect(percent).toBe(50);
    // deposit back in full + half of the 2400 rent; the host keeps the other half
    expect(refund).toBe(3200);
    expect(be.wallet.balance(host)).toBe(1200);
  });

  test("inside 2 hours only the deposit comes back", () => {
    const { be, customer, host, b } = paid();
    be.setNow("2026-08-20T11:00:00Z");
    const { refund, percent } = be.cancelBooking(customer, b.id);
    expect(percent).toBe(0);
    expect(refund).toBe(2000);
    expect(be.wallet.balance(customer)).toBe(2000);
    expect(be.wallet.balance(host)).toBe(2400);
  });

  test("unpaid cancellation refunds nothing and cannot be repeated", () => {
    const { be, customer, vehicle } = setup();
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(5, 6) });
    expect(be.cancelBooking(customer, b.id).refund).toBe(0);
    expect(() => be.cancelBooking(customer, b.id)).toThrow(/cannot be cancelled/);
  });

  test("another customer cannot cancel someone else's booking", () => {
    const { be, customer, vehicle } = setup();
    const stranger = be.registerCustomer("approved");
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...range(5, 6) });
    expect(() => be.cancelBooking(stranger, b.id)).toThrow(/Not your booking/);
  });
});
