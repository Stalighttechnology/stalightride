import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getBookingByQr } from "@/lib/actions";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { CalendarDays, Clock, MapPin, ShieldCheck, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/booking/qr/$code")({
  component: QrPage,
  head: () => ({
    meta: [
      { title: "Booking QR receipt — Synchoo" },
      { name: "description", content: "Scan a Synchoo booking QR code to verify vehicle, renter, host, schedule, payment, and trip status details." },
      { property: "og:title", content: "Booking QR receipt — Synchoo" },
      { property: "og:description", content: "Verified Synchoo booking details for scanned vehicle QR receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function QrPage() {
  const { code } = Route.useParams();
  const fetchBooking = getBookingByQr;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchBooking({ data: { code } })
      .then((res) => { if (!res) setNotFound(true); else setData(res); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code, fetchBooking]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 animate-fade-in">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Verified booking receipt
        </div>

        {loading && <Skeleton className="h-96 rounded-2xl" />}
        {notFound && !loading && (
          <Card><CardContent className="p-8 text-center">
            <h1 className="font-display text-xl font-semibold">Booking not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This QR code is invalid or has been revoked.</p>
            <Link to="/" className="mt-4 inline-block text-sm underline">Back to home</Link>
          </CardContent></Card>
        )}

        {data && (
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Booking ID</p>
                  <p className="font-mono text-sm">{data.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={data.status === "confirmed" ? "bg-blue-100 text-blue-800" : data.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-muted"}>{data.status}</Badge>
                  {data.paymentStatus === "paid" && (
                    <Badge className="gap-1 bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" />Paid</Badge>
                  )}
                </div>
              </div>
            </div>

            <CardContent className="space-y-6 p-6">
              <section>
                <h2 className="font-display text-xl font-semibold">{data.vehicle?.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {data.vehicle?.brand} {data.vehicle?.model} · {data.vehicle?.year} ·{" "}
                  <span className="capitalize">{data.vehicle?.fuel}</span> ·{" "}
                  <span className="capitalize">{data.vehicle?.transmission}</span>
                </p>
                <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />{data.vehicle?.address || data.vehicle?.city}
                </div>
                {data.vehicle?.lat && data.vehicle?.lng && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {Number(data.vehicle.lat).toFixed(5)}, {Number(data.vehicle.lng).toFixed(5)}
                  </p>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <PartyCard title="Currently rented by" name={data.customer?.full_name} avatar={data.customer?.avatar_url} />
                <PartyCard title="Hosted by" name={data.vendor?.full_name} avatar={data.vendor?.avatar_url} />
              </section>

              <section className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail icon={CalendarDays} label="Pickup">
                    {formatDate(data.startDate)}<br />
                    <span className="text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{data.pickupTime?.slice(0, 5)}</span>
                  </Detail>
                  <Detail icon={CalendarDays} label="Return">
                    {formatDate(data.endDate)}<br />
                    <span className="text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{data.dropoffTime?.slice(0, 5)}</span>
                  </Detail>
                </div>
              </section>

              <section className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount paid</p>
                  <p className="mt-1 text-2xl font-semibold">{currency(data.totalPrice)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Fare {currency(data.basePrice)} + deposit {currency(data.securityDeposit)}</p>
                </div>
                {data.paidAt && (
                  <div className="text-right text-xs text-muted-foreground">
                    Paid on<br />{formatDate(data.paidAt)}
                  </div>
                )}
              </section>

              {(data.pickupCheckedAt || data.returnCheckedAt) && (
                <section className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Trip inspection</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {data.pickupCheckedAt && <Inspection label="Pickup" at={data.pickupCheckedAt} fuel={data.pickupFuelPct} odo={data.pickupOdometer} />}
                    {data.returnCheckedAt && <Inspection label="Return" at={data.returnCheckedAt} fuel={data.returnFuelPct} odo={data.returnOdometer} />}
                  </div>
                </section>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Powered by Synchoo · This receipt was generated from a scanned QR code.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PartyCard({ title, name, avatar }: { title: string; name?: string | null; avatar?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatar ?? undefined} />
          <AvatarFallback>{(name ?? "?").charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0"><p className="truncate font-medium">{name ?? "—"}</p></div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function Inspection({ label, at, fuel, odo }: { label: string; at: string; fuel?: number | null; odo?: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-sm">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(at)}</p>
      <p className="mt-2 text-xs">Fuel: {fuel != null ? `${fuel}%` : "—"} · Odometer: {odo != null ? `${odo} km` : "—"}</p>
    </div>
  );
}

function formatDate(s: string) {
  try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

function formatDateTime(s: string) {
  try { return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}
