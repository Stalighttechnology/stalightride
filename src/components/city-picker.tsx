import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_INDIAN_CITIES = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Goa", "Jaipur", "Ahmedabad", "Kochi", "Chandigarh", "Kolkata"
];

export function CityPicker({
  value, onChange, placeholder = "Select city", allowClear = false, id, className,
}: {
  value?: string | null;
  onChange: (city: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeCities, setActiveCities] = useState<string[]>(DEFAULT_INDIAN_CITIES);

  useEffect(() => {
    supabase
      .from("cities")
      .select("name")
      .eq("active", true)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setActiveCities(data.map((c) => c.name));
        }
      });
  }, []);

  const list = value && !activeCities.includes(value) ? [value, ...activeCities] : activeCities;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}>
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search city..." />
          <CommandList>
            <CommandEmpty>No city found.</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem value="__all" onSelect={() => { onChange(""); setOpen(false); }}>
                  All cities
                </CommandItem>
              )}
              {list.map((c) => (
                <CommandItem key={c} value={c} onSelect={() => { onChange(c); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
