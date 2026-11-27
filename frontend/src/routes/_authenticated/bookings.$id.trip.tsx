import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { Camera, Gauge, KeyRound, ShieldAlert, Radio } from "lucide-react";
import { getHandoverGate } from "@/lib/trip-window";
import { submitInspection } from "@/lib/actions";
import { LiveTracker } from "@/components/live-tracker";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { TripSafetyExtension } from "@/components/trip-safety-extension";

export const Route = createFileRoute("/_authenticated/bookings/$id/trip")({
  component: TripPage,
});

type Phase = "pickup" | "return";

// A 360-degree walk-around (four sides, four corners) plus one dashboard shot with the odometer and
// fuel gauge, required at check-in and check-out. Keep in sync with INSPECTION_SHOTS in payments/views.py.
const SHOTS = [
  { key: "front", label: "Front" },
  { key: "front_left", label: "Front-left corner" },
  { key: "driver_side", label: "Driver side" },
  { key: "rear_left", label: "Rear-left corner" },
  { key: "rear", label: "Rear" },
  { key: "rear_right", label: "Rear-right corner" },
  { key: "passenger_side", label: "Passenger side" },
  { key: "front_right", label: "Front-right corner" },
  { key: "dashboard", label: "Dashboard (odometer + fuel)" },
] as const;
type ShotKey = (typeof SHOTS)[number]["key"];

const shotLabel = (path: string) =>
  SHOTS.find((s) => path.split("/").pop()?.startsWith(`${s.key}-`))?.label ?? "Extra photo";

function TripPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [b, setB] = useState<any>(null);
  const [hasReviewed, setHasReviewed] = useState(false);

  const load = async () => {
    const { data } = await api
      .from("bookings")
      .select("*, vehicles(title,brand,model,year,vehicle_locations(lat,lng))")
      .eq("id", id)
      .maybeSingle();
    setB(data);
    const { data: rev } = await api.from("reviews").select("id").eq("booking_id", id).maybeSingle();
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
  if (!b || !role)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {b ? "You don't have access to this trip." : "Booking not found."}
          </p>
        </div>
      </div>
    );

  const isRenter = role === "customer";
  const gate = getHandoverGate(b);
  const isPaid = b.payment_status === "paid" && b.status === "confirmed";
  const started = Boolean(b.pickup_checked_at);
  const ended = Boolean(b.return_checked_at) || b.status === "completed";
  const onTrip = started && !ended && b.status === "confirmed";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Booking · {b.start_date} → {b.end_date}
            </p>
            <h1 className="font-display text-3xl font-semibold">
              {isRenter ? "Your trip" : "Trip handover"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {b.vehicles?.title} · {b.vehicles?.brand} {b.vehicles?.model}
            </p>
          </div>
          <Link to="/bookings" className="text-sm text-muted-foreground hover:underline">
            Back to bookings
          </Link>
        </div>

        <div className="grid gap-6">
          {!isRenter && isPaid && !ended && <HostCodeCard bookingId={b.id} started={started} />}

          <TripSafetyExtension booking={b} role={role} onExtensionSubmitted={load} />

          {onTrip && (
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                      <Radio className="h-4 w-4 text-red-600" /> Live GPS tracking
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {isRenter
                        ? "Share your phone GPS so the host can see your live position during the trip."
                        : "The renter's live phone position updates here while they're sharing."}
                    </p>
                  </div>
                  <Badge className="bg-red-600 text-white">Active trip</Badge>
                </div>
                <LiveTracker
                  bookingId={b.id}
                  userId={user!.id}
                  role={role}
                  hostLat={b.vehicles?.vehicle_locations?.[0]?.lat ?? null}
                  hostLng={b.vehicles?.vehicle_locations?.[0]?.lng ?? null}
                />
              </CardContent>
            </Card>
          )}

          <Section
            title="Check-in"
            subtitle={
              isRenter
                ? "Photograph the car, note the odometer and enter the check-in code your host gives you."
                : "The renter photographs the car and enters your check-in code to start the trip."
            }
            done={started}
          >
            {started ? (
              <Snapshot odo={b.pickup_odometer} photos={b.pickup_photos} notes={b.pickup_notes} at={b.pickup_checked_at} />
            ) : !isRenter ? (
              <p className="text-sm text-muted-foreground">
                Waiting for the renter. At handover, give them the check-in code shown above.
              </p>
            ) : isPaid && gate.canCheckin ? (
              <CheckForm bookingId={b.id} phase="pickup" onDone={load} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {gate.checkinReason ?? "Check-in is not available for this booking."}
              </p>
            )}
          </Section>

          {(started || ended) && (
            <Section
              title="Check-out"
              subtitle={
                isRenter
                  ? "Returning the car, even early? Take the same photos, note the odometer and enter the check-out code from your host."
                  : "The trip ends when the renter enters your check-out code."
              }
              done={ended}
            >
              {ended ? (
                <Snapshot odo={b.return_odometer} photos={b.return_photos} notes={b.return_notes} at={b.return_checked_at} />
              ) : !isRenter ? (
                <p className="text-sm text-muted-foreground">
                  When you get the car back and have checked it, give the renter the check-out code shown above.
                </p>
              ) : (
                <CheckForm bookingId={b.id} phase="return" minOdo={b.pickup_odometer} onDone={load} />
              )}
            </Section>
          )}

          {b.pickup_odometer != null && b.return_odometer != null && (
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                <Stat label="Distance driven" value={`${b.return_odometer - b.pickup_odometer} km`} />
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
            {b.status === "completed" && isRenter && b.vehicle_id && !hasReviewed && (
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
        </div>
      </div>
    </div>
  );
}

/** The host's codes. The database only returns them to the host and admins. */
function HostCodeCard({ bookingId, started }: { bookingId: string; started: boolean }) {
  const [codes, setCodes] = useState<{ checkin_code: string; checkout_code: string } | null>(null);
  useEffect(() => {
    api
      .from("booking_handover_codes")
      .select("checkin_code, checkout_code")
      .eq("booking_id", bookingId)
      .maybeSingle()
      .then(({ data }) => setCodes(data ?? null));
  }, [bookingId]);
  if (!codes) return null;
  const code = started ? codes.checkout_code : codes.checkin_code;
  return (
    <Card className="border-brand/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{started ? "Check-out code" : "Check-in code"}</h2>
            <p className="text-xs text-muted-foreground">
              {started
                ? "Tell the renter this code once you have the car back and have checked it. Entering it ends the trip."
                : "Tell the renter this code at handover, after they've photographed the car. Entering it starts the trip."}
            </p>
          </div>
        </div>
        <p className="font-mono text-3xl font-semibold tracking-[0.3em]" aria-label={`Code ${code.split("").join(" ")}`}>
          {code}
        </p>
      </CardContent>
    </Card>
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
          {done && <Badge className="bg-emerald-600 text-white">Done</Badge>}
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

/** The renter's check-in / check-out: nine required distinct photos, the odometer and the host's code. */
function CheckForm({
  bookingId,
  phase,
  minOdo,
  onDone,
}: {
  bookingId: string;
  phase: Phase;
  minOdo?: number | null;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<Partial<Record<ShotKey, File>>>({});
  const [odo, setOdo] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // Keep uploaded paths so a wrong code doesn't upload the photos again.
  const uploaded = useRef(new Map<File, string>());

  const missing = SHOTS.filter((s) => !files[s.key]);
  const uploadedCount = SHOTS.length - missing.length;

  const fileFingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

  const handlePickPhoto = (key: ShotKey, f: File) => {
    const fp = fileFingerprint(f);
    const duplicateSlot = SHOTS.find(
      (s) => s.key !== key && files[s.key] && fileFingerprint(files[s.key]!) === fp,
    );
    if (duplicateSlot) {
      toast.error(
        `This photo is already uploaded for "${duplicateSlot.label}". Please upload a different photo for each angle.`,
      );
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: f }));
  };

  const submit = async () => {
    if (missing.length) {
      return toast.error(
        `All ${SHOTS.length} angle photos are mandatory. Missing: ${missing[0].label.toLowerCase()}`,
      );
    }
    const fingerprints = SHOTS.map((s) => fileFingerprint(files[s.key]!));
    if (new Set(fingerprints).size !== SHOTS.length) {
      return toast.error("Please upload a different photo for each vehicle angle.");
    }
    const odoNum = Number(odo);
    if (!odo || !Number.isInteger(odoNum) || odoNum < 0) return toast.error("Enter the odometer reading in km");
    if (minOdo != null && odoNum < minOdo) return toast.error(`Odometer can't be lower than ${minOdo} km`);
    if (!/^\d{6}$/.test(code)) return toast.error("Enter the 6-digit code from your host");
    setBusy(true);
    try {
      const photos = {} as Record<ShotKey, string>;
      for (const s of SHOTS) {
        const f = files[s.key]!;
        let path = uploaded.current.get(f);
        if (!path) {
          const ext = f.name.split(".").pop() ?? "jpg";
          path = `${bookingId}/${phase}/${s.key}-${Date.now()}.${ext}`;
          const { error } = await api.storage.from("trip-photos").upload(path, f, { upsert: false });
          if (error) throw error;
          uploaded.current.set(f, path);
        }
        photos[s.key] = path;
      }
      const res = await submitInspection({
        data: { bookingId, phase, odo: odoNum, code, photos, notes: notes.trim() || null },
      });
      if (!res.ok) return toast.error(res.message ?? "That code didn't work");
      toast.success(phase === "pickup" ? "Trip started. Drive safe!" : "Trip completed. Thanks for riding!");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label required className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Car photos (all {SHOTS.length} angles mandatory)
          </Label>
          <Badge variant={missing.length === 0 ? "default" : "outline"} className="text-[11px]">
            {uploadedCount}/{SHOTS.length} uploaded
          </Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Walk all the way round the car, clockwise from the front, and upload a distinct photo for each angle. The dashboard photo must show the odometer and the fuel gauge.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2.5">
          {SHOTS.map((s) => (
            <PhotoSlot
              key={s.key}
              label={s.label}
              file={files[s.key]}
              disabled={busy}
              onPick={(f) => handlePickPhoto(s.key, f)}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${phase}-odo`} required className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Odometer (km)
          </Label>
          <Input
            id={`${phase}-odo`}
            type="number"
            inputMode="numeric"
            required
            value={odo}
            onChange={(e) => setOdo(e.target.value)}
            placeholder={minOdo != null ? `At least ${minOdo}` : "e.g. 42315"}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${phase}-code`} required className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {phase === "pickup" ? "Check-in code" : "Check-out code"} from your host
          </Label>
          <Input
            id={`${phase}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6 digits"
            className="mt-1 font-mono tracking-[0.3em]"
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`${phase}-notes`}>Notes (optional)</Label>
        <Textarea
          id={`${phase}-notes`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth recording, e.g. a scratch already on the left door"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : phase === "pickup" ? "Start trip" : "End trip"}
        </Button>
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  file,
  disabled,
  onPick,
}: {
  label: string;
  file?: File;
  disabled: boolean;
  onPick: (f: File) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <label
      className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border text-center text-xs transition-colors ${
        file ? "border-emerald-500/60" : "border-dashed border-border hover:border-brand/60"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      {preview ? (
        <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Camera className="mb-1 h-5 w-5 text-muted-foreground" />
      )}
      <span
        className={`relative z-10 rounded-md px-1.5 py-0.5 font-medium ${preview ? "mt-auto mb-1.5 bg-black/60 text-white" : "text-muted-foreground"}`}
      >
        {label} <span className="text-destructive">*</span>
      </span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!f.type.startsWith("image/")) return toast.error("Choose an image");
          if (f.size > 15 * 1024 * 1024) return toast.error("Photo is over 15 MB");
          onPick(f);
        }}
      />
    </label>
  );
}

function Snapshot({
  odo,
  photos,
  notes,
  at,
}: {
  odo: number | null;
  photos: string[] | null;
  notes: string | null;
  at: string | null;
}) {
  const urls = useSignedUrls("trip-photos", photos ?? []);
  const [open, setOpen] = useState<{ url: string; label: string } | null>(null);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Odometer" value={odo != null ? `${odo} km` : "—"} />
        <Stat label="Recorded" value={at ? new Date(at).toLocaleString() : "—"} />
      </div>
      {photos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {photos.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => urls[p] && setOpen({ url: urls[p]!, label: shotLabel(p) })}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/40"
            >
              {urls[p] ? (
                <img src={urls[p]!} alt={shotLabel(p)} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              ) : (
                <span className="text-xs text-muted-foreground">Loading…</span>
              )}
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {shotLabel(p)}
              </span>
            </button>
          ))}
        </div>
      )}
      {notes && <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{notes}</p>}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{open?.label}</DialogTitle>
          </DialogHeader>
          {open && <img src={open.url} alt={open.label} className="max-h-[70vh] w-full rounded-xl object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
