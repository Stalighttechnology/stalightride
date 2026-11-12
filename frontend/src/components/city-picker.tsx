import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export const POPULAR_CITIES = [
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
  "Chennai",
  "Delhi",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
  "Goa",
];

export const DEFAULT_INDIAN_CITIES = POPULAR_CITIES;

export const CITY_ALIASES: Record<string, string[]> = {
  Bengaluru: ["Bangalore", "BLR"],
  Mumbai: ["Bombay", "BOM"],
  Chennai: ["Madras", "MAA"],
  Kolkata: ["Calcutta", "CCU"],
  Delhi: ["New Delhi", "NCR", "DEL"],
  Gurugram: ["Gurgaon"],
  Prayagraj: ["Allahabad"],
  Varanasi: ["Banaras", "Kashi"],
  Kochi: ["Cochin", "COK"],
  Thiruvananthapuram: ["Trivandrum", "TRV"],
  Mysuru: ["Mysore"],
  Mangaluru: ["Mangalore"],
  Puducherry: ["Pondicherry"],
  Hubli: ["Hubballi"],
  Vijayawada: ["Bezawada"],
  Vadodara: ["Baroda"],
};

export const INDIAN_CITIES = [
  "Agra",
  "Ahmedabad",
  "Ajmer",
  "Allahabad",
  "Amritsar",
  "Aurangabad",
  "Bengaluru",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Dehradun",
  "Delhi",
  "Dhanbad",
  "Faridabad",
  "Ghaziabad",
  "Goa",
  "Gurugram",
  "Guwahati",
  "Gwalior",
  "Howrah",
  "Hubli",
  "Hyderabad",
  "Indore",
  "Jabalpur",
  "Jaipur",
  "Jalandhar",
  "Jammu",
  "Jamshedpur",
  "Jodhpur",
  "Kanpur",
  "Kochi",
  "Kolhapur",
  "Kolkata",
  "Kota",
  "Kozhikode",
  "Lucknow",
  "Ludhiana",
  "Madurai",
  "Mangaluru",
  "Meerut",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Navi Mumbai",
  "Noida",
  "Patna",
  "Puducherry",
  "Pune",
  "Raipur",
  "Rajkot",
  "Ranchi",
  "Salem",
  "Shimla",
  "Srinagar",
  "Surat",
  "Thane",
  "Thiruvananthapuram",
  "Tiruchirappalli",
  "Udaipur",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
  "Warangal",
];

export function CityPicker({
  value,
  onChange,
  placeholder = "Select city",
  allowClear = false,
  id,
  className,
}: {
  value?: string | null;
  onChange: (city: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCities, setActiveCities] = useState<string[]>([]);

  useEffect(() => {
    api
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

  const popularSet = new Set(POPULAR_CITIES);
  const mergedIndianCities = Array.from(new Set([...activeCities, ...INDIAN_CITIES]));
  const otherCities = mergedIndianCities.filter((c) => !popularSet.has(c));
  const isCustomValue =
    value &&
    !INDIAN_CITIES.includes(value) &&
    !POPULAR_CITIES.includes(value) &&
    !activeCities.includes(value);

  const handleSelect = (selectedCity: string) => {
    onChange(selectedCity);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal text-left",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[260px] p-0 shadow-xl border-border/80"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search city..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>
              <div className="py-2 text-center text-xs text-muted-foreground px-2">
                <p>No listed city found.</p>
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelect(search.trim())}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Use &ldquo;{search.trim()}&rdquo;
                  </button>
                )}
              </div>
            </CommandEmpty>

            {allowClear && (
              <CommandGroup>
                <CommandItem
                  value="__all_cities all cities anywhere clear"
                  onSelect={() => handleSelect("")}
                  className="text-muted-foreground font-medium"
                >
                  <MapPin className="mr-2 h-4 w-4 opacity-50" />
                  All cities (clear filter)
                </CommandItem>
              </CommandGroup>
            )}

            {isCustomValue && (
              <CommandGroup heading="Current Selection">
                <CommandItem
                  value={value!}
                  onSelect={() => handleSelect(value!)}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
                    <span>{value}</span>
                  </div>
                  <Check className="h-4 w-4 text-brand opacity-100" />
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Popular Metros">
              {POPULAR_CITIES.map((c) => (
                <CommandItem
                  key={c}
                  value={`${c} ${CITY_ALIASES[c]?.join(" ") ?? ""}`}
                  keywords={CITY_ALIASES[c]}
                  onSelect={() => handleSelect(c)}
                  className="justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
                    <span>{c}</span>
                  </div>
                  <Check
                    className={cn("h-4 w-4 text-brand", value === c ? "opacity-100" : "opacity-0")}
                  />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="All Indian Cities (A-Z)">
              {otherCities.map((c) => (
                <CommandItem
                  key={c}
                  value={`${c} ${CITY_ALIASES[c]?.join(" ") ?? ""}`}
                  keywords={CITY_ALIASES[c]}
                  onSelect={() => handleSelect(c)}
                  className="justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
                    <span>{c}</span>
                  </div>
                  <Check
                    className={cn("h-4 w-4 text-brand", value === c ? "opacity-100" : "opacity-0")}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
