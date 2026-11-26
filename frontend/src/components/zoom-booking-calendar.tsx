import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  ChevronUp,
  ChevronDown,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from "@/components/wheel-picker";

export interface BookedDateRange {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  pickup_time?: string | null;
  dropoff_time?: string | null;
}

export interface ZoomBookingCalendarProps {
  // Selection state
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onStartTimeChange?: (time: string) => void;
  onEndTimeChange?: (time: string) => void;

  // Single date mode (e.g. for wash booking or hourly driver)
  singleDateMode?: boolean;

  // Constraints
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  bookedRanges?: BookedDateRange[];
  isDateDisabled?: (dateStr: string) => boolean;
  isTimeDisabled?: (timeStr: string, isStart: boolean) => boolean;

  // Context Header Info (optional top cards matching reference)
  itemTitle?: string;
  itemSubtitle?: string;
  onRemoveSelection?: () => void;
  locationAddress?: string;

  // Labels
  startTimeLabel?: string; // Default: "Pickup Time"
  endTimeLabel?: string; // Default: "Dropoff Time"
  continueButtonLabel?: string; // Default: "CONTINUE"
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueLoading?: boolean;

  // Time slot list
  timeSlots?: string[];

  // Layout mode
  variant?: "full" | "embedded" | "modal";
  className?: string;
}

