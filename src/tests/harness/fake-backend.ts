/**
 * In-memory model of Synchoo's server-side rules, used by the end-to-end
 * integration tests. It mirrors the guards that live in the database
 * (triggers, RPCs and RLS intent) so flows can be exercised deterministically
 * without a live connection:
 *
 *  - vehicle + driver verification gates and customer DL gate
 *  - double-booking / overbooking prevention on overlapping dates
 *  - wallet debits, refunds and transaction ledger
 *  - pooling seat accounting, duplicate requests and driver accept/decline
 *  - cancellation refund tiers (rental, driver hire, wash)
 *  - handover (check-in / check-out) sequencing
 *  - server-side pricing, platform fees, coupons (money phase 1)
 *  - earnings released on completion, provider withdrawals, promo credits
 *
 * Every rule is expressed once here and asserted by the flow tests.
 * Mirrors supabase/migrations/20261105120000_money_phase1.sql.
 */

import { computeCharges, round2, type Charges, type PlatformSettings } from "@/lib/charges";
import { calculateRentalPrice } from "@/lib/format";
import { calculateDriverPrice } from "@/lib/driver-pricing";

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "partially_refunded";

export class RuleError extends Error {}

const day = 86_400_000;

/** Harness default: fees off, so legacy flow tests keep their round numbers. */
export const ZERO_FEES: PlatformSettings = { commission_pct: 0, service_fee_pct: 0, gst_pct: 0, min_withdrawal: 500 };

export type Money = Charges & { base_price: number; coupon_code: string | null; earning_credited_at: string | null };

export type Vehicle = {
  id: string;
  vendor_id: string;
  price_daily: number;
  price_hourly?: number;
  security_deposit: number;
  status: "draft" | "active" | "paused";
  verification_status: "pending" | "approved" | "rejected";
};

export type Booking = Money & {
  id: string;
  vehicle_id: string;
  vendor_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  pickup_time: string;
  dropoff_time: string;
  security_deposit: number;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  refund_amount: number;
  pickup_checked_at: string | null;
  return_checked_at: string | null;
  pickup_fuel_pct?: number;
  return_fuel_pct?: number;
};

export type Coupon = {
  code: string;
  percent_off?: number | null;
  amount_off?: number | null;
  active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  method: "upi" | "bank";
  status: "requested" | "paid" | "rejected";
  reference: string | null;
};

export type Driver = {
  id: string;
  hourly_rate: number;
  daily_rate: number;
  status: "draft" | "active" | "paused";
  verification_status: "pending" | "approved" | "rejected";
};

export type DriverBooking = Money & {
  id: string;
  driver_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  refund_amount: number;
};

export type PoolTrip = {
  id: string;
  driver_id: string;
  depart_at: string;
  seats_total: number;
  seats_available: number;
  fare_per_seat: number;
  status: "scheduled" | "started" | "completed" | "cancelled";
};

export type PoolRequest = {
  id: string;
  trip_id: string;
  passenger_id: string;
  seats: number;
  match_score: number;
  status: BookingStatus;
};

export type WashBooking = Money & {
  id: string;
  customer_id: string;
  slot_date: string;
  price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  assigned_vendor_id: string | null;
  refund_amount: number;
};

export type WalletTxn = { user_id: string; amount: number; kind: string; balance_after: number };

/** Cancellation refund tiers, mirroring the cancel_* database functions. */
export function refundPercent(startsAt: Date, now: Date): number {
  const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  if (hours >= 24) return 100;
  if (hours >= 2) return 50;
  return 0;
}

export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

const EARNING_KINDS = ["booking_earning", "driver_earning", "driver_refund_reversal"];

