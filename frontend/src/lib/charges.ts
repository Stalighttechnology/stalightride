/**
 * Platform fees for a base amount. Mirrors public.compute_charges in
 * backend/sql/schema.sql — the database is the
 * source of truth (it reprices every booking on insert); this is for previews
 * and the test harness. Keep both in sync.
 */
export type PlatformSettings = {
  commission_pct: number;
  service_fee_pct: number;
  gst_pct: number;
  min_withdrawal: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  commission_pct: 10,
  service_fee_pct: 5,
  gst_pct: 18,
  min_withdrawal: 500,
};

export type Coupon = { percent_off?: number | null; amount_off?: number | null } | null | undefined;

export type Charges = {
  base: number;
  discount: number;
  service_fee: number;
  gst: number;
  commission: number;
  commission_gst: number;
  provider_earning: number;
  /** What the customer pays, excluding any refundable deposit. */
  customer_total: number;
};

/** Round to paise, half away from zero (matches Postgres round(numeric, 2)). */
export const round2 = (n: number) =>
  (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;

export function computeCharges(
  base: number,
  settings: PlatformSettings = DEFAULT_SETTINGS,
  coupon?: Coupon,
): Charges {
  const b = Math.max(0, Number(base) || 0);
  let discount = 0;
  if (coupon) {
    const raw =
      coupon.percent_off != null
        ? (b * Number(coupon.percent_off)) / 100
        : Number(coupon.amount_off ?? 0);
    discount = round2(Math.min(b, Math.max(0, raw)));
  }
  const service_fee = round2(((b - discount) * settings.service_fee_pct) / 100);
  const gst = round2((service_fee * settings.gst_pct) / 100);
  const commission = round2((b * settings.commission_pct) / 100);
  const commission_gst = round2((commission * settings.gst_pct) / 100);
  return {
    base: b,
    discount,
    service_fee,
    gst,
    commission,
    commission_gst,
    provider_earning: round2(b - commission - commission_gst),
    customer_total: round2(b - discount + service_fee + gst),
  };
}

/** Cancellation refund share: >=24h 100%, >=2h 50%, else 0. Provider/admin cancel = 100%. */
export function refundFraction(hoursLeft: number, cancelledByProviderOrAdmin = false) {
  if (cancelledByProviderOrAdmin || hoursLeft >= 24) return 1;
  if (hoursLeft >= 2) return 0.5;
  return 0;
}
