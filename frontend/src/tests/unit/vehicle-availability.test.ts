import { describe, expect, test } from "vitest";
import {
  isPickupDateFullyBlocked,
  isPickupSlotBlocked,
  getAvailablePickupSlots,
  getVehicleReturnInfoOnDate,
  getNextBookingAfterPickup,
  isReturnDateBlocked,
  isDropoffSlotBlocked,
  validateBookingAgainstRanges,
  bookingIntervalsOverlap,
  getSlotStatus,
  getDateAvailabilityState,
  type BookedRange,
} from "../../lib/vehicle-availability";

describe("vehicle-availability helper", () => {
  const ashaBooking: BookedRange = {
    start_date: "2026-11-27",
    pickup_time: "10:00:00",
    end_date: "2026-11-29",
    dropoff_time: "10:00:00",
  };

  test("booking intervals overlap correctly: 11am pickup does not overlap 10am return", () => {
    // Asha: 27th 10am to 29th 10am
    // Ben: 29th 11am to 30th 12pm
    const overlaps = bookingIntervalsOverlap(
      ashaBooking.start_date,
      ashaBooking.pickup_time,
      ashaBooking.end_date,
      ashaBooking.dropoff_time,
      "2026-11-29",
      "11:00",
      "2026-11-30",
      "12:00",
    );
    expect(overlaps).toBe(false);
  });

  test("booking intervals overlap when pickup is at 10am or before on return day", () => {
    // Ben tries 10:00 AM on 29th (same time car is returned)
    const at10am = bookingIntervalsOverlap(
      ashaBooking.start_date,
      ashaBooking.pickup_time,
      ashaBooking.end_date,
      ashaBooking.dropoff_time,
      "2026-11-29",
      "10:00",
      "2026-11-30",
      "12:00",
    );
    expect(at10am).toBe(true);

    // Ben tries 09:00 AM on 29th (before return)
    const at9am = bookingIntervalsOverlap(
      ashaBooking.start_date,
      ashaBooking.pickup_time,
      ashaBooking.end_date,
      ashaBooking.dropoff_time,
      "2026-11-29",
      "09:00",
      "2026-11-30",
      "12:00",
    );
    expect(at9am).toBe(true);
  });

  test("pickup date 29th is UNBLOCKED because car is returned at 10am and slots remain", () => {
    const isBlocked = isPickupDateFullyBlocked("2026-11-29", [ashaBooking]);
    expect(isBlocked).toBe(false);

    const availableSlots = getAvailablePickupSlots("2026-11-29", [ashaBooking]);
    // 06:00 to 10:00 should NOT be in availableSlots
    expect(availableSlots).not.toContain("06:00");
    expect(availableSlots).not.toContain("09:00");
    expect(availableSlots).not.toContain("10:00");
    // 11:00 onwards should be available
    expect(availableSlots).toContain("11:00");
    expect(availableSlots).toContain("12:00");
    expect(availableSlots).toContain("14:00");
  });

  test("interior dates (28th) are FULLY BLOCKED", () => {
    const is28thBlocked = isPickupDateFullyBlocked("2026-11-28", [ashaBooking]);
    expect(is28thBlocked).toBe(true);
  });

  test("pickup slots <= 10am are blocked on 29th", () => {
    expect(isPickupSlotBlocked("2026-11-29", "08:00", [ashaBooking])).toBe(true);
    expect(isPickupSlotBlocked("2026-11-29", "10:00", [ashaBooking])).toBe(true);
    expect(isPickupSlotBlocked("2026-11-29", "11:00", [ashaBooking])).toBe(false);
  });

  test("getVehicleReturnInfoOnDate provides return time info", () => {
    const info = getVehicleReturnInfoOnDate("2026-11-29", [ashaBooking]);
    expect(info).not.toBeNull();
    expect(info?.returnTime).toBe("10:00");
    expect(info?.availableFrom).toBe("11:00");
  });

  test("upcoming booking limits return date", () => {
    const ranges: BookedRange[] = [
      ashaBooking,
      {
        start_date: "2026-12-05",
        pickup_time: "14:00",
        end_date: "2026-12-07",
        dropoff_time: "10:00",
      },
    ];

    // Ben books from 29th 11am
    const next = getNextBookingAfterPickup("2026-11-29", "11:00", ranges);
    expect(next?.start_date).toBe("2026-12-05");

    // Return date up to Dec 5 is allowed
    expect(isReturnDateBlocked("2026-12-04", "2026-11-29", "11:00", ranges)).toBe(false);
    expect(isReturnDateBlocked("2026-12-05", "2026-11-29", "11:00", ranges)).toBe(false);
    // Return date strictly after Dec 5 is blocked
    expect(isReturnDateBlocked("2026-12-06", "2026-11-29", "11:00", ranges)).toBe(true);

    // On Dec 5, dropoff <= 14:00 is allowed, > 14:00 is blocked
    expect(isDropoffSlotBlocked("2026-12-05", "12:00", "2026-11-29", "11:00", ranges)).toBe(false);
    expect(isDropoffSlotBlocked("2026-12-05", "15:00", "2026-11-29", "11:00", ranges)).toBe(true);
  });

  test("schedule validation passes for Ben (29th 11am to 30th 12pm) and fails for clashing time", () => {
    const errValid = validateBookingAgainstRanges(
      "2026-11-29",
      "11:00",
      "2026-11-30",
      "12:00",
      [ashaBooking],
    );
    expect(errValid).toBeNull();

    const errClash = validateBookingAgainstRanges(
      "2026-11-29",
      "09:00",
      "2026-11-30",
      "12:00",
      [ashaBooking],
    );
    expect(errClash).toContain("Car is returned on 2026-11-29 at 10:00");
  });

  test("getSlotStatus identifies 2-hour platform advance notice and cleaning buffer", () => {
    // Current time: 2026-11-29 08:30:00
    const mockNow = new Date("2026-11-29T08:30:00");

    // 09:00 is within 2 hours of 08:30 -> blocked with min_notice_2h or cleaning_buffer (since car returns at 10:00)
    const slot09 = getSlotStatus("09:00", true, "2026-11-29", [ashaBooking], undefined, undefined, mockNow);
    expect(slot09.blocked).toBe(true);

    // 10:00 is also <= 10:00 return time
    const slot10 = getSlotStatus("10:00", true, "2026-11-29", [ashaBooking], undefined, undefined, mockNow);
    expect(slot10.blocked).toBe(true);

    // 11:00 is > 10:00 and > 08:30 + 2h (which is 10:30) -> available!
    const slot11 = getSlotStatus("11:00", true, "2026-11-29", [ashaBooking], undefined, undefined, mockNow);
    expect(slot11.blocked).toBe(false);
  });

  test("getDateAvailabilityState classifies available, partially booked, and sold out dates", () => {
    const mockNow = new Date("2026-11-25T10:00:00");
    // 2026-11-26 is completely free
    expect(getDateAvailabilityState("2026-11-26", [ashaBooking], "2026-11-25", mockNow)).toBe("available");

    // 2026-11-28 is in the middle of Asha's booking (27th-29th) -> sold_out
    expect(getDateAvailabilityState("2026-11-28", [ashaBooking], "2026-11-25", mockNow)).toBe("sold_out");

    // 2026-11-29 is the return day -> partially_booked
    expect(getDateAvailabilityState("2026-11-29", [ashaBooking], "2026-11-25", mockNow)).toBe("partially_booked");
  });
});
