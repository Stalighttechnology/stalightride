import React, { useMemo, useState, useEffect } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Truck,
  Store,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CheckCircle2,
  Zap,
  Info,
  Sun,
  Sunset,
  Moon,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Crown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateRentalPrice,
  currency,
  rentalDurationHours,
} from "@/lib/format";
import { computeCharges } from "@/lib/charges";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import {
  type BookedRange,
  toIsoDate,
  isPickupDateFullyBlocked,
  isPickupSlotBlocked,
  getAvailablePickupSlots,
  getVehicleReturnInfoOnDate,
  getNextBookingAfterPickup,
  isReturnDateBlocked,
  isDropoffSlotBlocked,
  validateBookingAgainstRanges,
  DEFAULT_TIME_SLOTS,
} from "@/lib/vehicle-availability";
import { cn } from "@/lib/utils";
import { ScrollableTimeDrum } from "@/components/zoom-booking-calendar";

export interface RentalCalendarSelectorProps {
  vehicle: {
    id: string;
    title: string;
    brand: string;
    model: string;
    category: string;
    city: string;
    address?: string | null;
    price_daily: number | string;
    price_hourly?: number | string | null;
    price_weekly?: number | string | null;
    security_deposit?: number | string | null;
    instant_book?: boolean;
    available_stock?: number;
  };
  bookedRanges: BookedRange[];
  startDate: string;
  endDate: string;
  pickupTime: string;
  dropoffTime: string;
  fulfillmentType?: "pickup" | "delivery";
  deliveryAddress?: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onPickupTimeChange: (time: string) => void;
  onDropoffTimeChange: (time: string) => void;
  onFulfillmentTypeChange?: (type: "pickup" | "delivery") => void;
  onDeliveryAddressChange?: (address: string) => void;
  onBookClick?: () => void;
  bookingLoading?: boolean;
  isOwner?: boolean;
  isDlApproved?: boolean;
  user?: any;
  membershipPlan?: string | null;
  coupon?: any;
  className?: string;
}

export function formatZoomTimeSlot(timeStr: string) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, "0")} ${period}`;
}

export function formatZoomSummaryTime(timeStr?: string): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const mins = mStr && mStr !== "00" ? `:${mStr}` : ":00";
  return `${displayH}${mins}${period}`;
}

export function formatZoomDate(dateStr?: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = String(d).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year2 = String(y).slice(-2);
  return `${weekday}, ${day} ${month} '${year2}`;
}

