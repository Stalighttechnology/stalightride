import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TimePickerProps {
  value?: string; // Format "HH:mm" (24-hour)
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  slots?: string[]; // Optional specific slots
}

const DEFAULT_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00"
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
  slots = DEFAULT_SLOTS,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [currentH, currentM] = (value || "10:00").split(":");
  const hourNum = parseInt(currentH, 10) || 10;
  const period = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;

  const setHour = (h12: number, p: "AM" | "PM") => {
    let h24 = h12 % 12;
    if (p === "PM") h24 += 12;
    const newH = String(h24).padStart(2, "0");
    const newM = currentM || "00";
    onChange?.(`${newH}:${newM}`);
  };

  const setMinute = (m: string) => {
    const newH = currentH || "10";
    onChange?.(`${newH}:${m}`);
  };

  const setPeriod = (p: "AM" | "PM") => {
    setHour(hour12, p);
  };

  const selectSlot = (slot: string) => {
    onChange?.(slot);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9 rounded-lg border-border/80 bg-background/90 px-3 text-xs sm:text-sm",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
          {value ? (
            <span>{formatTime12h(value)} <span className="text-[10px] text-muted-foreground">({value})</span></span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Time</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {formatTime12h(value || "10:00")}
            </span>
          </div>

          {/* Quick presets */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Common slots</div>
            <div className="grid grid-cols-4 gap-1.5">
              {slots.slice(0, 8).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => selectSlot(slot)}
                  className={cn(
                    "rounded-md py-1 text-center text-xs transition-colors",
                    value === slot
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Custom hour / minute / AM-PM selector */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {/* Hours 1-12 */}
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Hour</span>
                <ScrollArea className="h-28 mt-1">
                  <div className="space-y-0.5 pr-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setHour(h, period)}
                        className={cn(
                          "w-full rounded py-1 text-xs transition-colors",
                          hour12 === h
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted"
                        )}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Minutes */}
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Min</span>
                <ScrollArea className="h-28 mt-1">
                  <div className="space-y-0.5 pr-1">
                    {["00", "15", "30", "45"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMinute(m)}
                        className={cn(
                          "w-full rounded py-1 text-xs transition-colors",
                          currentM === m
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted"
                        )}
                      >
                        :{m}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* AM / PM */}
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Period</span>
                <div className="mt-1 space-y-1">
                  {(["AM", "PM"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={cn(
                        "w-full rounded py-1.5 text-xs font-semibold transition-colors",
                        period === p
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/70 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full text-xs h-8"
            onClick={() => setOpen(false)}
          >
            Apply time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
