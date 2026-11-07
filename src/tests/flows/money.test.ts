import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/charges";
import { createBackend, RuleError } from "../harness/fake-backend";

const NOW = new Date("2026-08-15T10:00:00Z");

/** Production rates: 10% commission, 5% service fee, 18% GST, Rs 500 min withdrawal. */
function setup() {
  const be = createBackend(NOW, DEFAULT_SETTINGS);
  const admin = be.registerAdmin();
  const host = be.registerCustomer("approved", "host@test.local");
  const customer = be.registerCustomer("approved", "rider@test.local");
  const vehicle = be.listVehicle(host, 1000, 2000);
  be.verifyVehicle(admin, vehicle.id, "approved");
  return { be, admin, host, customer, vehicle };
}

/** One-day rental (10:00 → next day 10:00) = base 1000. */
const oneDay = {
  start_date: "2026-08-20",
  end_date: "2026-08-21",
  pickup_time: "10:00",
  dropoff_time: "10:00",
};

function paidRental(coupon_code?: string) {
  const s = setup();
  const b = s.be.createBooking({
    customer_id: s.customer,
    vehicle_id: s.vehicle.id,
    ...oneDay,
    coupon_code,
  });
  s.be.hostDecide(s.host, b.id, "confirmed");
  s.be.wallet.topup(s.customer, b.total_price);
  s.be.payBookingWithWallet(s.customer, b.id);
  return { ...s, b };
}

describe("server-side pricing", () => {
  test("a client-sent price is ignored; fees, GST and deposit are added", () => {
    const { be, customer, vehicle } = setup();
    const b = be.createBooking({
      customer_id: customer,
      vehicle_id: vehicle.id,
      ...oneDay,
      total_price: 1,
    });
    expect(b.base_price).toBe(1000);
    expect(b.service_fee).toBe(50);
    expect(b.gst).toBe(9);
    expect(b.security_deposit).toBe(2000);
    expect(b.total_price).toBe(3059);
    expect(b.provider_earning).toBe(882);
  });

  test("updating money columns after booking has no effect", () => {
    const { be, customer, vehicle } = setup();
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...oneDay });
    expect(be.tamperBookingPrice(b.id, 1).total_price).toBe(3059);
  });

  test("hourly vehicles bill whole hours under a day", () => {
    const s = setup();
    const v = s.be.listVehicle(s.host, 1000, 0, 150);
    s.be.verifyVehicle(s.admin, v.id, "approved");
    const b = s.be.createBooking({
      customer_id: s.customer,
      vehicle_id: v.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      pickup_time: "10:00",
      dropoff_time: "13:30",
    });
    expect(b.base_price).toBe(600);
  });

  test("driver hire and wash are repriced too", () => {
    const { be, admin, customer } = setup();
    const d = be.enrollDriver(200, 1500);
    be.verifyDriver(admin, d.id, "approved");
    const hire = be.hireDriver({
      customer_id: customer,
      driver_id: d.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
      total_price: 1,
    });
    expect(hire.base_price).toBe(1500);
    expect(hire.total_price).toBe(1588.5); // 1500 + 75 fee + 13.5 GST
    const w = be.bookWash(customer, "2026-08-20", 400);
    expect(w.price).toBe(423.6); // 400 + 20 fee + 3.6 GST
  });
});

