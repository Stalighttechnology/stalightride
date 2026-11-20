import { describe, expect, test } from "vitest";
import { createBackend, DAY_MS, RuleError, bookingDeadline } from "../harness/fake-backend";

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

  test("car returned at 10am can be booked starting at 11am on the same date", () => {
    const { be, customer, vehicle } = setup();
    const ben = be.registerCustomer("approved");
    // Asha: day 2 10am to day 4 10am
    be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      ...range(2, 4),
      pickup_time: "10:00",
      dropoff_time: "10:00",
    });
    // Ben: day 4 11am to day 5 12pm (after return) -> allowed!
    const benBooking = be.createBooking({
      customer_id: ben,
      vehicle_id: vehicle.id,
      ...range(4, 5),
      pickup_time: "11:00",
      dropoff_time: "12:00",
    });
    expect(benBooking.status).toBe("pending");
  });

  test("car returned at 10am CANNOT be booked at 10am or earlier on the same date", () => {
    const { be, customer, vehicle } = setup();
    const other1 = be.registerCustomer("approved");
    const other2 = be.registerCustomer("approved");
    // Asha: day 2 10am to day 4 10am
    be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      ...range(2, 4),
      pickup_time: "10:00",
      dropoff_time: "10:00",
    });
    // Attempt pickup at 10:00 (exact boundary when car is returned) -> rejected!
    expect(() =>
      be.createBooking({
        customer_id: other1,
        vehicle_id: vehicle.id,
        ...range(4, 5),
        pickup_time: "10:00",
        dropoff_time: "12:00",
      }),
    ).toThrow(/already booked/);
    // Attempt pickup at 09:00 (before return) -> rejected!
    expect(() =>
      be.createBooking({
        customer_id: other2,
        vehicle_id: vehicle.id,
        ...range(4, 5),
        pickup_time: "09:00",
        dropoff_time: "12:00",
      }),
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

  test("allows early closing of ride after starting the ride and completes the trip", () => {
    const { be, host, customer, vehicle } = setup();
    const b = be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      start_date: "2026-08-20",
      end_date: "2026-08-25",
      pickup_time: "10:00",
      dropoff_time: "18:00",
    });
    be.hostDecide(host, b.id, "confirmed");
    be.wallet.topup(customer, b.total_price);
    be.payBookingWithWallet(customer, b.id);

    // Trip starts on Aug 20
    be.setNow("2026-08-20T10:00:00Z");
    be.checkIn(customer, b.id, 90);

    // Early closing on Aug 21 (4 days before scheduled dropoff on Aug 25)
    be.setNow("2026-08-21T14:00:00Z");
    const completed = be.checkOut(customer, b.id, 75);
    expect(completed.status).toBe("completed");
    expect(completed.return_checked_at).toBeTruthy();
    expect(completed.return_fuel_pct).toBe(75);
    expect(be.canReview(b.id)).toBe(true);
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

describe("rental booking windows & expiration", () => {
  test("formula cases: 3pm->6pm gives 4:30pm, approve at 4pm gives 5pm, next week gives +12h, under 2h refused", () => {
    // 3pm to 6pm with 1h buffer
    const t3pm = new Date("2026-08-15T15:00:00+05:30");
    const t6pm = new Date("2026-08-15T18:00:00+05:30");
    const dl1 = bookingDeadline(t3pm, t6pm, 3600 * 1000);
    expect(dl1.toISOString()).toBe(new Date("2026-08-15T16:30:00+05:30").toISOString());

    // approve at 4pm for 6pm pickup with 30m buffer
    const t4pm = new Date("2026-08-15T16:00:00+05:30");
    const dl2 = bookingDeadline(t4pm, t6pm, 30 * 60 * 1000);
    expect(dl2.toISOString()).toBe(new Date("2026-08-15T17:00:00+05:30").toISOString());

    // next week gives created + 12h
    const tNextWeek = new Date("2026-08-22T15:00:00+05:30");
    const dl3 = bookingDeadline(t3pm, tNextWeek, 3600 * 1000);
    expect(dl3.toISOString()).toBe(new Date(t3pm.getTime() + 12 * 3600 * 1000).toISOString());

    // under 2h is refused
    const be = createBackend(new Date("2026-08-15T15:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    expect(() =>
      be.createBooking({
        customer_id: cust,
        vehicle_id: v.id,
        start_date: "2026-08-15",
        end_date: "2026-08-16",
        pickup_time: "16:30", // only 1.5h away
      }),
    ).toThrow(/Pickup must be at least 2 hours from now/);
  });

  test("approving after respond_by fails", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    const b = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-15",
      end_date: "2026-08-16",
      pickup_time: "16:00", // 6h away -> respond_by is 13:00 (10:00 + 3h)
    });
    expect(b.respond_by).toBeDefined();

    // Advance clock past respond_by
    be.setNow(new Date("2026-08-15T14:00:00+05:30"));
    expect(() => be.hostDecide(host, b.id, "confirmed")).toThrow(/This request has expired/);
  });

  test("wallet payment after pay_by fails", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    const b = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-15",
      end_date: "2026-08-16",
      pickup_time: "16:00",
    });
    be.hostDecide(host, b.id, "confirmed");
    expect(b.status).toBe("confirmed");
    expect(b.pay_by).toBeDefined();

    be.wallet.topup(cust, b.total_price);

    // Advance clock past pay_by
    be.setNow(new Date(new Date(b.pay_by!).getTime() + 60_000));
    expect(() => be.payBookingWithWallet(cust, b.id)).toThrow(/Payment window has closed/);
  });

  test("a new request for the same car succeeds once the old one's respond_by is in the past", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust1 = be.registerCustomer("approved");
    const cust2 = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    const b1 = be.createBooking({
      customer_id: cust1,
      vehicle_id: v.id,
      start_date: "2026-08-16",
      end_date: "2026-08-17",
      pickup_time: "10:00",
    });

    // Advance clock past b1's respond_by
    be.setNow(new Date(new Date(b1.respond_by!).getTime() + 60_000));

    // cust2 creates overlapping booking -> succeeds because b1 is lazily cancelled
    const b2 = be.createBooking({
      customer_id: cust2,
      vehicle_id: v.id,
      start_date: "2026-08-16",
      end_date: "2026-08-17",
      pickup_time: "10:00",
    });
    expect(b2.status).toBe("pending");
    expect(b1.status).toBe("cancelled");
    expect(b1.cancellation_reason).toBe("host_no_response");
  });

  test("expire_booking_windows cancels both kinds of expired booking and sends each reminder once", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust1 = be.registerCustomer("approved");
    const cust2 = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    const b1 = be.createBooking({
      customer_id: cust1,
      vehicle_id: v.id,
      start_date: "2026-08-17",
      end_date: "2026-08-18",
    });

    const b2 = be.createBooking({
      customer_id: cust2,
      vehicle_id: v.id,
      start_date: "2026-08-20",
      end_date: "2026-08-21",
    });
    be.hostDecide(host, b2.id, "confirmed");

    // Manually set deadlines in the past for b1 and b2
    b1.respond_by = new Date("2026-08-15T11:00:00+05:30").toISOString();
    b2.pay_by = new Date("2026-08-15T11:00:00+05:30").toISOString();

    // Create b3 (pending halfway) and b4 (confirmed unpaid halfway)
    const b3 = be.createBooking({
      customer_id: cust1,
      vehicle_id: v.id,
      start_date: "2026-08-25",
      end_date: "2026-08-26",
    });
    b3.created_at = new Date("2026-08-15T08:00:00+05:30").toISOString();
    b3.respond_by = new Date("2026-08-15T12:00:00+05:30").toISOString(); // halfway 10:00

    const b4 = be.createBooking({
      customer_id: cust2,
      vehicle_id: v.id,
      start_date: "2026-08-28",
      end_date: "2026-08-29",
    });
    be.hostDecide(host, b4.id, "confirmed");
    b4.confirmed_at = new Date("2026-08-15T09:00:00+05:30").toISOString();
    b4.pay_by = new Date("2026-08-15T13:00:00+05:30").toISOString(); // halfway 11:00

    be.setNow(new Date("2026-08-15T11:30:00+05:30"));

    const res1 = be.expireBookingWindows();
    expect(res1.rentals_cancelled).toBe(2);
    expect(res1.reminders_sent).toBe(2);
    expect(b1.status).toBe("cancelled");
    expect(b1.cancellation_reason).toBe("host_no_response");
    expect(b2.status).toBe("cancelled");
    expect(b2.cancellation_reason).toBe("payment_timeout");
    expect(b3.respond_reminded_at).toBeDefined();
    expect(b4.pay_reminded_at).toBeDefined();

    // Second call is idempotent - no duplicate reminders or cancellations
    const notifCountBefore = be.notifications.length;
    const res2 = be.expireBookingWindows();
    expect(res2.rentals_cancelled).toBe(0);
    expect(res2.reminders_sent).toBe(0);
    expect(be.notifications.length).toBe(notifCountBefore);
  });

  test("a late Razorpay verify refunds to the wallet exactly once", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const v = be.listVehicle(host);
    const admin = be.registerAdmin();
    be.verifyVehicle(admin, v.id, "approved");

    const b = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-17",
      end_date: "2026-08-18",
    });
    be.hostDecide(host, b.id, "confirmed");

    // Booking expires and gets cancelled
    b.status = "cancelled";
    b.cancellation_reason = "payment_timeout";

    expect(be.wallet.balance(cust)).toBe(0);

    // Late Razorpay payment arrives
    be.payBookingWithRazorpay(cust, b.id);
    expect(b.payment_status).toBe("refunded");
    expect(be.wallet.balance(cust)).toBe(b.total_price);

    // Second late verify is idempotent
    be.payBookingWithRazorpay(cust, b.id);
    expect(be.wallet.balance(cust)).toBe(b.total_price);
  });

  test("an Instant Book insert lands as confirmed with pay_by, notifies both sides, and sorts first in browse", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const admin = be.registerAdmin();

    const standardCar = be.listVehicle(host, 1500, 2000, undefined, "Bengaluru", false);
    const instantCar = be.listVehicle(host, 2000, 2000, undefined, "Bengaluru", true);
    be.verifyVehicle(admin, standardCar.id, "approved");
    be.verifyVehicle(admin, instantCar.id, "approved");

    // Browse order: instant book vehicle is sorted first
    const catalog = be.browse();
    expect(catalog[0].id).toBe(instantCar.id);
    expect(catalog[1].id).toBe(standardCar.id);

    // Book instant vehicle
    const b = be.createBooking({
      customer_id: cust,
      vehicle_id: instantCar.id,
      start_date: "2026-08-20",
      end_date: "2026-08-22",
    });

    expect(b.status).toBe("confirmed");
    expect(b.confirmed_at).toBe(be.now.toISOString());
    expect(b.pay_by).toBeDefined();
    expect(b.respond_by).toBeNull();

    // Notified both sides
    expect(be.notifications.some((n) => n.user_id === host && n.title === "Instant booking confirmed")).toBe(true);
    expect(be.notifications.some((n) => n.user_id === cust && n.title === "Booking confirmed")).toBe(true);
  });

  test("host_response_stats numbers calculate accurately over 90 days", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const admin = be.registerAdmin();
    const v = be.listVehicle(host);
    be.verifyVehicle(admin, v.id, "approved");

    // Initially 0 requests
    const initialStats = be.hostResponseStats(host);
    expect(initialStats.request_count).toBe(0);
    expect(initialStats.response_rate).toBeNull();
    expect(initialStats.median_response_minutes).toBeNull();

    // 1. Responded (confirmed) in 20 minutes (before respond_by)
    be.setNow(new Date("2026-08-10T10:00:00+05:30"));
    const b1 = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-20",
      end_date: "2026-08-21",
    });
    be.setNow(new Date("2026-08-10T10:20:00+05:30"));
    be.hostDecide(host, b1.id, "confirmed");

    // 2. Responded (rejected) in 40 minutes (before respond_by)
    be.setNow(new Date("2026-08-12T10:00:00+05:30"));
    const b2 = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-22",
      end_date: "2026-08-23",
    });
    be.setNow(new Date("2026-08-12T10:40:00+05:30"));
    be.hostDecide(host, b2.id, "rejected");

    // 3. Expired without response (host_no_response)
    be.setNow(new Date("2026-08-14T10:00:00+05:30"));
    const b3 = be.createBooking({
      customer_id: cust,
      vehicle_id: v.id,
      start_date: "2026-08-25",
      end_date: "2026-08-26",
    });
    // Fast forward past respond_by (which is capped at +12h -> 22:00)
    be.setNow(new Date("2026-08-14T23:00:00+05:30"));
    be.expireBookingWindows();
    expect(b3.status).toBe("cancelled");
    expect(b3.cancellation_reason).toBe("host_no_response");

    // Check host_response_stats
    const stats = be.hostResponseStats(host);
    expect(stats.request_count).toBe(3);
    // 2 answered in time out of 3 = 0.6667
    expect(stats.response_rate).toBeCloseTo(0.6667, 3);
    // Median of [20, 40] is 30 minutes
    expect(stats.median_response_minutes).toBe(30);
  });

  test("3 expiries pause the listings once and reactivating resets the breach count", () => {
    const be = createBackend(new Date("2026-08-15T10:00:00+05:30"));
    const host = be.registerCustomer();
    const cust = be.registerCustomer("approved");
    const admin = be.registerAdmin();

    const v1 = be.listVehicle(host, 1200);
    const v2 = be.listVehicle(host, 1500);
    be.verifyVehicle(admin, v1.id, "approved");
    be.verifyVehicle(admin, v2.id, "approved");

    expect(v1.status).toBe("active");
    expect(v2.status).toBe("active");

    // Expiry 1
    be.setNow(new Date("2026-08-10T10:00:00+05:30"));
    be.createBooking({ customer_id: cust, vehicle_id: v1.id, start_date: "2026-08-20", end_date: "2026-08-21" });
    be.setNow(new Date("2026-08-10T23:00:00+05:30"));
    be.expireBookingWindows();
    expect(v1.status).toBe("active");

    // Expiry 2
    be.setNow(new Date("2026-08-11T10:00:00+05:30"));
    be.createBooking({ customer_id: cust, vehicle_id: v1.id, start_date: "2026-08-22", end_date: "2026-08-23" });
    be.setNow(new Date("2026-08-11T23:00:00+05:30"));
    be.expireBookingWindows();
    expect(v1.status).toBe("active");

    // Expiry 3 - breaches threshold of 3 in 30 days
    be.setNow(new Date("2026-08-12T10:00:00+05:30"));
    be.createBooking({ customer_id: cust, vehicle_id: v1.id, start_date: "2026-08-24", end_date: "2026-08-25" });
    be.setNow(new Date("2026-08-12T23:00:00+05:30"));
    be.expireBookingWindows();

    // Both vehicles should now be paused
    expect(v1.status).toBe("paused");
    expect(v2.status).toBe("paused");

    // Notified vendor with exact message
    const pauseNote = be.notifications.find(
      (n) => n.user_id === host && n.title === "Your listings are paused",
    );
    expect(pauseNote).toBeDefined();
    expect(pauseNote?.body).toContain(
      "Your listings are paused because 3 requests expired without a response. Turn them back on from your dashboard.",
    );

    // Calling expire again is idempotent (only runs once per breach)
    const notifsCount = be.notifications.length;
    be.expireBookingWindows();
    expect(be.notifications.length).toBe(notifsCount);

    // Host reactivates listings
    be.reactivateVendorListings(host, host);
    expect(v1.status).toBe("active");
    expect(v2.status).toBe("active");

    // After reactivation, previous 3 expiries do not cause instant re-pause
    be.expireBookingWindows();
    expect(v1.status).toBe("active");
    expect(v2.status).toBe("active");
  });
});
