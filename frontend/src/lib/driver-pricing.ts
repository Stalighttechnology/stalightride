import { currency } from "@/lib/format";

export type DriverRateType = "hourly" | "daily";

export type DriverPriceInput = {
  rateType: DriverRateType;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number | string | null | undefined;
  dailyRate: number | string | null | undefined;
};

export type DriverPriceBreakdown = {
  hours: number;
  days: number;
  subtotal: number;
  lines: { label: string; value: number }[];
  error?: string;
};

const num = (n: number | string | null | undefined) => Number(n ?? 0);

/** Whole days inclusive of both start and end date. */
export const driverDays = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff < 0 ? 0 : diff + 1;
};

/** Hours between start and end datetime (hourly hires are same-day). */
export const driverHours = (startDate: string, endDate: string, startTime: string, endTime: string) => {
  if (!startDate || !endDate || !startTime || !endTime) return 0;
  const s = new Date(`${startDate}T${startTime}`);
  const e = new Date(`${endDate}T${endTime}`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / 3600000);
};

export const calculateDriverPrice = (input: DriverPriceInput): DriverPriceBreakdown => {
  const hourly = num(input.hourlyRate);
  const daily = num(input.dailyRate);
  const days = driverDays(input.startDate, input.endDate);
  const rawHours = driverHours(input.startDate, input.endDate, input.startTime, input.endTime);
  const lines: { label: string; value: number }[] = [];

  if (days <= 0) return { hours: 0, days: 0, subtotal: 0, lines, error: "Pick valid dates" };

  if (input.rateType === "hourly") {
    if (hourly <= 0) return { hours: 0, days, subtotal: 0, lines, error: "This driver does not offer hourly hire" };
    if (days > 1) return { hours: 0, days, subtotal: 0, lines, error: "Hourly hire must start and end on the same day" };
    const billed = Math.ceil(rawHours);
    if (billed <= 0) return { hours: 0, days, subtotal: 0, lines, error: "End time must be after start time" };
    const value = billed * hourly;
    lines.push({ label: `${currency(hourly)} × ${billed} hour${billed === 1 ? "" : "s"}`, value });
    return { hours: billed, days, subtotal: value, lines };
  }

  if (daily <= 0) return { hours: 0, days, subtotal: 0, lines, error: "Daily rate unavailable" };
  const value = days * daily;
  lines.push({ label: `${currency(daily)} × ${days} day${days === 1 ? "" : "s"}`, value });
  return { hours: Math.ceil(rawHours), days, subtotal: value, lines };
};
