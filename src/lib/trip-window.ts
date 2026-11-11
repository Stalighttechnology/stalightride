/**
 * Shared rules for when a trip handover (check-in / check-out) may happen.
 * Check-in opens 30 minutes before the scheduled pickup and only once the
 * booking is confirmed + paid. Check-out opens once the pickup is recorded.
 */
const CHECKIN_LEAD_MINUTES = 30;

type TripBooking = {
  status?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pickup_time?: string | null;
  dropoff_time?: string | null;
  pickup_checked_at?: string | null;
  return_checked_at?: string | null;
};

export function combineDateTime(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const t = (time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "10:00") + ":00";
  const d = new Date(`${date}T${t}`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatWhen(d: Date) {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export type HandoverGate = {
  /** true when the check-in form should be usable now */
  canCheckin: boolean;
  /** true when the check-out form should be usable now */
  canCheckout: boolean;
  /** short label for the trip CTA, or null when no CTA should show */
  ctaLabel: string | null;
  /** why the action is blocked, in plain language */
  checkinReason: string | null;
  checkoutReason: string | null;
  /** the moment check-in becomes possible */
  opensAt: Date | null;
};

export function getHandoverGate(b: TripBooking, now: Date = new Date()): HandoverGate {
  const paid = b.status === "confirmed" && (b.payment_status === "paid" || !!b.paid_at);
  const start = combineDateTime(b.start_date, b.pickup_time);
  const end = combineDateTime(b.end_date, b.dropoff_time);
  const opensAt = start ? new Date(start.getTime() - CHECKIN_LEAD_MINUTES * 60_000) : null;

  const checkedIn = !!b.pickup_checked_at;
  const checkedOut = !!b.return_checked_at;

  let canCheckin = false;
  let checkinReason: string | null = null;

  if (checkedIn || checkedOut) {
    checkinReason = null;
  } else if (!paid) {
    checkinReason = "Check-in unlocks once the host accepts the request and payment is complete.";
  } else if (opensAt && now < opensAt) {
    checkinReason = `Check-in opens ${formatWhen(opensAt)} (${CHECKIN_LEAD_MINUTES} minutes before pickup).`;
  } else {
    canCheckin = true;
  }

  let canCheckout = false;
  let checkoutReason: string | null = null;
  if (checkedOut) {
    checkoutReason = null;
  } else if (!checkedIn) {
    checkoutReason = "Complete the pickup check-in first.";
  } else if (b.status !== "confirmed") {
    checkoutReason = "This booking is no longer active.";
  } else {
    canCheckout = true;
  }

  const ctaLabel = !paid
    ? null
    : checkedOut
      ? "Trip summary"
      : checkedIn
        ? "End trip"
        : canCheckin
          ? "Start trip"
          : "Check-in not open yet";

  return { canCheckin, canCheckout, ctaLabel, checkinReason, checkoutReason, opensAt: opensAt ?? end };
}
