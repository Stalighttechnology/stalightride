import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { QrCamera } from "@/components/qr-camera";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { resolveHandoverCode, confirmHandover } from "@/lib/actions";
import { QrCode, ScanLine, CheckCircle2, RotateCcw, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
  head: () => ({
    meta: [
      { title: "QR check-in & check-out — Synchoo" },
      {
        name: "description",
        content: "Scan the rider's booking QR to confirm pickup and return handover instantly.",
      },
      { property: "og:title", content: "QR check-in & check-out — Synchoo" },
      {
        property: "og:description",
        content: "Verify a Synchoo trip handover in seconds with QR check-in and check-out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/** Extract the booking code from a scanned URL or raw code. */
function extractCode(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/([0-9a-fA-F-]{20,})\/?$/);
  return match ? match[1] : trimmed;
}

function ScanPage() {
  const resolve = resolveHandoverCode;
  const confirm = confirmHandover;
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(true);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [code, setCode] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const clean = extractCode(raw);
    setBusy(true);
    setScanning(false);
    try {
      const res: any = await resolve({ data: { code: clean } });
      if (!res.found) {
        toast.error("No booking matches this QR code.");
        setScanning(true);
        return;
      }
      setCode(clean);
      setResult(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read this QR code.");
      setScanning(true);
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async (phase: "pickup" | "return") => {
    if (!code) return;
    setBusy(true);
    try {
      await confirm({ data: { code, phase } });
      toast.success(
        phase === "pickup"
          ? "Pickup confirmed — now complete the checklist"
          : "Return confirmed — now complete the return checklist",
      );
      const id = result?.booking?.id;
      if (id) return navigate({ to: "/bookings/$id/trip", params: { id } });
      await lookup(code);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not confirm the handover.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCode(null);
    setManual("");
    setScanning(true);
  };

  const b = result?.booking;
  const phase: "pickup" | "return" | null = !b
    ? null
    : !b.pickup_checked_at
      ? "pickup"
      : !b.return_checked_at
        ? "return"
        : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">
            <ScanLine className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              QR check-in &amp; check-out
            </h1>
            <p className="text-sm text-muted-foreground">
              Scan the rider's booking QR at pickup and return to confirm the handover instantly.
            </p>
          </div>
        </div>

        {!result && (
          <Card className="mt-6 overflow-hidden rounded-2xl">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <QrCamera active={scanning} onResult={lookup} />
              <div className="flex items-center gap-2">
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Or paste the booking code"
                  className="rounded-xl"
                />
                <Button
                  disabled={!manual.trim() || busy}
                  onClick={() => lookup(manual)}
                  className="rounded-xl"
                >
                  {busy ? "Checking…" : "Verify"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Riders find their QR in{" "}
                <Link to="/bookings" className="underline">
                  My trips
                </Link>{" "}
                once the booking is paid.
              </p>
            </CardContent>
          </Card>
        )}

        {result && b && (
          <Card className="mt-6 rounded-2xl">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {result.vehicle?.title ?? "Vehicle"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.vehicle?.brand} {result.vehicle?.model} · {result.vehicle?.city}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{b.status}</Badge>
                  {b.payment_status === "paid" && (
                    <Badge className="bg-emerald-600 text-white">Paid</Badge>
                  )}
                </div>
              </div>

              <dl className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
                <Row label="Rider" value={result.rider?.full_name ?? "Synchoo rider"} />
                <Row label="Amount" value={currency(b.total_price)} />
                <Row label="Dates" value={`${b.start_date} → ${b.end_date}`} />
                <Row
                  label="Times"
                  value={`${String(b.pickup_time ?? "").slice(0, 5)} → ${String(b.dropoff_time ?? "").slice(0, 5)}`}
                />
                <Row
                  label="Pickup check-in"
                  value={
                    b.pickup_checked_at ? new Date(b.pickup_checked_at).toLocaleString() : "Pending"
                  }
                />
                <Row
                  label="Return check-out"
                  value={
                    b.return_checked_at ? new Date(b.return_checked_at).toLocaleString() : "Pending"
                  }
                />
              </dl>

              {!result.canConfirm && (
                <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                  Only the vehicle host can confirm this handover. You are viewing the trip as a
                  participant.
                </p>
              )}

              {result.canConfirm &&
                phase &&
                (() => {
                  const gate = result.gate;
                  const allowed =
                    phase === "pickup" ? gate?.canCheckin !== false : gate?.canCheckout !== false;
                  const reason = phase === "pickup" ? gate?.checkinReason : gate?.checkoutReason;
                  return (
                    <div className="space-y-2">
                      {!allowed && reason && (
                        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                          {reason}
                        </p>
                      )}
                      <Button
                        className="w-full rounded-xl"
                        disabled={busy || !allowed}
                        onClick={() => doConfirm(phase)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {busy
                          ? "Confirming…"
                          : phase === "pickup"
                            ? "Confirm pickup handover"
                            : "Confirm return handover"}
                      </Button>
                    </div>
                  );
                })()}

              {!phase && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Pickup and return are both verified for this trip.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Scan another
                </Button>
                <Button asChild variant="ghost" className="rounded-xl">
                  <Link to="/bookings/$id/trip" params={{ id: b.id }}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Inspection checklist
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <QrCode className="mt-0.5 h-4 w-4 shrink-0" />
          Every paid booking mints a unique QR. Scanning it stamps the handover time, notifies both
          sides, and unlocks the fuel and damage checklist.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