describe("coupons", () => {
  test("a valid coupon discounts the customer's price only", () => {
    const s = setup();
    s.be.addCoupon(s.admin, { code: "welcome20", percent_off: 20, active: true });
    const b = s.be.createBooking({
      customer_id: s.customer,
      vehicle_id: s.vehicle.id,
      ...oneDay,
      coupon_code: " Welcome20 ",
    });
    expect(b.coupon_code).toBe("WELCOME20");
    expect(b.discount).toBe(200);
    expect(b.total_price).toBe(2847.2); // 800 + 40 fee + 7.2 GST + 2000 deposit
    expect(b.provider_earning).toBe(882);
  });

  test("unknown, inactive or expired coupons are rejected", () => {
    const s = setup();
    s.be.addCoupon(s.admin, { code: "OFF", amount_off: 100, active: false });
    s.be.addCoupon(s.admin, {
      code: "OLD",
      amount_off: 100,
      active: true,
      ends_at: "2026-08-01T00:00:00Z",
    });
    for (const code of ["NOPE", "OFF", "OLD"]) {
      expect(() =>
        s.be.createBooking({
          customer_id: s.customer,
          vehicle_id: s.vehicle.id,
          ...oneDay,
          coupon_code: code,
        }),
      ).toThrow(/Invalid or expired coupon/);
    }
  });

  test("only admins create coupons", () => {
    const s = setup();
    expect(() => s.be.addCoupon(s.customer, { code: "X", percent_off: 50, active: true })).toThrow(
      /Admins only/,
    );
  });
});

describe("earnings are released on completion", () => {
  test("wallet payment credits nothing to the host until the trip completes", () => {
    const { be, host, customer, b } = paidRental();
    expect(be.wallet.balance(host)).toBe(0);
    be.setNow("2026-08-20T10:00:00Z");
    be.checkIn(customer, b.id, 80);
    be.setNow("2026-08-21T10:00:00Z");
    be.checkOut(customer, b.id, 70);
    expect(be.wallet.balance(host)).toBe(882);
    expect(be.wallet.balance(customer)).toBe(2000); // deposit returned
  });

  test("Razorpay-paid rentals now credit the host too", () => {
    const s = setup();
    const b = s.be.createBooking({ customer_id: s.customer, vehicle_id: s.vehicle.id, ...oneDay });
    s.be.hostDecide(s.host, b.id, "confirmed");
    s.be.payBookingWithRazorpay(s.customer, b.id);
    s.be.setNow("2026-08-20T10:00:00Z");
    s.be.checkIn(s.customer, b.id, 80);
    s.be.checkOut(s.customer, b.id, 70);
    expect(s.be.wallet.balance(s.host)).toBe(882);
  });

  test("the host cannot complete a paid trip before the return check-out", () => {
    const { be, host, b } = paidRental();
    expect(() => be.completeBooking(host, b.id)).toThrow(/return check-out/);
  });

  test("earnings are credited exactly once", () => {
    const { be, host, customer, admin, b } = paidRental();
    be.setNow("2026-08-20T10:00:00Z");
    be.checkIn(customer, b.id, 80);
    be.checkOut(customer, b.id, 70);
    expect(() => be.completeBooking(admin, b.id)).toThrow(/confirmed/);
    expect(be.wallet.txns(host).filter((t) => t.kind === "booking_earning")).toHaveLength(1);
  });

  test("driver earnings release when the driver completes the hire", () => {
    const { be, admin, customer } = setup();
    const d = be.enrollDriver(200, 1500);
    be.verifyDriver(admin, d.id, "approved");
    const hire = be.hireDriver({
      customer_id: customer,
      driver_id: d.id,
      start_date: "2026-08-20",
      end_date: "2026-08-20",
    });
    be.driverDecide(d.id, hire.id, "confirmed");
    be.wallet.topup(customer, hire.total_price);
    be.payDriverBookingWithWallet(customer, hire.id);
    expect(be.wallet.balance(d.id)).toBe(0);
    expect(() => be.completeDriverBooking(customer, hire.id)).toThrow(/Only the driver/);
    be.completeDriverBooking(d.id, hire.id);
    expect(be.wallet.balance(d.id)).toBe(1323); // 1500 - 150 commission - 27 GST
  });
});

