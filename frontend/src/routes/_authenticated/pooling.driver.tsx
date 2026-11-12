import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { PoolRouteMap } from "@/components/pool-route-map";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currency } from "@/lib/format";
import { normalizeRoute } from "@/lib/pool-match";
import { toast } from "sonner";
import {
  Users,
  CalendarClock,
  MapPin,
  PlusCircle,
  Check,
  X,
  CircleSlash,
  Flag,
  Star,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pooling/driver")({
  component: PoolDriver,
  head: () => ({
    meta: [
      { title: "My pooling trips — Synchoo" },
      {
        name: "description",
        content:
          "Manage the car pooling trips you offer: approve or decline riders, track seats and close the trip.",
      },
      { property: "og:title", content: "My pooling trips — Synchoo" },
      {
        property: "og:description",
        content: "Approve riders and manage seats on your pooling trips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_TONE: Record<string, string> = {
  pending: "secondary",
  confirmed: "default",
  rejected: "destructive",
  cancelled: "outline",
  completed: "default",
};

const LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Accepted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

function whenLabel(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PoolDriver() {
  const { user } = useSession();
  const [trips, setTrips] = useState<any[] | null>(null);
  const [requests, setRequests] = useState<Record<string, any[]>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [ratedRiders, setRatedRiders] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: t } = await api
      .from("pool_trips")
      .select("*")
      .eq("driver_id", user.id)
      .order("depart_at", { ascending: false });
    setTrips(t ?? []);
    const ids = (t ?? []).map((x) => x.id);
    if (!ids.length) return setRequests({});
    const { data: r } = await api
      .from("pool_requests")
      .select("*")
      .in("trip_id", ids)
      .order("created_at", { ascending: false });
    const grouped: Record<string, any[]> = {};
    (r ?? []).forEach((req) => {
      (grouped[req.trip_id] ??= []).push(req);
    });
    setRequests(grouped);
    const pids = [...new Set((r ?? []).map((x) => x.passenger_id))];
    if (pids.length) {
      const { data: p } = await api.from("public_profiles").select("*").in("id", pids);
      setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x])));
    }

    const { data: driverRatings } = await api
      .from("pool_ratings")
      .select("request_id")
      .eq("rater_id", user.id);
    if (driverRatings) {
      setRatedRiders(new Set(driverRatings.map((x) => x.request_id).filter(Boolean) as string[]));
    }
  };
  useEffect(() => {
    load();
  }, [user?.id]);

  const decide = async (req: any, status: "confirmed" | "rejected") => {
    setBusy(req.id);
    const { error } = await api
      .from("pool_requests")
      .update({ status } as any)
      .eq("id", req.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "Rider accepted — seats updated" : "Rider declined");
    load();
  };

  const ratePassenger = async (trip: any, r: any) => {
    if (trip.status !== "completed") {
      return toast.error("Ratings can only be submitted after the trip is marked completed");
    }
    const stars = window.prompt("Rate passenger (1 to 5 stars):", "5");
    if (!stars) return;
    const ratingNum = Number(stars);
    if (ratingNum < 1 || ratingNum > 5 || isNaN(ratingNum)) {
      return toast.error("Please enter a valid rating between 1 and 5");
    }
    const comment = window.prompt("Optional feedback / comment:") || "";
    const { error } = await api.from("pool_ratings").insert({
      trip_id: trip.id,
      request_id: r.id,
      rater_id: user!.id,
      ratee_id: r.passenger_id,
      role: "driver_to_passenger",
      rating: ratingNum,
      comment: comment.trim() || null,
    });
    if (error) {
      return toast.error(error.message);
    }
    toast.success("Passenger rated successfully");
    setRatedRiders((prev) => new Set([...prev, r.id]));
  };

  const reportPassenger = async (trip: any, r: any) => {
    const reason = window.prompt("Reason for report / safety issue:");
    if (!reason?.trim()) return;
    const details = window.prompt("Additional details (optional):") || "";
    const { error } = await api.from("user_reports").insert({
      reporter_id: user!.id,
      reported_user_id: r.passenger_id,
      target_type: "pooling_request",
      target_id: r.id,
      reason: reason.trim(),
      details: details.trim() || null,
    });
    if (error) {
      return toast.error(error.message);
    }
    toast.success("Report submitted to trust & safety moderation");
  };

  const setTripStatus = async (trip: any, status: "started" | "completed" | "cancelled") => {
    if (
      status === "cancelled" &&
      !window.confirm("Cancel this pooling trip? Accepted riders will be notified.")
    )
      return;
    setBusy(trip.id);
    const { error } = await api
      .from("pool_trips")
      .update({ status } as any)
      .eq("id", trip.id);
    if (!error && status !== "started") {
      const list = (requests[trip.id] ?? []).filter((r) =>
        ["pending", "confirmed"].includes(r.status),
      );
      for (const r of list) {
        await api
          .from("pool_requests")
          .update({
            status:
              status === "completed"
                ? r.status === "confirmed"
                  ? "completed"
                  : "rejected"
                : "cancelled",
          } as any)
          .eq("id", r.id);
      }
    }
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(
      status === "started"
        ? "Trip marked as started"
        : status === "completed"
          ? "Trip completed"
          : "Trip cancelled",
    );
    load();
  };

  if (!user || trips === null)
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-10 w-56 rounded-full" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="secondary" className="rounded-full">
              Car pooling
            </Badge>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Trips you offer</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Accept riders whose route matches yours and keep seats in sync.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/pooling/new">
              <PlusCircle className="mr-1.5 h-4 w-4" /> Offer a ride
            </Link>
          </Button>
        </div>

        {trips.length === 0 && (
          <Card className="mt-6">
            <CardContent className="p-6 text-sm text-muted-foreground">
              You haven't published a pooling trip yet. Share your next drive and split the fuel
              cost.
            </CardContent>
          </Card>
        )}

        <div className="mt-6 space-y-5">
          {trips.map((trip) => {
            const list = requests[trip.id] ?? [];
            const pending = list.filter((r) => r.status === "pending");
            return (
              <Card key={trip.id}>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={trip.status === "scheduled" ? "default" : "secondary"}
                          className="rounded-full capitalize"
                        >
                          {trip.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{trip.vehicle_label}</span>
                        {pending.length > 0 && (
                          <Badge variant="secondary" className="rounded-full">
                            {pending.length} awaiting reply
                          </Badge>
                        )}
                      </div>
                      <p className="flex items-start gap-2 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        <span className="break-words">{trip.origin_label}</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="break-words">{trip.dest_label}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                          <CalendarClock className="h-3.5 w-3.5" /> {whenLabel(trip.depart_at)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                          <Users className="h-3.5 w-3.5" /> {trip.seats_available}/
                          {trip.seats_total} seats free
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-semibold">
                          {currency(Number(trip.fare_per_seat))} / passenger
                        </span>
                      </div>
                      {trip.status === "scheduled" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={busy === trip.id}
                            onClick={() => setTripStatus(trip, "started")}
                          >
                            <Flag className="mr-1.5 h-4 w-4" /> Start trip
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            disabled={busy === trip.id}
                            onClick={() => setTripStatus(trip, "cancelled")}
                          >
                            <CircleSlash className="mr-1.5 h-4 w-4" /> Cancel trip
                          </Button>
                        </div>
                      )}
                      {trip.status === "started" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={busy === trip.id}
                          onClick={() => setTripStatus(trip, "completed")}
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Mark completed
                        </Button>
                      )}
                    </div>
                    <PoolRouteMap route={normalizeRoute(trip)} className="h-44 w-full lg:h-full" />
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rider requests
                    </p>
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground">No requests yet.</p>
                    )}
                    {list.map((r) => {
                      const p = profiles[r.passenger_id];
                      return (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={p?.avatar_url ?? undefined} />
                            <AvatarFallback>
                              {(p?.full_name ?? "R").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {p?.full_name ?? "Rider"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.pickup_label} → {r.drop_label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.seats} seat{r.seats > 1 ? "s" : ""} ·{" "}
                              {currency(Number(r.fare_total))} · {Number(r.match_score)}% match
                            </p>
                            {r.emergency_contact && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">SOS contact:</span>{" "}
                                {r.emergency_contact}
                              </p>
                            )}
                            {r.note && <p className="text-xs text-muted-foreground">“{r.note}”</p>}
                          </div>
                          <Badge variant={STATUS_TONE[r.status] as any} className="rounded-full">
                            {LABEL[r.status]}
                          </Badge>
                          {r.status === "pending" && trip.status === "scheduled" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="rounded-full"
                                disabled={busy === r.id}
                                onClick={() => decide(r, "confirmed")}
                              >
                                <Check className="mr-1.5 h-4 w-4" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                disabled={busy === r.id}
                                onClick={() => decide(r, "rejected")}
                              >
                                <X className="mr-1.5 h-4 w-4" /> Reject
                              </Button>
                            </div>
                          )}
                          {trip.status === "completed" && r.status === "completed" && (
                            <div className="flex gap-1.5">
                              {!ratedRiders.has(r.id) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full h-8 text-xs"
                                  onClick={() => ratePassenger(trip, r)}
                                >
                                  <Star className="mr-1 h-3.5 w-3.5 text-amber-500" /> Rate rider
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full h-8 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => reportPassenger(trip, r)}
                              >
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Report
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
