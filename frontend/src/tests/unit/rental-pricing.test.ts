import { describe, expect, test } from "vitest";
import { calculateRentalPrice, rentalDurationHours, daysBetween } from "@/lib/format";

describe("rental duration", () => {
  test("hours between pickup and drop-off", () => {
    expect(rentalDurationHours("2026-08-20", "2026-08-20", "09:00", "15:30")).toBe(6.5);
    expect(rentalDurationHours("2026-08-20", "2026-08-22", "10:00", "10:00")).toBe(48);
  });

  test("invalid or reversed inputs collapse to zero", () => {
    expect(rentalDurationHours("", "", "", "")).toBe(0);
    expect(rentalDurationHours("2026-08-22", "2026-08-20", "10:00", "10:00")).toBe(0);
  });

  test("daysBetween is inclusive and never below one", () => {
    expect(daysBetween("2026-08-20", "2026-08-20")).toBe(1);
    expect(daysBetween("2026-08-20", "2026-08-22")).toBe(3);
  });
});

describe("rental price breakdown", () => {
  test("sub-day hires bill hourly, rounded up", () => {
    const p = calculateRentalPrice({
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      pickupTime: "09:00",
      dropoffTime: "12:15",
      priceHourly: 100,
      priceDaily: 1200,
    });
    expect(p.subtotal).toBe(400);
    expect(p.lines).toHaveLength(1);
  });

  test("no hourly rate falls back to a full day", () => {
    const p = calculateRentalPrice({
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      pickupTime: "09:00",
      dropoffTime: "12:00",
      priceHourly: 0,
      priceDaily: 1200,
    });
    expect(p.subtotal).toBe(1200);
    expect(p.days).toBe(1);
  });

  test("multi-day hires bill per day", () => {
    const p = calculateRentalPrice({
      startDate: "2026-08-20",
      endDate: "2026-08-23",
      pickupTime: "10:00",
      dropoffTime: "10:00",
      priceHourly: 100,
      priceDaily: 1200,
    });
    expect(p.days).toBe(3);
    expect(p.subtotal).toBe(3600);
  });

  test("weekly rate is applied first, then leftover days", () => {
    const p = calculateRentalPrice({
      startDate: "2026-08-01",
      endDate: "2026-08-10",
      pickupTime: "10:00",
      dropoffTime: "10:00",
      priceHourly: 100,
      priceDaily: 1200,
      priceWeekly: 7000,
    });
    expect(p.weeks).toBe(1);
    expect(p.days).toBe(2);
    expect(p.subtotal).toBe(7000 + 2 * 1200);
    expect(p.lines).toHaveLength(2);
  });

  test("a weekly rate cheaper than 7 days is preferred over daily billing", () => {
    const base = {
      startDate: "2026-08-01",
      endDate: "2026-08-08",
      pickupTime: "10:00",
      dropoffTime: "10:00",
      priceDaily: 1200,
    };
    const withWeekly = calculateRentalPrice({ ...base, priceWeekly: 7000 }).subtotal;
    const dailyOnly = calculateRentalPrice({ ...base, priceWeekly: 0 }).subtotal;
    expect(withWeekly).toBeLessThan(dailyOnly);
  });

  test("zero or invalid duration yields an empty breakdown", () => {
    const p = calculateRentalPrice({
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      pickupTime: "10:00",
      dropoffTime: "10:00",
      priceDaily: 1200,
    });
    expect(p.subtotal).toBe(0);
    expect(p.lines).toHaveLength(0);
  });
});