describe("cancellation money split", () => {
  test("a late customer cancel splits the rent; deposit always comes back", () => {
    const { be, host, customer, b } = paidRental();
    be.setNow("2026-08-20T02:00:00Z"); // 8h before pickup → 50%
    const res = be.cancelBooking(customer, b.id);
    expect(res.percent).toBe(50);
    expect(res.refund).toBe(2529.5); // 2000 deposit + half of 1059
    expect(res.provider_share).toBe(441);
    expect(be.wallet.balance(customer)).toBe(2529.5);
    expect(be.wallet.balance(host)).toBe(441);
    expect(res.booking.payment_status).toBe("partially_refunded");
  });

  test("a host cancellation is always a full refund", () => {
    const { be, host, customer, b } = paidRental();
    be.setNow("2026-08-20T09:00:00Z");
    const res = be.cancelBooking(host, b.id);
    expect(res.percent).toBe(100);
    expect(be.wallet.balance(customer)).toBe(3059);
    expect(be.wallet.balance(host)).toBe(0);
  });

  test("strangers cannot cancel", () => {
    const { be, b } = paidRental();
    const stranger = be.registerCustomer();
    expect(() => be.cancelBooking(stranger, b.id)).toThrow(/Not your booking/);
  });
});

describe("withdrawals", () => {
  /** A host who has earned 882 + 882 = 1764 from two completed trips. */
  function earningHost() {
    const s = setup();
    for (const [start, end] of [
      ["2026-08-20", "2026-08-21"],
      ["2026-08-25", "2026-08-26"],
    ]) {
      const b = s.be.createBooking({
        customer_id: s.customer,
        vehicle_id: s.vehicle.id,
        start_date: start,
        end_date: end,
        pickup_time: "10:00",
        dropoff_time: "10:00",
      });
      s.be.hostDecide(s.host, b.id, "confirmed");
      s.be.payBookingWithRazorpay(s.customer, b.id);
      s.be.setNow(`${start}T10:00:00Z`);
      s.be.checkIn(s.customer, b.id, 80);
      s.be.checkOut(s.customer, b.id, 80);
    }
    return s;
  }
  const upi = { upi_id: "host@okaxis" };

  test("withdrawable equals completed earnings", () => {
    const { be, host } = earningHost();
    expect(be.withdrawable(host)).toBe(1764);
  });

  test("request holds the money, admin pays with a reference", () => {
    const { be, host, admin } = earningHost();
    const w = be.requestWithdrawal(host, 1000, "upi", upi);
    expect(be.wallet.balance(host)).toBe(764);
    expect(be.withdrawable(host)).toBe(764);
    expect(() => be.decideWithdrawal(admin, w.id, "paid")).toThrow(/reference/);
    be.decideWithdrawal(admin, w.id, "paid", "UTR123");
    expect(be.tables.withdrawals.get(w.id)!.status).toBe("paid");
    expect(be.wallet.balance(host)).toBe(764);
    expect(() => be.decideWithdrawal(admin, w.id, "rejected")).toThrow(/already processed/);
  });

  test("a rejected withdrawal returns the money and it is withdrawable again", () => {
    const { be, host, admin } = earningHost();
    const w = be.requestWithdrawal(host, 1764, "upi", upi);
    expect(be.withdrawable(host)).toBe(0);
    be.decideWithdrawal(admin, w.id, "rejected");
    expect(be.wallet.balance(host)).toBe(1764);
    expect(be.withdrawable(host)).toBe(1764);
  });

  test("minimum, maximum and payout details are enforced", () => {
    const { be, host } = earningHost();
    expect(() => be.requestWithdrawal(host, 499, "upi", upi)).toThrow(/Minimum/);
    expect(() => be.requestWithdrawal(host, 1765, "upi", upi)).toThrow(/at most Rs 1764/);
    expect(() => be.requestWithdrawal(host, 600, "upi", { upi_id: "nope" })).toThrow(/UPI/);
    expect(() =>
      be.requestWithdrawal(host, 600, "bank", {
        account_name: "A",
        account_number: "12",
        ifsc: "SBIN0001234",
      }),
    ).toThrow(/account number/);
    expect(() =>
      be.requestWithdrawal(host, 600, "bank", {
        account_name: "A",
        account_number: "123456789",
        ifsc: "BAD",
      }),
    ).toThrow(/IFSC/);
    expect(
      be.requestWithdrawal(host, 600, "bank", {
        account_name: "A",
        account_number: "123456789",
        ifsc: "sbin0001234",
      }).status,
    ).toBe("requested");
  });

  test("top-ups, refunds and promo credit can never be withdrawn", () => {
    const { be, host, admin } = earningHost();
    be.wallet.topup(host, 5000);
    be.grantCredit(admin, "host@test.local", 1000);
    expect(be.wallet.balance(host)).toBe(7764);
    expect(be.withdrawable(host)).toBe(1764);
  });

  test("customers cannot withdraw", () => {
    const { be, customer } = earningHost();
    be.wallet.topup(customer, 5000);
    expect(() => be.requestWithdrawal(customer, 1000, "upi", upi)).toThrow(
      /Only hosts and drivers/,
    );
  });
});

