import * as React from "react";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  /** Number of months to render vertically (defaults to 6). */
  monthsToRender?: number;
  /** Optional wrapper class overrides. */
  className?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
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

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface MonthGrid {
  key: string;
  label: string;
  leadingEmpty: number;
  days: Date[];
}

function buildMonthGrids(baseDate: Date, count: number): MonthGrid[] {
  const safeCount = Math.max(1, count);
  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth();
  const grids: MonthGrid[] = [];

  for (let i = 0; i < safeCount; i++) {
    const firstOfMonth = new Date(startYear, startMonth + i, 1);
    const year = firstOfMonth.getFullYear();
    const month = firstOfMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Date[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }

    grids.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: formatMonthYear(firstOfMonth),
      leadingEmpty: firstOfMonth.getDay(),
      days,
    });
  }

  return grids;
}

/**
 * Compact, vertically scrollable date-range picker with live hover preview,
 * sticky month headers, and inclusive day-count badge.
 */
export function CompactDateRangePicker({
  value,
  onChange,
  minDate,
  disabledDates,
  monthsToRender = 6,
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

  const activeRange: DateRangeValue = React.useMemo(() => {
    const raw = isControlled ? value : internalRange;
    return {
      start: raw?.start ? startOfDay(raw.start) : null,
      end: raw?.end ? startOfDay(raw.end) : null,
    };
  }, [isControlled, value, internalRange]);

  const months = React.useMemo(
    () => buildMonthGrids(effectiveMinDate, monthsToRender),
    [effectiveMinDate, monthsToRender],
  );

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

  const handleClear = () => {
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

  const dayCountLabel =
    displayDays === 0
      ? "Select dates"
      : displayDays === 1
        ? "1 day"
        : `${displayDays} days`;

  return (
    <div
      className={cn(
        "w-[310px] max-w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm select-none",
        className,
      )}
    >
      {/* Top Summary & Day-Count Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-muted/25 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" />
          {displayStart ? (
            <div className="flex min-w-0 items-center gap-1 truncate tabular-nums">
              <span className="font-semibold text-foreground">
                {formatMonthDay(displayStart)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "truncate",
                  displayEnd
                    ? isPreviewing
                      ? "font-medium text-primary"
                      : "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {displayEnd ? formatMonthDay(displayEnd) : "End"}
              </span>
            </div>
          ) : (
            <span className="truncate text-muted-foreground">Pick start &amp; end</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
              displayDays > 0
                ? isPreviewing
                  ? "bg-primary/15 text-primary"
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {dayCountLabel}
          </span>
          {start && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear selected dates"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Fixed Weekday Header (aligned with scrollable 7-column grid) */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-card px-3 py-1.5 text-center [scrollbar-gutter:stable]">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Scrollable Months Container */}
      <div
        className="max-h-[250px] overflow-y-auto scroll-smooth px-3 pb-3 [scrollbar-gutter:stable]"
        onMouseLeave={() => setHoverDate(null)}
      >
        {months.map((month) => (
          <section key={month.key} aria-label={month.label}>
            {/* Sticky Month Title */}
            <div className="sticky top-0 z-20 bg-card/95 py-2 text-xs font-bold tracking-tight text-foreground backdrop-blur-xs">
              {month.label}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
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
                    {/* Continuous soft range fill */}
                    {hasRange && (isStart || isEnd || isStrictlyBetween) && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "pointer-events-none absolute inset-y-0.5 transition-colors",
                          isPreviewing ? "bg-primary/10" : "bg-primary/15",
                          isStart && "left-1/2 right-0",
                          isEnd && "left-0 right-1/2",
                          isStrictlyBetween && "inset-x-0",
                          isStrictlyBetween && isWeekStart && "rounded-l-full",
                          isStrictlyBetween && isWeekEnd && "rounded-r-full",
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
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        disabled
                          ? "cursor-not-allowed text-muted-foreground/35 line-through"
                          : isStart || isEnd
                            ? cn(
                                "font-semibold shadow-xs",
                                isPreviewing && isEnd && !isSameDay(day, start)
                                  ? "bg-primary/80 text-primary-foreground"
                                  : "bg-primary text-primary-foreground",
                              )
                            : isStrictlyBetween
                              ? "text-foreground hover:bg-primary/20"
                              : isToday
                                ? "font-semibold text-primary ring-1 ring-primary/50 hover:bg-primary/10"
                                : "text-foreground hover:bg-muted",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