export function RentalCalendarSelector({
  vehicle,
  bookedRanges,
  startDate,
  endDate,
  pickupTime,
  dropoffTime,
  fulfillmentType = "pickup",
  deliveryAddress = "",
  onStartDateChange,
  onEndDateChange,
  onPickupTimeChange,
  onDropoffTimeChange,
  onFulfillmentTypeChange,
  onDeliveryAddressChange,
  onBookClick,
  bookingLoading = false,
  isOwner = false,
  isDlApproved = false,
  user,
  membershipPlan,
  coupon,
  className,
}: RentalCalendarSelectorProps) {
  const [baseMonth, setBaseMonth] = useState(() => {
    if (startDate) {
      const [y, m] = startDate.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const todayStr = useMemo(() => toIsoDate(new Date()), []);

  const isDelivery = fulfillmentType === "delivery";
  const isBlackVip = (membershipPlan || "").toLowerCase() === "black";
  const deliveryFee = isDelivery ? (isBlackVip ? 0 : 350) : 0;

  const rentalHours = useMemo(() => {
    return rentalDurationHours(startDate, endDate, pickupTime, dropoffTime);
  }, [startDate, endDate, pickupTime, dropoffTime]);

  const priceBreakdown = useMemo(() => {
    if (rentalHours <= 0) return { hours: 0, weeks: 0, days: 0, subtotal: 0, lines: [] };
    return calculateRentalPrice({
      startDate,
      endDate,
      pickupTime,
      dropoffTime,
      priceHourly: vehicle.price_hourly,
      priceDaily: vehicle.price_daily,
      priceWeekly: vehicle.price_weekly,
    });
  }, [startDate, endDate, pickupTime, dropoffTime, vehicle]);

  const settings = usePlatformSettings();
  const subtotal = priceBreakdown.subtotal;

  const charges = useMemo(() => {
    return computeCharges(subtotal, settings, coupon, membershipPlan);
  }, [subtotal, settings, coupon, membershipPlan]);

  const deposit = isBlackVip ? 0 : Number(vehicle.security_deposit || 0);
  const grandTotal = charges.customer_total + deposit + deliveryFee;

  const returnInfo = useMemo(() => {
    return startDate ? getVehicleReturnInfoOnDate(startDate, bookedRanges) : null;
  }, [startDate, bookedRanges]);

  const nextBooking = useMemo(() => {
    return startDate ? getNextBookingAfterPickup(startDate, pickupTime, bookedRanges) : null;
  }, [startDate, pickupTime, bookedRanges]);

  const validationError = useMemo(() => {
    if (!startDate && !endDate) return null;
    if (!startDate) return "Select a pickup date";
    if (!endDate) return "Select a return date";

    const pickupDateTime = new Date(`${startDate}T${(pickupTime || "10:00").slice(0, 5)}:00+05:30`);
    if (pickupDateTime.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      return "Pickup must be at least 2 hours from now (platform rule)";
    }

    if (rentalHours <= 0) {
      return "Drop-off must be strictly after pickup time";
    }

    return validateBookingAgainstRanges(
      startDate,
      pickupTime,
      endDate,
      dropoffTime,
      bookedRanges,
    );
  }, [startDate, endDate, pickupTime, dropoffTime, rentalHours, bookedRanges]);

  const visibleMonths = useMemo(() => {
    const list: { year: number; month: number; label: string; days: (string | null)[] }[] = [];
    for (let offset = 0; offset < 2; offset++) {
      const d = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthName = d.toLocaleDateString("en-US", { month: "long" });
      const yearShort = String(year).slice(-2);
      const label = `${monthName} '${yearShort}`;

      const daysCount = new Date(year, month + 1, 0).getDate();
      let startDayOfWeek = new Date(year, month, 1).getDay() - 1;
      if (startDayOfWeek === -1) startDayOfWeek = 6;

      const days: (string | null)[] = [];
      for (let i = 0; i < startDayOfWeek; i++) {
        days.push(null);
      }
      for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        days.push(dateStr);
      }

      list.push({ year, month, label, days });
    }
    return list;
  }, [baseMonth]);

  const checkDateBlocked = (dateStr: string) => {
    if (dateStr < todayStr) return true;
    return isPickupDateFullyBlocked(dateStr, bookedRanges);
  };

  const handleDateClick = (dateStr: string) => {
    if (checkDateBlocked(dateStr)) return;

    if (!startDate || (startDate && endDate)) {
      onStartDateChange(dateStr);
      onEndDateChange("");

      if (isPickupSlotBlocked(dateStr, pickupTime, bookedRanges)) {
        const available = getAvailablePickupSlots(dateStr, bookedRanges);
        if (available.length > 0) onPickupTimeChange(available[0]);
      }
      return;
    }

    if (startDate && !endDate) {
      if (dateStr < startDate) {
        onStartDateChange(dateStr);
        onEndDateChange("");
        return;
      }

      if (isReturnDateBlocked(dateStr, startDate, pickupTime, bookedRanges)) {
        return;
      }

      onEndDateChange(dateStr);

      if (isDropoffSlotBlocked(dateStr, dropoffTime, startDate, pickupTime, bookedRanges)) {
        const nextSlot = DEFAULT_TIME_SLOTS.find(
          (t) => !isDropoffSlotBlocked(dateStr, t, startDate, pickupTime, bookedRanges),
        );
        if (nextSlot) onDropoffTimeChange(nextSlot);
      }
    }
  };

  const handleClear = () => {
    onStartDateChange("");
    onEndDateChange("");
  };

  const getSlotIndices = (timeVal: string) => {
    const idx = DEFAULT_TIME_SLOTS.indexOf(timeVal);
    const activeIdx = idx >= 0 ? idx : 0;
    const prevIdx = activeIdx > 0 ? activeIdx - 1 : null;
    const nextIdx = activeIdx < DEFAULT_TIME_SLOTS.length - 1 ? activeIdx + 1 : null;
    return { activeIdx, prevIdx, nextIdx };
  };

  const startSlots = getSlotIndices(pickupTime);
  const endSlots = getSlotIndices(dropoffTime);

  const handleShiftTime = (isStart: boolean, direction: "prev" | "next") => {
    const currentVal = isStart ? pickupTime : dropoffTime;
    const idx = DEFAULT_TIME_SLOTS.indexOf(currentVal);
    const validIdx = idx >= 0 ? idx : 0;

    let targetIdx = validIdx;
    if (direction === "prev" && validIdx > 0) targetIdx = validIdx - 1;
    if (direction === "next" && validIdx < DEFAULT_TIME_SLOTS.length - 1) targetIdx = validIdx + 1;

    const targetTime = DEFAULT_TIME_SLOTS[targetIdx];
    if (isStart) {
      onPickupTimeChange(targetTime);
    } else {
      onDropoffTimeChange(targetTime);
    }
  };

  const summaryString = useMemo(() => {
    if (!startDate) return "Choose start and end dates";
    const startPart = `${formatZoomDate(startDate)}, ${formatZoomSummaryTime(pickupTime)}`;
    if (!endDate) {
      return `${startPart} →`;
    }
    const endPart = `${formatZoomDate(endDate)}, ${formatZoomSummaryTime(dropoffTime)}`;
    return `${startPart} → ${endPart}`;
  }, [startDate, endDate, pickupTime, dropoffTime]);

  return (
    <div className={cn("space-y-4 font-sans text-foreground", className)}>
      {/* 1. Zoomcar-style Top Vehicle Summary Card */}
      <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <div>
          <h3 className="text-base font-bold text-foreground leading-tight">
            {vehicle.brand} {vehicle.model}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{vehicle.city}</p>
        </div>
        <div className="flex items-center gap-2">
          {vehicle.instant_book && (
            <Badge className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1 text-[10px] font-medium border-0">
              <Zap className="h-3 w-3 fill-current" /> Instant Book
            </Badge>
          )}
          {startDate && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-destructive hover:underline"
            >
              Remove Selection
            </button>
          )}
        </div>
      </div>

      {/* 2. Zoomcar-style "Where" Hub / Fulfillment Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-xs text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-muted-foreground shrink-0">Where</span>
          <p className="truncate text-foreground font-medium">
            {vehicle.address || `${vehicle.city} Central Hub`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => onFulfillmentTypeChange?.("pickup")}
            className={cn(
              "rounded-xl px-2.5 py-1 text-[11px] font-semibold transition-all border",
              !isDelivery
                ? "bg-brand text-brand-foreground border-brand shadow-xs"
                : "bg-muted/60 text-muted-foreground border-transparent hover:text-foreground",
            )}
          >
            Hub Pickup (Free)
          </button>
          <button
            type="button"
            onClick={() => onFulfillmentTypeChange?.("delivery")}
            className={cn(
              "rounded-xl px-2.5 py-1 text-[11px] font-semibold transition-all border",
              isDelivery
                ? "bg-brand text-brand-foreground border-brand shadow-xs"
                : "bg-muted/60 text-muted-foreground border-transparent hover:text-foreground",
            )}
          >
            Delivery {isBlackVip ? "(Free VIP)" : "(+₹350)"}
          </button>
        </div>
      </div>

      {isDelivery && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-3 animate-fade-in space-y-1.5 text-xs">
          <Label htmlFor="delivery-address" className="font-medium text-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-brand" />
              Delivery address in {vehicle.city}:
            </span>
            <span className="text-[11px] text-brand font-semibold">Standard 60-min delivery window</span>
          </Label>
          <Input
            id="delivery-address"
            value={deliveryAddress}
            onChange={(e) => onDeliveryAddressChange?.(e.target.value)}
            placeholder="Enter apartment, street or landmark..."
            className="h-9 bg-card text-xs rounded-xl border-border/80"
          />
        </div>
      )}

      {/* 3. Main Zoomcar-style Booking Calendar & Time Slot Card */}
      <div className="relative rounded-3xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm overflow-hidden">
        {/* Header: "Select start & end date" and "CLEAR" */}
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            Select start & end date
          </h2>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-bold text-brand hover:text-brand/80 tracking-wider uppercase transition-colors"
            >
              CLEAR
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm font-semibold text-foreground/90 pb-3">
          {summaryString}
        </p>

        {/* Day of week header: M  T  W  T  F  S  S */}
        <div className="grid grid-cols-7 gap-1 border-t border-border/60 py-2.5 text-center text-xs font-medium text-muted-foreground select-none">
          <span>M</span>
          <span>T</span>
          <span>W</span>
          <span>T</span>
          <span>F</span>
          <span>S</span>
          <span>S</span>
        </div>

        {/* Continuous Multi-Month Grid */}
        <div className="max-h-[360px] sm:max-h-[380px] overflow-y-auto pr-1 space-y-6 inapp-scroll">
          {visibleMonths.map((m) => (
            <div key={m.label} className="space-y-2">
              <div className="flex items-center justify-between pt-1">
                <h3 className="text-sm font-bold text-foreground tracking-tight">
                  {m.label}
                </h3>
              </div>

              <div className="grid grid-cols-7 gap-y-1 text-center text-xs sm:text-sm font-medium">
                {m.days.map((dayStr, dIdx) => {
                  if (!dayStr) {
                    return <div key={`empty-${dIdx}`} className="h-10" />;
                  }

                  const dayNum = parseInt(dayStr.split("-")[2], 10);
                  const isBlocked = checkDateBlocked(dayStr);
                  const isStart = dayStr === startDate;
                  const isEnd = dayStr === endDate;
                  const isSingle = isStart && isEnd;
                  const inRange =
                    startDate && endDate && dayStr > startDate && dayStr < endDate;

                  let containerClasses = "relative flex items-center justify-center h-10 w-full transition-colors";
                  let textClasses = "z-10 font-medium select-none";

                  if (isSingle) {
                    containerClasses += " bg-brand text-brand-foreground rounded-md font-bold shadow-xs";
                    textClasses = "text-brand-foreground font-bold flex items-center justify-center gap-1";
                  } else if (isStart) {
                    containerClasses += " bg-brand text-brand-foreground rounded-l-md font-bold shadow-xs";
                    if (!endDate) containerClasses += " rounded-r-md";
                    textClasses = "text-brand-foreground font-bold flex items-center justify-center gap-1 pl-1";
                  } else if (isEnd) {
                    containerClasses += " bg-brand text-brand-foreground rounded-r-md font-bold shadow-xs";
                    textClasses = "text-brand-foreground font-bold flex items-center justify-center gap-1 pr-1";
                  } else if (inRange) {
                    containerClasses += " bg-brand/15 dark:bg-brand/25 text-foreground";
                    textClasses = "text-foreground font-semibold";
                  } else if (isBlocked) {
                    containerClasses += " opacity-40 cursor-not-allowed";
                    textClasses = "text-muted-foreground line-through font-normal";
                  } else {
                    containerClasses += " hover:bg-muted/60 rounded-md cursor-pointer";
                    textClasses = "text-foreground font-semibold";
                  }

                  return (
                    <button
                      key={dayStr}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => handleDateClick(dayStr)}
                      className={containerClasses}
                      aria-label={dayStr}
                    >
                      {isStart && (
                        <span className="text-[10px] opacity-80 font-bold select-none tracking-tighter">
                          ||
                        </span>
                      )}

                      <span className={textClasses}>
                        {String(dayNum).padStart(2, "0")}
                      </span>

                      {isEnd && (
                        <span className="text-[10px] opacity-80 font-bold select-none tracking-tighter">
                          ||
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Floating pill: "Select trip end date" (matching Zoomcar screenshot 2) */}
        {startDate && !endDate && (
          <div className="sticky bottom-2 left-0 right-0 flex justify-center py-1 pointer-events-none z-20 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full bg-zinc-900 dark:bg-zinc-800 text-white px-4 py-2 text-xs font-semibold shadow-xl border border-zinc-700/50">
              <CalendarDays className="h-3.5 w-3.5 text-brand" />
              <span>Select trip end date</span>
            </div>
          </div>
        )}

        <hr className="my-4 border-border/70" />

        {/* 4. Time Picker Section: Genuine scrollable 3D vertical roller drums */}
        <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-1 justify-items-center">
          <ScrollableTimeDrum
            label="Pickup Time"
            value={pickupTime}
            slots={DEFAULT_TIME_SLOTS}
            onChange={onPickupTimeChange}
            isSlotDisabled={(t) => isPickupSlotBlocked(startDate, t, bookedRanges)}
          />
          <ScrollableTimeDrum
            label="Dropoff Time"
            value={dropoffTime}
            slots={DEFAULT_TIME_SLOTS}
            onChange={onDropoffTimeChange}
            isSlotDisabled={(t) =>
              isDropoffSlotBlocked(endDate || startDate, t, startDate, pickupTime, bookedRanges)
            }
          />
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive font-medium flex items-center gap-2 animate-fade-in">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Sticky Duration & Price Summary Bar */}
        {rentalHours > 0 && !validationError && (
          <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Duration: </span>
              <strong className="text-foreground">
                {Math.floor(rentalHours / 24) > 0 ? `${Math.floor(rentalHours / 24)}d ` : ""}
                {rentalHours % 24 > 0 ? `${(rentalHours % 24).toFixed(0)}h` : ""}
                {rentalHours < 24 && `${rentalHours} hrs`}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{currency(grandTotal)}</span>
              <button
                type="button"
                onClick={() => setShowPriceBreakdown(!showPriceBreakdown)}
                className="text-[11px] text-brand hover:underline font-semibold"
              >
                {showPriceBreakdown ? "Hide" : "Details"}
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Fare breakdown */}
        {showPriceBreakdown && rentalHours > 0 && (
          <div className="mt-3 rounded-2xl border border-border/70 bg-muted/30 p-3 text-xs space-y-1.5 animate-fade-in">
            {priceBreakdown.lines.map((l) => (
              <div key={l.label} className="flex justify-between text-muted-foreground">
                <span>{l.label}</span>
                <span>{currency(l.value)}</span>
              </div>
            ))}
            {charges.discount > 0 && (
              <div className="flex justify-between text-brand font-medium">
                <span>Discount</span>
                <span>-{currency(charges.discount)}</span>
              </div>
            )}
            {isDelivery && (
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span>{isBlackVip ? "FREE (VIP)" : currency(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>GST & Platform Fee</span>
              <span>{currency(charges.service_fee + charges.gst)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit (refundable)</span>
                <span>{currency(deposit)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground border-t border-border/50 pt-1.5">
              <span>Payable Total</span>
              <span>{currency(grandTotal)}</span>
            </div>
          </div>
        )}

        {/* 5. Solid Brand CTA Button */}
        <div className="pt-4">
          <button
            type="button"
            disabled={Boolean(validationError) || !startDate || !endDate || bookingLoading}
            onClick={onBookClick}
            className={cn(
              "w-full rounded-2xl btn-gradient text-brand-foreground font-bold text-sm tracking-wider uppercase py-3.5 shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2",
              (Boolean(validationError) || !startDate || !endDate || bookingLoading)
                ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground shadow-none"
                : "",
            )}
          >
            {bookingLoading ? "PROCESSING..." : "CONTINUE"}
          </button>
        </div>
      </div>
    </div>
  );
}
