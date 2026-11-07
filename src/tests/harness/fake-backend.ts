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
  city?: string;
  avg_rating?: number;
  review_count?: number;
};

export type Review = {
  id: string;
  booking_id: string;
  vehicle_id: string;
  customer_id: string;
  rating: number;
  comment?: string;
  reported: boolean;
  report_reason?: string;
};

export type UserReport = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: "pending" | "action_taken" | "dismissed";
};

export type SupportTicket = {
  id: string;
  ticket_no: string;
  user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: "Open" | "In Progress" | "Resolved";
  description: string;
  resolution?: string;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  is_admin: boolean;
};

export type Incident = {
  id: string;
  reporter_id: string;
  type: string;
  booking_id?: string;
  lat?: number;
  lng?: number;
  description: string;
  status: string;
};

export type TrustedContact = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship?: string;
};

export type City = {
  name: string;
  state: string;
  active: boolean;
  surgeMultiplier: number;
};

export type PlatformSettings = {
  gst_pct: number;
  service_fee_pct: number;
  commission_rental_pct: number;
  commission_driver_pct: number;
  commission_wash_pct: number;
  commission_pool_pct: number;
  sos_phone: string;
  maintenance_mode: boolean;
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

export type WashBooking = {
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
  const wallets = new Map<string, number>();
  const walletTxns: WalletTxn[] = [];
  const notifications: { user_id: string; title: string; body?: string; link?: string }[] = [];

  const reviews = new Map<string, Review>();
  const userReports = new Map<string, UserReport>();
  const supportTickets = new Map<string, SupportTicket>();
  const ticketMessages = new Map<string, TicketMessage[]>();
  const incidents = new Map<string, Incident>();
  const trustedContacts = new Map<string, TrustedContact[]>();
  const cities = new Map<string, City>([
    ["Bengaluru", { name: "Bengaluru", state: "Karnataka", active: true, surgeMultiplier: 1.0 }],
    ["Mumbai", { name: "Mumbai", state: "Maharashtra", active: true, surgeMultiplier: 1.2 }],
    ["Delhi", { name: "Delhi", state: "Delhi", active: true, surgeMultiplier: 1.1 }],
  ]);
  const platformSettings: PlatformSettings = {
    gst_pct: 18,
    service_fee_pct: 5,
    commission_rental_pct: 10,
    commission_driver_pct: 10,
    commission_wash_pct: 15,
    commission_pool_pct: 5,
    sos_phone: "+91 80 4567 8900",
    maintenance_mode: false,
  };

  const notify = (user_id: string, title: string, body?: string, link?: string) =>
    notifications.push({ user_id, title, body, link });

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
    tables: {
      vehicles,
      bookings,
      drivers,
      driverBookings,
      trips,
      poolRequests,
      washes,
      reviews,
      userReports,
      supportTickets,
      ticketMessages,
      incidents,
      trustedContacts,
      cities,
      platformSettings,
    },

    /* ---------- accounts ---------- */
    registerCustomer(dl: "none" | "pending" | "approved" | "rejected" = "approved", referredByCode?: string) {
      const uid = id("user");
      let refBy: string | undefined;
      if (referredByCode) {
        for (const [pId, p] of profiles.entries()) {
          if (p.referral_code === referredByCode) {
            refBy = pId;
            break;
          }
        }
      }
      profiles.set(uid, {
        dl_status: dl,
        referral_code: `SYN-${uid.toUpperCase()}`,
        referred_by: refBy,
        referral_rewarded: false,
      });
      return uid;
    },
    getProfile(user: string) {
      return profiles.get(user);
    },
    setDl(user: string, dl: "none" | "pending" | "approved" | "rejected") {
      const p = profiles.get(user) || { referral_code: `SYN-${user.toUpperCase()}` };
      profiles.set(user, { ...p, dl_status: dl });
    },
    setDlExpiry(user: string, expiry: string) {
      const p = profiles.get(user) || { dl_status: "approved", referral_code: `SYN-${user.toUpperCase()}` };
      profiles.set(user, { ...p, dl_expiry: expiry });
    },
    registerAdmin() {
      const uid = id("admin");
      admins.add(uid);
      return uid;
    },

    /* ---------- vehicle listing + admin verification ---------- */
    listVehicle(vendor_id: string, price_daily = 1200, security_deposit = 2000, city = "Bengaluru"): Vehicle {
      // Guard: new listings are always pending, never publicly visible.
      const v: Vehicle = {
        id: id("veh"),
        vendor_id,
        price_daily,
        security_deposit,
        city,
        status: "active",
        verification_status: "pending",
        avg_rating: 0,
        review_count: 0,
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
    /** What an anonymous visitor sees in Browse Rides for a date range and optional city. */
    browse(startDate?: string, endDate?: string, city?: string) {
      if (city && cities.get(city)?.active === false) {
        return [];
      }
      const blocked = new Set(
        [...bookings.values()]
          .filter((b) => ["pending", "confirmed"].includes(b.status))
          .filter((b) => !startDate || !endDate || datesOverlap(b.start_date, b.end_date, startDate, endDate))
          .map((b) => b.vehicle_id),
      );
      return [...vehicles.values()].filter(
        (v) =>
          v.status === "active" &&
          v.verification_status === "approved" &&
          !blocked.has(v.id) &&
          (!city || v.city === city),
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

      // Referral credit on first paid booking (GR-01)
      const p = profiles.get(b.customer_id);
      if (p?.referred_by && !p.referral_rewarded) {
        const priorPaid = [...bookings.values()].filter(
          (x) => x.customer_id === b.customer_id && x.payment_status === "paid" && x.id !== b.id
        ).length;
        if (priorPaid === 0) {
          wallet.apply(p.referred_by, 500, "referral_bonus");
          wallet.apply(b.customer_id, 500, "referral_bonus");
          p.referral_rewarded = true;
          notify(p.referred_by, "Referral Bonus Credited");
          notify(b.customer_id, "Welcome Bonus Credited");
        }
      }

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
    hireDriver(args: { customer_id: string; driver_id: string; start_date: string; end_date: string; total_price?: number }) {
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
    bookWash(customer_id: string, slot_date: string, price = 499) {
      const w: WashBooking = {
        id: id("wash"),
        customer_id,
        slot_date,
        price,
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

    /* ---------- Person 3: Review Moderation (3.1) ---------- */
    addReview(args: { booking_id: string; vehicle_id: string; customer_id: string; rating: number; comment?: string }): Review {
      const r: Review = {
        id: id("rev"),
        booking_id: args.booking_id,
        vehicle_id: args.vehicle_id,
        customer_id: args.customer_id,
        rating: args.rating,
        comment: args.comment,
        reported: false,
      };
      reviews.set(r.id, r);
      this._recomputeVehicleRating(args.vehicle_id);
      return r;
    },
    reportReview(actor: string, review_id: string, reason: string) {
      const r = reviews.get(review_id);
      if (!r) throw new RuleError("Review not found");
      r.reported = true;
      r.report_reason = reason;
      return r;
    },
    dismissReviewReport(actor: string, review_id: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can dismiss reports");
      const r = reviews.get(review_id);
      if (!r) throw new RuleError("Review not found");
      r.reported = false;
      r.report_reason = undefined;
      return r;
    },
    removeReview(actor: string, review_id: string) {
      const r = reviews.get(review_id);
      if (!r) throw new RuleError("Review not found");
      if (!admins.has(actor) && r.customer_id !== actor) {
        throw new RuleError("You cannot delete this review");
      }
      reviews.delete(review_id);
      this._recomputeVehicleRating(r.vehicle_id);
      return true;
    },
    _recomputeVehicleRating(vehicle_id: string) {
      const v = vehicles.get(vehicle_id);
      if (!v) return;
      const vReviews = [...reviews.values()].filter((r) => r.vehicle_id === vehicle_id);
      v.review_count = vReviews.length;
      v.avg_rating =
        vReviews.length === 0
          ? 0
          : Number((vReviews.reduce((sum, r) => sum + r.rating, 0) / vReviews.length).toFixed(2));
    },

    /* ---------- Person 3: User Reports (3.1) ---------- */
    reportUser(actor: string, target_type: string, target_id: string, reason: string): UserReport {
      const report: UserReport = {
        id: id("rep"),
        reporter_id: actor,
        target_type,
        target_id,
        reason,
        status: "pending",
      };
      userReports.set(report.id, report);
      return report;
    },
    resolveUserReport(actor: string, report_id: string, decision: "action_taken" | "dismissed") {
      if (!admins.has(actor)) throw new RuleError("Only admins can moderate user reports");
      const report = userReports.get(report_id);
      if (!report) throw new RuleError("Report not found");
      report.status = decision;
      return report;
    },

    /* ---------- Person 3: Support Tickets (3.2) ---------- */
    createTicket(args: {
      user_id: string;
      subject: string;
      category?: string;
      priority?: string;
      description: string;
    }): SupportTicket {
      const ticket: SupportTicket = {
        id: id("tkt"),
        ticket_no: `SYN-${Math.floor(1000 + Math.random() * 9000)}`,
        user_id: args.user_id,
        subject: args.subject,
        category: args.category || "Other",
        priority: args.priority || "Medium",
        status: "Open",
        description: args.description,
      };
      supportTickets.set(ticket.id, ticket);
      ticketMessages.set(ticket.id, [
        {
          id: id("msg"),
          ticket_id: ticket.id,
          sender_id: args.user_id,
          message: args.description,
          is_admin: false,
        },
      ]);
      return ticket;
    },
    replyTicket(actor: string, ticket_id: string, message: string, resolve = true) {
      const t = supportTickets.get(ticket_id);
      if (!t) throw new RuleError("Ticket not found");
      const isAdmin = admins.has(actor);
      if (!isAdmin && t.user_id !== actor) {
        throw new RuleError("Unauthorized ticket access");
      }
      const msgs = ticketMessages.get(ticket_id) || [];
      msgs.push({
        id: id("msg"),
        ticket_id,
        sender_id: actor,
        message,
        is_admin: isAdmin,
      });
      ticketMessages.set(ticket_id, msgs);

      if (isAdmin && resolve) {
        t.status = "Resolved";
        t.resolution = message;
        notify(t.user_id, "Support Ticket Resolved", message, "/help");
      }
      return t;
    },
    getTickets(actor: string): SupportTicket[] {
      if (admins.has(actor)) {
        return [...supportTickets.values()];
      }
      return [...supportTickets.values()].filter((t) => t.user_id === actor);
    },

    /* ---------- Person 3: Safety Incidents & Trusted Contacts (3.3) ---------- */
    triggerSos(args: { user_id: string; booking_id?: string; lat: number; lng: number }): Incident {
      const inc: Incident = {
        id: id("inc"),
        reporter_id: args.user_id,
        type: "sos",
        booking_id: args.booking_id,
        lat: args.lat,
        lng: args.lng,
        description: "Emergency SOS triggered during trip",
        status: "open",
      };
      incidents.set(inc.id, inc);
      for (const adm of admins) {
        notify(adm, "EMERGENCY SOS Triggered!", `At ${args.lat},${args.lng}`, "/admin");
      }
      return inc;
    },
    reportIncident(args: {
      user_id: string;
      type: "accident" | "breakdown" | "lost_item" | "other";
      booking_id?: string;
      description: string;
      item_name?: string;
    }): Incident {
      const inc: Incident = {
        id: id("inc"),
        reporter_id: args.user_id,
        type: args.type,
        booking_id: args.booking_id,
        description: args.description,
        status: "open",
      };
      incidents.set(inc.id, inc);
      if (args.type === "lost_item" && args.booking_id) {
        const b = bookings.get(args.booking_id);
        if (b) {
          notify(b.vendor_id, "Lost Item Reported", args.item_name || "item", "/bookings");
        }
      }
      return inc;
    },
    addTrustedContact(user_id: string, name: string, phone: string, relationship?: string): TrustedContact {
      const contact: TrustedContact = {
        id: id("tc"),
        user_id,
        name,
        phone,
        relationship,
      };
      const list = trustedContacts.get(user_id) || [];
      list.push(contact);
      trustedContacts.set(user_id, list);
      return contact;
    },
    getTrustedContacts(user_id: string): TrustedContact[] {
      return trustedContacts.get(user_id) || [];
    },

    /* ---------- Person 3: Cities & Category Rules (3.4) ---------- */
    setCityActive(actor: string, cityName: string, active: boolean) {
      if (!admins.has(actor)) throw new RuleError("Only admins can configure operating cities");
      const c = cities.get(cityName);
      if (!c) throw new RuleError("City not found");
      c.active = active;
      return c;
    },
    getCities(onlyActive = true): City[] {
      const all = [...cities.values()];
      return onlyActive ? all.filter((c) => c.active) : all;
    },

    /* ---------- Person 3: Platform Settings (3.5) ---------- */
    getPlatformSettings(): PlatformSettings {
      return { ...platformSettings };
    },
    updatePlatformSettings(actor: string, updates: Partial<PlatformSettings>): PlatformSettings {
      if (!admins.has(actor)) throw new RuleError("Only admins can update platform settings");
      Object.assign(platformSettings, updates);
      return { ...platformSettings };
    },
    calculateBookingCharges(basePrice: number) {
      const gst = Math.round((basePrice * platformSettings.gst_pct) / 100);
      const serviceFee = Math.round((basePrice * platformSettings.service_fee_pct) / 100);
      return {
        basePrice,
        gstRate: platformSettings.gst_pct,
        gst,
        serviceFee,
        total: basePrice + gst + serviceFee,
      };
    },

    /* ---------- Person 3: Revenue Aggregates (3.6) ---------- */
    getRevenueAggregates(actor: string) {
      if (!admins.has(actor)) throw new RuleError("Only admins can view revenue aggregates");
      const rentals = [...bookings.values()]
        .filter((b) => b.payment_status === "paid")
        .reduce((sum, b) => sum + b.total_price, 0);
      const hires = [...driverBookings.values()]
        .filter((b) => b.payment_status === "paid")
        .reduce((sum, b) => sum + b.total_price, 0);
      const washVol = [...washes.values()]
        .filter((w) => w.payment_status === "paid")
        .reduce((sum, w) => sum + w.price, 0);

      const gmv = rentals + hires + washVol;
      const platformRev =
        (rentals * platformSettings.commission_rental_pct) / 100 +
        (hires * platformSettings.commission_driver_pct) / 100 +
        (washVol * platformSettings.commission_wash_pct) / 100;

      return {
        gmv,
        platform_revenue: Math.round(platformRev),
        rentals_volume: rentals,
        driver_volume: hires,
        wash_volume: washVol,
      };
    },

    /* ---------- Person 3: Scheduled Reminders (3.7) ---------- */
    generateScheduledReminders(): number {
      let created = 0;
      const nowMs = clock.now.getTime();

      // 1. Bookings pickup within 24h & 2h
      for (const b of bookings.values()) {
        if (b.status === "confirmed" && b.payment_status === "paid") {
          const pickupMs = new Date(`${b.start_date}T${b.pickup_time}:00Z`).getTime();
          const hoursLeft = (pickupMs - nowMs) / 3_600_000;

          if (hoursLeft >= 0 && hoursLeft <= 24) {
            const alreadyNotified = notifications.some(
              (n) => n.user_id === b.customer_id && n.title === "Trip reminder (24h)" && n.body?.includes(b.id)
            );
            if (!alreadyNotified) {
              notify(b.customer_id, "Trip reminder (24h)", `Starts within 24 hours (${b.id})`, "/bookings");
              created++;
            }
          }

          if (hoursLeft >= 0 && hoursLeft <= 2) {
            const alreadyNotified = notifications.some(
              (n) => n.user_id === b.customer_id && n.title === "Pickup in 2 hours" && n.body?.includes(b.id)
            );
            if (!alreadyNotified) {
              notify(b.customer_id, "Pickup in 2 hours", `Pickup in 2h (${b.id})`, "/bookings");
              created++;
            }
          }
        }
      }

      // 2. DL expiry within 30 days
      for (const [uid, p] of profiles.entries()) {
        if (p.dl_expiry) {
          const expiryMs = new Date(`${p.dl_expiry}T00:00:00Z`).getTime();
          const daysLeft = (expiryMs - nowMs) / 86_400_000;
          if (daysLeft >= 0 && daysLeft <= 30) {
            const alreadyNotified = notifications.some(
              (n) => n.user_id === uid && n.title === "Driving Licence Expiring Soon"
            );
            if (!alreadyNotified) {
              notify(uid, "Driving Licence Expiring Soon", `Expires on ${p.dl_expiry}`, "/profile");
              created++;
            }
          }
        }
      }

      return created;
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export const DAY_MS = day;