export function createBackend(now = new Date("2026-08-15T10:00:00Z"), initialSettings: PlatformSettings = ZERO_FEES) {
  const clock = { now };
  const settings: PlatformSettings = { ...initialSettings };
  const profiles = new Map<string, { dl_status: "none" | "pending" | "approved" | "rejected" }>();
  const admins = new Set<string>();
  const emails = new Map<string, string>();
  const hosts = new Set<string>();
  const coupons = new Map<string, Coupon>();
  const withdrawals = new Map<string, Withdrawal>();
  const vehicles = new Map<string, Vehicle>();
  const bookings = new Map<string, Booking>();
  const drivers = new Map<string, Driver>();
  const driverBookings = new Map<string, DriverBooking>();
  const trips = new Map<string, PoolTrip>();
  const poolRequests = new Map<string, PoolRequest>();
  const washes = new Map<string, WashBooking>();
  const wallets = new Map<string, number>();
  const walletTxns: WalletTxn[] = [];
  const notifications: { user_id: string; title: string }[] = [];

  const notify = (user_id: string, title: string) => notifications.push({ user_id, title });

  const wallet = {
    balance: (user: string) => wallets.get(user) ?? 0,
    topup(user: string, amount: number) {
      if (amount <= 0) throw new RuleError("Top-up must be positive");
      const next = wallet.balance(user) + amount;
      wallets.set(user, next);
      walletTxns.push({ user_id: user, amount, kind: "topup", balance_after: next });
      notify(user, "Wallet topped up");
      return next;
    },
    apply(user: string, amount: number, kind: string) {
      const next = wallet.balance(user) + amount;
      if (next < 0) throw new RuleError("Insufficient wallet balance");
      wallets.set(user, next);
      walletTxns.push({ user_id: user, amount, kind, balance_after: next });
      return next;
    },
    txns: (user: string) => walletTxns.filter((t) => t.user_id === user),
  };

  /** public.compute_charges: validates the coupon and prices the base amount. */
  const price = (base: number, coupon_code?: string | null): Money => {
    const code = coupon_code?.trim().toUpperCase() || null;
    let coupon: Coupon | undefined;
    if (code) {
      coupon = coupons.get(code);
      const t = clock.now.getTime();
      const live =
        coupon &&
        coupon.active &&
        (!coupon.starts_at || new Date(coupon.starts_at).getTime() <= t) &&
        (!coupon.ends_at || new Date(coupon.ends_at).getTime() >= t);
      if (!live) throw new RuleError("Invalid or expired coupon");
    }
    const c = computeCharges(base, settings, coupon);
    return { ...c, base_price: c.base, coupon_code: code, earning_credited_at: null };
  };

  const isProvider = (user: string) => hosts.has(user) || drivers.has(user);

  /** Earnings and deposit are released when a paid booking completes (tg_money_settle_*). */
  const settleRental = (b: Booking) => {
    if (b.payment_status !== "paid" || b.earning_credited_at) return;
    if (b.vendor_id !== b.customer_id && b.provider_earning > 0)
      wallet.apply(b.vendor_id, b.provider_earning, "booking_earning");
    if (b.security_deposit > 0) wallet.apply(b.customer_id, b.security_deposit, "refund");
    b.earning_credited_at = clock.now.toISOString();
  };
  const settleDriver = (b: DriverBooking) => {
    if (b.payment_status !== "paid" || b.earning_credited_at) return;
    if (b.driver_id !== b.customer_id && b.provider_earning > 0)
      wallet.apply(b.driver_id, b.provider_earning, "driver_earning");
    b.earning_credited_at = clock.now.toISOString();
  };

  const withdrawable = (user: string) => {
    const earned = walletTxns
      .filter((t) => t.user_id === user && EARNING_KINDS.includes(t.kind))
      .reduce((s, t) => s + t.amount, 0);
    const withdrawn = [...withdrawals.values()]
      .filter((w) => w.user_id === user && w.status !== "rejected")
      .reduce((s, w) => s + w.amount, 0);
    return Math.max(0, Math.min(wallet.balance(user), round2(earned - withdrawn)));
  };

  return {
    clock,
    setNow: (d: string | Date) => (clock.now = new Date(d)),
    wallet,
    notifications,
    settings,
    tables: { vehicles, bookings, drivers, driverBookings, trips, poolRequests, washes, withdrawals, coupons },

    /* ---------- accounts ---------- */
    registerCustomer(dl: "none" | "pending" | "approved" | "rejected" = "approved", email?: string) {
      const uid = id("user");
      profiles.set(uid, { dl_status: dl });
      emails.set((email ?? `${uid}@test.local`).toLowerCase(), uid);
      return uid;
    },
    setDl(user: string, dl: "none" | "pending" | "approved" | "rejected") {
      profiles.set(user, { dl_status: dl });
    },
    registerAdmin() {
      const uid = id("admin");
      admins.add(uid);
      return uid;
    },

    /* ---------- vehicle listing + admin verification ---------- */
    listVehicle(vendor_id: string, price_daily = 1200, security_deposit = 2000, price_hourly?: number): Vehicle {
      // Guard: new listings are always pending, never publicly visible.
      const v: Vehicle = {
        id: id("veh"),
        vendor_id,
        price_daily,
        price_hourly,
        security_deposit,
        status: "active",
        verification_status: "pending",
      };
      vehicles.set(v.id, v);
      hosts.add(vendor_id);
      return v;
    },
    verifyVehicle(actor: string, vehicle_id: string, decision: "approved" | "rejected") {
      if (!admins.has(actor)) throw new RuleError("Only admins can verify vehicles");
      const v = vehicles.get(vehicle_id)!;
      v.verification_status = decision;
      notify(v.vendor_id, `Vehicle ${decision}`);
      return v;
    },
    /** What an anonymous visitor sees in Browse Rides for a date range. */
    browse(startDate?: string, endDate?: string) {
      const blocked = new Set(
        [...bookings.values()]
          .filter((b) => ["pending", "confirmed"].includes(b.status))
          .filter((b) => !startDate || !endDate || datesOverlap(b.start_date, b.end_date, startDate, endDate))
          .map((b) => b.vehicle_id),
      );
      return [...vehicles.values()].filter(
        (v) => v.status === "active" && v.verification_status === "approved" && !blocked.has(v.id),
      );
    },

    /* ---------- rental bookings ---------- */
    createBooking(args: {
      customer_id: string;
      vehicle_id: string;
      start_date: string;
      end_date: string;
      pickup_time?: string;
      dropoff_time?: string;
      /** Client-sent price — ignored; the backend reprices (tg_price_booking). */
      total_price?: number;
      coupon_code?: string | null;
    }): Booking {
      const v = vehicles.get(args.vehicle_id);
      if (!v) throw new RuleError("Vehicle not found");
      if (v.verification_status !== "approved" || v.status !== "active")
        throw new RuleError("This vehicle is not available for booking");
      if (v.vendor_id === args.customer_id) throw new RuleError("You cannot book your own vehicle");
      if ((profiles.get(args.customer_id)?.dl_status ?? "none") !== "approved")
        throw new RuleError("Your driving licence must be approved before booking");
      const clash = [...bookings.values()].some(
        (b) =>
          b.vehicle_id === v.id &&
          ["pending", "confirmed"].includes(b.status) &&
          datesOverlap(b.start_date, b.end_date, args.start_date, args.end_date),
      );
      if (clash) throw new RuleError("These dates are already booked");

      const pickup_time = args.pickup_time ?? "10:00";
      const dropoff_time = args.dropoff_time ?? "18:00";
      const rental = calculateRentalPrice({
        startDate: args.start_date,
        endDate: args.end_date,
        pickupTime: pickup_time,
        dropoffTime: dropoff_time,
        priceHourly: v.price_hourly,
        priceDaily: v.price_daily,
      });
      if (rental.hours <= 0) throw new RuleError("Drop-off must be after pickup");
      const money = price(rental.subtotal, args.coupon_code);

      const b: Booking = {
        ...money,
        id: id("bk"),
        vehicle_id: v.id,
        vendor_id: v.vendor_id,
        customer_id: args.customer_id,
        start_date: args.start_date,
        end_date: args.end_date,
        pickup_time,
        dropoff_time,
        security_deposit: v.security_deposit,
        total_price: round2(money.customer_total + v.security_deposit),
        status: "pending",
        payment_status: "unpaid",
        refund_amount: 0,
        pickup_checked_at: null,
        return_checked_at: null,
      };
      bookings.set(b.id, b);
      notify(v.vendor_id, "New booking request");
      return b;
    },
    hostDecide(actor: string, booking_id: string, decision: "confirmed" | "rejected") {
      const b = bookings.get(booking_id)!;
      if (b.vendor_id !== actor) throw new RuleError("Only the host can decide this booking");
      if (b.status !== "pending") throw new RuleError("This booking is no longer pending");
      b.status = decision;
      notify(b.customer_id, `Booking ${decision}`);
      return b;
    },
    payBookingWithWallet(actor: string, booking_id: string) {
      const b = bookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your booking");
      if (b.status !== "confirmed") throw new RuleError("Only confirmed bookings can be paid");
      if (b.payment_status === "paid") throw new RuleError("Already paid");
      wallet.apply(actor, -b.total_price, "booking_payment");
      b.payment_status = "paid";
      notify(b.vendor_id, "Booking paid");
      return b;
    },
    /** Razorpay path: verify only marks the booking paid; no earning is credited yet. */
    payBookingWithRazorpay(actor: string, booking_id: string) {
      const b = bookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your booking");
      if (b.status !== "confirmed") throw new RuleError("Only confirmed bookings can be paid");
      if (b.payment_status === "paid") throw new RuleError("Already paid");
      b.payment_status = "paid";
      return b;
    },
    /** Host marks the trip completed (tg_money_guard_booking rules). */
    completeBooking(actor: string, booking_id: string) {
      const b = bookings.get(booking_id)!;
      if (actor !== b.vendor_id && !admins.has(actor)) throw new RuleError("Only the host can complete a trip");
      if (b.status !== "confirmed") throw new RuleError("Only confirmed bookings can be completed");
      if (b.payment_status === "paid" && !b.return_checked_at && !admins.has(actor))
        throw new RuleError("Record the return check-out before completing the trip");
      b.status = "completed";
      settleRental(b);
      return b;
    },
    /** A client trying to rewrite money columns on UPDATE is reset by the guard. */
    tamperBookingPrice(booking_id: string, total_price: number) {
      const b = bookings.get(booking_id)!;
      void total_price;
      return b;
    },
    checkIn(actor: string, booking_id: string, fuel_pct: number) {
      const b = bookings.get(booking_id)!;
      if (b.customer_id !== actor && b.vendor_id !== actor) throw new RuleError("Not your booking");
      if (b.status !== "confirmed" || b.payment_status !== "paid")
        throw new RuleError("Check-in unlocks after acceptance and payment");
      const opensAt = new Date(`${b.start_date}T${b.pickup_time}:00Z`).getTime() - 30 * 60_000;
      if (clock.now.getTime() < opensAt) throw new RuleError("Check-in is not open yet");
      if (b.pickup_checked_at) throw new RuleError("Already checked in");
      b.pickup_checked_at = clock.now.toISOString();
      b.pickup_fuel_pct = fuel_pct;
      return b;
    },
    checkOut(actor: string, booking_id: string, fuel_pct: number) {
      const b = bookings.get(booking_id)!;
      if (!b.pickup_checked_at) throw new RuleError("Complete the pickup check-in first");
      if (b.return_checked_at) throw new RuleError("Already checked out");
      b.return_checked_at = clock.now.toISOString();
      b.return_fuel_pct = fuel_pct;
      b.status = "completed";
      settleRental(b);
      return b;
    },
    /** public.cancel_booking — customer, host or admin. */
    cancelBooking(actor: string, booking_id: string) {
      const b = bookings.get(booking_id)!;
      const isAdmin = admins.has(actor);
      const byProvider = b.vendor_id === actor;
      if (b.customer_id !== actor && !byProvider && !isAdmin) throw new RuleError("Not your booking");
      if (!["pending", "confirmed"].includes(b.status)) throw new RuleError("This booking cannot be cancelled");
      if (b.pickup_checked_at && !isAdmin) throw new RuleError("The trip has already started");
      let pct = refundPercent(new Date(`${b.start_date}T${b.pickup_time}:00Z`), clock.now);
      if (byProvider || isAdmin) pct = 100;
      let refund = 0;
      let share = 0;
      if (b.payment_status === "paid") {
        refund = round2(b.security_deposit + ((b.total_price - b.security_deposit) * pct) / 100);
        share = round2((b.provider_earning * (100 - pct)) / 100);
        if (refund > 0) wallet.apply(b.customer_id, refund, "refund");
        if (share > 0 && b.vendor_id !== b.customer_id && !b.earning_credited_at)
          wallet.apply(b.vendor_id, share, "booking_earning");
        b.payment_status = pct === 100 ? "refunded" : "partially_refunded";
        b.earning_credited_at = clock.now.toISOString();
      }
      b.refund_amount = refund;
      b.status = "cancelled";
      notify(b.vendor_id, "Booking cancelled");
      return { booking: b, refund, percent: pct, provider_share: share };
    },
    canReview(booking_id: string) {
      return bookings.get(booking_id)!.status === "completed";
    },

    /* ---------- driver hire ---------- */
    enrollDriver(hourly = 200, daily = 1500) {
      const d: Driver = {
        id: id("drv"),
        hourly_rate: hourly,
        daily_rate: daily,
        status: "active",
        verification_status: "pending",
      };
      drivers.set(d.id, d);
      return d;
    },
    verifyDriver(actor: string, driver_id: string, decision: "approved" | "rejected") {
      if (!admins.has(actor)) throw new RuleError("Only admins can verify drivers");
      drivers.get(driver_id)!.verification_status = decision;
      return drivers.get(driver_id)!;
    },
    searchDrivers() {
      return [...drivers.values()].filter((d) => d.status === "active" && d.verification_status === "approved");
    },
    hireDriver(args: {
      customer_id: string;
      driver_id: string;
      start_date: string;
      end_date: string;
      rate_type?: "hourly" | "daily";
      start_time?: string;
      end_time?: string;
      /** Client-sent price — ignored; the backend reprices (tg_price_driver_booking). */
      total_price?: number;
      coupon_code?: string | null;
    }) {
      const d = drivers.get(args.driver_id);
      if (!d || d.verification_status !== "approved" || d.status !== "active")
        throw new RuleError("This driver is not available");
      const clash = [...driverBookings.values()].some(
        (b) =>
          b.driver_id === d.id &&
          ["pending", "confirmed"].includes(b.status) &&
          datesOverlap(b.start_date, b.end_date, args.start_date, args.end_date),
      );
      if (clash) throw new RuleError("This driver is already booked for those dates");
      const quote = calculateDriverPrice({
        rateType: args.rate_type ?? "daily",
        startDate: args.start_date,
        endDate: args.end_date,
        startTime: args.start_time ?? "09:00",
        endTime: args.end_time ?? "18:00",
        hourlyRate: d.hourly_rate,
        dailyRate: d.daily_rate,
      });
      if (quote.error) throw new RuleError(quote.error);
      const money = price(quote.subtotal, args.coupon_code);
      const b: DriverBooking = {
        ...money,
        id: id("dbk"),
        driver_id: d.id,
        customer_id: args.customer_id,
        start_date: args.start_date,
        end_date: args.end_date,
        total_price: money.customer_total,
        status: "pending",
        payment_status: "unpaid",
        refund_amount: 0,
      };
      driverBookings.set(b.id, b);
      notify(d.id, "New driver hire request");
      return b;
    },
    driverDecide(driver_id: string, booking_id: string, decision: "confirmed" | "rejected") {
      const b = driverBookings.get(booking_id)!;
      if (b.driver_id !== driver_id) throw new RuleError("Not your hire request");
      if (b.status !== "pending") throw new RuleError("This request is no longer pending");
      b.status = decision;
      notify(b.customer_id, `Driver ${decision === "confirmed" ? "accepted" : "declined"} your hire`);
      return b;
    },
    payDriverBookingWithWallet(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your hire");
      if (b.status !== "confirmed") throw new RuleError("Only accepted hires can be paid");
      if (b.payment_status === "paid") throw new RuleError("Already paid");
      wallet.apply(actor, -b.total_price, "driver_payment");
      b.payment_status = "paid";
      return b;
    },
    completeDriverBooking(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id)!;
      if (actor !== b.driver_id && !admins.has(actor)) throw new RuleError("Only the driver can complete a hire");
      if (b.status !== "confirmed") throw new RuleError("Only confirmed hires can be completed");
      b.status = "completed";
      settleDriver(b);
      return b;
    },
    /** public.cancel_driver_booking — customer, driver or admin. */
    cancelDriverBooking(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id)!;
      const isAdmin = admins.has(actor);
      const byDriver = b.driver_id === actor;
      if (b.customer_id !== actor && !byDriver && !isAdmin) throw new RuleError("Not your hire");
      if (!["pending", "confirmed"].includes(b.status)) throw new RuleError("This hire cannot be cancelled");
      let pct = refundPercent(new Date(`${b.start_date}T00:00:00Z`), clock.now);
      if (byDriver || isAdmin) pct = 100;
      let refund = 0;
      let share = 0;
      if (b.payment_status === "paid") {
        refund = round2((b.total_price * pct) / 100);
        share = round2((b.provider_earning * (100 - pct)) / 100);
        if (refund > 0) wallet.apply(b.customer_id, refund, "driver_refund");
        if (share > 0 && b.driver_id !== b.customer_id && !b.earning_credited_at)
          wallet.apply(b.driver_id, share, "driver_earning");
        b.payment_status = pct === 100 ? "refunded" : "partially_refunded";
        b.earning_credited_at = clock.now.toISOString();
      }
      b.refund_amount = refund;
      b.status = "cancelled";
      notify(b.driver_id, "Hire cancelled");
      return { booking: b, refund, percent: pct, provider_share: share };
    },

    /* ---------- car pooling ---------- */
    createTrip(driver_id: string, args: { depart_at: string; seats_total: number; fare_per_seat: number }) {
      if (args.seats_total < 1) throw new RuleError("A trip needs at least one seat");
      const t: PoolTrip = {
        id: id("trip"),
        driver_id,
        depart_at: args.depart_at,
        seats_total: args.seats_total,
        seats_available: args.seats_total,
        fare_per_seat: args.fare_per_seat,
        status: "scheduled",
      };
      trips.set(t.id, t);
      return t;
    },
    /** Direct seat tampering is ignored by the trip guard. */
    tamperSeats(trip_id: string, seats: number) {
      const t = trips.get(trip_id)!;
      void seats;
      return t;
    },
    requestSeat(args: { passenger_id: string; trip_id: string; seats: number; match_score: number }) {
      const t = trips.get(args.trip_id);
      if (!t) throw new RuleError("Trip not found");
      if (t.status !== "scheduled") throw new RuleError("This trip is no longer open");
      if (t.driver_id === args.passenger_id) throw new RuleError("You cannot join your own trip");
      if (args.match_score < 80) throw new RuleError("This trip does not match your route closely enough");
      if (args.seats < 1) throw new RuleError("Request at least one seat");
      if (args.seats > t.seats_available) throw new RuleError("Not enough seats available");
      const dupe = [...poolRequests.values()].some(
        (r) => r.trip_id === t.id && r.passenger_id === args.passenger_id && ["pending", "confirmed"].includes(r.status),
      );
      if (dupe) throw new RuleError("You already have an active request for this trip");
      const r: PoolRequest = {
        id: id("preq"),
        trip_id: t.id,
        passenger_id: args.passenger_id,
        seats: args.seats,
        match_score: args.match_score,
        status: "pending",
      };
      poolRequests.set(r.id, r);
      notify(t.driver_id, "New pooling request");
      return r;
    },
    poolDecide(driver_id: string, request_id: string, decision: "confirmed" | "rejected") {
      const r = poolRequests.get(request_id)!;
      const t = trips.get(r.trip_id)!;
      if (t.driver_id !== driver_id) throw new RuleError("Not your trip");
      if (r.status !== "pending") throw new RuleError("This request is no longer pending");
      if (decision === "confirmed") {
        if (r.seats > t.seats_available) throw new RuleError("Not enough seats left to accept this rider");
        t.seats_available -= r.seats;
      }
      r.status = decision;
      notify(r.passenger_id, `Pooling request ${decision === "confirmed" ? "accepted" : "declined"}`);
      return { request: r, trip: t };
    },
    cancelPoolRequest(actor: string, request_id: string) {
      const r = poolRequests.get(request_id)!;
      const t = trips.get(r.trip_id)!;
      if (r.passenger_id !== actor) throw new RuleError("Not your request");
      if (!["pending", "confirmed"].includes(r.status)) throw new RuleError("Already closed");
      if (r.status === "confirmed") t.seats_available = Math.min(t.seats_total, t.seats_available + r.seats);
      r.status = "cancelled";
      notify(t.driver_id, "Rider cancelled");
      return { request: r, trip: t };
    },
    setTripStatus(driver_id: string, trip_id: string, status: "started" | "completed" | "cancelled") {
      const t = trips.get(trip_id)!;
      if (t.driver_id !== driver_id) throw new RuleError("Not your trip");
      t.status = status;
      for (const r of poolRequests.values()) {
        if (r.trip_id !== t.id || !["pending", "confirmed"].includes(r.status)) continue;
        if (status === "completed") r.status = r.status === "confirmed" ? "completed" : "rejected";
        if (status === "cancelled") r.status = "cancelled";
      }
      return t;
    },

    /* ---------- vehicle wash ---------- */
    /** `service_price` is the wash_services price; the booking total is repriced with fees. */
    bookWash(customer_id: string, slot_date: string, service_price = 499, coupon_code?: string | null) {
      const money = price(service_price, coupon_code);
      const w: WashBooking = {
        ...money,
        id: id("wash"),
        customer_id,
        slot_date,
        price: money.customer_total,
        status: "pending",
        payment_status: "unpaid",
        assigned_vendor_id: null,
        refund_amount: 0,
      };
      washes.set(w.id, w);
      return w;
    },
    adminDecideWash(actor: string, wash_id: string, decision: "confirmed" | "rejected", vendor_id?: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can assign wash bookings");
      const w = washes.get(wash_id)!;
      if (w.status !== "pending") throw new RuleError("Already decided");
      if (decision === "confirmed" && !vendor_id) throw new RuleError("Assign a wash vendor before approving");
      w.status = decision;
      w.assigned_vendor_id = decision === "confirmed" ? vendor_id! : null;
      notify(w.customer_id, `Wash ${decision}`);
      return w;
    },
    payWashWithWallet(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      if (w.status !== "confirmed") throw new RuleError("Wait for admin approval before paying");
      wallet.apply(actor, -w.price, "wash_payment");
      w.payment_status = "paid";
      return w;
    },
    cancelWash(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      const pct = refundPercent(new Date(`${w.slot_date}T00:00:00Z`), clock.now);
      const refund = w.payment_status === "paid" ? Math.round((w.price * pct) / 100) : 0;
      if (refund > 0) {
        wallet.apply(w.customer_id, refund, "wash_refund");
        w.payment_status = "refunded";
      }
      w.refund_amount = refund;
      w.status = "cancelled";
      return { wash: w, refund, percent: pct };
    },

    /* ---------- money: coupons, settings, withdrawals, promo credit ---------- */
    addCoupon(actor: string, c: Coupon) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      const coupon = { ...c, code: c.code.trim().toUpperCase() };
      coupons.set(coupon.code, coupon);
      return coupon;
    },
    updateSettings(actor: string, patch: Partial<PlatformSettings>) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      Object.assign(settings, patch);
      return settings;
    },
    withdrawable,
    /** public.request_withdrawal */
    requestWithdrawal(actor: string, amount: number, method: "upi" | "bank", details: { upi_id?: string; account_number?: string; ifsc?: string; account_name?: string }) {
      if (!isProvider(actor)) throw new RuleError("Only hosts and drivers can withdraw earnings");
      const amt = round2(amount);
      if (amt <= 0 || amt < settings.min_withdrawal) throw new RuleError(`Minimum withdrawal is Rs ${settings.min_withdrawal}`);
      const avail = withdrawable(actor);
      if (amt > avail) throw new RuleError(`You can withdraw at most Rs ${avail}`);
      if (method === "upi" && !/^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/.test(details.upi_id?.trim() ?? ""))
        throw new RuleError("Enter a valid UPI ID");
      if (method === "bank") {
        if (!details.account_name?.trim()) throw new RuleError("Enter the account holder name");
        if (!/^[0-9]{9,18}$/.test(details.account_number?.trim() ?? "")) throw new RuleError("Enter a valid account number");
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(details.ifsc?.trim().toUpperCase() ?? "")) throw new RuleError("Enter a valid IFSC code");
      }
      const w: Withdrawal = { id: id("wd"), user_id: actor, amount: amt, method, status: "requested", reference: null };
      withdrawals.set(w.id, w);
      wallet.apply(actor, -amt, "payout");
      for (const a of admins) notify(a, "New withdrawal request");
      return w;
    },
    /** public.admin_decide_withdrawal */
    decideWithdrawal(actor: string, withdrawal_id: string, decision: "paid" | "rejected", reference?: string) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      const w = withdrawals.get(withdrawal_id);
      if (!w) throw new RuleError("Withdrawal not found");
      if (w.status !== "requested") throw new RuleError("This withdrawal was already processed");
      if (decision === "paid") {
        if (!reference?.trim()) throw new RuleError("Enter the payment reference (UTR)");
        w.status = "paid";
        w.reference = reference.trim();
        notify(w.user_id, "Payout sent");
      } else {
        w.status = "rejected";
        wallet.apply(w.user_id, w.amount, "payout_reversal");
        notify(w.user_id, "Withdrawal rejected");
      }
      return w;
    },
    /** public.admin_grant_credit */
    grantCredit(actor: string, email: string, amount: number) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      if (amount <= 0 || amount > 100000) throw new RuleError("Amount must be between 1 and 100000");
      const uid = emails.get(email.trim().toLowerCase());
      if (!uid) throw new RuleError("No user with that email");
      return wallet.apply(uid, round2(amount), "promo_credit");
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export const DAY_MS = day;
