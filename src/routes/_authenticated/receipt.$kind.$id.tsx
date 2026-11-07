import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { Printer, ArrowLeft } from "lucide-react";

type Kind = "vehicle" | "driver" | "wash";

export const Route = createFileRoute("/_authenticated/receipt/$kind/$id")({
  component: ReceiptPage,
  head: () => ({
    meta: [
      { title: "Booking receipt & bill — Synchoo" },
      { name: "description", content: "Download or print a detailed Synchoo bill with charges, taxes, payment method and refund details for any rental, driver hire or vehicle wash." },
      { property: "og:title", content: "Booking receipt & bill — Synchoo" },
      { property: "og:description", content: "Itemised Synchoo invoice for rentals, driver hires and vehicle wash bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Line = { label: string; value: number; muted?: boolean };

type Receipt = {
  title: string;
  subtitle: string;
  invoiceNo: string;
  issuedAt: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  reference: string | null;
  schedule: { label: string; value: string }[];
  lines: Line[];
  total: number;
  refund: number;
  backTo: string;
};

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
};
const fmtDateTime = (s?: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
};
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "—");

function ReceiptPage() {
  const { kind, id } = Route.useParams();
  const [data, setData] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await buildReceipt(kind as Kind, id);
        if (alive) setData(r);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Receipt not available");
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [kind, id]);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="print:hidden"><SiteHeader /></div>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link to={data?.backTo ?? "/bookings"}><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="mr-1.5 h-4 w-4" />Print / Save PDF
          </Button>
        </div>

        {loading && <Skeleton className="h-[520px] rounded-2xl" />}

        {!loading && error && (
          <Card><CardContent className="p-8 text-center">
            <h1 className="font-display text-xl font-semibold">Receipt unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Link to="/bookings" className="mt-4 inline-block text-sm underline">Back to trips</Link>
          </CardContent></Card>
        )}

        {data && (
          <Card className="overflow-hidden bg-card print:border-0 print:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight">Synchoo</p>
                <p className="text-xs text-muted-foreground">Tax invoice / payment receipt</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Invoice <span className="font-mono text-foreground">{data.invoiceNo}</span></p>
                <p className="mt-1">Issued {fmtDateTime(data.issuedAt)}</p>
              </div>
            </div>

            <CardContent className="space-y-6 p-6">
              <section className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-xl font-semibold">{data.title}</h1>
                  <p className="text-sm text-muted-foreground">{data.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{data.status}</Badge>
                  {data.paymentStatus === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
                  {data.paymentStatus === "unpaid" && <Badge variant="outline" className="border-amber-300 text-amber-700">Payment pending</Badge>}
                  {data.paymentStatus === "refunded" && <Badge variant="outline" className="border-emerald-300 text-emerald-700">Refunded</Badge>}
                  {data.paymentStatus === "partially_refunded" && <Badge variant="outline" className="border-amber-300 text-amber-700">Partly refunded</Badge>}
                </div>
              </section>

              <section className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                {data.schedule.map((s) => (
                  <div key={s.label}>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="mt-0.5 text-sm font-medium">{s.value}</p>
                  </div>
                ))}
              </section>

              <section>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill details</p>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className={`py-2 pr-4 ${l.muted ? "text-muted-foreground" : ""}`}>{l.label}</td>
                        <td className={`py-2 text-right tabular-nums ${l.muted ? "text-muted-foreground" : ""}`}>{currency(l.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="py-3 font-semibold">Total</td>
                      <td className="py-3 text-right text-lg font-semibold tabular-nums">{currency(data.total)}</td>
                    </tr>
                    {data.refund > 0 && (
                      <tr>
                        <td className="py-1 text-emerald-700">Refunded to wallet</td>
                        <td className="py-1 text-right tabular-nums text-emerald-700">− {currency(data.refund)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </section>

              <section className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</p>
                  <p className="mt-0.5 font-medium capitalize">{data.paymentMethod ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference</p>
                  <p className="mt-0.5 break-all font-mono text-xs">{data.reference ?? "—"}</p>
                </div>
              </section>

              <p className="text-center text-xs text-muted-foreground">
                Amounts are in INR and inclusive of applicable taxes. This is a computer-generated receipt from Synchoo.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Discount, service fee and GST lines shared by every receipt kind (money phase 1 columns). */
function feeLines(b: any): Line[] {
  const out: Line[] = [];
  if (Number(b.discount ?? 0) > 0) {
    out.push({ label: `Discount${b.coupon_code ? ` (${b.coupon_code})` : ""}`, value: -Number(b.discount), muted: true });
  }
  if (Number(b.service_fee ?? 0) > 0) out.push({ label: "Service fee", value: Number(b.service_fee), muted: true });
  if (Number(b.gst_amount ?? 0) > 0) out.push({ label: "GST on service fee", value: Number(b.gst_amount), muted: true });
  return out;
}

async function buildReceipt(kind: Kind, id: string): Promise<Receipt> {
  if (kind === "vehicle") {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, vehicles(title,brand,model,year,city,address)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Booking not found.");
    const b: any = data;
    const lines: Line[] = [
      { label: "Rental fare", value: Number(b.base_price ?? 0) },
      ...feeLines(b),
      { label: "Refundable security deposit", value: Number(b.security_deposit ?? 0) },
    ];
    return {
      title: b.vehicles?.title ?? "Vehicle rental",
      subtitle: [b.vehicles?.brand, b.vehicles?.model, b.vehicles?.year].filter(Boolean).join(" ") + (b.vehicles?.city ? ` · ${b.vehicles.city}` : ""),
      invoiceNo: `RS-VH-${String(b.id).slice(0, 8).toUpperCase()}`,
      issuedAt: b.paid_at ?? b.created_at,
      status: b.status,
      paymentStatus: b.payment_status,
      paymentMethod: b.payment_method === "wallet" ? "Wallet" : b.payment_method ?? null,
      reference: b.razorpay_payment_id ?? b.razorpay_order_id ?? null,
      schedule: [
        { label: "Pickup", value: `${fmtDate(b.start_date)} · ${hhmm(b.pickup_time)}` },
        { label: "Return", value: `${fmtDate(b.end_date)} · ${hhmm(b.dropoff_time)}` },
        { label: "Pickup location", value: b.vehicles?.address || b.vehicles?.city || "—" },
        { label: "Booking ID", value: String(b.id).slice(0, 8).toUpperCase() },
      ],
      lines,
      total: Number(b.total_price ?? 0),
      refund: Number(b.refund_amount ?? 0),
      backTo: "/bookings",
    };
  }

  if (kind === "driver") {
    const { data, error } = await supabase
      .from("driver_bookings")
      .select("*, drivers(full_name,city)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Driver hire not found.");
    const b: any = data;
    const lines: Line[] =
      b.rate_type === "hourly"
        ? [{ label: `Driver charges · ${b.hours} hour${Number(b.hours) === 1 ? "" : "s"}`, value: Number(b.base_price || b.total_price || 0) }, ...feeLines(b)]
        : [{ label: `Driver charges · ${b.days} day${Number(b.days) === 1 ? "" : "s"}`, value: Number(b.base_price || b.total_price || 0) }, ...feeLines(b)];
    return {
      title: `Driver hire — ${b.drivers?.full_name ?? "Driver"}`,
      subtitle: `${b.rate_type === "hourly" ? "Hourly" : "Daily"} hire${b.drivers?.city ? ` · ${b.drivers.city}` : ""}`,
      invoiceNo: `RS-DR-${String(b.id).slice(0, 8).toUpperCase()}`,
      issuedAt: b.paid_at ?? b.created_at,
      status: b.status,
      paymentStatus: b.payment_status,
      paymentMethod: b.payment_method === "wallet" ? "Wallet" : b.payment_method ?? null,
      reference: b.razorpay_payment_id ?? b.razorpay_order_id ?? null,
      schedule: [
        { label: "Starts", value: `${fmtDate(b.start_date)} · ${hhmm(b.start_time)}` },
        { label: "Ends", value: `${fmtDate(b.end_date)} · ${hhmm(b.end_time)}` },
        { label: "Pickup address", value: b.pickup_address || "—" },
        { label: "Hire ID", value: String(b.id).slice(0, 8).toUpperCase() },
      ],
      lines,
      total: Number(b.total_price ?? 0),
      refund: Number(b.refund_amount ?? 0),
      backTo: "/hires",
    };
  }

  const { data, error } = await supabase
    .from("wash_bookings")
    .select("*, wash_services(name,duration_minutes,vehicle_category)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Wash booking not found.");
  const b: any = data;
  return {
    title: b.wash_services?.name ?? "Vehicle wash",
    subtitle: [b.wash_services?.vehicle_category, b.wash_services?.duration_minutes ? `${b.wash_services.duration_minutes} min` : null, b.city]
      .filter(Boolean)
      .join(" · "),
    invoiceNo: `RS-WS-${String(b.id).slice(0, 8).toUpperCase()}`,
    issuedAt: b.paid_at ?? b.created_at,
    status: b.status,
    paymentStatus: b.payment_status,
    paymentMethod: b.payment_method === "wallet" ? "Wallet" : b.payment_method ?? null,
    reference: b.razorpay_payment_id ?? b.razorpay_order_id ?? null,
    schedule: [
      { label: "Slot", value: `${fmtDate(b.slot_date)} · ${hhmm(b.slot_time)}` },
      { label: "Vehicle", value: b.vehicle_label || "—" },
      { label: "Service address", value: b.address || b.city || "—" },
      { label: "Booking ID", value: String(b.id).slice(0, 8).toUpperCase() },
    ],
    lines: [{ label: "Wash package", value: Number(b.base_price || b.price || 0) }, ...feeLines(b)],
    total: Number(b.price ?? 0),
    refund: Number(b.refund_amount ?? 0),
    backTo: "/washes",
  };
}
