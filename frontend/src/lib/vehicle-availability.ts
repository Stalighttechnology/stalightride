export interface BookedRange {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  pickup_time?: string | null; // HH:mm or HH:mm:ss
  dropoff_time?: string | null; // HH:mm or HH:mm:ss
}

export const DEFAULT_TIME_SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
];

export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateTime(dateStr: string, timeStr?: string | null): number {
  const t = (timeStr || "10:00").slice(0, 5);
  return new Date(`${dateStr}T${t}:00`).getTime();
}

/**
 * Checks whether two bookings overlap.
 * If Booking A ends on 29th 10:00 and Booking B starts on 29th 11:00:
 * bStart (11:00) > aEnd (10:00), so they do NOT overlap.
 * If Booking B starts on 29th 10:00 or earlier:
 * bStart (10:00) <= aEnd (10:00), so they DO overlap.
 */
export function bookingIntervalsOverlap(
  aStart: string,
  aPickup: string | null | undefined,
  aEnd: string,
  aDropoff: string | null | undefined,
  bStart: string,
  bPickup: string | null | undefined,
  bEnd: string,
  bDropoff: string | null | undefined,
): boolean {
  const a1 = parseDateTime(aStart, aPickup || "10:00");
  const a2 = parseDateTime(aEnd, aDropoff || "10:00");
  const b1 = parseDateTime(bStart, bPickup || "10:00");
  const b2 = parseDateTime(bEnd, bDropoff || "10:00");
  return b1 <= a2 && b2 >= a1;
}

/**
 * Returns whether a date is fully blocked for starting a new reservation.
 * If a car is returned on this date at e.g. 10:00 AM, and slots are available afterwards (11:00+),
 * the date is NOT fully blocked.
 */
export function isPickupDateFullyBlocked(
  dateStr: string,
  ranges: BookedRange[],
  allSlots: string[] = DEFAULT_TIME_SLOTS,
): boolean {
  if (!ranges || ranges.length === 0) return false;

  // 1. Strictly inside a booked window (e.g. booked 27th to 30th -> 28th and 29th are fully inside)
  for (const r of ranges) {
    if (r.start_date < dateStr && dateStr < r.end_date) {
      return true;
    }
  }

  // 2. Check if any pickup slot is available on this date
  const available = getAvailablePickupSlots(dateStr, ranges, allSlots);
  return available.length === 0;
}

/**
 * Checks if a specific pickup slot on dateStr is blocked.
 * If car is returned on dateStr at 10:00 AM:
 * Any slot <= 10:00 AM is BLOCKED. Slots > 10:00 AM are allowed.
 */
export function isPickupSlotBlocked(
  dateStr: string,
  slotTime: string,
  ranges: BookedRange[],
): boolean {
  if (!ranges || ranges.length === 0 || !dateStr) return false;
  const slotMs = parseDateTime(dateStr, slotTime);

  for (const r of ranges) {
    const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
    const rEndMs = parseDateTime(r.end_date, r.dropoff_time || "10:00");

    // Strictly within an existing reservation window
    if (slotMs >= rStartMs && slotMs <= rEndMs) {
      return true;
    }
    // Returned on dateStr at rEndMs: cannot pick up at or before return time
    if (r.end_date === dateStr && slotMs <= rEndMs) {
      return true;
    }
    // Starts on dateStr at rStartMs: cannot pick up at or after existing start time
    if (r.start_date === dateStr && slotMs >= rStartMs) {
      return true;
    }
  }
  return false;
}

/**
 * Returns list of available pickup slots for a given date.
 */
export function getAvailablePickupSlots(
  dateStr: string,
  ranges: BookedRange[],
  allSlots: string[] = DEFAULT_TIME_SLOTS,
): string[] {
  if (!dateStr) return allSlots;
  return allSlots.filter((slot) => !isPickupSlotBlocked(dateStr, slot, ranges));
}

/**
 * Gets info on whether a vehicle is being returned on dateStr,
 * and what the earliest pickup time would be.
 */
