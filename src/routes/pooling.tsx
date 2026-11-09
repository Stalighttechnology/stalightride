import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { MapPicker } from "@/components/map-picker";
import { PoolRouteMap } from "@/components/pool-route-map";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { MATCH_THRESHOLD, matchScore, normalizeRoute, type MatchResult } from "@/lib/pool-match";
import { Users, MapPin, CalendarClock, Route as RouteIcon, Search, ArrowRight, PlusCircle, ShieldAlert, AlertTriangle } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

export const Route = createFileRoute("/pooling")({
  component: PoolingPage,
  head: () => ({
    meta: [
      { title: "Car pooling — share a ride on your route | Synchoo" },
      {
        name: "description",
        content:
          "Find car pooling trips that follow your own route. Match with drivers heading your way, see seats, fare per passenger and request a seat in seconds.",
      },
      { property: "og:title", content: "Car pooling — share a ride | Synchoo" },
      { property: "og:description", content: "Match with drivers whose route overlaps yours by 80% or more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Point = { lat: number | null; lng: number | null };

function whenLabel(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

function PoolingPage() {
  const { user } = useSession();
  const [pickup, setPickup] = useState<Point>({ lat: null, lng: null });
  const [pickupLabel, setPickupLabel] = useState("");
  const [drop, setDrop] = useState<Point>({ lat: null, lng: null });
  const [dropLabel, setDropLabel] = useState("");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState(1);
  const [note, setNote] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ trip: any; match: MatchResult }[] | null>(null);
  const [drivers, setDrivers] = useState<Record<string, any>>({});
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<string[]>([]);

  const ready = pickup.lat != null && drop.lat != null && pickupLabel.trim() && dropLabel.trim();

  const search = async () => {
    if (!ready) return toast.error("Pick both your start and destination points");
    setSearching(true);
    setResults(null);
    try {
      let q = supabase
        .from("pool_trips")
        .select("*")
        .eq("status", "scheduled")
        .gt("seats_available", 0)
        .gte("seats_available", seats)
        .gt("depart_at", new Date().toISOString())
        .order("depart_at", { ascending: true })
        .limit(60);
      if (date) {
        q = q.gte("depart_at", `${date}T00:00:00`).lte("depart_at", `${date}T23:59:59`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const scored = (data ?? [])
        .map((trip) => ({
          trip,
          match: matchScore(trip as any, { lat: pickup.lat!, lng: pickup.lng! }, { lat: drop.lat!, lng: drop.lng! }),
        }))
        .filter((r) => r.match.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.match.score - a.match.score);
      setResults(scored);
      const ids = [...new Set(scored.map((r) => r.trip.driver_id))];
      if (ids.length) {
        const { data: profiles } = await supabase.from("public_profiles").select("*").in("id", ids);
        setDrivers(Object.fromEntries((profiles ?? []).map((p) => [p.id, p])));
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not search pooling trips");
    } finally {
      setSearching(false);
    }
  };

  const join = async (trip: any) => {
    if (!user) return;
    setJoining(trip.id);
    try {
      const match = matchScore(trip, { lat: pickup.lat!, lng: pickup.lng! }, { lat: drop.lat!, lng: drop.lng! });
      const { error } = await supabase.from("pool_requests").insert({
        trip_id: trip.id,
        passenger_id: user.id,
        pickup_label: pickupLabel.trim(),
        pickup_lat: pickup.lat!,
        pickup_lng: pickup.lng!,
        drop_label: dropLabel.trim(),
        drop_lat: drop.lat!,
        drop_lng: drop.lng!,
        seats,
        match_score: match.score,
        emergency_contact: emergencyContact.trim() || null,
        note: note.trim() || null,
      });
      if (error) {
        if (error.code === "23505" || error.message.includes("pool_requests_one_active_idx"))
          throw new Error("You already have an active request for this trip");
        throw error;
      }
      setJoined((j) => [...j, trip.id]);
      toast.success("Seat requested — the driver will accept or decline shortly");
    } catch (e: any) {
      toast.error(e.message ?? "Could not request this trip");
    } finally {
      setJoining(null);
    }
  };

  const reportRide = (tripId: string) => {
    const reason = window.prompt("Reason for reporting this ride / driver?");
    if (reason?.trim()) {
      toast.success("Report submitted to trust & safety team");
    }
  };

  const heading = useMemo(
    () => (results === null ? null : results.length ? `${results.length} matching trip${results.length > 1 ? "s" : ""}` : "No matching trips yet"),
    [results],
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="rise">
            <Badge variant="secondary" className="rounded-full">Car pooling</Badge>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Share the ride, split the fare</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              We match you with drivers whose route overlaps yours by at least {MATCH_THRESHOLD}% — so no long detours for anyone.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/pooling/new"><PlusCircle className="mr-1.5 h-4 w-4" /> Offer a ride</Link>
            </Button>
            {user && (
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/pooling/mine">My pooling</Link>
              </Button>
            )}
          </div>
        </div>

        <Card className="glass mt-6">
          <CardContent className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Where do you start?</Label>
              <MapPicker
                value={pickup}
                address={pickupLabel}
                onChange={(v) => { setPickup({ lat: v.lat, lng: v.lng }); if (v.address) setPickupLabel(v.address); }}
                onAddressChange={setPickupLabel}
                mapHeight="h-44"
              />
            </div>
            <div className="space-y-2">
              <Label>Where are you going?</Label>
              <MapPicker
                value={drop}
                address={dropLabel}
                onChange={(v) => { setDrop({ lat: v.lat, lng: v.lng }); if (v.address) setDropLabel(v.address); }}
                onAddressChange={setDropLabel}
                mapHeight="h-44"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="pool-date">Travel date (optional)</Label>
                <DatePicker id="pool-date" value={date} onChange={setDate} minDate={new Date()} placeholder="dd-mm-yyyy" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool-seats">Seats needed</Label>
                <Input id="pool-seats" type="number" min={1} max={8} value={seats}
                  onChange={(e) => setSeats(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool-ec">Emergency contact</Label>
                <Input id="pool-ec" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="+91 emergency phone" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool-note">Note to driver (optional)</Label>
                <Input id="pool-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="One cabin bag" />
              </div>
            </div>
            <div className="lg:col-span-2">
              <Button onClick={search} disabled={!ready || searching} className="w-full rounded-full sm:w-auto">
                <Search className="mr-1.5 h-4 w-4" /> {searching ? "Matching routes…" : "Find matching trips"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Written cancellation policy and safety info */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border/80 bg-muted/40 p-4 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <span className="font-semibold text-foreground">Pooling Safety & Cancellation Policy:</span> Every driver is verified before listing trips. Fares are settled directly with the driver (Cash or UPI). Riders can cancel their booking anytime before departure with no cancellation fees; seats are automatically returned to the pool for other travelers.
          </div>
        </div>

        {searching && (
          <div className="mt-6 space-y-4">
            {[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
          </div>
        )}

        {heading && !searching && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold">{heading}</h2>
            {results!.length === 0 && (
              <Card className="mt-3">
                <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
                  <p>No driver is covering at least {MATCH_THRESHOLD}% of your route right now.</p>
                  <p>Try a different date, or offer your own ride and let others join you.</p>
                  <Button asChild size="sm" variant="outline" className="mt-2 rounded-full">
                    <Link to="/pooling/new">Offer a ride <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="mt-4 space-y-4">
              {(results ?? []).map(({ trip, match }) => {
                const driver = drivers[trip.driver_id];
                const alreadyJoined = joined.includes(trip.id);
                return (
                  <Card key={trip.id} className="overflow-hidden">
                    <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.1fr_1fr]">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={driver?.avatar_url ?? undefined} />
                            <AvatarFallback>{(driver?.full_name ?? "D").charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{driver?.full_name ?? "Verified driver"}</p>
                            <p className="truncate text-xs text-muted-foreground">{trip.vehicle_label}</p>
                          </div>
                          <Badge className="ml-auto rounded-full">{match.score}% route match</Badge>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span className="min-w-0 break-words">{trip.origin_label}</span></p>
                          <p className="flex items-start gap-2"><RouteIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{trip.dest_label}</span></p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                            <CalendarClock className="h-3.5 w-3.5" /> {whenLabel(trip.depart_at)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                            <Users className="h-3.5 w-3.5" /> {trip.seats_available} seat{trip.seats_available === 1 ? "" : "s"} left
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-semibold">
                            {currency(Number(trip.fare_per_seat))} / passenger
                          </span>
                        </div>
                        {trip.notes && <p className="text-xs text-muted-foreground">“{trip.notes}”</p>}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-sm font-semibold">Total {currency(Number(trip.fare_per_seat) * seats)}</span>
                          {user ? (
                            <Button
                              size="sm"
                              className="rounded-full"
                              disabled={joining === trip.id || alreadyJoined}
                              onClick={() => join(trip)}
                            >
                              {alreadyJoined ? "Requested" : joining === trip.id ? "Requesting…" : `Request ${seats} seat${seats > 1 ? "s" : ""}`}
                            </Button>
                          ) : (
                            <Button asChild size="sm" className="rounded-full">
                              <Link to="/auth">Sign in to join</Link>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => reportRide(trip.id)}
                          >
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Report
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Pickup ~{match.pickupDistanceKm.toFixed(1)} km off route · Drop ~{match.dropDistanceKm.toFixed(1)} km
                          </span>
                        </div>
                      </div>
                      <PoolRouteMap
                        route={normalizeRoute(trip)}
                        pickup={{ lat: pickup.lat!, lng: pickup.lng! }}
                        drop={{ lat: drop.lat!, lng: drop.lng! }}
                        className="h-56 w-full lg:h-full"
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
