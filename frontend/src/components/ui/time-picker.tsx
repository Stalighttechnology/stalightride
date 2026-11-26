import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from "@/components/wheel-picker";

export interface TimePickerProps {
  value?: string; // Format "HH:mm" (24-hour)
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  slots?: string[];
  disabledSlots?: string[];
  isTimeDisabled?: (time: string) => boolean;
}

const HOUR_OPTIONS: WheelPickerOption<string>[] = Array.from({ length: 12 }, (_, i) => {
  const h = String(i + 1);
  return { value: h, label: h.padStart(2, "0") };
});

const BASE_MINUTES = ["00", "15", "30", "45"];

const PERIOD_OPTIONS: WheelPickerOption<"AM" | "PM">[] = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

function formatTime12h(timeStr: string) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${mStr || "00"} ${period}`;
}

export function TimePicker({
  value = "10:00",
  onChange,
  placeholder = "Select time",
  className,
  disabled,
  id,
  disabledSlots,
  isTimeDisabled,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [currentH, rawM] = (value || "10:00").split(":");
  const parsedH = parseInt(currentH, 10);
  const hourNum = Number.isNaN(parsedH) ? 10 : parsedH;
  const currentM = rawM || "00";
  const period: "AM" | "PM" = hourNum >= 12 ? "PM" : "AM";
  const hour12 = String(hourNum % 12 === 0 ? 12 : hourNum % 12);

  const minuteOptions = React.useMemo<WheelPickerOption<string>[]>(() => {
    const mins = BASE_MINUTES.includes(currentM)
      ? BASE_MINUTES
      : [...BASE_MINUTES, currentM].sort();
    return mins.map((m) => ({ value: m, label: m }));
  }, [currentM]);

  const to24Hour = (h12Str: string, p: "AM" | "PM") => {
    const h12 = parseInt(h12Str, 10) || 12;
    let h24 = h12 % 12;
    if (p === "PM") h24 += 12;
    return String(h24).padStart(2, "0");
  };

  const setHour = (h12Str: string) => {
    onChange?.(`${to24Hour(h12Str, period)}:${currentM}`);
  };

  const setMinute = (m: string) => {
    onChange?.(`${String(hourNum).padStart(2, "0")}:${m}`);
  };

  const setPeriod = (p: "AM" | "PM") => {
    onChange?.(`${to24Hour(hour12, p)}:${currentM}`);
  };

  const timeUnavailable = isTimeDisabled
    ? isTimeDisabled(value)
    : Boolean(disabledSlots?.includes(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full min-w-0 justify-start text-left font-normal h-9 rounded-lg border-border/80 bg-background/90 px-2 sm:px-2.5 text-xs sm:text-sm",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="mr-1 sm:mr-1.5 h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate flex-1 whitespace-nowrap tabular-nums">
            {value ? formatTime12h(value) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Select Time
            </span>
            <span className="font-mono text-sm font-bold text-foreground tabular-nums">
              {formatTime12h(value || "10:00")}
            </span>
          </div>

          <WheelPickerWrapper className="w-full border-border/80 bg-muted/20">
            <WheelPicker
              options={HOUR_OPTIONS}
              value={hour12}
              onValueChange={setHour}
              infinite
              visibleCount={12}
              optionItemHeight={32}
            />
            <WheelPicker
              options={minuteOptions}
              value={currentM}
              onValueChange={setMinute}
              infinite
              visibleCount={12}
              optionItemHeight={32}
            />
            <WheelPicker
              options={PERIOD_OPTIONS}
              value={period}
              onValueChange={setPeriod}
              visibleCount={12}
              optionItemHeight={32}
            />
          </WheelPickerWrapper>

          {timeUnavailable && (
            <p className="text-center text-[11px] font-medium text-destructive">
              This time slot is unavailable
            </p>
          )}

          <Button
            type="button"
            size="sm"
            className="w-full text-xs h-8"
            disabled={timeUnavailable}
            onClick={() => setOpen(false)}
          >
            Apply time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
