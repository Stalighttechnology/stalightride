import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Input } from "@/components/ui/input";
import { CitySearch } from "@/components/city-search";
import { CITIES, useSelectedCity } from "@/components/city-selector";

import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { currency } from "@/lib/format";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import {
  MapPin, Star, Search, Filter, ChevronLeft, ChevronRight,
  Fuel, Settings2, CalendarDays, ShieldCheck, CarFront,
} from "lucide-react";

const PAGE_SIZE = 12;

const search = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  transmission: z.string().optional(),
  fuel: z.string().optional(),
  max: z.number().optional(),
  page: z.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/browse")({
  validateSearch: search,
  component: Browse,
  head: () => ({
    meta: [
      { title: "Browse verified rentals — Synchoo" },
      { name: "description", content: "Search verified cars, bikes, scooters, and EVs by city, dates, category, fuel type, transmission, and daily price." },
      { property: "og:title", content: "Browse verified rentals — Synchoo" },
      { property: "og:description", content: "Find verified local vehicle rentals with live availability, exact pickup maps, ratings, and secure booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Vehicle = {
  id: string; title: string; brand: string; model: string; year: number; category: string;
  city: string; price_daily: number; price_hourly: number | null; seats: number | null;
  avg_rating: number; review_count: number;
  transmission: string; fuel: string;
  vehicle_images: { url: string; sort_order: number }[];
};

const CATEGORY_CHIPS = [
  { key: undefined, label: "All" },
  { key: "car", label: "Cars" },
  { key: "ev", label: "Electric" },
  { key: "motorcycle", label: "Motorcycles" },
  { key: "scooter", label: "Scooters" },
  { key: "bike", label: "Bicycles" },
] as const;

function Browse() {
  const params = useSearch({ from: "/browse" });
  const navigate = useNavigate();
  const { city: savedCity, select: saveCity } = useSelectedCity();
  const [items, setItems] = useState<Vehicle[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(params.max ?? 5000);
  const [cities, setCities] = useState<string[]>([]);
  const page = Math.max(1, params.page ?? 1);

  const update = (patch: Partial<Search>) =>
    navigate({ to: "/browse", search: { ...params, page: 1, ...patch } as any });

  // Adopt the city chosen in the top navigation on first visit.
  useEffect(() => {
    if (!params.city && savedCity) update({ city: savedCity });
  }, [savedCity]);

  useEffect(() => {
    if (params.city) saveCity(params.city);
  }, [params.city]);

  useEffect(() => {
    (async () => {
      setItems(null);

      // Vehicles already booked or blocked for the chosen window are hidden
      // from everyone else — no duplicate bookings. With no dates picked we
      // still hide anything unavailable today, so live trips never show up.
      const today = new Date().toISOString().slice(0, 10);
      const winStart = params.from ?? today;
      const winEnd = params.to ?? params.from ?? today;
      let unavailable: string[] = [];
      const { data: booked } = await supabase.rpc("booked_vehicle_ids", {
        _start: winStart,
        _end: winEnd,
      });
      unavailable = ((booked as any) ?? [])
        .map((r: any) => (typeof r === "string" ? r : r.booked_vehicle_ids ?? r.vehicle_id))
        .filter(Boolean);


      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("vehicles")
        .select(
          "id,title,brand,model,year,category,city,price_daily,price_hourly,seats,avg_rating,review_count,transmission,fuel,vehicle_images(url,sort_order)",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (params.category) q = q.eq("category", params.category as any);
      if (params.transmission) q = q.eq("transmission", params.transmission as any);
      if (params.fuel) q = q.eq("fuel", params.fuel as any);
      if (params.city) q = q.ilike("city", `%${params.city}%`);
      if (params.q) q = q.or(`title.ilike.%${params.q}%,brand.ilike.%${params.q}%,model.ilike.%${params.q}%`);
      if (params.max) q = q.lte("price_daily", params.max);
      if (unavailable.length) q = q.not("id", "in", `(${unavailable.join(",")})`);
      const { data, count } = await q;
      setItems((data as any) ?? []);
      setTotal(count ?? 0);
    })();
  }, [params.category, params.transmission, params.fuel, params.city, params.q, params.max, params.from, params.to, page]);

  useEffect(() => {
    supabase
      .from("vehicles")
      .select("city")
      .eq("status", "active")
      .order("city", { ascending: true })
      .limit(300)
      .then(({ data }) => {
        const seen = new Map<string, string>();
        for (const c of CITIES) seen.set(c.toLowerCase(), c);
        for (const row of data ?? []) {
          const raw = (row.city ?? "").trim();
          if (!raw) continue;
          const key = raw.toLowerCase();
          if (!seen.has(key)) seen.set(key, raw.replace(/\b\w/g, (m) => m.toUpperCase()));
        }
        setCities(Array.from(seen.values()).sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  const paths = (items ?? []).map((v) =>
    v.vehicle_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goto = (p: number) =>
    navigate({ to: "/browse", search: { ...params, page: Math.min(Math.max(1, p), totalPages) } as any });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filters = (
    <div className="space-y-5">
      <div>
        <Label>Search</Label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="rounded-xl pl-9"
            placeholder="Brand, model or title"
            defaultValue={params.q}
            onBlur={(e) => update({ q: e.target.value || undefined })}
          />
        </div>
      </div>

      <div>
        <Label>City</Label>
        <CitySearch value={params.city} cities={cities} onChange={(city) => update({ city })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Pickup</Label>
          <Input
            type="date" min={today} className="mt-1.5 rounded-xl"
            value={params.from ?? ""}
            onChange={(e) => update({ from: e.target.value || undefined, to: params.to ?? (e.target.value || undefined) })}
          />
        </div>
        <div>
          <Label>Return</Label>
          <Input
            type="date" min={params.from ?? today} className="mt-1.5 rounded-xl"
            value={params.to ?? ""}
            onChange={(e) => update({ to: e.target.value || undefined, from: params.from ?? (e.target.value || undefined) })}
          />
        </div>
      </div>

      <div>
        <Label>Category</Label>
        <Select value={params.category ?? "any"} onValueChange={(v) => update({ category: v === "any" ? undefined : v })}>
          <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="car">Car</SelectItem>
            <SelectItem value="ev">EV</SelectItem>
            <SelectItem value="motorcycle">Motorcycle</SelectItem>
            <SelectItem value="scooter">Scooter</SelectItem>
            <SelectItem value="bike">Bike</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Transmission</Label>
        <Select value={params.transmission ?? "any"} onValueChange={(v) => update({ transmission: v === "any" ? undefined : v })}>
          <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="automatic">Automatic</SelectItem>
            <SelectItem value="none">N/A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Fuel</Label>
        <Select value={params.fuel ?? "any"} onValueChange={(v) => update({ fuel: v === "any" ? undefined : v })}>
          <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="petrol">Petrol</SelectItem>
            <SelectItem value="diesel">Diesel</SelectItem>
            <SelectItem value="electric">Electric</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="none">N/A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Max price / day</Label>
          <span className="text-sm font-semibold text-brand">{currency(maxPrice)}</span>
        </div>
        <Slider className="mt-3" min={200} max={20000} step={100} value={[maxPrice]} onValueChange={(v) => setMaxPrice(v[0])} onValueCommit={(v) => update({ max: v[0] })} />
      </div>

      <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate({ to: "/browse", search: {} as any })}>
        Clear filters
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="gradient-hero border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <Badge variant="secondary" className="mb-4 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-brand" />
            Every vehicle admin-verified
          </Badge>
          <h1 className="max-w-2xl font-display text-3xl leading-[1.08] sm:text-5xl">
            Find your next ride in{" "}
            <span className="text-gradient">{params.city ?? "your city"}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            {items === null
              ? "Checking live availability…"
              : `${total} vehicle${total === 1 ? "" : "s"} ready to book${params.from && params.to ? " for your dates" : ""}.`}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((c) => {
              const active = (params.category ?? undefined) === c.key;
              return (
                <button
                  key={c.label}
                  onClick={() => update({ category: c.key })}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-transparent bg-brand text-brand-foreground shadow-glow"
                      : "border-border bg-card text-foreground hover:border-brand/50"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-4 lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full rounded-xl">
                <Filter className="mr-2 h-4 w-4" />Filters & dates
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[86vw] overflow-y-auto sm:max-w-sm">
              <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
              <div className="mt-4">{filters}</div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="hidden surface-card p-5 lg:sticky lg:top-20 lg:block lg:self-start">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-brand" />Filters
            </div>
            {filters}
          </aside>

          <div>
            {!items && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <div key={i} className="surface-card overflow-hidden">
                    <Skeleton className="aspect-[4/3] w-full rounded-none" />
                    <div className="space-y-3 p-4">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <div className="flex justify-between pt-1">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items && items.length === 0 && (
              <div className="surface-card p-12 text-center">
                <CarFront className="mx-auto mb-3 h-6 w-6 text-brand" />
                <p className="font-display text-lg">No vehicles for this selection</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try widening your dates, city or price range — booked vehicles are hidden automatically.
                </p>
              </div>
            )}

            {items && items.length > 0 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((v) => {
                    const first = v.vehicle_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0];
                    const url = first ? urls[first.url] : null;
                    return <VehicleCard key={v.id} v={v} imgUrl={url ?? null} dates={{ from: params.from, to: params.to }} />;
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-center gap-3">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => goto(page - 1)} disabled={page <= 1}>
                      <ChevronLeft className="mr-1 h-4 w-4" />Prev
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => goto(page + 1)} disabled={page >= totalPages}>
                      Next<ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VehicleCard({
  v, imgUrl, dates,
}: { v: Vehicle; imgUrl: string | null; dates: { from?: string; to?: string } }) {
  return (
    <Link
      to="/vehicle/$id"
      params={{ id: v.id }}
      search={{ from: dates.from, to: dates.to } as any}
      className="group block"
    >
      <Card className="lift overflow-hidden rounded-2xl border-border p-0 shadow-card">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {imgUrl ? (
            <img
              src={imgUrl} alt={`${v.brand} ${v.model} available in ${v.city}`} loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">No image</div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
          <Badge className="absolute left-3 top-3 rounded-full bg-background/90 capitalize text-foreground">{v.category}</Badge>
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-medium">
            <Star className="h-3.5 w-3.5 fill-brand text-brand" />
            {Number(v.avg_rating).toFixed(1)}
            <span className="text-muted-foreground">({v.review_count})</span>
          </div>
        </div>

        <CardContent className="p-4">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold">{v.title}</div>
            <div className="truncate text-xs text-muted-foreground">{v.brand} {v.model} · {v.year}</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 capitalize">
              <Settings2 className="h-3 w-3" />{v.transmission}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 capitalize">
              <Fuel className="h-3 w-3" />{v.fuel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <MapPin className="h-3 w-3" />{v.city}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3">
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-none">{currency(v.price_daily)}</div>
              <div className="truncate text-[11px] text-muted-foreground">per day{v.price_hourly ? ` · ${currency(v.price_hourly)}/hr` : ""}</div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">
              <CalendarDays className="h-3.5 w-3.5" />Book
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