describe("promo credit", () => {
  test("admins grant credit by email; others cannot", () => {
    const { be, admin, customer } = setup();
    expect(be.grantCredit(admin, "RIDER@test.local", 250)).toBe(250);
    expect(be.wallet.txns(customer).at(-1)!.kind).toBe("promo_credit");
    expect(() => be.grantCredit(customer, "rider@test.local", 250)).toThrow(RuleError);
    expect(() => be.grantCredit(admin, "ghost@test.local", 250)).toThrow(/No user/);
  });
});

describe("settings", () => {
  test("admin changes to fees apply to new bookings", () => {
    const { be, admin, customer, vehicle } = setup();
    be.updateSettings(admin, { service_fee_pct: 0, gst_pct: 0 });
    const b = be.createBooking({ customer_id: customer, vehicle_id: vehicle.id, ...oneDay });
    expect(b.total_price).toBe(3000);
    expect(() => be.updateSettings(customer, { commission_pct: 0 })).toThrow(/Admins only/);
  });
});

describe("admin refund", () => {
  test("admins credit a refund by email with a reason; it is not withdrawable", () => {
    const { be, admin, customer } = setup();
    expect(be.adminRefund(admin, "RIDER@test.local", 300, "Host was late")).toBe(300);
    expect(be.wallet.txns(customer).at(-1)).toMatchObject({ kind: "refund", amount: 300, balance_after: 300 });
    expect(be.withdrawable(customer)).toBe(0);
  });

  test("non-admins, missing reasons, bad amounts and unknown emails are rejected", () => {
    const { be, admin, customer } = setup();
    expect(() => be.adminRefund(customer, "rider@test.local", 300, "x")).toThrow(/Admins only/);
    expect(() => be.adminRefund(admin, "rider@test.local", 300, "   ")).toThrow(/reason/);
    expect(() => be.adminRefund(admin, "rider@test.local", 0, "x")).toThrow(/between/);
    expect(() => be.adminRefund(admin, "ghost@test.local", 300, "x")).toThrow(/No user/);
    expect(be.wallet.balance(customer)).toBe(0);
  });
});

