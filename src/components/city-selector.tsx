import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CITIES = [
  "Bengaluru", "Hyderabad", "Mumbai", "Chennai", "Delhi",
  "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Kochi",
] as const;

const KEY = "synchoo-city";

export function useSelectedCity() {
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    try { setCity(localStorage.getItem(KEY)); } catch { /* ignore */ }
  }, []);
  const select = (next: string | null) => {
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    setCity(next);
  };
  return { city, select };
}

export function CitySelector({ className }: { className?: string }) {
  const { city, select } = useSelectedCity();
  const navigate = useNavigate();

  const pick = (next: string | null) => {
    select(next);
    navigate({ to: "/browse", search: { city: next ?? undefined } as any });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 sm:h-9 gap-1.5 rounded-full px-2 sm:pl-2.5 sm:pr-2", className)}
          aria-label="Select your city"
        >
          <MapPin className="h-4 w-4 text-brand" />
          <span className="hidden max-w-[7rem] truncate text-xs font-medium sm:inline sm:text-sm">
            {city ?? "Select city"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Browse vehicles in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CITIES.map((c) => (
          <DropdownMenuItem key={c} onClick={() => pick(c)} className="justify-between">
            {c}
            {city === c && <Check className="h-4 w-4 text-brand" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick(null)}>All cities</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
