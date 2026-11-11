import { api } from "@/lib/api";

export const currency = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const daysBetween = (start: string | Date, end: string | Date) => {
  const s = new Date(start);
  const e = new Date(end);
  const ms = Math.max(0, e.getTime() - s.getTime());
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
};

export type RentalPriceInput = {
  startDate: string;
  endDate: string;
  pickupTime: string;
  dropoffTime: string;
  priceHourly?: number | string | null;
  priceDaily?: number | string | null;
  priceWeekly?: number | string | null;
};

export type RentalPriceBreakdown = {
  hours: number;
  weeks: number;
  days: number;
  remainingHours: number;
  subtotal: number;
  lines: { label: string; value: number }[];
};

const toMoney = (n: number | string | null | undefined) => Number(n ?? 0);

export const rentalDurationHours = (startDate: string, endDate: string, pickupTime: string, dropoffTime: string) => {
  if (!startDate || !endDate || !pickupTime || !dropoffTime) return 0;
  const start = new Date(`${startDate}T${pickupTime}`);
  const end = new Date(`${endDate}T${dropoffTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
};

export const calculateRentalPrice = (input: RentalPriceInput): RentalPriceBreakdown => {
  const hours = rentalDurationHours(input.startDate, input.endDate, input.pickupTime, input.dropoffTime);
  const hourly = toMoney(input.priceHourly);
  const daily = toMoney(input.priceDaily);
  const weekly = toMoney(input.priceWeekly);
  const lines: { label: string; value: number }[] = [];
  let subtotal = 0;

  if (hours <= 0) return { hours: 0, weeks: 0, days: 0, remainingHours: 0, subtotal: 0, lines };

  if (hours < 24 && hourly > 0) {
    const billedHours = Math.ceil(hours);
    subtotal = billedHours * hourly;
    lines.push({ label: `${currency(hourly)} × ${billedHours} hour${billedHours === 1 ? "" : "s"}`, value: subtotal });
    return { hours, weeks: 0, days: 0, remainingHours: billedHours, subtotal, lines };
  }

  let remainingHours = Math.ceil(hours);
  let weeks = 0;
  if (weekly > 0 && remainingHours >= 24 * 7) {
    weeks = Math.floor(remainingHours / (24 * 7));
    const value = weeks * weekly;
    subtotal += value;
    remainingHours -= weeks * 24 * 7;
    lines.push({ label: `${currency(weekly)} × ${weeks} week${weeks === 1 ? "" : "s"}`, value });
  }

  const days = Math.ceil(remainingHours / 24);
  if (days > 0) {
    const value = days * daily;
    subtotal += value;
    lines.push({ label: `${currency(daily)} × ${days} day${days === 1 ? "" : "s"}`, value });
  }

  return { hours, weeks, days, remainingHours, subtotal, lines };
};

/** Legacy sync helper — returns a public URL. Only works for public buckets. */
export const publicUrl = (bucket: string, path: string | null | undefined) => {
  if (!path) return null;
  const { data } = api.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

/** Batch-sign a list of storage paths from a bucket. Returns a { path -> url } map. */
export async function signImageUrls(bucket: string, paths: string[], expiresIn = 3600) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {} as Record<string, string>;
  const { data, error } = await api.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((d, i) => { if (d.signedUrl) map[unique[i]] = d.signedUrl; });
  return map;
}