describe("trip extension", () => {
  /** Paid one-day rental (base 1000) that has been picked up. */
  function activeTrip() {
    const s = paidRental();
    s.be.setNow("2026-08-20T10:00:00Z");
    s.be.checkIn(s.host, s.b.id, 80);
    return s;
  }

  test("only the customer can request, and only during an active trip", () => {
    const s = paidRental();
    expect(() => s.be.requestExtension(s.customer, s.b.id, 6)).toThrow(/active trip/);
    s.be.setNow("2026-08-20T10:00:00Z");
    s.be.checkIn(s.host, s.b.id, 80);
    expect(() => s.be.requestExtension(s.host, s.b.id, 6)).toThrow(/Not your booking/);
    expect(() => s.be.requestExtension(s.customer, s.b.id, 0)).toThrow(/1 to 72/);
    expect(() => s.be.requestExtension(s.customer, s.b.id, 73)).toThrow(/1 to 72/);
  });

  test("request → host accepts → wallet pays → booking extended and earning released on return", () => {
    const { be, host, customer, b } = activeTrip();
    const totalBefore = b.total_price;

    // 24h + 6h = 30h → 2 days = 2000, so the extra base is 1000.
    const e = be.requestExtension(customer, b.id, 6);
    expect(e).toMatchObject({ base: 1000, service_fee: 50, gst: 9, provider_earning: 882, customer_total: 1059 });
    expect(e).toMatchObject({ new_end_date: "2026-08-21", new_dropoff_time: "16:00", status: "pending" });
    expect(() => be.requestExtension(customer, b.id, 3)).toThrow(/already open/);
    expect(() => be.payExtension(customer, e.id)).toThrow(/not accepted/);
    expect(() => be.decideExtension(customer, e.id, true)).toThrow(/Only the host/);

    be.decideExtension(host, e.id, true);
    expect(() => be.decideExtension(host, e.id, true)).toThrow(/already decided/);
    be.wallet.topup(customer, 1059);
    be.payExtension(customer, e.id);

    expect(be.wallet.balance(customer)).toBe(0);
    expect(b).toMatchObject({
      end_date: "2026-08-21",
      dropoff_time: "16:00",
      base_price: 2000,
      provider_earning: 1764,
      total_price: totalBefore + 1059,
    });
    expect(() => be.payExtension(customer, e.id)).toThrow(/Already paid/);

    be.checkOut(host, b.id, 70);
    expect(be.wallet.txns(host).filter((t) => t.kind === "booking_earning").map((t) => t.amount)).toEqual([1764]);
  });

  test("an accept that would clash with the next booking is rejected; the customer can withdraw and retry", () => {
    const { be, host, customer, vehicle, b } = activeTrip();
    const e = be.requestExtension(customer, b.id, 24); // → 22 Aug 10:00

    const other = be.registerCustomer("approved");
    be.createBooking({ customer_id: other, vehicle_id: vehicle.id, start_date: "2026-08-22", end_date: "2026-08-23" });

    expect(() => be.decideExtension(host, e.id, true)).toThrow(/booked or blocked/);
    expect(() => be.requestExtension(customer, b.id, 48)).toThrow(/already open/);
    be.cancelExtension(customer, e.id);
    expect(() => be.requestExtension(customer, b.id, 48)).toThrow(/not available/);
    expect(be.requestExtension(customer, b.id, 3).status).toBe("pending"); // same day, no clash
  });

  test("a declined request cannot be paid; insufficient balance leaves the booking unchanged", () => {
    const { be, host, customer, b } = activeTrip();
    const declined = be.requestExtension(customer, b.id, 6);
    be.decideExtension(host, declined.id, false);
    expect(() => be.payExtension(customer, declined.id)).toThrow(/not accepted/);

    const e = be.requestExtension(customer, b.id, 6);
    be.decideExtension(host, e.id, true);
    expect(() => be.payExtension(customer, e.id)).toThrow(/Insufficient/);
    expect(b).toMatchObject({ end_date: "2026-08-21", dropoff_time: "10:00", base_price: 1000 });
    expect(e.status).toBe("accepted");
  });

  test("after the return check-out the trip can no longer be extended or paid", () => {
    const { be, host, customer, b } = activeTrip();
    const e = be.requestExtension(customer, b.id, 6);
    be.decideExtension(host, e.id, true);
    be.checkOut(host, b.id, 70);
    be.wallet.topup(customer, 2000);
    expect(() => be.payExtension(customer, e.id)).toThrow(/already ended/);
    expect(() => be.requestExtension(customer, b.id, 6)).toThrow(/paid, confirmed|active trip/);
  });
});
