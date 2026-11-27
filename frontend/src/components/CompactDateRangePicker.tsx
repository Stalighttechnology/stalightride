import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { getEarliestBookingTimeForDate } from "@/lib/vehicle-availability";

export interface DateRangeValue {
  start: Date | null;
  end: Date | null;
}

export interface CompactDateRangePickerProps {
  /** Controlled selected range. */
  value?: DateRangeValue;
  /** Called whenever the range changes, with the inclusive day count. */
  onChange?: (range: DateRangeValue, days: number) => void;
  /** Earliest selectable date (defaults to today at local midnight). */
  minDate?: Date;
  /** Specific dates that cannot be selected. */
  disabledDates?: Date[];
  /** Number of months visible side-by-side on desktop (`1` for compact/sidebar, `2` for modal). */
  desktopMonths?: 1 | 2;
  /** Optional start/end time integration (uses @ncdai/wheel-picker TimePicker). */
  startTime?: string;
  endTime?: string;
  onStartTimeChange?: (time: string) => void;
  onEndTimeChange?: (time: string) => void;
  isStartTimeDisabled?: (time: string) => boolean;
  isEndTimeDisabled?: (time: string) => boolean;
  /** Optional Continue button in the footer. */
  onContinue?: () => void;
  continueLabel?: string;
  /** Optional wrapper class overrides. */
  className?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MS_PER_DAY = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` string into a local-midnight `Date` without UTC offset drift. */
export function parseIsoDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    return null;
  }
  return parsed;
}

/** Format a `Date` as a local `YYYY-MM-DD` string. */
export function formatIsoDate(date?: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return toDayKey(date);
}

function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffDaysInclusive(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.abs(Math.round((utcEnd - utcStart) / MS_PER_DAY)) + 1;
}

function formatSummaryDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year2 = String(date.getFullYear()).slice(-2);
  return `${day} ${month}'${year2}`;
}

function formatSummaryTime(timeStr?: string): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${mStr || "00"} ${period}`;
}

function formatMonthTitle(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const year2 = String(date.getFullYear()).slice(-2);
  return `${month} '${year2}`;
}

interface MonthGrid {
  key: string;
  label: string;
  leadingEmpty: number;
  days: Date[];
}

function buildMonthGrid(year: number, month: number): MonthGrid {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: formatMonthTitle(firstOfMonth),
    leadingEmpty: firstOfMonth.getDay(),
    days,
  };
}

/**
 * Slideable 2-month (desktop) / 1-month (mobile) date-range calendar
 * styled to match the website's brand palette, with optional wheel TimePickers.
 */
