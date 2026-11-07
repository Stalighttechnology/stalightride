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
 *
 * Every rule is expressed once here and asserted by the flow tests.
 */

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

export class RuleError extends Error {}

const day = 86_400_000;

export type Vehicle = {
  id: string;
  vendor_id: string;
  price_daily: number;
  security_deposit: number;
  status: "draft" | "active" | "paused";
  verification_status: "pending" | "approved" | "rejected";
};

export type Booking = {
  id: string;
  vehicle_id: string;
  vendor_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  pickup_time: string;
  dropoff_time: string;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  refund_amount: number;
  pickup_checked_at: string | null;
  return_checked_at: string | null;
  pickup_fuel_pct?: number;
  return_fuel_pct?: number;
};

export type Driver = {
  id: string;
  hourly_rate: number;
  daily_rate: number;
  status: "draft" | "active" | "paused";
  verification_status: "pending" | "approved" | "rejected";
  trip_types?: string[];
  service_area?: string;
};

export type Cleaner = {
  id: string;
  full_name: string;
  phone?: string;
  city: string;
  service_area?: string;
  bio?: string;
  experience_years: number;
  available: boolean;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  services: string[];
  avg_rating: number;
  review_count: number;
};

export type WashCenter = {
  id: string;
  name: string;
  city: string;
  address?: string;
  contact_phone?: string;
  contact_email?: string;
  daily_capacity: number;
  opening_time?: string;
  closing_time?: string;
  active: boolean;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  avg_rating: number;
  review_count: number;
};

export type WashReview = {
  id: string;
  wash_booking_id: string;
  customer_id: string;
  cleaner_id?: string | null;
  center_id?: string | null;
  vendor_id?: string | null;
  rating: number;
  comment?: string | null;
};

export type WashCenterStaff = {
  id: string;
  center_id: string;
  name: string;
  phone?: string;
  role: string;
  active: boolean;
};

export type WashCenterPackage = {
  id: string;
  center_id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
};

export type DriverBooking = {
  id: string;
  driver_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  refund_amount: number;
  trip_type?: string;
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
  emergency_contact?: string | null;
};

export type PoolRating = {
  id: string;
  trip_id: string;
  request_id?: string | null;
  rater_id: string;
  ratee_id: string;
  role: "passenger_to_driver" | "driver_to_passenger";
  rating: number;
  comment?: string | null;
  created_at: string;
};

export type UserReport = {
  id: string;
  reporter_id: string;
  reported_user_id?: string | null;
  target_type: string;
  target_id?: string | null;
  reason: string;
  details?: string | null;
  status: "pending" | "investigating" | "resolved" | "dismissed";
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
};

export type WashStatus =
  | "requested"
  | "confirmed"
  | "assigned"
  | "on_the_way"
  | "started"
  | "completed"
  | "cancelled"
  | "rejected";