export function getVehicleReturnInfoOnDate(
  dateStr: string,
  ranges: BookedRange[],
): { returnTime: string; availableFrom: string } | null {
  if (!ranges || !dateStr) return null;
  const match = ranges.find((r) => r.end_date === dateStr && r.start_date <= dateStr);
  if (!match) return null;

  const returnTime = (match.dropoff_time || "10:00").slice(0, 5);
  // Find first standard slot strictly after returnTime
  const nextSlot = DEFAULT_TIME_SLOTS.find((s) => s > returnTime);
  const availableFrom = nextSlot || `${parseInt(returnTime.split(":")[0], 10) + 1}:00`;
  return { returnTime, availableFrom };
}

/**
 * Finds the earliest existing reservation that starts after the chosen pickup.
 */
export function getNextBookingAfterPickup(
  startDateStr: string,
  pickupTime: string,
  ranges: BookedRange[],
): BookedRange | null {
  if (!startDateStr) return null;
  const pickupMs = parseDateTime(startDateStr, pickupTime || "10:00");
  let nextBooking: BookedRange | null = null;
  let nextStartMs = Infinity;

  for (const r of ranges) {
    const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
    if (rStartMs > pickupMs && rStartMs < nextStartMs) {
      nextStartMs = rStartMs;
      nextBooking = r;
    }
  }
  return nextBooking;
}

/**
 * Checks if a return date is blocked.
 * The customer cannot pick a return date that is past the start date of the next reservation.
 */
