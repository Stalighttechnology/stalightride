import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Route as RouteIcon, Users, Trash2, Plus, ArrowLeft } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

export const Route = createFileRoute("/_authenticated/pooling/new")({
  component: NewPoolTrip,
  head: () => ({
    meta: [
      { title: "Offer a car pooling ride — Synchoo" },
      { name: "description", content: "Publish your route, seats and fare per passenger, then approve the riders you want to travel with." },
      { property: "og:title", content: "Offer a car pooling ride — Synchoo" },
      { property: "og:description", content: "Share your route and fill empty seats on Synchoo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Point = { lat: number | null; lng: number | null };
type Stop = { label: string; point: Point };

function minDateTime() {
  const d = new Date(Date.now() + 30 * 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function NewPoolTrip() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState<Point>({ lat: null, lng: null });
  const [originLabel, setOriginLabel] = useState("");
  const [dest, setDest] = useState<Point>({ lat: null, lng: null });
  const [destLabel, setDestLabel] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [departDate, setDepartDate] = useState("");
  const [departTime, setDepartTime] = useState("10:00");
  const departAt = departDate ? `${departDate}T${departTime}` : "";
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [seats, setSeats] = useState(3);
  const [fare, setFare] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const distanceKm =
    origin.lat != null && dest.lat != null
      ? [
          { lat: origin.lat, lng: origin.lng! },
          ...stops.filter((s) => s.point.lat != null).map((s) => ({ lat: s.point.lat!, lng: s.point.lng! })),
          { lat: dest.lat, lng: dest.lng! },
        ].reduce((sum, p, i, arr) => (i === 0 ? 0 : sum + haversineKm(arr[i - 1]!, p)), 0)
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!originLabel.trim() || origin.lat == null) return toast.error("Pick your starting point on the map");
    if (!destLabel.trim() || dest.lat == null) return toast.error("Pick your destination on the map");
    if (!vehicleLabel.trim()) return toast.error("Tell riders which vehicle you'll drive");
    if (!departAt) return toast.error("Choose a departure date and time");
    if (new Date(departAt).getTime() <= Date.now()) return toast.error("Departure must be in the future");
    if (seats < 1 || seats > 8) return toast.error("Seats must be between 1 and 8");
    if (Number(fare) < 0) return toast.error("Fare cannot be negative");

    setSaving(true);
    const { error } = await supabase.from("pool_trips").insert({
      driver_id: user.id,
      vehicle_label: vehicleLabel.trim(),
      origin_label: originLabel.trim(),
      origin_lat: origin.lat,
      origin_lng: origin.lng!,
      dest_label: destLabel.trim(),
      dest_lat: dest.lat,
      dest_lng: dest.lng!,
      route: stops
        .filter((s) => s.point.lat != null)
        .map((s) => ({ lat: s.point.lat, lng: s.point.lng, label: s.label })),
      depart_at: new Date(departAt).toISOString(),
      seats_total: seats,
      seats_available: seats,
      fare_per_seat: Number(fare),
      notes: notes.trim() || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pooling trip published");
    navigate({ to: "/pooling/driver" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 rounded-full">
          <Link to="/pooling"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to pooling</Link>
        </Button>
        <Badge variant="secondary" className="rounded-full">Car pooling</Badge>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Offer a ride on your route</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add waypoints so riders travelling part of your route can match with you.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <Card>
            <CardContent className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Starting point</Label>
                <MapPicker
                  value={origin}
                  address={originLabel}
                  onChange={(v) => { setOrigin({ lat: v.lat, lng: v.lng }); if (v.address) setOriginLabel(v.address); }}
                  onAddressChange={setOriginLabel}
                  mapHeight="h-44"
                />
              </div>
              <div className="space-y-2">
                <Label>Destination</Label>
                <MapPicker
                  value={dest}
                  address={destLabel}
                  onChange={(v) => { setDest({ lat: v.lat, lng: v.lng }); if (v.address) setDestLabel(v.address); }}
                  onAddressChange={setDestLabel}
                  mapHeight="h-44"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="flex items-center gap-2"><RouteIcon className="h-4 w-4" /> Route waypoints</Label>
                  <p className="text-xs text-muted-foreground">Optional — towns or highway stops you pass through.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-full"
                  onClick={() => setStops((s) => [...s, { label: "", point: { lat: null, lng: null } }])}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add waypoint
                </Button>
              </div>
              {stops.map((stop, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Waypoint {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" className="rounded-full"
                      onClick={() => setStops((s) => s.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <MapPicker
                    value={stop.point}
                    address={stop.label}
                    onChange={(v) =>
                      setStops((s) => s.map((x, idx) => (idx === i ? { label: v.address ?? x.label, point: { lat: v.lat, lng: v.lng } } : x)))
                    }
                    onAddressChange={(label) => setStops((s) => s.map((x, idx) => (idx === i ? { ...x, label } : x)))}
                    mapHeight="h-40"
                  />
                </div>
              ))}
              {distanceKm != null && (
                <p className="text-xs text-muted-foreground">Approx route length: {distanceKm.toFixed(0)} km</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="depart">Departure date & time</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <DatePicker value={departDate} onChange={setDepartDate} minDate={new Date()} placeholder="Departure date" />
                  <TimePicker value={departTime} onChange={setDepartTime} placeholder="Departure time" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vehicle">Vehicle</Label>
                <Input id="vehicle" value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} placeholder="Hyundai Creta · White" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seats" className="flex items-center gap-2"><Users className="h-4 w-4" /> Seats offered</Label>
                <Input id="seats" type="number" min={1} max={8} value={seats}
                  onChange={(e) => setSeats(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fare">Fare per passenger (₹)</Label>
                <Input id="fare" type="number" min={0} step={10} value={fare} onChange={(e) => setFare(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Notes for riders</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Boot space for one bag each, no smoking." />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={saving} className="w-full rounded-full sm:w-auto">
            {saving ? "Publishing…" : "Publish pooling trip"}
          </Button>
        </form>
      </div>
    </div>
  );
}