export const ZOOM_DEFAULT_TIME_SLOTS = [
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

// Helper to format ISO date to "Tue, 08 Dec '26"
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

// Helper to format 24h time ("08:00") to 12h time ("08 AM" or "8:00AM")
export function formatZoomTimeSlot(timeStr?: string): string {
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

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ScrollableTimeDrum({
  label,
  value,
  slots,
  onChange,
  isSlotDisabled,
}: {
  label: string;
  value: string;
  slots: string[];
  onChange: (time: string) => void;
  isSlotDisabled?: (time: string) => boolean;
}) {
  const options = useMemo<WheelPickerOption<string>[]>(
    () =>
      slots.map((slot) => ({
        value: slot,
        label: formatZoomTimeSlot(slot),
        disabled: isSlotDisabled ? isSlotDisabled(slot) : false,
      })),
    [slots, isSlotDisabled],
  );

  const activeIdx = Math.max(0, slots.indexOf(value));
  const canGoPrev = activeIdx > 0;
  const canGoNext = activeIdx < slots.length - 1;

  const handleStep = (direction: -1 | 1) => {
    let nextIdx = activeIdx + direction;
    while (nextIdx >= 0 && nextIdx < slots.length) {
      const nextSlot = slots[nextIdx];
      if (!isSlotDisabled?.(nextSlot)) {
        onChange(nextSlot);
        return;
      }
      nextIdx += direction;
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-[180px]">
      <div className="flex items-center justify-between w-full px-1 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => handleStep(-1)}
            aria-label={`Previous ${label}`}
            className="h-5 w-5 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20 transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => handleStep(1)}
            aria-label={`Next ${label}`}
            className="h-5 w-5 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <WheelPickerWrapper className="w-full rounded-2xl border-border/70 bg-muted/15 px-1">
        <WheelPicker
          options={options}
          value={value}
          onValueChange={(next) => {
            if (!isSlotDisabled?.(next)) {
              onChange(next);
            }
          }}
          visibleCount={12}
          optionItemHeight={40}
          classNames={{
            optionItem: "text-xs sm:text-sm font-medium text-muted-foreground/70 data-disabled:line-through data-disabled:opacity-30",
            highlightWrapper: "border-y-2 border-brand/80 bg-brand/5 text-foreground",
            highlightItem: "text-sm sm:text-base font-bold text-foreground data-disabled:line-through data-disabled:opacity-30",
          }}
        />
      </WheelPickerWrapper>
    </div>
  );
}

export function ZoomBookingCalendar({
  startDate = "",
  endDate = "",
  startTime = "08:00",
  endTime = "09:00",
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  singleDateMode = false,
  minDate,
  maxDate,
  bookedRanges = [],
  isDateDisabled,
  isTimeDisabled,
  itemTitle,
  itemSubtitle,
  onRemoveSelection,
  locationAddress,
  startTimeLabel = "Pickup Time",
  endTimeLabel = "Dropoff Time",
  continueButtonLabel = "CONTINUE",
  onContinue,
  continueDisabled = false,
  continueLoading = false,
  timeSlots = ZOOM_DEFAULT_TIME_SLOTS,
  variant = "full",
  className,
}: ZoomBookingCalendarProps) {
  const todayIso = useMemo(() => toIso(new Date()), []);
  const effectiveMinDate = minDate || todayIso;

  // Track start of visible months: generate 3 consecutive months starting from today or startDate
  const initialBaseMonth = useMemo(() => {
    if (startDate) {
      const [y, m] = startDate.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const [baseMonth, setBaseMonth] = useState<Date>(initialBaseMonth);

  // Generate 3 consecutive months
  const months = useMemo(() => {
    const list: { year: number; month: number; label: string; days: (string | null)[] }[] = [];
    for (let offset = 0; offset < 3; offset++) {
      const d = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthName = d.toLocaleDateString("en-US", { month: "long" });
      const yearShort = String(year).slice(-2);
      const label = `${monthName} '${yearShort}`;

      // Days of the month
      const daysCount = new Date(year, month + 1, 0).getDate();
      // Monday = 0, Sunday = 6
      let startDayOfWeek = new Date(year, month, 1).getDay() - 1;
      if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday is index 6 in M-T-W-T-F-S-S

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

  // Check if a date is booked or disabled
  const checkDateBlocked = (dateStr: string): boolean => {
    if (dateStr < effectiveMinDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    if (isDateDisabled && isDateDisabled(dateStr)) return true;

    // Check booked ranges
    for (const r of bookedRanges) {
      if (r.start_date <= dateStr && dateStr <= r.end_date) {
        // If interior date
        if (dateStr > r.start_date && dateStr < r.end_date) return true;
        // If both start and end are on this date
        if (r.start_date === dateStr && r.end_date === dateStr) return true;
      }
    }
    return false;
  };

  // Handle Date Click
  const handleDateClick = (dateStr: string) => {
    if (checkDateBlocked(dateStr)) return;

    if (singleDateMode) {
      onStartDateChange?.(dateStr);
      onEndDateChange?.(dateStr);
      return;
    }

    // If no start date selected yet, or both start and end are already selected, start fresh selection
    if (!startDate || (startDate && endDate)) {
      onStartDateChange?.(dateStr);
      onEndDateChange?.("");
      return;
    }

    // When start date is selected and end date is pending
    if (startDate && !endDate) {
      if (dateStr < startDate) {
        // Clicked a date before start date -> make it new start date
        onStartDateChange?.(dateStr);
        onEndDateChange?.("");
        return;
      }
      // Clicked date is same or after start date -> set end date
      onEndDateChange?.(dateStr);
    }
  };

  // Handle Clear
  const handleClear = () => {
    onStartDateChange?.("");
    onEndDateChange?.("");
  };

  // Time Wheel helpers
  const getSlotIndices = (timeVal: string) => {
    const idx = timeSlots.indexOf(timeVal);
    const activeIdx = idx >= 0 ? idx : 0;
    const prevIdx = activeIdx > 0 ? activeIdx - 1 : null;
    const nextIdx = activeIdx < timeSlots.length - 1 ? activeIdx + 1 : null;
    return { activeIdx, prevIdx, nextIdx };
  };

  const startSlots = getSlotIndices(startTime);
  const endSlots = getSlotIndices(endTime);

  const handleShiftTime = (isStart: boolean, direction: "prev" | "next") => {
    const currentVal = isStart ? startTime : endTime;
    const idx = timeSlots.indexOf(currentVal);
    const validIdx = idx >= 0 ? idx : 0;

    let targetIdx = validIdx;
    if (direction === "prev" && validIdx > 0) targetIdx = validIdx - 1;
    if (direction === "next" && validIdx < timeSlots.length - 1) targetIdx = validIdx + 1;

    const targetTime = timeSlots[targetIdx];
    if (isStart) {
      onStartTimeChange?.(targetTime);
    } else {
      onEndTimeChange?.(targetTime);
    }
  };

  // Formatted date-time summary string (matches: "Tue, 08 Dec '26, 8:00AM → Thu, 10 Dec '26, 9:00AM")
  const summaryString = useMemo(() => {
    if (!startDate) return "Choose pickup and return dates";
    const startPart = `${formatZoomDate(startDate)}, ${formatZoomSummaryTime(startTime)}`;
    if (singleDateMode) {
      return `${startPart} (${startTimeLabel})`;
    }
    if (!endDate) {
      return `${startPart} →`;
    }
    const endPart = `${formatZoomDate(endDate)}, ${formatZoomSummaryTime(endTime)}`;
    return `${startPart} → ${endPart}`;
  }, [startDate, endDate, startTime, endTime, singleDateMode, startTimeLabel]);

  return (
    <div className={cn("flex flex-col space-y-3 font-sans text-foreground", className)}>
      {/* 1. Optional Top Item Card (e.g. "Hyundai Exter 2026", "Bangalore", "Remove Selection") */}
      {itemTitle && (
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
          <div>
            <h3 className="text-base font-bold text-foreground leading-tight">{itemTitle}</h3>
            {itemSubtitle && <p className="text-xs text-muted-foreground mt-0.5">{itemSubtitle}</p>}
          </div>
          {onRemoveSelection && (
            <button
              type="button"
              onClick={onRemoveSelection}
              className="text-xs font-semibold text-destructive hover:underline"
            >
              Remove Selection
            </button>
          )}
        </div>
      )}

      {/* 2. Optional Location Card ("Where" badge + address) */}
      {locationAddress && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-xs text-xs">
          <span className="font-semibold text-muted-foreground shrink-0">Where</span>
          <p className="truncate text-foreground font-medium">{locationAddress}</p>
        </div>
      )}

      {/* 3. Main Zoomcar-style Booking Calendar & Time Slot Card */}
      <div className="relative rounded-3xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm overflow-hidden">
        {/* Header: "Select start & end date" and "CLEAR" */}
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {singleDateMode ? "Select booking date" : "Select start & end date"}
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

        {/* Selected date-time summary line */}
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

        {/* Scrollable Month Grids */}
        <div className="max-h-[380px] sm:max-h-[420px] overflow-y-auto pr-1 space-y-6 inapp-scroll">
          {months.map((m) => (
            <div key={m.label} className="space-y-2">
              <h3 className="text-sm font-bold text-foreground tracking-tight pt-1">
                {m.label}
              </h3>

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

                  // Styling logic mirroring Zoomcar reference
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
                      {/* Zoomcar "||" pill indicator on start date */}
                      {isStart && (
                        <span className="text-[10px] opacity-80 font-bold select-none tracking-tighter">
                          ||
                        </span>
                      )}

                      <span className={textClasses}>
                        {String(dayNum).padStart(2, "0")}
                      </span>

                      {/* Zoomcar "||" pill indicator on end date */}
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
        {startDate && !endDate && !singleDateMode && (
          <div className="sticky bottom-2 left-0 right-0 flex justify-center py-1 pointer-events-none z-20 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full bg-zinc-900 dark:bg-zinc-800 text-white px-4 py-2 text-xs font-semibold shadow-xl border border-zinc-700/50">
              <CalendarDays className="h-3.5 w-3.5 text-brand" />
              <span>Select trip end date</span>
            </div>
          </div>
        )}

        {/* Divider before Time Picker */}
        <hr className="my-4 border-border/70" />

        {/* 4. Time Picker Section: Side-by-side vertical roller drums */}
        <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-1 justify-items-center">
          <ScrollableTimeDrum
            label={startTimeLabel}
            value={startTime}
            slots={timeSlots}
            onChange={(t) => onStartTimeChange?.(t)}
            isSlotDisabled={(t) => (isTimeDisabled ? isTimeDisabled(t, true) : false)}
          />
          <ScrollableTimeDrum
            label={endTimeLabel}
            value={endTime}
            slots={timeSlots}
            onChange={(t) => onEndTimeChange?.(t)}
            isSlotDisabled={(t) => (isTimeDisabled ? isTimeDisabled(t, false) : false)}
          />
        </div>

        {/* 5. Solid Brand CTA Button at Bottom */}
        <div className="pt-5">
          <button
            type="button"
            disabled={continueDisabled || !startDate || (!singleDateMode && !endDate) || continueLoading}
            onClick={onContinue}
            className={cn(
              "w-full rounded-2xl btn-gradient text-brand-foreground font-bold text-sm tracking-wider uppercase py-3.5 shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2",
              (continueDisabled || !startDate || (!singleDateMode && !endDate) || continueLoading)
                ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground shadow-none"
                : "",
            )}
          >
            {continueLoading ? "PLEASE WAIT..." : continueButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
