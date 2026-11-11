import { expect, test } from "vitest";
import { getHandoverGate } from "@/lib/trip-window";
const base = { status:"confirmed", payment_status:"paid", start_date:"2026-08-20", end_date:"2026-08-22", pickup_time:"10:00", dropoff_time:"18:00" };
test("locked before window", () => {
  const g = getHandoverGate(base as any, new Date("2026-08-19T10:00:00"));
  expect(g.canCheckin).toBe(false); expect(g.ctaLabel).toBe("Check-in not open yet");
});
test("open 30m before", () => {
  expect(getHandoverGate(base as any, new Date("2026-08-20T09:40:00")).canCheckin).toBe(true);
});
test("unpaid blocked", () => {
  expect(getHandoverGate({...base, payment_status:"pending"} as any, new Date("2026-08-20T11:00:00")).ctaLabel).toBe(null);
});
test("checkout after checkin", () => {
  const g = getHandoverGate({...base, pickup_checked_at:"2026-08-20T10:00:00Z"} as any, new Date("2026-08-21T10:00:00"));
  expect(g.canCheckout).toBe(true); expect(g.ctaLabel).toBe("End trip");
});
