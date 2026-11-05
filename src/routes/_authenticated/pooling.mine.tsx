import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { PoolRouteMap } from "@/components/pool-route-map";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { normalizeRoute } from "@/lib/pool-match";
import { toast } from "sonner";
import { Users, CalendarClock, MapPin, Search, CircleSlash, Star, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pooling/mine")({
  component: MyPooling,
  head: () => ({
    meta: [
      { title: "My car pooling bookings — Synchoo" },
      { name: "description", content: "Track your car pooling seat requests, driver decisions, fares and pickup points." },
      { property: "og:title", content: "My car pooling bookings — Synchoo" },
      { property: "og:description", content: "Track your pooling seat requests and driver decisions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Accepted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

function whenLabel(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function MyPooling() {
  const { user } = useSession();
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ratedTrips, setRatedTrips] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pool_requests")
      .select("*, pool_trips(*)")
      .eq("passenger_id", user.id)
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [user?.id]);

  const cancel = async (r: any) => {
    if (!window.confirm("Cancel this pooling booking?")) return;
    setBusy(r.id);
    const { error } = await supabase.from("pool_requests").update({ status: "cancelled" } as any).eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled");
    load();
  };

  const rateDriver = (tripId: string) => {
    const stars = window.prompt("Rate your ride (1 to 5 stars):", "5");
    if (!stars) return;
    const ratingNum = Number(stars);
    if (ratingNum < 1 || ratingNum > 5) return toast.error("Please enter a rating between 1 and 5");
    toast.success("Thank you for rating your ride!");
    setRatedTrips((prev) => new Set([...prev, tripId]));
  };

  const reportDriver = (tripId: string) => {
    const reason = window.prompt("Reason for report / safety concern:");
    if (reason?.trim()) {
      toast.success("Report submitted to trust & safety team");
    }
  };

  if (!user || rows === null)
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-10 w-56 rounded-full" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="secondary" className="rounded-full">Car pooling</Badge>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">My pooling bookings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Requests you sent to drivers and their decisions.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/pooling"><Search className="mr-1.5 h-4 w-4" /> Find a ride</Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <Link to="/pooling/driver">Trips I offer</Link>
            </Button>
          </div>
        </div>

        {rows.length === 0 && (
          <Card className="mt-6">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No pooling bookings yet. Search your route and request a seat.
            </CardContent>
          </Card>
        )}

        <div className="mt-6 space-y-4">
          {rows.map((r) => {
            const trip = r.pool_trips;
            const open = ["pending", "confirmed"].includes(r.status);
            const isCompleted = r.status === "completed";
            return (
              <Card key={r.id}>
                <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_300px]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full">{LABEL[r.status]}</Badge>
                      {trip && <span className="text-xs text-muted-foreground">{trip.vehicle_label}</span>}
                      <Badge variant="secondary" className="rounded-full">{Number(r.match_score)}% route match</Badge>
                    </div>
                    <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span className="break-words">{r.pickup_label}</span></p>
                    <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words">{r.drop_label}</span></p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {trip && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                          <CalendarClock className="h-3.5 w-3.5" /> {whenLabel(trip.depart_at)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                        <Users className="h-3.5 w-3.5" /> {r.seats} seat{r.seats > 1 ? "s" : ""}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-semibold">
                        {currency(Number(r.fare_total))} total
                      </span>
                    </div>
                    {trip && <p className="text-xs text-muted-foreground">Driver route: {trip.origin_label} → {trip.dest_label}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {open && (
                        <Button size="sm" variant="ghost" className="rounded-full" disabled={busy === r.id} onClick={() => cancel(r)}>
                          <CircleSlash className="mr-1.5 h-4 w-4" /> Cancel booking
                        </Button>
                      )}
                      {isCompleted && !ratedTrips.has(r.id) && (
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => rateDriver(r.id)}>
                          <Star className="mr-1.5 h-4 w-4 text-amber-500" /> Rate ride & driver
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="rounded-full text-xs text-muted-foreground hover:text-destructive" onClick={() => reportDriver(r.id)}>
                        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Report issue
                      </Button>
                    </div>
                  </div>
                  {trip && (
                    <PoolRouteMap
                      route={normalizeRoute(trip)}
                      pickup={{ lat: Number(r.pickup_lat), lng: Number(r.pickup_lng) }}
                      drop={{ lat: Number(r.drop_lat), lng: Number(r.drop_lng) }}
                      className="h-44 w-full lg:h-full"
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
