import { describe, expect, test } from "vitest";
import { computeCharges, DEFAULT_SETTINGS, refundFraction, round2 } from "@/lib/charges";

describe("computeCharges (mirror of public.compute_charges)", () => {
  test("10% commission, 5% service fee, 18% GST on fees", () => {
    const c = computeCharges(1000, DEFAULT_SETTINGS);
    expect(c).toEqual({
      base: 1000,
      discount: 0,
      membership_discount: 0,
      service_fee: 50,
      gst: 9,
      commission: 100,
      commission_gst: 18,
      provider_earning: 882,
      customer_total: 1059,
    });
  });

  test("percent coupon reduces the customer's price, not the provider's earning", () => {
    const c = computeCharges(1000, DEFAULT_SETTINGS, { percent_off: 20 });
    expect(c.discount).toBe(200);
    expect(c.service_fee).toBe(40);
    expect(c.gst).toBe(7.2);
    expect(c.customer_total).toBe(847.2);
    expect(c.provider_earning).toBe(882);
  });

  test("flat coupon is capped at the base amount", () => {
    const c = computeCharges(300, DEFAULT_SETTINGS, { amount_off: 500 });
    expect(c.discount).toBe(300);
    expect(c.service_fee).toBe(0);
    expect(c.customer_total).toBe(0);
  });

  test("rounds to paise half away from zero", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    const c = computeCharges(333, DEFAULT_SETTINGS);
    expect(c.service_fee).toBe(16.65);
    expect(c.gst).toBe(3);
    expect(c.commission).toBe(33.3);
    expect(c.commission_gst).toBe(5.99);
    expect(c.provider_earning).toBe(293.71);
  });

  test("zero fees leave the base untouched", () => {
    const c = computeCharges(1200, {
      commission_pct: 0,
      service_fee_pct: 0,
      gst_pct: 0,
      min_withdrawal: 0,
    });
    expect(c.customer_total).toBe(1200);
    expect(c.provider_earning).toBe(1200);
  });

  test("Synchoo Plus: 10% discount and 0% convenience fees", () => {
    const c = computeCharges(1000, DEFAULT_SETTINGS, null, "plus");
    expect(c.membership_discount).toBe(100);
    expect(c.discount).toBe(100);
    expect(c.service_fee).toBe(0);
    expect(c.gst).toBe(0);
    expect(c.customer_total).toBe(900);
  });

  test("Synchoo Black: 15% discount and 0% convenience fees", () => {
    const c = computeCharges(1000, DEFAULT_SETTINGS, null, "black");
    expect(c.membership_discount).toBe(150);
    expect(c.discount).toBe(150);
    expect(c.service_fee).toBe(0);
    expect(c.gst).toBe(0);
    expect(c.customer_total).toBe(850);
  });
});

describe("refundFraction", () => {
  test("tiers and provider override", () => {
    expect(refundFraction(30)).toBe(1);
    expect(refundFraction(24)).toBe(1);
    expect(refundFraction(10)).toBe(0.5);
    expect(refundFraction(2)).toBe(0.5);
    expect(refundFraction(1.9)).toBe(0);
    expect(refundFraction(0, true)).toBe(1);
  });

  test("Synchoo Plus cancellation: 100% refund up to 6 hours before trip", () => {
    expect(refundFraction(6, false, "plus")).toBe(1);
    expect(refundFraction(10, false, "plus")).toBe(1);
    expect(refundFraction(4, false, "plus")).toBe(0.5);
    expect(refundFraction(2, false, "plus")).toBe(0.5);
    expect(refundFraction(1.5, false, "plus")).toBe(0);
  });

  test("Synchoo Black VIP cancellation: 100% refund up to 2 hours before trip", () => {
    expect(refundFraction(2, false, "black")).toBe(1);
    expect(refundFraction(3, false, "black")).toBe(1);
    expect(refundFraction(1, false, "black")).toBe(0.5);
    expect(refundFraction(0.1, false, "black")).toBe(0.5);
  });
});