export type WashBooking = {
  id: string;
  customer_id: string;
  slot_date: string;
  city?: string;
  price: number;
  status: string;
  progress?: WashStatus;
  before_photos?: string[];
  after_photos?: string[];
  payment_status: PaymentStatus;
  assigned_vendor_id: string | null;
  assigned_cleaner_id?: string | null;
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

export function createBackend(now = new Date("2026-08-15T10:00:00Z")) {
  const clock = { now };
  const profiles = new Map<string, { dl_status: "none" | "pending" | "approved" | "rejected" }>();
  const admins = new Set<string>();
  const vehicles = new Map<string, Vehicle>();
  const bookings = new Map<string, Booking>();
  const drivers = new Map<string, Driver>();
  const driverBookings = new Map<string, DriverBooking>();
  const trips = new Map<string, PoolTrip>();
  const poolRequests = new Map<string, PoolRequest>();
  const washes = new Map<string, WashBooking>();
  const cleaners = new Map<string, Cleaner>();
  const washCenters = new Map<string, WashCenter>();
  const washCenterStaff = new Map<string, WashCenterStaff>();
  const washCenterPackages = new Map<string, WashCenterPackage>();
  const washReviews = new Map<string, WashReview>();
  const poolRatings = new Map<string, PoolRating>();
  const userReports = new Map<string, UserReport>();
  const userRoles = new Map<string, Set<string>>();

  const assignRole = (userId: string, role: string) => {
    let r = userRoles.get(userId);
    if (!r) {
      r = new Set();
      userRoles.set(userId, r);
    }
    r.add(role);
  };
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

  return {
    clock,
    setNow: (d: string | Date) => (clock.now = new Date(d)),
    wallet,
    notifications,
    tables: { vehicles, bookings, drivers, driverBookings, trips, poolRequests, washes, poolRatings, userReports },

    /* ---------- accounts ---------- */
    registerCustomer(dl: "none" | "pending" | "approved" | "rejected" = "approved") {
      const uid = id("user");
      profiles.set(uid, { dl_status: dl });
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
    listVehicle(vendor_id: string, price_daily = 1200, security_deposit = 2000): Vehicle {
      // Guard: new listings are always pending, never publicly visible.
      const v: Vehicle = {
        id: id("veh"),
        vendor_id,
        price_daily,
        security_deposit,
        status: "active",
        verification_status: "pending",
      };
      vehicles.set(v.id, v);
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
      total_price?: number;
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

      const b: Booking = {
        id: id("bk"),
        vehicle_id: v.id,
        vendor_id: v.vendor_id,
        customer_id: args.customer_id,
        start_date: args.start_date,
        end_date: args.end_date,
        pickup_time: args.pickup_time ?? "10:00",
        dropoff_time: args.dropoff_time ?? "18:00",
        total_price: args.total_price ?? v.price_daily + v.security_deposit,
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
      wallet.apply(actor, -b.total_price, "booking");
      b.payment_status = "paid";
      notify(b.vendor_id, "Booking paid");
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
      return b;
    },
    cancelBooking(actor: string, booking_id: string) {
      const b = bookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your booking");
      if (!["pending", "confirmed"].includes(b.status)) throw new RuleError("This booking cannot be cancelled");
      if (b.pickup_checked_at) throw new RuleError("The trip has already started");
      const pct = refundPercent(new Date(`${b.start_date}T${b.pickup_time}:00Z`), clock.now);
      const refund = b.payment_status === "paid" ? Math.round((b.total_price * pct) / 100) : 0;
      if (refund > 0) {
        wallet.apply(b.customer_id, refund, "refund");
        b.payment_status = "refunded";
      }
      b.refund_amount = refund;
      b.status = "cancelled";
      notify(b.vendor_id, "Booking cancelled");
      return { booking: b, refund, percent: pct };
    },
    canReview(booking_id: string) {
      return bookings.get(booking_id)!.status === "completed";
    },

    /* ---------- driver hire ---------- */
    enrollDriver(hourly = 200, daily = 1500, trip_types: string[] = [], service_area?: string) {
      const d: Driver = {
        id: id("drv"),
        hourly_rate: hourly,
        daily_rate: daily,
        status: "active",
        verification_status: "pending",
        trip_types,
        service_area,
      };
      drivers.set(d.id, d);
      return d;
    },
    verifyDriver(actor: string, driver_id: string, decision: "approved" | "rejected") {
      if (!admins.has(actor)) throw new RuleError("Only admins can verify drivers");
      drivers.get(driver_id)!.verification_status = decision;
      return drivers.get(driver_id)!;
    },
    searchDrivers(filters?: { trip_type?: string; service_area?: string }) {
      return [...drivers.values()].filter((d) => {
        if (d.status !== "active" || d.verification_status !== "approved") return false;
        if (filters?.trip_type) {
          const req = filters.trip_type.toLowerCase();
          const has = (d.trip_types ?? []).some((t) => t.toLowerCase() === req);
          if (!has) return false;
        }
        if (filters?.service_area) {
          const req = filters.service_area.toLowerCase();
          if (!d.service_area || !d.service_area.toLowerCase().includes(req)) return false;
        }
        return true;
      });
    },
    hireDriver(args: { customer_id: string; driver_id: string; start_date: string; end_date: string; total_price?: number; trip_type?: string }) {
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
      const b: DriverBooking = {
        id: id("dbk"),
        driver_id: d.id,
        customer_id: args.customer_id,
        start_date: args.start_date,
        end_date: args.end_date,
        total_price: args.total_price ?? d.daily_rate,
        status: "pending",
        payment_status: "unpaid",
        refund_amount: 0,
        trip_type: args.trip_type,
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
      wallet.apply(actor, -b.total_price, "driver_booking");
      b.payment_status = "paid";
      return b;
    },
    cancelDriverBooking(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your hire");
      if (!["pending", "confirmed"].includes(b.status)) throw new RuleError("This hire cannot be cancelled");
      const pct = refundPercent(new Date(`${b.start_date}T00:00:00Z`), clock.now);
      const refund = b.payment_status === "paid" ? Math.round((b.total_price * pct) / 100) : 0;
      if (refund > 0) {
        wallet.apply(b.customer_id, refund, "refund");
        b.payment_status = "refunded";
      }
      b.refund_amount = refund;
      b.status = "cancelled";
      notify(b.driver_id, "Hire cancelled");
      return { booking: b, refund, percent: pct };
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
    requestSeat(args: { passenger_id: string; trip_id: string; seats: number; match_score: number; emergency_contact?: string | null }) {
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
        emergency_contact: args.emergency_contact || null,
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

    /* ---------- pooling ratings and reports (Task 2.8) ---------- */
    ratePoolTrip(
      rater_id: string,
      args: {
        trip_id: string;
        request_id?: string;
        ratee_id: string;
        role: "passenger_to_driver" | "driver_to_passenger";
        rating: number;
        comment?: string;
      },
    ) {
      const t = trips.get(args.trip_id);
      if (!t) throw new RuleError("Trip not found");
      if (t.status !== "completed") {
        throw new RuleError(`Ratings can only be submitted for completed trips (trip status is ${t.status})`);
      }
      if (args.rating < 1 || args.rating > 5) throw new RuleError("Rating must be between 1 and 5");
      if (rater_id === args.ratee_id) throw new RuleError("Cannot rate yourself");

      if (args.role === "passenger_to_driver") {
        if (args.ratee_id !== t.driver_id) throw new RuleError("Ratee must be the trip driver");
        const isPassenger = [...poolRequests.values()].some(
          (r) => r.trip_id === t.id && r.passenger_id === rater_id && ["confirmed", "completed"].includes(r.status),
        );
        if (!isPassenger) throw new RuleError("Rater is not a confirmed passenger on this trip");
      } else if (args.role === "driver_to_passenger") {
        if (rater_id !== t.driver_id) throw new RuleError("Rater must be the trip driver");
        const isPassenger = [...poolRequests.values()].some(
          (r) => r.trip_id === t.id && r.passenger_id === args.ratee_id && ["confirmed", "completed"].includes(r.status),
        );
        if (!isPassenger) throw new RuleError("Ratee is not a confirmed passenger on this trip");
      }

      // Unique rating per party per trip
      const dupe = [...poolRatings.values()].some(
        (r) => r.trip_id === t.id && r.rater_id === rater_id && r.ratee_id === args.ratee_id,
      );
      if (dupe) throw new RuleError("You have already submitted a rating for this trip and participant");

      const ratingRow: PoolRating = {
        id: id("prate"),
        trip_id: t.id,
        request_id: args.request_id || null,
        rater_id,
        ratee_id: args.ratee_id,
        role: args.role,
        rating: args.rating,
        comment: args.comment || null,
        created_at: clock.now.toISOString(),
      };
      poolRatings.set(ratingRow.id, ratingRow);
      return ratingRow;
    },

    reportUser(
      reporter_id: string,
      args: {
        reported_user_id?: string | null;
        target_type: string;
        target_id?: string | null;
        reason: string;
        details?: string | null;
      },
    ) {
      if (!args.reason?.trim()) throw new RuleError("Report reason is required");
      const rep: UserReport = {
        id: id("urep"),
        reporter_id,
        reported_user_id: args.reported_user_id || null,
        target_type: args.target_type,
        target_id: args.target_id || null,
        reason: args.reason.trim(),
        details: args.details?.trim() || null,
        status: "pending",
        admin_notes: null,
        resolved_at: null,
        created_at: clock.now.toISOString(),
      };
      userReports.set(rep.id, rep);
      return rep;
    },

    adminDecideUserReport(
      admin_id: string,
      report_id: string,
      decision: "resolved" | "dismissed",
      admin_notes?: string,
    ) {
      if (!admins.has(admin_id)) throw new RuleError("Only admins can moderate user reports");
      const rep = userReports.get(report_id);
      if (!rep) throw new RuleError("User report not found");
      rep.status = decision;
      rep.admin_notes = admin_notes || null;
      rep.resolved_at = clock.now.toISOString();
      return rep;
    },

    /* ---------- vehicle wash ---------- */
    bookWash(customer_id: string, slot_date: string, price = 499, city = "Bangalore") {
      const w: WashBooking = {
        id: id("wash"),
        customer_id,
        slot_date,
        city,
        price,
        status: "pending",
        progress: "requested",
        before_photos: [],
        after_photos: [],
        payment_status: "unpaid",
        assigned_vendor_id: null,
        assigned_cleaner_id: null,
        refund_amount: 0,
      };
      washes.set(w.id, w);
      return w;
    },
    createConfirmedWash(customer_id: string, slot_date: string, city = "Bangalore", price = 499) {
      const w: WashBooking = {
        id: id("wash"),
        customer_id,
        slot_date,
        city,
        price,
        status: "confirmed",
        progress: "confirmed",
        before_photos: [],
        after_photos: [],
        payment_status: "paid",
        assigned_vendor_id: null,
        assigned_cleaner_id: null,
        refund_amount: 0,
      };
      washes.set(w.id, w);
      return w;
    },
    claimWashJob(cleaner_id: string, wash_id: string) {
      const cleaner = cleaners.get(cleaner_id);
      if (!cleaner) throw new RuleError("Cleaner profile not found");
      if (cleaner.verification_status !== "approved") {
        throw new RuleError("Only verified cleaners can claim jobs");
      }

      const w = washes.get(wash_id);
      if (!w) throw new RuleError("Wash booking not found");

      if (w.assigned_cleaner_id || w.assigned_vendor_id) {
        throw new RuleError("This wash job is already assigned");
      }

      if (w.status !== "confirmed" && w.progress !== "confirmed") {
        throw new RuleError("Only confirmed wash jobs can be claimed");
      }

      const cleanerCity = (cleaner.city || "Bangalore").trim().toLowerCase();
      const jobCity = (w.city || "Bangalore").trim().toLowerCase();
      if (cleanerCity !== jobCity) {
        throw new RuleError(`Cleaner cannot claim jobs outside their operating city (cleaner city: ${cleaner.city}, job city: ${w.city})`);
      }

      // Atomic claim
      w.assigned_cleaner_id = cleaner_id;
      w.progress = "assigned";
      w.status = "confirmed";
      notify(w.customer_id, "Cleaner Assigned to Your Wash");
      return w;
    },
    adminDecideWash(actor: string, wash_id: string, decision: "confirmed" | "rejected", vendor_id?: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can assign wash bookings");
      const w = washes.get(wash_id)!;
      if (w.status !== "pending") throw new RuleError("Already decided");
      if (decision === "confirmed" && !vendor_id) throw new RuleError("Assign a wash vendor before approving");
      w.status = decision;
      w.progress = decision === "confirmed" ? "confirmed" : "rejected";
      w.assigned_vendor_id = decision === "confirmed" ? vendor_id! : null;
      notify(w.customer_id, `Wash ${decision}`);
      return w;
    },
    advanceWashStatus(actor: string, wash_id: string, nextStatus: WashStatus, photos?: string[]) {
      const w = washes.get(wash_id);
      if (!w) throw new RuleError("Wash booking not found");
      const isAssigned = w.assigned_vendor_id === actor || w.assigned_cleaner_id === actor || admins.has(actor);
      if (!isAssigned) throw new RuleError("You are not assigned to this wash job");

      const ranks: Record<string, number> = {
        requested: 1,
        pending: 1,
        confirmed: 2,
        assigned: 3,
        on_the_way: 4,
        started: 5,
        completed: 6,
      };

      const curr = (w.progress || w.status) as string;
      const currRank = ranks[curr] ?? 0;
      const nextRank = ranks[nextStatus] ?? -1;

      if (nextRank === -1) throw new RuleError(`Invalid wash status: ${nextStatus}`);
      if (nextRank <= currRank) {
        throw new RuleError(`Status cannot be moved backwards or to the same status (current: ${curr}, requested: ${nextStatus})`);
      }

      if (nextStatus === "started" && photos) {
        w.before_photos = [...(w.before_photos ?? []), ...photos];
      }
      if (nextStatus === "completed") {
        if (photos) w.after_photos = [...(w.after_photos ?? []), ...photos];
        if (!w.after_photos || w.after_photos.length === 0) {
          throw new RuleError("After photos are required to complete the wash");
        }
      }

      w.progress = nextStatus;
      w.status = nextStatus;
      notify(w.customer_id, `Wash status updated to ${nextStatus}`);
      return w;
    },
    payWashWithWallet(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      if (w.status !== "confirmed") throw new RuleError("Wait for admin approval before paying");
      wallet.apply(actor, -w.price, "wash_booking");
      w.payment_status = "paid";
      return w;
    },
    cancelWash(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      const pct = refundPercent(new Date(`${w.slot_date}T00:00:00Z`), clock.now);
      const refund = w.payment_status === "paid" ? Math.round((w.price * pct) / 100) : 0;
      if (refund > 0) {
        wallet.apply(w.customer_id, refund, "refund");
        w.payment_status = "refunded";
      }
      w.refund_amount = refund;
      w.status = "cancelled";
      return { wash: w, refund, percent: pct };
    },

    /* ---------- roles, cleaners & wash centers (Task 2.4) ---------- */
    registerCleaner(profile: Omit<Cleaner, "verification_status" | "avg_rating" | "review_count"> & { avg_rating?: number; review_count?: number }) {
      const cleaner: Cleaner = {
        ...profile,
        avg_rating: profile.avg_rating ?? 0,
        review_count: profile.review_count ?? 0,
        verification_status: "pending",
        rejection_reason: null,
      };
      cleaners.set(profile.id, cleaner);
      return cleaner;
    },
    getCleaner(id: string) {
      return cleaners.get(id);
    },
    verifyCleaner(actor: string, cleanerId: string, decision: "approved" | "rejected", reason?: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can verify cleaners");
      const c = cleaners.get(cleanerId);
      if (!c) throw new RuleError("Cleaner not found");
      c.verification_status = decision;
      c.rejection_reason = decision === "rejected" ? reason || "Rejected by admin" : null;
      if (decision === "approved") {
        assignRole(cleanerId, "cleaner");
      }
      return c;
    },
    registerWashCenter(profile: Omit<WashCenter, "verification_status" | "active" | "avg_rating" | "review_count"> & { avg_rating?: number; review_count?: number }) {
      const center: WashCenter = {
        ...profile,
        active: false,
        avg_rating: profile.avg_rating ?? 0,
        review_count: profile.review_count ?? 0,
        verification_status: "pending",
        rejection_reason: null,
      };
      washCenters.set(profile.id, center);
      return center;
    },
    getWashCenter(id: string) {
      return washCenters.get(id);
    },
    verifyWashCenter(actor: string, centerId: string, decision: "approved" | "rejected", reason?: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can verify wash centers");
      const c = washCenters.get(centerId);
      if (!c) throw new RuleError("Wash center not found");
      c.verification_status = decision;
      c.active = decision === "approved";
      c.rejection_reason = decision === "rejected" ? reason || "Rejected by admin" : null;
      if (decision === "approved") {
        assignRole(centerId, "wash_center");
      }
      return c;
    },
    addWashCenterStaff(centerId: string, staffMember: Omit<WashCenterStaff, "id" | "center_id">) {
      const sId = id("wc_staff");
      const st: WashCenterStaff = {
        id: sId,
        center_id: centerId,
        ...staffMember,
      };
      washCenterStaff.set(sId, st);
      return st;
    },
    getWashCenterStaff(centerId: string) {
      return Array.from(washCenterStaff.values()).filter((s) => s.center_id === centerId);
    },
    addWashCenterPackage(centerId: string, pkg: Omit<WashCenterPackage, "id" | "center_id">) {
      const pId = id("wc_pkg");
      const p: WashCenterPackage = {
        id: pId,
        center_id: centerId,
        ...pkg,
      };
      washCenterPackages.set(pId, p);
      return p;
    },
    getWashCenterPackages(centerId: string) {
      return Array.from(washCenterPackages.values()).filter((p) => p.center_id === centerId);
    },
    hasRole(userId: string, role: string) {
      return userRoles.get(userId)?.has(role) ?? false;
    },

    /* ---------- wash reviews (Task 2.6) ---------- */
    reviewWash(customer_id: string, wash_booking_id: string, rating: number, comment?: string) {
      const w = washes.get(wash_booking_id);
      if (!w) throw new RuleError("Wash booking not found");
      if (w.customer_id !== customer_id) throw new RuleError("Only the booking customer can write a review");
      if (w.status !== "completed" && w.progress !== "completed") {
        throw new RuleError("Only completed wash bookings can be reviewed");
      }
      if (washReviews.has(wash_booking_id)) {
        throw new RuleError("Wash booking has already been reviewed");
      }
      if (rating < 1 || rating > 5) {
        throw new RuleError("Rating must be between 1 and 5");
      }

      const cleaner_id = w.assigned_cleaner_id || null;
      const center_id = w.assigned_vendor_id || null;

      const rev: WashReview = {
        id: id("wash_rev"),
        wash_booking_id,
        customer_id,
        cleaner_id,
        center_id,
        rating,
        comment: comment || null,
      };
      washReviews.set(wash_booking_id, rev);

      // Trigger simulation: keep cleaner or center average rating up to date (WR-01)
      if (cleaner_id) {
        const cleaner = cleaners.get(cleaner_id);
        if (cleaner) {
          const revs = Array.from(washReviews.values()).filter((r) => r.cleaner_id === cleaner_id);
          cleaner.review_count = revs.length;
          const sum = revs.reduce((acc, curr) => acc + curr.rating, 0);
          cleaner.avg_rating = Number((sum / revs.length).toFixed(2));
        }
      }

      if (center_id) {
        const center = washCenters.get(center_id);
        if (center) {
          const revs = Array.from(washReviews.values()).filter((r) => r.center_id === center_id);
          center.review_count = revs.length;
          const sum = revs.reduce((acc, curr) => acc + curr.rating, 0);
          center.avg_rating = Number((sum / revs.length).toFixed(2));
        }
      }

      return rev;
    },
    getWashReview(wash_booking_id: string) {
      return washReviews.get(wash_booking_id);
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export const DAY_MS = day;
