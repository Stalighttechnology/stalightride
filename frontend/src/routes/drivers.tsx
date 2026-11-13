import { CityPicker } from "@/components/city-picker";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currency } from "@/lib/format";
import { Star, MapPin, Search, BadgeCheck, Clock, Compass } from "lucide-react";

const searchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  trip_type: z.string().optional(),
  service_area: z.string().optional(),
  page: z.number().optional(),
});

export const Route = createFileRoute("/drivers")({
  validateSearch: searchSchema,
  component: DriversPage,
  head: () => ({
    meta: [
      { title: "Hire a verified driver — Synchoo" },
      {
        name: "description",
        content:
          "Book background-verified professional drivers by the hour or by the day across India. Transparent rates, instant confirmation.",
      },
      { property: "og:title", content: "Hire a verified driver — Synchoo" },
      {
        property: "og:description",
        content:
          "Book background-verified professional drivers by the hour or by the day across India.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 12;

const TRIP_TYPE_FILTERS = [
  { id: "", label: "All types" },
  { id: "airport", label: "Airport" },
  { id: "outstation", label: "Outstation" },
  { id: "corporate", label: "Corporate" },
  { id: "events", label: "Events" },
  { id: "city", label: "City travel" },
];

function DriversPage() {
  const search = Route.useSearch();
  const [items, setItems] = useState<any[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(search.page ?? 0);
  const [q, setQ] = useState(search.q ?? "");
  const [city, setCity] = useState(search.city ?? "");
  const [tripType, setTripType] = useState(search.trip_type ?? "");
  const [serviceArea, setServiceArea] = useState(search.service_area ?? "");

  useEffect(() => {
    setPage(0);
  }, [q, city, tripType, serviceArea]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      let query = api
        .from("public_drivers")
        .select("*", { count: "exact" })
        .order("avg_rating", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (city.trim()) query = query.ilike("city", `%${city.trim()}%`);
      if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);
      if (serviceArea.trim()) query = query.ilike("service_area", `%${serviceArea.trim()}%`);
      if (tripType.trim()) {
        const norm = tripType.trim().toLowerCase();
        const raw = tripType.trim();
        if (norm !== raw) {
          query = query.or(`trip_types.cs.{"${norm}"},trip_types.cs.{"${raw}"}`);
        } else {
          query = query.contains("trip_types", [norm]);
        }
      }
      const { data, count: c } = await query;
      if (cancelled) return;
      setItems(data ?? []);
      setCount(c ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, q, city, tripType, serviceArea]);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="border-b border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Hire a professional driver
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Every driver is licence-verified and approved by our team. Book by the hour for city
            runs, or by the day for outstation trips.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by driver name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <CityPicker value={city} onChange={setCity} placeholder="All cities" allowClear />
            <div className="relative">
              <Compass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Filter by service area"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={tripType || "all"}
                onValueChange={(val) => setTripType(val === "all" ? "" : val)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Trip type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trip types</SelectItem>
                  <SelectItem value="airport">Airport</SelectItem>
                  <SelectItem value="outstation">Outstation</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="city">City travel</SelectItem>
                </SelectContent>
              </Select>
              {(q || city || tripType || serviceArea) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setCity("");
                    setTripType("");
                    setServiceArea("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Trip type:</span>
            {TRIP_TYPE_FILTERS.map((t) => (
              <Button
                key={t.id || "all"}
                type="button"
                size="sm"
                variant={tripType.toLowerCase() === t.id ? "default" : "outline"}
                className="h-7 text-xs rounded-full"
                onClick={() => setTripType(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {!items && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        )}
        {items && items.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <p className="font-medium">No drivers found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your filters, or check back soon — new drivers are approved daily.
            </p>
          </div>
        )}
        {items && items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {count} driver{count === 1 ? "" : "s"} available
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((d) => (
                <DriverCard key={d.id} d={d} />
              ))}
            </ul>
            {pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DriverCard({ d }: { d: any }) {
  return (
    <li>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarImage src={d.photo_url ?? undefined} alt={d.full_name} />
              <AvatarFallback>{d.full_name?.charAt(0)?.toUpperCase() ?? "D"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-semibold">{d.full_name}</p>
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {d.city} · {d.experience_years} yr{d.experience_years === 1 ? "" : "s"} exp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 font-medium">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {Number(d.avg_rating).toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({d.review_count} review{d.review_count === 1 ? "" : "s"})
            </span>
          </div>

          {d.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{d.bio}</p>}

          {d.service_area && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Compass className="h-3.5 w-3.5 shrink-0 text-brand" />
              <span className="truncate">Area: {d.service_area}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(d.trip_types ?? []).map((t: string) => (
              <Badge
                key={t}
                variant="secondary"
                className="capitalize text-[11px] bg-primary/10 text-primary border-primary/20"
              >
                {t}
              </Badge>
            ))}
            {(d.languages ?? []).slice(0, 3).map((l: string) => (
              <Badge key={l} variant="secondary" className="text-[11px]">
                {l}
              </Badge>
            ))}
            {(d.vehicle_types ?? []).slice(0, 2).map((v: string) => (
              <Badge key={v} variant="outline" className="text-[11px]">
                {v}
              </Badge>
            ))}
          </div>

          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <div>
              <p className="text-lg font-semibold">
                {currency(d.daily_rate)}
                <span className="text-xs font-normal text-muted-foreground">/day</span>
              </p>
              {Number(d.hourly_rate) > 0 && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {currency(d.hourly_rate)}/hour
                </p>
              )}
            </div>
            <Button asChild size="sm">
              <Link to="/driver/$id" params={{ id: d.id }}>
                View & hire
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