export function isReturnDateBlocked(
  returnDateStr: string,
  startDateStr: string,
  pickupTime: string,
  ranges: BookedRange[],
): boolean {
  if (!returnDateStr || !startDateStr) return false;
  if (returnDateStr < startDateStr) return true;

  const nextBooking = getNextBookingAfterPickup(startDateStr, pickupTime, ranges);
  if (nextBooking) {
    // If return date is strictly after next reservation's start date, it is blocked
    if (returnDateStr > nextBooking.start_date) {
      return true;
    }
  }

  // Also check if returnDateStr is strictly inside any booking
  for (const r of ranges) {
    if (r.start_date < returnDateStr && returnDateStr < r.end_date) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a dropoff time slot is blocked.
 */
export function isDropoffSlotBlocked(
  returnDateStr: string,
  dropoffTime: string,
  startDateStr: string,
  pickupTime: string,
  ranges: BookedRange[],
): boolean {
  if (!returnDateStr) return false;
  const dropoffMs = parseDateTime(returnDateStr, dropoffTime);
  const pickupMs = parseDateTime(startDateStr || returnDateStr, pickupTime || "10:00");

  // Dropoff must be after pickup
  if (returnDateStr === startDateStr && dropoffMs <= pickupMs) {
    return true;
  }

  const nextBooking = getNextBookingAfterPickup(startDateStr, pickupTime, ranges);
  if (nextBooking) {
    const nextStartMs = parseDateTime(nextBooking.start_date, nextBooking.pickup_time || "10:00");
    if (dropoffMs > nextStartMs) {
      return true;
    }
  }

  for (const r of ranges) {
    const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
    const rEndMs = parseDateTime(r.end_date, r.dropoff_time || "10:00");
    if (dropoffMs > rStartMs && dropoffMs <= rEndMs) {
      return true;
    }
  }

  return false;
}

/**
 * Validates the entire schedule against existing bookings.
 * Returns null if valid, or a descriptive error message if invalid.
 */
export function validateBookingAgainstRanges(
  startDateStr: string,
  pickupTime: string,
  endDateStr: string,
  dropoffTime: string,
  ranges: BookedRange[],
): string | null {
  if (!startDateStr || !endDateStr) return "Pick dates first";

  const reqStartMs = parseDateTime(startDateStr, pickupTime || "10:00");
  const reqEndMs = parseDateTime(endDateStr, dropoffTime || "10:00");

  if (reqEndMs <= reqStartMs) {
    return "Drop-off must be after pickup";
  }

  for (const r of ranges) {
    const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
    const rEndMs = parseDateTime(r.end_date, r.dropoff_time || "10:00");

    if (reqStartMs <= rEndMs && reqEndMs >= rStartMs) {
      // Detailed error depending on overlap point
      if (r.end_date === startDateStr && reqStartMs <= rEndMs) {
        const retTime = (r.dropoff_time || "10:00").slice(0, 5);
        return `Car is returned on ${r.end_date} at ${retTime}. Pickup must be after ${retTime}.`;
      }
      if (r.start_date === endDateStr && reqEndMs > rStartMs) {
        const nextTime = (r.pickup_time || "10:00").slice(0, 5);
        return `Car is reserved on ${r.start_date} from ${nextTime}. Drop-off must be at or before ${nextTime}.`;
      }
      return `Vehicle is already booked from ${r.start_date} to ${r.end_date}`;
    }
  }

  return null;
}

export type SlotBlockedReason =
  | "past"
  | "min_notice_2h"
  | "cleaning_buffer"
  | "reserved"
  | "before_pickup"
  | "exceeds_next_booking";

export interface SlotStatus {
  blocked: boolean;
  reason?: SlotBlockedReason;
  label?: string;
}

/**
 * Returns detailed availability and block reason for a specific time slot.
 */
export function getSlotStatus(
  slotTime: string,
  isPickup: boolean,
  dateStr: string,
  ranges: BookedRange[],
  startDateStr?: string,
  pickupTime?: string,
  now = new Date(),
): SlotStatus {
  if (!dateStr) return { blocked: false };
  const slotMs = parseDateTime(dateStr, slotTime);
  const nowMs = now.getTime();
  const todayStr = toIsoDate(now);

  // 1. Pickup: check 2 hours advance notice requirement
  if (isPickup) {
    if (slotMs < nowMs) {
      return { blocked: true, reason: "past", label: "Time passed" };
    }
    // 2-hour platform notice buffer
    if (slotMs < nowMs + 2 * 60 * 60 * 1000) {
      return { blocked: true, reason: "min_notice_2h", label: "<2h advance notice" };
    }

    // Check existing booking overlap
    for (const r of ranges) {
      const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
      const rEndMs = parseDateTime(r.end_date, r.dropoff_time || "10:00");

      if (slotMs >= rStartMs && slotMs <= rEndMs) {
        return { blocked: true, reason: "reserved", label: "Reserved" };
      }
      if (r.end_date === dateStr && slotMs <= rEndMs) {
        return { blocked: true, reason: "cleaning_buffer", label: "Prep & buffer" };
      }
      if (r.start_date === dateStr && slotMs >= rStartMs) {
        return { blocked: true, reason: "reserved", label: "Reserved" };
      }
    }
    return { blocked: false };
  }

  // 2. Dropoff
  const pickupMs = parseDateTime(startDateStr || dateStr, pickupTime || "10:00");
  if (slotMs <= pickupMs) {
    return { blocked: true, reason: "before_pickup", label: "Before pickup" };
  }

  const nextBooking = startDateStr ? getNextBookingAfterPickup(startDateStr, pickupTime || "10:00", ranges) : null;
  if (nextBooking) {
    const nextStartMs = parseDateTime(nextBooking.start_date, nextBooking.pickup_time || "10:00");
    if (slotMs > nextStartMs) {
      return { blocked: true, reason: "exceeds_next_booking", label: "Next booking overlap" };
    }
  }

  for (const r of ranges) {
    const rStartMs = parseDateTime(r.start_date, r.pickup_time || "10:00");
    const rEndMs = parseDateTime(r.end_date, r.dropoff_time || "10:00");
    if (slotMs > rStartMs && slotMs <= rEndMs) {
      return { blocked: true, reason: "reserved", label: "Reserved" };
    }
  }

  return { blocked: false };
}

export type DateAvailabilityState = "available" | "partially_booked" | "sold_out" | "past";

/**
 * Returns whether a date is available, partially booked, sold out, or past.
 */
export function getDateAvailabilityState(
  dateStr: string,
  ranges: BookedRange[],
  todayStr?: string,
  now = new Date(),
): DateAvailabilityState {
  const today = todayStr || toIsoDate(now);
  if (dateStr < today) return "past";

  if (isPickupDateFullyBlocked(dateStr, ranges)) {
    return "sold_out";
  }

  // If today: check if any slot has >= 2h notice
  if (dateStr === today) {
    const availableSlots = DEFAULT_TIME_SLOTS.filter(
      (slot) => !getSlotStatus(slot, true, dateStr, ranges, undefined, undefined, now).blocked,
    );
    if (availableSlots.length === 0) return "sold_out";
    if (availableSlots.length < DEFAULT_TIME_SLOTS.length) return "partially_booked";
  }

  // If vehicle is dropped off or starts on this date
  const touchesBooking = ranges.some(
    (r) => r.start_date === dateStr || r.end_date === dateStr,
  );
  if (touchesBooking) {
    return "partially_booked";
  }

  return "available";
}

