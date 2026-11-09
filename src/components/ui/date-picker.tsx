import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  value?: string; // Format "yyyy-MM-dd"
  onChange?: (isoDate: string) => void;
  minDate?: string | Date;
  placeholder?: string;
  formatStr?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  placeholder = "dd-mm-yyyy",
  formatStr = "d MMM yyyy",
  className,
  disabled,
  clearable = true,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    try {
      const parsed = parseISO(value);
      return isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      return undefined;
    }
  }, [value]);

  const minMidnight = React.useMemo(() => {
    if (!minDate) return undefined;
    const d = minDate instanceof Date ? new Date(minDate.getTime()) : parseISO(minDate);
    if (isNaN(d.getTime())) return undefined;
    d.setHours(0, 0, 0, 0);
    return d;
  }, [minDate]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      onChange?.(`${year}-${month}-${day}`);
    } else {
      onChange?.("");
    }
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
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate flex-1">
            {selectedDate ? (
              format(selectedDate, formatStr)
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          {clearable && selectedDate && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange?.("");
              }}
              className="ml-1 -mr-1 rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={minMidnight ? (d) => d < minMidnight : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

