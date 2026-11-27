import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { MapPicker } from "@/components/map-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { haversineKm } from "@/lib/pool-match";
import { Route as RouteIcon, Users, ArrowLeft, MapPin, CheckCircle2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

export const Route = createFileRoute("/_authenticated/pooling/new")({
  component: NewPoolTrip,
  head: () => ({
    meta: [
      { title: "Offer a car pooling ride — Synchoo" },
      {
        name: "description",
        content:
          "Publish your 4-point route corridor, seats and fare per passenger, then approve the riders you want to travel with.",
      },
      { property: "og:title", content: "Offer a car pooling ride — Synchoo" },
      { property: "og:description", content: "Share your route and fill empty seats on Synchoo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Point = { lat: number | null; lng: number | null };

function NewPoolTrip() {
  const { user } = useSession();
  const navigate = useNavigate();

  // Mandatory 4-point corridor:
  // Point 1: Origin (Pickup)
  const [origin, setOrigin] = useState<Point>({ lat: null, lng: null });
  const [originLabel, setOriginLabel] = useState("");

  // Point 2: Via Stop 1 (Milestone 1)
  const [via1, setVia1] = useState<Point>({ lat: null, lng: null });
  const [via1Label, setVia1Label] = useState("");

  // Point 3: Via Stop 2 (Milestone 2)
  const [via2, setVia2] = useState<Point>({ lat: null, lng: null });
  const [via2Label, setVia2Label] = useState("");

  // Point 4: Destination (Dropoff)
  const [dest, setDest] = useState<Point>({ lat: null, lng: null });
  const [destLabel, setDestLabel] = useState("");

  const [departDate, setDepartDate] = useState("");
  const [departTime, setDepartTime] = useState("10:00");
  const departAt = departDate ? `${departDate}T${departTime}` : "";
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [seats, setSeats] = useState(3);
  const [fare, setFare] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Compute leg distances and total distance
  const leg1Km =
    origin.lat != null && via1.lat != null
      ? haversineKm({ lat: origin.lat, lng: origin.lng! }, { lat: via1.lat, lng: via1.lng! })
      : null;
  const leg2Km =
    via1.lat != null && via2.lat != null
      ? haversineKm({ lat: via1.lat, lng: via1.lng! }, { lat: via2.lat, lng: via2.lng! })
      : null;
  const leg3Km =
    via2.lat != null && dest.lat != null
      ? haversineKm({ lat: via2.lat, lng: via2.lng! }, { lat: dest.lat, lng: dest.lng! })
      : null;

  const totalDistanceKm =
    leg1Km != null && leg2Km != null && leg3Km != null ? leg1Km + leg2Km + leg3Km : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!originLabel.trim() || origin.lat == null)
      return toast.error("Pick your starting point on the map (Stop 1 of 4)");
    if (!via1Label.trim() || via1.lat == null)
      return toast.error("Pick your 1st via stop on the map (Stop 2 of 4, mandatory)");
    if (!via2Label.trim() || via2.lat == null)
      return toast.error("Pick your 2nd via stop on the map (Stop 3 of 4, mandatory)");
    if (!destLabel.trim() || dest.lat == null)
      return toast.error("Pick your destination on the map (Stop 4 of 4)");
    if (!vehicleLabel.trim()) return toast.error("Tell riders which vehicle you'll drive");
    if (!departAt) return toast.error("Choose a departure date and time");
    if (new Date(departAt).getTime() <= Date.now())
      return toast.error("Departure must be in the future");
    if (seats < 1 || seats > 8) return toast.error("Seats must be between 1 and 8");
    if (Number(fare) < 0) return toast.error("Fare cannot be negative");

    setSaving(true);
    const { error } = await api.from("pool_trips").insert({
      driver_id: user.id,
      vehicle_label: vehicleLabel.trim(),
      origin_label: originLabel.trim(),
      origin_lat: origin.lat,
      origin_lng: origin.lng!,
      dest_label: destLabel.trim(),
      dest_lat: dest.lat,
      dest_lng: dest.lng!,
      route: [
        { lat: via1.lat, lng: via1.lng!, label: via1Label.trim(), order: 1 },
        { lat: via2.lat, lng: via2.lng!, label: via2Label.trim(), order: 2 },
      ],
      depart_at: new Date(departAt).toISOString(),
      seats_total: seats,
      seats_available: seats,
      fare_per_seat: Number(fare),
      notes: notes.trim() || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("4-point pooling trip published successfully");
    navigate({ to: "/pooling/driver" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 rounded-full">
          <Link to="/pooling">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to pooling
          </Link>
        </Button>
        <Badge variant="secondary" className="rounded-full">
          Car pooling host
        </Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Offer a ride on your route
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every pool host must choose 4 locations: pickup, two intermediate waypoints, and dropoff.
          This establishes the exact route corridor so passengers along any section can match.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* Section: 4 Mandatory Route Locations */}
          <Card>
            <CardContent className="space-y-6 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <RouteIcon className="h-5 w-5 text-brand" /> Mandatory 4-Point Route Corridor
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    All 4 points are required (Origin → Via 1 → Via 2 → Destination) to define the 3-leg corridor.
                  </p>
                </div>
                {totalDistanceKm != null && (
                  <Badge variant="outline" className="rounded-full text-xs font-semibold text-brand">
                    Total: {totalDistanceKm.toFixed(1)} km across 3 legs
                  </Badge>
                )}
              </div>

              {/* Point 1: Start (Pickup) */}
              <div className="rounded-xl border border-border p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-500">
                      1
                    </span>
                    <Label required className="font-semibold">Starting Point (Pickup Location)</Label>
                  </div>
                  {origin.lat != null && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                    </span>
                  )}
                </div>
                <MapPicker
                  value={origin}
                  address={originLabel}
                  onChange={(v) => {
                    setOrigin({ lat: v.lat, lng: v.lng });
                    if (v.address) setOriginLabel(v.address);
                  }}
                  onAddressChange={setOriginLabel}
                  mapHeight="h-40"
                />
              </div>

              {/* Point 2: Via Stop 1 */}
              <div className="rounded-xl border border-border p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-500">
                      2
                    </span>
                    <Label required className="font-semibold">Via Stop 1 (First Intermediate Milestone)</Label>
                  </div>
                  {leg1Km != null && (
                    <span className="text-xs text-muted-foreground">
                      Leg 1: ~{leg1Km.toFixed(1)} km from start
                    </span>
                  )}
                </div>
                <MapPicker
                  value={via1}
                  address={via1Label}
                  onChange={(v) => {
                    setVia1({ lat: v.lat, lng: v.lng });
                    if (v.address) setVia1Label(v.address);
                  }}
                  onAddressChange={setVia1Label}
                  mapHeight="h-40"
                />
              </div>

              {/* Point 3: Via Stop 2 */}
              <div className="rounded-xl border border-border p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-500">
                      3
                    </span>
                    <Label required className="font-semibold">Via Stop 2 (Second Intermediate Milestone)</Label>
                  </div>
                  {leg2Km != null && (
                    <span className="text-xs text-muted-foreground">
                      Leg 2: ~{leg2Km.toFixed(1)} km from stop 1
                    </span>
                  )}
                </div>
                <MapPicker
                  value={via2}
                  address={via2Label}
                  onChange={(v) => {
                    setVia2({ lat: v.lat, lng: v.lng });
                    if (v.address) setVia2Label(v.address);
                  }}
                  onAddressChange={setVia2Label}
                  mapHeight="h-40"
                />
              </div>

              {/* Point 4: Destination */}
              <div className="rounded-xl border border-border p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-500">
                      4
                    </span>
                    <Label required className="font-semibold">Destination (Final Drop-off Location)</Label>
                  </div>
                  {leg3Km != null && (
                    <span className="text-xs text-muted-foreground">
                      Leg 3: ~{leg3Km.toFixed(1)} km from stop 2
                    </span>
                  )}
                </div>
                <MapPicker
                  value={dest}
                  address={destLabel}
                  onChange={(v) => {
                    setDest({ lat: v.lat, lng: v.lng });
                    if (v.address) setDestLabel(v.address);
                  }}
                  onAddressChange={setDestLabel}
                  mapHeight="h-40"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section: Trip Logistics */}
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="depart" required>Departure date & time</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <DatePicker
                    value={departDate}
                    onChange={setDepartDate}
                    minDate={new Date()}
                    placeholder="dd-mm-yyyy"
                  />
                  <TimePicker
                    value={departTime}
                    onChange={setDepartTime}
                    placeholder="Departure time"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vehicle" required>Vehicle</Label>
                <Input
                  id="vehicle"
                  required
                  value={vehicleLabel}
                  onChange={(e) => setVehicleLabel(e.target.value)}
                  placeholder="Hyundai Creta · White"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seats" required className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Seats offered
                </Label>
                <Input
                  id="seats"
                  type="number"
                  min={1}
                  max={8}
                  required
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fare" required>Fare per passenger (₹)</Label>
                <Input
                  id="fare"
                  type="number"
                  min={0}
                  step={10}
                  required
                  value={fare}
                  onChange={(e) => setFare(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes for riders</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Boot space for one bag each, no smoking."
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={saving} className="w-full rounded-full sm:w-auto">
            {saving ? "Publishing…" : "Publish 4-point pooling trip"}
          </Button>
        </form>
      </div>
    </div>
  );
}
