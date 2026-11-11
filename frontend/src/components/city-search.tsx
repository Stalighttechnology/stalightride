import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, X } from "lucide-react";

export function CitySearch({
  value,
  cities,
  onChange,
  placeholder = "Search city",
}: {
  value?: string;
  cities: string[];
  onChange: (city?: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value ?? ""), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = text.trim().toLowerCase();
  const matches = cities.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);

  const commit = (city?: string) => {
    setText(city ?? "");
    setOpen(false);
    onChange(city && city.trim() ? city.trim() : undefined);
  };

  return (
    <div ref={wrapRef} className="relative mt-1">
      <MapPin className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8 pr-8"
        placeholder={placeholder}
        value={text}
        aria-label="Search city"
        autoComplete="off"
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(matches[0] ?? text); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {text && (
        <button
          type="button"
          aria-label="Clear city"
          onClick={() => commit(undefined)}
          className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {matches.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => commit(c)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
