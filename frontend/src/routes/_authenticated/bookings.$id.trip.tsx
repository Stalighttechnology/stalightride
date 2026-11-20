import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { Upload, X, Fuel, Gauge, Camera, ShieldAlert, Radio, CheckCircle2 } from "lucide-react";
import { getHandoverGate } from "@/lib/trip-window";
import { submitInspection, completeBooking } from "@/lib/actions";
import { LiveTracker } from "@/components/live-tracker";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { TripSafetyExtension } from "@/components/trip-safety-extension";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bookings/$id/trip")({
  component: TripInspection,
});

const DAMAGE_AREAS = [
  "Front bumper",
  "Rear bumper",
  "Left side panels",
  "Right side panels",
  "Windshield",
  "Wheels & tyres",
  "Headlights & tail-lights",
  "Interior & seats",
  "Dashboard warning lights",
];
type DamageEntry = { area: string; condition: "ok" | "minor" | "major"; note?: string };

type Phase = "pickup" | "return";

function TripInspection() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [b, setB] = useState<any>(null);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [saving, setSaving] = useState<Phase | null>(null);
  const [endRideModalOpen, setEndRideModalOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("action") === "return";
    }
    return false;
  });
  const saveInspection = submitInspection;

  const load = async () => {
    const { data } = await api
      .from("bookings")
      .select("*, vehicles(title,brand,model,year,lat,lng)")
      .eq("id", id)
      .maybeSingle();
    setB(data);
    const { data: rev } = await api
      .from("reviews")
      .select("id")
      .eq("booking_id", id)
      .maybeSingle();
    setHasReviewed(Boolean(rev));
  };
  useEffect(() => {
    load();
  }, [id]);

  const isAdmin = useIsAdmin();
  const role = useMemo(() => {
    if (!user || !b) return null;
    if (user.id === b.customer_id) return "customer" as const;
    if (user.id === b.vendor_id) return "vendor" as const;
    if (isAdmin) return "admin" as const;
    return null;
  }, [user, b, isAdmin]);

  if (b === null)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-4xl p-6">
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  if (!b)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Booking not found.</p>
        </div>
      </div>
    );
  if (!role)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">You don't have access to this trip.</p>
        </div>
      </div>
    );

  const gate = getHandoverGate(b);
  // Checklist is "done" once readings exist; a QR scan alone only stamps the handover time.
  const pickupDone = b.pickup_odometer != null;
  const returnDone = b.return_odometer != null || b.status === "completed";
  const isPaid = (b.payment_status === "paid" || !!b.paid_at) && b.status === "confirmed";
  const tripStarted = !!b.pickup_checked_at || pickupDone;
  const canCheckin = !pickupDone && (gate.canCheckin || !!b.pickup_checked_at || isPaid);
  const canCheckout = tripStarted && !returnDone && b.status === "confirmed";
  const tripActive = tripStarted && !returnDone && b.status === "confirmed";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Booking · {b.start_date} → {b.end_date}
            </p>
            <h1 className="font-display text-3xl font-semibold">Trip inspection</h1>
            <p className="text-sm text-muted-foreground">
              {b.vehicles?.title} · {b.vehicles?.brand} {b.vehicles?.model}
            </p>
          </div>
          <Link to="/bookings" className="text-sm text-muted-foreground hover:underline">
            Back to bookings
          </Link>
        </div>

        <div className="grid gap-6">
          <TripSafetyExtension booking={b} role={role} onExtensionSubmitted={load} />

          {tripActive && (
            <Card className="border-emerald-500/30 bg-emerald-950/20">
              <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">
                      Ride is currently in progress
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Returning the vehicle early? You can finalize your trip now. Your host will be notified and your security deposit will be returned to your wallet immediately.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setEndRideModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> End ride early &amp; Complete trip
                </Button>
              </CardContent>
            </Card>
          )}

          {tripActive && (
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                      <Radio className="h-4 w-4 text-red-600" /> Live GPS tracking
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {role === "customer"
                        ? "Share your phone GPS so the host can see your live position during the trip."
                        : "The rider's live phone position updates here while they're sharing."}
                    </p>
                  </div>
                  <Badge className="bg-red-600 text-white">Active trip</Badge>
                </div>
                <LiveTracker
                  bookingId={b.id}
                  userId={user!.id}
                  role={role}
                  hostLat={b.vehicles?.lat ?? null}
                  hostLng={b.vehicles?.lng ?? null}
                />
              </CardContent>
            </Card>
          )}

          <Section
            title="Pickup check-in"
            subtitle="Record fuel, odometer and photos before starting the trip."
            done={pickupDone}
          >
            {pickupDone ? (
              <ReadOnlySnapshot
                bookingId={b.id}
                fuel={b.pickup_fuel_pct}
                odo={b.pickup_odometer}
                photos={b.pickup_photos}
                notes={b.pickup_notes}
                damage={b.pickup_damage}
                at={b.pickup_checked_at}
                phase="pickup"
              />
            ) : canCheckin ? (
              <InspectionForm
                bookingId={b.id}
                phase="pickup"
                saving={saving === "pickup"}
                onSave={async (payload) => {
                  setSaving("pickup");
                  try {
                    await saveInspection({
                      data: {
                        bookingId: b.id,
                        phase: "pickup",
                        fuel: payload.fuel,
                        odo: payload.odo,
                        photoPaths: payload.photoPaths,
                        notes: payload.notes || null,
                        damage: payload.damage as any,
                      },
                    });
                  } catch (e: any) {
                    setSaving(null);
                    return toast.error(e?.message ?? "Could not record the pickup.");
                  }
                  setSaving(null);
                  toast.success("Pickup recorded");
                  load();
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {gate.checkinReason ?? "Check-in is not available for this booking."}
              </p>
            )}
          </Section>

          <Section
            title="Return check-out"
            subtitle="Record fuel, odometer and photos when returning the vehicle."
            done={returnDone}
          >
            {returnDone ? (
              <ReadOnlySnapshot
                bookingId={b.id}
                fuel={b.return_fuel_pct}
                odo={b.return_odometer}
                photos={b.return_photos}
                notes={b.return_notes}
                damage={b.return_damage}
                at={b.return_checked_at}
                phase="return"
              />
            ) : canCheckout ? (
              <InspectionForm
                bookingId={b.id}
                phase="return"
                saving={saving === "return"}
                onSave={async (payload) => {
                  setSaving("return");
                  try {
                    await saveInspection({
                      data: {
                        bookingId: b.id,
                        phase: "return",
                        fuel: payload.fuel,
                        odo: payload.odo,
                        photoPaths: payload.photoPaths,
                        notes: payload.notes || null,
                        damage: payload.damage as any,
                      },
                    });
                    try {
                      await completeBooking({
                        data: {
                          bookingId: b.id,
                          odo: payload.odo,
                          fuel: payload.fuel,
                          notes: payload.notes || undefined,
                        },
                      });
                    } catch {
                      // Handled by saveInspection or database trigger
                    }
                  } catch (e: any) {
                    setSaving(null);
                    return toast.error(e?.message ?? "Could not record the return.");
                  }
                  setSaving(null);
                  toast.success("Return recorded — trip completed successfully!");
                  load();
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {gate.checkoutReason ?? "Check-out is not available yet."}
              </p>
            )}
          </Section>

          {b.pickup_odometer != null && b.return_odometer != null && (
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
                <Stat
                  label="Distance driven"
                  value={`${b.return_odometer - b.pickup_odometer} km`}
                />
                <Stat
                  label="Fuel change"
                  value={
                    b.return_fuel_pct != null && b.pickup_fuel_pct != null
                      ? `${b.pickup_fuel_pct}% → ${b.return_fuel_pct}%`
                      : "—"
                  }
                />
                <Stat label="Trip status" value={b.status} />
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {b.status !== "completed" && (
              <Button asChild variant="outline">
                <Link to="/bookings/$id/dispute" params={{ id: b.id }}>
                  Report damage or dispute
                </Link>
              </Button>
            )}
            {b.status === "completed" && role === "customer" && b.vehicle_id && !hasReviewed && (
              <Button asChild variant="outline">
                <Link to="/vehicle/$id" params={{ id: b.vehicle_id }}>
                  Review this ride
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" onClick={() => navigate({ to: "/bookings" })}>
              <span>Done</span>
            </Button>
          </div>

          <EndRideModal
            open={endRideModalOpen}
            onOpenChange={setEndRideModalOpen}
            booking={b}
            onComplete={load}
          />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  done,
  children,
}: {
  title: string;
  subtitle: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {done && <Badge className="bg-emerald-600 text-white">Completed</Badge>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

function InspectionForm({
  bookingId,
  phase,
  saving,
  onSave,
}: {
  bookingId: string;
  phase: Phase;
  saving: boolean;
  onSave: (p: {
    fuel: number;
    odo: number;
    photoPaths: string[];
    notes: string;
    damage: DamageEntry[];
  }) => void;
}) {
  const [fuel, setFuel] = useState(50);
  const [odo, setOdo] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [damage, setDamage] = useState<DamageEntry[]>(
    DAMAGE_AREAS.map((area) => ({ area, condition: "ok" })),
  );

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).slice(0, 8);
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };
  const remove = (i: number) => {
    setFiles(files.filter((_, x) => x !== i));
    setPreviews(previews.filter((_, x) => x !== i));
  };

  const submit = async () => {
    if (!odo) return toast.error("Enter odometer reading");
    if (files.length === 0) return toast.error("Add at least one photo");
    const flagged = damage.filter((d) => d.condition !== "ok");
    const missingNote = flagged.find((d) => !d.note?.trim());
    if (missingNote) return toast.error(`Add a note for "${missingNote.area}"`);
    setUploading(true);
    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${bookingId}/${phase}/${Date.now()}-${i}.${ext}`;
        const { error } = await api.storage.from("trip-photos").upload(path, f, { upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      onSave({ fuel, odo: Number(odo), photoPaths: paths, notes, damage });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <Label className="flex items-center gap-2">
          <Fuel className="h-4 w-4" /> Fuel level: <span className="font-mono">{fuel}%</span>
        </Label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={fuel}
          onChange={(e) => setFuel(Number(e.target.value))}
          className="mt-2 w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Empty</span>
          <span>¼</span>
          <span>½</span>
          <span>¾</span>
          <span>Full</span>
        </div>
      </div>
      <div>
        <Label className="flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Odometer (km)
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          value={odo}
          onChange={(e) => setOdo(e.target.value)}
          placeholder="e.g. 42315"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="flex items-center gap-2">
          <Camera className="h-4 w-4" /> Vehicle photos
        </Label>
        <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs">Add up to 8 photos (front, back, sides, dashboard)</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={pick} />
        </label>
        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Damage checklist
        </Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Walk around the vehicle and mark each area. Add a note for anything not OK.
        </p>
        <ul className="mt-2 space-y-2">
          {damage.map((d, idx) => (
            <li key={d.area} className="rounded-lg border border-border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{d.area}</span>
                <div className="flex gap-1">
                  {(["ok", "minor", "major"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setDamage((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, condition: c } : x)),
                        )
                      }
                      className={`rounded-md px-2 py-0.5 text-xs capitalize ${
                        d.condition === c
                          ? c === "ok"
                            ? "bg-emerald-600 text-white"
                            : c === "minor"
                              ? "bg-amber-500 text-white"
                              : "bg-red-600 text-white"
                          : "border border-border bg-background"
                      }`}
                    >
                      {c === "ok" ? "OK" : c}
                    </button>
                  ))}
                </div>
              </div>
              {d.condition !== "ok" && (
                <Input
                  className="mt-2"
                  placeholder="Describe (e.g. scratch on left door, dent near rear light)"
                  value={d.note ?? ""}
                  onChange={(e) =>
                    setDamage((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)),
                    )
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any scratches, warning lights, personal items…"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving || uploading}>
          {uploading
            ? "Uploading…"
            : saving
              ? "Saving…"
              : phase === "pickup"
                ? "Start trip"
                : "End trip"}
        </Button>
      </div>
    </div>
  );
}

function ReadOnlySnapshot({
  fuel,
  odo,
  photos,
  notes,
  damage,
  at,
  phase,
}: {
  bookingId: string;
  fuel: number | null;
  odo: number | null;
  photos: string[] | null;
  notes: string | null;
  damage?: DamageEntry[] | null;
  at: string;
  phase: Phase;
}) {
  const urls = useSignedUrls("trip-photos", photos ?? []);
  const flagged = (damage ?? []).filter((d) => d.condition !== "ok");
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Fuel" value={fuel != null ? `${fuel}%` : "—"} />
        <Stat label="Odometer" value={odo != null ? `${odo} km` : "—"} />
        <Stat label="Recorded" value={new Date(at).toLocaleString()} />
      </div>
      {photos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <a
              key={p}
              href={urls[p] ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square overflow-hidden rounded-lg border"
            >
              {urls[p] && (
                <img src={urls[p]!} alt={`${phase} photo`} className="h-full w-full object-cover" />
              )}
            </a>
          ))}
        </div>
      )}
      {damage && damage.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Damage checklist</p>
          {flagged.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-700">All areas marked OK.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {flagged.map((d) => (
                <li key={d.area} className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={
                      d.condition === "major" ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                    }
                  >
                    {d.condition}
                  </Badge>
                  <span className="font-medium">{d.area}</span>
                  {d.note && <span className="text-muted-foreground">— {d.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notes && <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{notes}</p>}
    </div>
  );
}

function EndRideModal({
  open,
  onOpenChange,
  booking,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any;
  onComplete: () => void;
}) {
  const [odo, setOdo] = useState<string>("");
  const [fuel, setFuel] = useState<number>(100);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (booking?.pickup_odometer) {
      setOdo(String(booking.pickup_odometer));
    }
    if (booking?.pickup_fuel_pct != null) {
      setFuel(booking.pickup_fuel_pct);
    }
  }, [booking?.pickup_odometer, booking?.pickup_fuel_pct, open]);

  const handleEndRide = async () => {
    const odoNum = odo ? parseInt(odo, 10) : undefined;
    if (odoNum !== undefined && booking?.pickup_odometer && odoNum < booking.pickup_odometer) {
      return toast.error("Return odometer cannot be less than pickup odometer");
    }

    const ok = await confirm({
      title: "End Ride Early & Complete Trip?",
      description: `Are you sure you want to end this ride early and return the vehicle now?
This will finalize the trip, credit host earnings, and return your security deposit (${currency(Number(booking?.security_deposit || 0))}) to your wallet.`,
      confirmText: "End Ride & Complete",
      cancelText: "Keep Riding",
      variant: "destructive",
    });
    if (!ok) return;

    setLoading(true);
    try {
      await completeBooking({
        data: {
          bookingId: booking.id,
          odo: odoNum,
          fuel,
          notes: notes.trim() || undefined,
        },
      });
      toast.success("Ride ended early — trip completed successfully!");
      onOpenChange(false);
      onComplete();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to end ride");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            End Ride Early &amp; Complete Trip
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Returning the vehicle before scheduled dropoff? Confirm your final vehicle readings to complete the trip now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {booking?.pickup_odometer != null && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
              <span className="text-muted-foreground">Pickup Odometer: </span>
              <span className="font-semibold">{booking.pickup_odometer} km</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Return Odometer (km)</Label>
            <Input
              type="number"
              placeholder={booking?.pickup_odometer ? String(booking.pickup_odometer) : "e.g. 15420"}
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Return Fuel Level</Label>
              <span className="text-xs font-semibold text-brand">{fuel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fuel}
              onChange={(e) => setFuel(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Return Notes / Remarks (Optional)</Label>
            <Textarea
              placeholder="e.g. Parked in designated bay, handed keys to host"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-20 text-xs"
            />
          </div>

          <div className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Security deposit of {currency(Number(booking?.security_deposit || 0))} will be credited back to your wallet upon completion.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleEndRide}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "Completing Trip…" : "Confirm & Complete Trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
