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
 *  - admin refunds and paid trip extensions (money phase 1b)
 *
 * Mirrors supabase/migrations/20261105120000_money_phase1.sql and
 * 20261107120000_money_phase1b.sql.
 */

import { computeCharges, round2, type Charges, type PlatformSettings as FeeSettings } from "@/lib/charges";
import { calculateRentalPrice } from "@/lib/format";
import { calculateDriverPrice } from "@/lib/driver-pricing";

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "partially_refunded";

export class RuleError extends Error {}

const day = 86_400_000;

/** Harness default: fees off, so legacy flow tests keep their round numbers. */
export const ZERO_FEES: FeeSettings = { commission_pct: 0, service_fee_pct: 0, gst_pct: 0, min_withdrawal: 500 };

export type Money = Charges & { base_price: number; coupon_code: string | null; earning_credited_at: string | null };

export type Vehicle = {
  id: string;
  vendor_id: string;
  price_daily: number;
  price_hourly?: number;
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

export type BookingExtension = Charges & {
  id: string;
  booking_id: string;
  customer_id: string;
  vendor_id: string;
  hours: number;
  new_end_date: string;
  new_dropoff_time: string;
  status: "pending" | "accepted" | "rejected" | "paid" | "cancelled";
};

export type Driver = {
  id: string;
  full_name?: string;
  phone?: string;
  hourly_rate: number;
  daily_rate: number;
  status: "draft" | "active" | "paused";
  verification_status: "pending" | "approved" | "rejected";
  trip_types?: string[];
  service_area?: string;
  bio?: string;
  languages?: string[];
  vehicle_types?: string[];
  experience_years?: number;
  city?: string;
  photo_url?: string | null;
  dl_number?: string;
  dl_expiry?: string;
  dl_front_url?: string | null;
  dl_back_url?: string | null;
  id_document_url?: string | null;
  avg_rating?: number;
  review_count?: number;
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

export type DriverBooking = Money & {
  id: string;
  driver_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  total_price: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  refund_amount: number;
  trip_type?: string;
  pickup_address?: string;
  notes?: string;
};

export type DriverReview = {
  id: string;
  driver_booking_id: string;
  driver_id: string;
  customer_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
};

export type PoolTrip = {
  id: string;
  driver_id: string;
  depart_at: string;
  seats_total: number;
  seats_available: number;
  fare_per_seat: number;
  status: "scheduled" | "started" | "completed" | "cancelled";
  vehicle_label?: string;
  origin_label?: string;
  origin_lat?: number;
  origin_lng?: number;
  dest_label?: string;
  dest_lat?: number;
  dest_lng?: number;
  route?: { lat: number; lng: number; label?: string }[];
  notes?: string;
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
  status: "pending" | "investigating" | "resolved" | "dismissed" | "action_taken";
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

export type WashBooking = Money & {
  id: string;
  customer_id: string;
  slot_date: string;
  slot_time?: string;
  address?: string;
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

const EARNING_KINDS = ["booking_earning", "driver_earning", "driver_refund_reversal", "wash_earning"];

export function createBackend(now = new Date("2026-08-15T10:00:00Z"), initialSettings: FeeSettings = ZERO_FEES) {
  const clock = { now };
  const settings: FeeSettings = { ...initialSettings };
  const profiles = new Map<
    string,
    {
      dl_status: "none" | "pending" | "approved" | "rejected";
      dl_expiry?: string;
      referral_code?: string;
      referred_by?: string;
      referral_rewarded?: boolean;
    }
  >();
  const admins = new Set<string>();
  const emails = new Map<string, string>();
  const hosts = new Set<string>();
  const coupons = new Map<string, Coupon>();
  const withdrawals = new Map<string, Withdrawal>();
  const extensions = new Map<string, BookingExtension>();
  const vehicles = new Map<string, Vehicle>();
  const bookings = new Map<string, Booking>();
  const drivers = new Map<string, Driver>();
  const driverBookings = new Map<string, DriverBooking>();
  const driverReviews = new Map<string, DriverReview>();
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
  const notifications: { user_id: string; title: string; body?: string; link?: string }[] = [];

  const reviews = new Map<string, Review>();
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

  const isProvider = (user: string) => hosts.has(user) || drivers.has(user) || cleaners.has(user) || washCenters.has(user);

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

  /** public.extension_clashes: another live booking on the vehicle overlapping [start, newEnd]. */
  const extensionClashes = (b: Booking, newEnd: string) =>
    [...bookings.values()].some(
      (o) =>
        o.id !== b.id && o.vehicle_id === b.vehicle_id && ["pending", "confirmed"].includes(o.status) &&
        datesOverlap(o.start_date, o.end_date, b.start_date, newEnd),
    );

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
    tables: {
      vehicles,
      bookings,
      drivers,
      driverBookings,
      trips,
      poolRequests,
      washes,
      withdrawals,
      coupons,
      extensions,
      reviews,
      userReports,
      supportTickets,
      ticketMessages,
      incidents,
      trustedContacts,
      cities,
      platformSettings,
      poolRatings,
    },

    /* ---------- accounts ---------- */
    registerCustomer(
      dl: "none" | "pending" | "approved" | "rejected" = "approved",
      emailOrRef?: string,
      refCode?: string
    ) {
      const uid = id("user");
      let email = `${uid}@test.local`;
      let referredByCode = refCode;
      if (emailOrRef) {
        if (emailOrRef.includes("@")) {
          email = emailOrRef;
        } else {
          referredByCode = emailOrRef;
        }
      }
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
      emails.set(email.toLowerCase(), uid);
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
    listVehicle(
      vendor_id: string,
      price_daily = 1200,
      security_deposit = 2000,
      price_hourlyOrCity?: number | string,
      cityParam = "Bengaluru"
    ): Vehicle {
      const price_hourly = typeof price_hourlyOrCity === "number" ? price_hourlyOrCity : undefined;
      const city = typeof price_hourlyOrCity === "string" ? price_hourlyOrCity : cityParam;
      // Guard: new listings are always pending, never publicly visible.
      const v: Vehicle = {
        id: id("veh"),
        vendor_id,
        price_daily,
        price_hourly,
        security_deposit,
        city,
        status: "active",
        verification_status: "pending",
        avg_rating: 0,
        review_count: 0,
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
    deleteVehicle(actor: string, vehicle_id: string) {
      const v = vehicles.get(vehicle_id);
      if (!v) throw new RuleError("Vehicle not found");
      if (v.vendor_id !== actor && !admins.has(actor)) {
        throw new RuleError("Only the vehicle host or admin can delete this vehicle");
      }
      const hasActiveBookings = [...bookings.values()].some(
        (b) => b.vehicle_id === vehicle_id && ["pending", "confirmed"].includes(b.status),
      );
      if (hasActiveBookings) {
        throw new RuleError("Cannot delete vehicle with active or upcoming bookings");
      }
      vehicles.delete(vehicle_id);
      return true;
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
    saveDriverProfile(driver_id: string, updates: Partial<Driver>) {
      const d = drivers.get(driver_id);
      if (!d) throw new RuleError("Driver not found");
      Object.assign(d, updates);
      return d;
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
    getPublicDriver(id: string) {
      const d = drivers.get(id);
      if (!d || d.verification_status !== "approved" || d.status !== "active") return null;
      return {
        id: d.id,
        full_name: d.full_name || "Driver",
        city: d.city,
        bio: d.bio,
        experience_years: d.experience_years || 0,
        languages: d.languages || [],
        vehicle_types: d.vehicle_types || [],
        photo_url: d.photo_url || null,
        hourly_rate: d.hourly_rate,
        daily_rate: d.daily_rate,
        avg_rating: d.avg_rating || 0,
        review_count: d.review_count || 0,
        trip_types: d.trip_types || [],
        service_area: d.service_area || null,
      };
    },
    setDriverStatus(driver_id: string, status: "active" | "paused") {
      const d = drivers.get(driver_id);
      if (!d) throw new RuleError("Driver not found");
      d.status = status;
      return d;
    },
    hireDriver(args: {
      customer_id: string;
      driver_id: string;
      start_date: string;
      end_date: string;
      rate_type?: "hourly" | "daily";
      start_time?: string;
      end_time?: string;
      total_price?: number;
      coupon_code?: string | null;
      trip_type?: string;
      pickup_address?: string;
      notes?: string;
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
        start_time: args.start_time,
        end_time: args.end_time,
        total_price: money.customer_total,
        status: "pending",
        payment_status: "unpaid",
        refund_amount: 0,
        trip_type: args.trip_type,
        pickup_address: args.pickup_address,
        notes: args.notes,
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
      if (settings.commission_pct === 0 && !b.earning_credited_at) {
        wallet.apply(b.driver_id, b.provider_earning ?? b.total_price, "driver_earning");
        b.earning_credited_at = clock.now.toISOString();
      }
      notify(b.driver_id, "Hire payment received");
      return b;
    },
    payDriverBookingWithRazorpay(actor: string, booking_id: string, payment_id: string) {
      const b = driverBookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your hire");
      if (b.status !== "confirmed") throw new RuleError("Driver has not accepted this request yet");
      if (b.payment_status === "paid") {
        // Replay of verify payload (DH-10): already paid, do not credit driver again
        return { ok: true, replayed: true, booking: b };
      }
      b.payment_status = "paid";
      wallet.apply(b.driver_id, b.provider_earning ?? b.total_price, "driver_earning");
      b.earning_credited_at = clock.now.toISOString();
      notify(b.driver_id, `Hire payment received via Razorpay (${payment_id})`);
      return { ok: true, replayed: false, booking: b };
    },
    completeDriverBooking(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id);
      if (!b) throw new RuleError("Booking not found");
      if (actor !== b.driver_id && !admins.has(actor)) throw new RuleError("Only the driver can complete a hire");
      if (b.status !== "confirmed") throw new RuleError("Only confirmed hires can be completed");
      b.status = "completed";
      settleDriver(b);
      notify(b.customer_id, "Driver has completed the hire");
      return b;
    },
    /** public.cancel_driver_booking — customer, driver or admin. */
    cancelDriverBooking(actor: string, booking_id: string) {
      const b = driverBookings.get(booking_id)!;
      const isAdmin = admins.has(actor);
      const byDriver = b.driver_id === actor;
      if (b.customer_id !== actor && !byDriver && !isAdmin) throw new RuleError("Not your hire");
      if (!["pending", "confirmed"].includes(b.status)) throw new RuleError("This hire cannot be cancelled");
      const timePart = b.start_time ? (b.start_time.length === 5 ? `${b.start_time}:00` : b.start_time.slice(0, 8)) : "00:00:00";
      let pct = refundPercent(new Date(`${b.start_date}T${timePart}Z`), clock.now);
      if (byDriver || isAdmin) pct = 100;
      let refund = 0;
      let share = 0;
      if (b.payment_status === "paid") {
        refund = round2((b.total_price * pct) / 100);
        share = round2(((b.provider_earning ?? b.total_price) * (100 - pct)) / 100);
        if (refund > 0) wallet.apply(b.customer_id, refund, "driver_refund");
        if (settings.commission_pct === 0) {
          if (pct === 100) {
            wallet.apply(b.driver_id, -b.total_price, "payout_reversal");
          } else if (pct > 0) {
            wallet.apply(b.driver_id, -refund, "payout_reversal");
          }
        } else {
          if (share > 0 && b.driver_id !== b.customer_id && !b.earning_credited_at) {
            wallet.apply(b.driver_id, share, "driver_earning");
            b.earning_credited_at = clock.now.toISOString();
          }
        }
        b.payment_status = pct === 100 ? "refunded" : "partially_refunded";
      }
      b.refund_amount = refund;
      b.status = "cancelled";
      notify(b.customer_id, `Hire cancelled by ${actor === b.driver_id ? "driver" : "customer"}`);
      notify(b.driver_id, "Hire cancelled");
      return { booking: b, refund, percent: pct, provider_share: share };
    },
    reviewDriver(customer_id: string, booking_id: string, rating: number, comment?: string) {
      const b = driverBookings.get(booking_id);
      if (!b) throw new RuleError("Hire not found");
      if (b.customer_id !== customer_id) throw new RuleError("Only the hiring customer can review this hire");
      if (b.status !== "completed") throw new RuleError("Only completed hires can be reviewed");
      if (driverReviews.has(booking_id)) throw new RuleError("Hire has already been reviewed");
      if (rating < 1 || rating > 5) throw new RuleError("Rating must be between 1 and 5");

      const rev: DriverReview = {
        id: id("drev"),
        driver_booking_id: booking_id,
        driver_id: b.driver_id,
        customer_id,
        rating,
        comment: comment || null,
        created_at: clock.now.toISOString(),
      };
      driverReviews.set(booking_id, rev);

      // Recompute driver avg_rating and review_count (trigger simulation)
      const d = drivers.get(b.driver_id);
      if (d) {
        const revs = Array.from(driverReviews.values()).filter((r) => r.driver_id === b.driver_id);
        d.review_count = revs.length;
        const sum = revs.reduce((acc, curr) => acc + curr.rating, 0);
        d.avg_rating = Number((sum / revs.length).toFixed(2));
      }

      return rev;
    },
    getDriverUpcomingHires(driver_id: string, asOfDate?: string) {
      const date = asOfDate ?? clock.now.toISOString().slice(0, 10);
      return Array.from(driverBookings.values()).filter(
        (h) => h.driver_id === driver_id && h.status === "confirmed" && h.start_date >= date,
      );
    },
    getDriverHistoryHires(driver_id: string) {
      return Array.from(driverBookings.values()).filter(
        (h) => h.driver_id === driver_id && (h.status === "completed" || h.status === "cancelled"),
      );
    },
    getDriverReviews(driver_id: string) {
      return Array.from(driverReviews.values()).filter((r) => r.driver_id === driver_id);
    },
    getDriverEarnings(driver_id: string) {
      return Array.from(driverBookings.values())
        .filter((h) => h.driver_id === driver_id && h.status !== "cancelled" && (h.payment_status === "paid" || h.status === "completed"))
        .reduce((s, h) => s + Number(h.total_price), 0);
    },

    /* ---------- car pooling ---------- */
    createTrip(
      driver_id: string,
      args: {
        depart_at: string;
        seats_total: number;
        fare_per_seat: number;
        vehicle_label?: string;
        origin_label?: string;
        origin_lat?: number;
        origin_lng?: number;
        dest_label?: string;
        dest_lat?: number;
        dest_lng?: number;
        route?: { lat: number; lng: number; label?: string }[];
        notes?: string;
      },
    ) {
      if (args.seats_total < 1 || args.seats_total > 8) throw new RuleError("Seats must be between 1 and 8");
      if (new Date(args.depart_at) <= clock.now) throw new RuleError("Departure must be in the future");
      const t: PoolTrip = {
        id: id("trip"),
        driver_id,
        depart_at: args.depart_at,
        seats_total: args.seats_total,
        seats_available: args.seats_total,
        fare_per_seat: args.fare_per_seat,
        status: "scheduled",
        vehicle_label: args.vehicle_label,
        origin_label: args.origin_label,
        origin_lat: args.origin_lat,
        origin_lng: args.origin_lng,
        dest_label: args.dest_label,
        dest_lat: args.dest_lat,
        dest_lng: args.dest_lng,
        route: args.route ?? [],
        notes: args.notes,
      };
      trips.set(t.id, t);
      return t;
    },
    getPublicScheduledTrips() {
      return Array.from(trips.values()).filter(
        (t) => t.status === "scheduled" && t.seats_available > 0 && new Date(t.depart_at) > clock.now,
      );
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
      if (new Date(t.depart_at) <= clock.now) throw new RuleError("This trip has already departed");
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
      argsOrTargetType:
        | string
        | {
            reported_user_id?: string | null;
            target_type: string;
            target_id?: string | null;
            reason: string;
            details?: string | null;
          },
      targetIdParam?: string,
      reasonParam?: string
    ) {
      if (typeof argsOrTargetType === "object") {
        if (!argsOrTargetType.reason?.trim()) throw new RuleError("Report reason is required");
        const rep: UserReport = {
          id: id("urep"),
          reporter_id,
          reported_user_id: argsOrTargetType.reported_user_id || null,
          target_type: argsOrTargetType.target_type,
          target_id: argsOrTargetType.target_id || null,
          reason: argsOrTargetType.reason.trim(),
          details: argsOrTargetType.details?.trim() || null,
          status: "pending",
          admin_notes: null,
          resolved_at: null,
          created_at: clock.now.toISOString(),
        };
        userReports.set(rep.id, rep);
        for (const a of admins) notify(a, "New user report filed", rep.reason);
        return rep;
      }

      const rep: UserReport = {
        id: id("urep"),
        reporter_id,
        reported_user_id: null,
        target_type: argsOrTargetType,
        target_id: targetIdParam || null,
        reason: (reasonParam || "").trim(),
        details: null,
        status: "pending",
        admin_notes: null,
        resolved_at: null,
        created_at: clock.now.toISOString(),
      };
      userReports.set(rep.id, rep);
      for (const a of admins) notify(a, "New user report filed", rep.reason);
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
    /** `service_price` is the wash_services price; the booking total is repriced with fees. */
    bookWash(
      customer_id: string,
      slot_date: string,
      service_price = 499,
      city = "Bangalore",
      address?: string,
      slot_time?: string,
      coupon_code?: string | null,
    ) {
      const money = price(service_price, coupon_code);
      const w: WashBooking = {
        ...money,
        id: id("wash"),
        customer_id,
        slot_date,
        slot_time,
        address,
        city,
        price: money.customer_total ?? price,
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
    createConfirmedWash(customer_id: string, slot_date: string, city = "Bangalore", service_price = 499) {
      const money = price(service_price);
      const w: WashBooking = {
        ...money,
        id: id("wash"),
        customer_id,
        slot_date,
        city,
        price: service_price,
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
      // tg_wash_settle: a paid wash pays the cleaner, else the registered center, once.
      if (nextStatus === "completed" && w.payment_status === "paid" && !w.earning_credited_at) {
        const payee = w.assigned_cleaner_id ?? (washCenters.has(w.assigned_vendor_id ?? "") ? w.assigned_vendor_id : null);
        if (payee && payee !== w.customer_id && w.provider_earning > 0)
          wallet.apply(payee, w.provider_earning, "wash_earning");
        w.earning_credited_at = clock.now.toISOString();
      }
      notify(w.customer_id, `Wash status updated to ${nextStatus}`);
      return w;
    },
    payWashWithWallet(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (!w) throw new RuleError("Wash booking not found");
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      if (w.status !== "confirmed") throw new RuleError("Wait for admin approval before paying");
      wallet.apply(actor, -w.price, "wash_payment");
      w.payment_status = "paid";
      return w;
    },
    payWashWithRazorpay(actor: string, wash_id: string, payment_id: string) {
      const w = washes.get(wash_id)!;
      if (!w) throw new RuleError("Wash booking not found");
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      if (w.status !== "confirmed") throw new RuleError("Wait for admin approval before paying");
      if (w.payment_status === "paid") {
        return { ok: true, replayed: true, wash: w };
      }
      w.payment_status = "paid";
      notify(w.customer_id, `Wash payment received via Razorpay (${payment_id})`);
      return { ok: true, replayed: false, wash: w };
    },
    cancelWash(actor: string, wash_id: string) {
      const w = washes.get(wash_id)!;
      if (!w) throw new RuleError("Wash booking not found");
      if (w.customer_id !== actor) throw new RuleError("Not your wash booking");
      const timePart = w.slot_time ? (w.slot_time.length === 5 ? `${w.slot_time}:00` : w.slot_time.slice(0, 8)) : "00:00:00";
      const pct = refundPercent(new Date(`${w.slot_date}T${timePart}Z`), clock.now);
      const refund = w.payment_status === "paid" ? Math.round((w.price * pct) / 100) : 0;
      if (refund > 0) {
        wallet.apply(w.customer_id, refund, "wash_refund");
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

    /* ---------- money: coupons, settings, withdrawals, promo credit ---------- */
    addCoupon(actor: string, c: Coupon) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      const coupon = { ...c, code: c.code.trim().toUpperCase() };
      coupons.set(coupon.code, coupon);
      return coupon;
    },
    updateSettings(actor: string, patch: Partial<FeeSettings>) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      Object.assign(settings, patch);
      return settings;
    },
    withdrawable,
    /** public.request_withdrawal */
    requestWithdrawal(actor: string, amount: number, method: "upi" | "bank", details: { upi_id?: string; account_number?: string; ifsc?: string; account_name?: string }) {
      if (!isProvider(actor)) throw new RuleError("Only hosts, drivers, cleaners and washing centers can withdraw earnings");
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
    /** public.admin_refund: credited as 'refund', so it is never withdrawable. */
    adminRefund(actor: string, email: string, amount: number, reason: string) {
      if (!admins.has(actor)) throw new RuleError("Admins only");
      if (amount <= 0 || amount > 100000) throw new RuleError("Amount must be between 1 and 100000");
      if (!reason.trim()) throw new RuleError("A reason is required");
      const uid = emails.get(email.trim().toLowerCase());
      if (!uid) throw new RuleError("No user with that email");
      return wallet.apply(uid, round2(amount), "refund");
    },

    /* ---------- trip extensions (wallet only) ---------- */
    /** public.request_booking_extension */
    requestExtension(actor: string, booking_id: string, hours: number) {
      const b = bookings.get(booking_id)!;
      if (b.customer_id !== actor) throw new RuleError("Not your booking");
      if (b.status !== "confirmed" || b.payment_status !== "paid")
        throw new RuleError("Only paid, confirmed trips can be extended");
      if (!b.pickup_checked_at || b.return_checked_at)
        throw new RuleError("Extensions are only possible during an active trip");
      if (!Number.isInteger(hours) || hours < 1 || hours > 72) throw new RuleError("Extend by 1 to 72 hours");
      if ([...extensions.values()].some((e) => e.booking_id === b.id && ["pending", "accepted"].includes(e.status)))
        throw new RuleError("An extension request is already open for this trip");
      const end = new Date(new Date(`${b.end_date}T${b.dropoff_time}:00Z`).getTime() + hours * 3_600_000).toISOString();
      const new_end_date = end.slice(0, 10);
      const new_dropoff_time = end.slice(11, 16);
      if (extensionClashes(b, new_end_date)) throw new RuleError("The vehicle is not available for the extra time");
      const v = vehicles.get(b.vehicle_id)!;
      const full = calculateRentalPrice({
        startDate: b.start_date, endDate: new_end_date, pickupTime: b.pickup_time, dropoffTime: new_dropoff_time,
        priceHourly: v.price_hourly, priceDaily: v.price_daily,
      }).subtotal;
      const e: BookingExtension = {
        ...computeCharges(Math.max(0, full - b.base_price), settings),
        id: id("ext"), booking_id: b.id, customer_id: b.customer_id, vendor_id: b.vendor_id,
        hours, new_end_date, new_dropoff_time, status: "pending",
      };
      extensions.set(e.id, e);
      notify(b.vendor_id, "Trip extension requested");
      return e;
    },
    /** public.decide_booking_extension */
    decideExtension(actor: string, extension_id: string, accept: boolean) {
      const e = extensions.get(extension_id)!;
      if (e.vendor_id !== actor) throw new RuleError("Only the host can decide");
      if (e.status !== "pending") throw new RuleError("This request was already decided");
      if (accept && extensionClashes(bookings.get(e.booking_id)!, e.new_end_date))
        throw new RuleError("The vehicle is booked or blocked during the extra time");
      e.status = accept ? "accepted" : "rejected";
      notify(e.customer_id, accept ? "Extension accepted" : "Extension declined");
      return e;
    },
    /** public.cancel_booking_extension */
    cancelExtension(actor: string, extension_id: string) {
      const e = extensions.get(extension_id)!;
      if (e.customer_id !== actor) throw new RuleError("Not your request");
      if (!["pending", "accepted"].includes(e.status)) throw new RuleError("This request is already closed");
      e.status = "cancelled";
      return e;
    },
    /** public.wallet_pay_extension: debit + extend the booking atomically. */
    payExtension(actor: string, extension_id: string) {
      const e = extensions.get(extension_id)!;
      if (e.customer_id !== actor) throw new RuleError("Not your request");
      if (e.status === "paid") throw new RuleError("Already paid");
      if (e.status !== "accepted") throw new RuleError("The host has not accepted this extension");
      const b = bookings.get(e.booking_id)!;
      if (b.status !== "confirmed" || b.return_checked_at) throw new RuleError("This trip has already ended");
      // trg_bookings_conflict re-checks on UPDATE; the debit rolls back with it.
      if (extensionClashes(b, e.new_end_date)) throw new RuleError("Vehicle not available for selected dates");
      if (e.customer_total > 0) wallet.apply(actor, -e.customer_total, "booking_payment");
      Object.assign(b, {
        end_date: e.new_end_date,
        dropoff_time: e.new_dropoff_time,
        base_price: round2(b.base_price + e.base),
        service_fee: round2(b.service_fee + e.service_fee),
        gst: round2(b.gst + e.gst),
        commission: round2(b.commission + e.commission),
        commission_gst: round2(b.commission_gst + e.commission_gst),
        provider_earning: round2(b.provider_earning + e.provider_earning),
        total_price: round2(b.total_price + e.customer_total),
      });
      e.status = "paid";
      notify(e.vendor_id, "Trip extended");
      return b;
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export const DAY_MS = day;