export function CompactDateRangePicker({
  value,
  onChange,
  minDate,
  disabledDates,
  desktopMonths = 1,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  isStartTimeDisabled,
  isEndTimeDisabled,
  onContinue,
  continueLabel = "CONTINUE",
  className,
}: CompactDateRangePickerProps) {
  const isControlled = value !== undefined;
  const [internalRange, setInternalRange] = React.useState<DateRangeValue>({
    start: null,
    end: null,
  });
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  const today = React.useMemo(() => startOfDay(new Date()), []);
  const effectiveMinDate = React.useMemo(
    () => (minDate ? startOfDay(minDate) : today),
    [minDate, today],
  );

  const activeRange: DateRangeValue = React.useMemo(() => {
    const raw = isControlled ? value : internalRange;
    return {
      start: raw?.start ? startOfDay(raw.start) : null,
      end: raw?.end ? startOfDay(raw.end) : null,
    };
  }, [isControlled, value, internalRange]);

  const minMonthAnchor = React.useMemo(
    () => new Date(effectiveMinDate.getFullYear(), effectiveMinDate.getMonth(), 1),
    [effectiveMinDate],
  );

  const [viewMonth, setViewMonth] = React.useState<Date>(() => {
    if (activeRange.start) {
      const s = new Date(activeRange.start.getFullYear(), activeRange.start.getMonth(), 1);
      return s >= minMonthAnchor ? s : minMonthAnchor;
    }
    return minMonthAnchor;
  });

  const canGoPrev =
    viewMonth.getFullYear() > minMonthAnchor.getFullYear() ||
    (viewMonth.getFullYear() === minMonthAnchor.getFullYear() &&
      viewMonth.getMonth() > minMonthAnchor.getMonth());

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const disabledKeySet = React.useMemo(() => {
    const set = new Set<string>();
    if (disabledDates) {
      for (const d of disabledDates) {
        if (!Number.isNaN(d.getTime())) {
          set.add(toDayKey(d));
        }
      }
    }
    return set;
  }, [disabledDates]);

  const primaryMonth = React.useMemo(
    () => buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );

  const secondaryMonth = React.useMemo(() => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    return buildMonthGrid(next.getFullYear(), next.getMonth());
  }, [viewMonth]);

  const isDateDisabled = React.useCallback(
    (day: Date) => day < effectiveMinDate || disabledKeySet.has(toDayKey(day)),
    [effectiveMinDate, disabledKeySet],
  );

  const emitChange = (next: DateRangeValue) => {
    if (!isControlled) {
      setInternalRange(next);
    }
    const days = next.start
      ? next.end
        ? diffDaysInclusive(next.start, next.end)
        : 1
      : 0;
    onChange?.(next, days);
  };

  const handleDayClick = (day: Date) => {
    if (isDateDisabled(day)) return;

    const { start, end } = activeRange;

    // 1st click or 3rd click (reset when range is already complete)
    if (!start || (start && end)) {
      setHoverDate(null);
      emitChange({ start: day, end: null });
      return;
    }

    // 2nd click: auto-swap if clicked date is earlier than start
    if (day < start) {
      setHoverDate(null);
      emitChange({ start: day, end: start });
      return;
    }

    setHoverDate(null);
    emitChange({ start, end: day });
  };

  const handleReset = () => {
    setHoverDate(null);
    emitChange({ start: null, end: null });
  };

  // Compute display / preview range
  const { start, end } = activeRange;
  const isPreviewing = Boolean(start && !end && hoverDate);

  const displayStart = React.useMemo(() => {
    if (!start) return null;
    if (isPreviewing && hoverDate && hoverDate < start) return hoverDate;
    return start;
  }, [start, isPreviewing, hoverDate]);

  const displayEnd = React.useMemo(() => {
    if (end) return end;
    if (isPreviewing && start && hoverDate) {
      return hoverDate < start ? start : hoverDate;
    }
    return null;
  }, [end, isPreviewing, start, hoverDate]);

  const displayDays = React.useMemo(() => {
    if (!displayStart) return 0;
    if (!displayEnd) return 1;
    return diffDaysInclusive(displayStart, displayEnd);
  }, [displayStart, displayEnd]);

  const hasTimeSection = Boolean(onStartTimeChange || onEndTimeChange);

  const renderMonth = (month: MonthGrid, isSecondary = false) => (
    <div key={month.key} className={cn("w-full", isSecondary && "hidden sm:block")}>
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border/60 pb-2 text-center">
        {WEEKDAYS.map((day, idx) => (
          <div
            key={`${month.key}-wd-${idx}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div
        className="mt-2 grid grid-cols-7 gap-y-1"
        onMouseLeave={() => setHoverDate(null)}
      >
        {Array.from({ length: month.leadingEmpty }).map((_, idx) => (
          <div key={`empty-${month.key}-${idx}`} className="h-9" aria-hidden="true" />
        ))}

        {month.days.map((day) => {
          const disabled = isDateDisabled(day);
          const isToday = isSameDay(day, today);

          const isStart = isSameDay(day, displayStart);
          const isEnd = isSameDay(day, displayEnd);
          const isSingleDay = isStart && isEnd;

          const hasRange = Boolean(displayStart && displayEnd && !isSingleDay);
          const isStrictlyBetween = Boolean(
            hasRange && displayStart && displayEnd && day > displayStart && day < displayEnd,
          );

          const colIdx = day.getDay();
          const isWeekStart = colIdx === 0;
          const isWeekEnd = colIdx === 6;

          return (
            <div
              key={toDayKey(day)}
              className="relative flex h-9 w-full items-center justify-center"
            >
              {/* Continuous soft brand range fill */}
              {hasRange && (isStart || isEnd || isStrictlyBetween) && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-0.5 transition-colors",
                    isPreviewing ? "bg-brand/10" : "bg-brand/15",
                    isStart && "left-1/2 right-0",
                    isEnd && "left-0 right-1/2",
                    isStrictlyBetween && "inset-x-0",
                    isStrictlyBetween && isWeekStart && "rounded-l-lg",
                    isStrictlyBetween && isWeekEnd && "rounded-r-lg",
                  )}
                />
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(day)}
                onMouseEnter={() => {
                  if (!disabled && start && !end) {
                    setHoverDate(day);
                  }
                }}
                aria-label={day.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                aria-pressed={isStart || isEnd}
                className={cn(
                  "relative z-10 flex h-8 w-9 items-center justify-center rounded-lg text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  disabled
                    ? "cursor-not-allowed text-muted-foreground/35 line-through"
                    : isStart || isEnd
                      ? cn(
                          "font-semibold shadow-xs",
                          isPreviewing && isEnd && !isSameDay(day, start)
                            ? "bg-brand/80 text-brand-foreground"
                            : "bg-brand text-brand-foreground",
                        )
                      : isStrictlyBetween
                        ? "text-foreground hover:bg-brand/20"
                        : isToday
                          ? "font-semibold text-brand ring-1 ring-brand/50 hover:bg-brand/10"
                          : "text-foreground hover:bg-muted",
                )}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm select-none",
        desktopMonths === 1 ? "max-w-[340px]" : "max-w-[660px]",
        className,
      )}
    >
      {/* Top Summary & RESET Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm font-medium text-foreground">
          <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
          {displayStart ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
              <span className="font-semibold">
                {formatSummaryDate(displayStart)}
                {startTime ? `, ${formatSummaryTime(startTime)}` : ""}
              </span>
              <span className="text-muted-foreground">-</span>
              <span
                className={cn(
                  displayEnd ? "font-semibold" : "text-muted-foreground font-normal",
                )}
              >
                {displayEnd
                  ? `${formatSummaryDate(displayEnd)}${endTime ? `, ${formatSummaryTime(endTime)}` : ""}`
                  : "Select return"}
              </span>
              {displayDays > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  {displayDays === 1 ? "1 day" : `${displayDays} days`}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate text-muted-foreground">Select start &amp; end date</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={!start && !end}
          className="shrink-0 text-xs font-bold uppercase tracking-wider text-brand transition-opacity hover:underline disabled:opacity-35 disabled:no-underline cursor-pointer"
        >
          RESET
        </button>
      </div>

      {/* Month Slide Navigation Row */}
      <div className="px-4 pt-3 pb-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div
            className={cn(
              "grid flex-1 items-center text-center",
              desktopMonths === 2 ? "grid-cols-1 sm:grid-cols-2 sm:gap-6" : "grid-cols-1",
            )}
          >
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {primaryMonth.label}
            </span>
            {desktopMonths === 2 && (
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">
                {secondaryMonth.label}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 1-month on mobile, 2-month side-by-side on desktop when desktopMonths === 2 */}
        <div
          className={cn(
            "grid gap-6",
            desktopMonths === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
          )}
        >
          {renderMonth(primaryMonth, false)}
          {desktopMonths === 2 && renderMonth(secondaryMonth, true)}
        </div>
      </div>

      {/* Time Selection Section (uses @ncdai/wheel-picker TimePicker) */}
      {hasTimeSection && (() => {
        const startDayStr = value?.start ? toDayKey(value.start) : undefined;
        const endDayStr = value?.end ? toDayKey(value.end) : undefined;
        const todayKey = toDayKey(new Date());

        const minStartTime = startDayStr === todayKey ? getEarliestBookingTimeForDate(startDayStr) : undefined;
        const minEndTime = (startDayStr && endDayStr && startDayStr === endDayStr)
          ? (startTime || minStartTime)
          : (endDayStr === todayKey ? minStartTime : undefined);

        return (
          <div className="border-t border-border/70 bg-muted/20 px-4 py-3.5 space-y-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                Select the start time &amp; end time
              </p>
              <p className="text-[11px] text-muted-foreground">
                All times are shown in IST (UTC+5:30).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {onStartTimeChange && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
                  <span className="text-xs font-semibold text-foreground shrink-0">
                    Start Time
                  </span>
                  <TimePicker
                    value={startTime ?? "08:00"}
                    onChange={onStartTimeChange}
                    isTimeDisabled={isStartTimeDisabled}
                    minTime={minStartTime}
                    className="h-8 w-32 rounded-lg text-xs"
                  />
                </div>
              )}

              {onEndTimeChange && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
                  <span className="text-xs font-semibold text-foreground shrink-0">
                    End Time
                  </span>
                  <TimePicker
                    value={endTime ?? "08:00"}
                    onChange={onEndTimeChange}
                    isTimeDisabled={isEndTimeDisabled}
                    minTime={minEndTime}
                    className="h-8 w-32 rounded-lg text-xs"
                  />
                </div>
              )}
            </div>

            {onContinue && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  onClick={onContinue}
                  className="btn-gradient h-9 px-6 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  {continueLabel}
                </Button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
