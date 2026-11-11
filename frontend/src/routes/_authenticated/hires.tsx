import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { CreditCard, Wallet as WalletIcon, Star, UserRound, ReceiptText } from "lucide-react";
import { createDriverRazorpayOrder, verifyDriverRazorpayPayment } from "@/lib/actions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

export const Route = createFileRoute("/_authenticated/hires")({
  component: HiresPage,
  head: () => ({
    meta: [
      { title: "My driver hires — Synchoo" },
      { name: "description", content: "Track your driver hire requests, pay securely by wallet or card, and review your driver after the trip." },
      { property: "og:title", content: "My driver hires — Synchoo" },
      { property: "og:description", content: "Track your driver hire requests, pay securely and review your driver." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Refund policy for a customer cancellation: 100% >24h before start, 50% >2h, else 0. */
export function refundPercent(b: any, now: number = Date.now()) {
  const time = b.start_time ? String(b.start_time).slice(0, 8) : "00:00:00";
  const timePart = time.length === 5 ? `${time}:00` : time;
  const start = new Date(`${b.start_date}T${timePart}Z`);
  const hoursLeft = (start.getTime() - now) / 3600000;
  if (hoursLeft >= 24) return 100;
  if (hoursLeft >= 2) return 50;
  return 0;
}

function HiresPage() {
  const { user } = useSession();
  const [items, setItems] = useState<any[] | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const createOrder = createDriverRazorpayOrder;
  const verifyPayment = verifyDriverRazorpayPayment;

  const load = async () => {
    if (!user) return;
    const [{ data }, { data: w }, { data: rv }] = await Promise.all([
      api
        .from("driver_bookings")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      api.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      api.from("driver_reviews").select("driver_booking_id").eq("customer_id", user.id),
    ]);
    const rows = data ?? [];
    // Driver details come from the public directory view (the drivers table is
    // host-private), so hydrate names/photos separately instead of embedding.
    const ids = Array.from(new Set(rows.map((b: any) => b.driver_id)));
    const { data: drv } = ids.length
      ? await api.from("public_drivers").select("id,full_name,photo_url,city").in("id", ids)
      : { data: [] as any[] };
    const byId = new Map((drv ?? []).map((d: any) => [d.id, d]));
    const reviewed = new Set((rv ?? []).map((r) => r.driver_booking_id));
    setItems(rows.map((b: any) => ({ ...b, drivers: byId.get(b.driver_id) ?? null, reviewed: reviewed.has(b.id) })));
    setWallet(Number(w?.balance ?? 0));
  };

  useEffect(() => { load(); }, [user?.id]);

  const cancel = async (b: any) => {
    const paid = b.payment_status === "paid";
    const pct = refundPercent(b);
    const msg = paid
      ? pct === 100
        ? `Cancel this hire? You'll get a full refund of ${currency(b.total_price)} to your wallet.`
        : pct === 50
          ? `Cancel this hire? It starts in under 24 hours, so 50% (${currency(Number(b.total_price) / 2)}) will be refunded to your wallet.`
          : "Cancel this hire? It starts in under 2 hours, so no refund is available."
      : "Cancel this hire request?";
    if (!window.confirm(msg)) return;

    setBusy(b.id);
    const { data, error } = await api.rpc("cancel_driver_booking", {
      _driver_booking_id: b.id,
      _reason: null,
    } as any);
    setBusy(null);
    if (error) return toast.error(error.message);
    const refund = Number((data as any)?.refund ?? 0);
    toast.success(refund > 0 ? `Hire cancelled — ${currency(refund)} refunded to your wallet` : "Hire cancelled");
    load();
  };

  const payWallet = async (b: any) => {
    setBusy(b.id);
    const { error } = await api.rpc("wallet_pay_driver_booking", { _driver_booking_id: b.id } as any);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Paid from wallet");
    load();
  };

  const payCard = async (b: any) => {
    if (!user) return;
    setBusy(b.id);
    try {
      const order = await createOrder({ data: { driverBookingId: b.id } });
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        orderId: order.orderId,
        name: "Synchoo",
        description: `Driver hire — ${b.drivers?.full_name ?? ""}`,
        prefill: { email: user.email ?? undefined, name: user.user_metadata?.full_name ?? undefined },
        onSuccess: async (resp) => {
          try {
            await verifyPayment({ data: { driverBookingId: b.id, ...resp } });
            toast.success("Payment successful");
            load();
          } catch (e: any) {
            toast.error(e.message ?? "Payment verification failed");
          }
        },
        onDismiss: () => setBusy(null),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not start payment");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Driver hires</h1>
            <p className="text-sm text-muted-foreground">Your hired drivers and their payment status.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/wallet" className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
              <WalletIcon className="h-4 w-4" />{wallet === null ? "…" : currency(wallet)}
            </Link>
            <Button asChild size="sm" variant="outline"><Link to="/drivers">Hire a driver</Link></Button>
          </div>
        </div>

        {!items && <div className="mt-6 grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>}
        {items && items.length === 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center">
            <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No driver hires yet</p>
            <Button asChild className="mt-4"><Link to="/drivers">Browse verified drivers</Link></Button>
          </div>
        )}

        <ul className="mt-6 grid gap-3">
          {(items ?? []).map((b) => {
            const canPay = b.status === "confirmed" && b.payment_status !== "paid";
            return (
              <Card key={b.id}><CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={b.drivers?.photo_url ?? undefined} />
                      <AvatarFallback>{(b.drivers?.full_name ?? "D").charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Link to="/driver/$id" params={{ id: b.driver_id }} className="font-medium hover:underline">{b.drivers?.full_name ?? "Driver"}</Link>
                      <p className="text-xs text-muted-foreground">{b.drivers?.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge s={b.status} />
                    {b.payment_status === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
                    {b.payment_status === "refunded" && <Badge variant="outline" className="border-emerald-300 text-emerald-700">Refunded</Badge>}
                    {b.payment_status === "partially_refunded" && <Badge variant="outline" className="border-amber-300 text-amber-700">Partly refunded</Badge>}
                  </div>
                </div>

                <div className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>📅 {b.start_date}{b.end_date !== b.start_date ? ` → ${b.end_date}` : ""}</div>
                  <div>🕒 {String(b.start_time).slice(0, 5)} → {String(b.end_time).slice(0, 5)}</div>
                  <div>🧾 {b.rate_type === "hourly" ? `${b.hours} hour(s)` : `${b.days} day(s)`}</div>
                  {b.trip_type && <div>🚗 <span className="capitalize">{b.trip_type}</span> trip</div>}
                  {b.pickup_address && <div>📍 {b.pickup_address}</div>}
                </div>
                <p className="mt-1 text-sm">Total: <span className="font-semibold">{currency(b.total_price)}</span></p>
                {Number(b.refund_amount ?? 0) > 0 && (
                  <p className="text-sm text-emerald-700">Refunded {currency(b.refund_amount)} to your wallet</p>
                )}
                {b.status === "cancelled" && Number(b.refund_amount ?? 0) === 0 && b.paid_at && (
                  <p className="text-sm text-muted-foreground">Cancelled within 2 hours of start — no refund</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canPay && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === b.id || (wallet ?? 0) < Number(b.total_price)} onClick={() => payWallet(b)}>
                        <WalletIcon className="mr-1.5 h-4 w-4" />{busy === b.id ? "Paying…" : "Pay with wallet"}
                      </Button>
                      <Button size="sm" disabled={busy === b.id} onClick={() => payCard(b)}>
                        <CreditCard className="mr-1.5 h-4 w-4" />Pay now
                      </Button>
                      {(wallet ?? 0) < Number(b.total_price) && <Link to="/wallet" className="text-xs underline text-muted-foreground">Add money</Link>}
                    </>
                  )}
                  {canPay && (
                    <span className="text-xs text-muted-foreground">Free cancellation up to 24h before start</span>
                  )}
                  {(b.status === "pending" || b.status === "confirmed") && (
                    <Button size="sm" variant="ghost" disabled={busy === b.id} onClick={() => cancel(b)}>Cancel</Button>
                  )}
                  {(b.payment_status === "paid" || b.paid_at || Number(b.refund_amount ?? 0) > 0) && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/receipt/$kind/$id" params={{ kind: "driver", id: b.id }}>
                        <ReceiptText className="mr-1.5 h-4 w-4" />Receipt
                      </Link>
                    </Button>
                  )}
                </div>

                {b.status === "completed" && !b.reviewed && (
                  <ReviewBox bookingId={b.id} driverId={b.driver_id} customerId={user!.id} onDone={load} />
                )}
              </CardContent></Card>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ReviewBox({ bookingId, driverId, customerId, onDone }: { bookingId: string; driverId: string; customerId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await api.from("driver_reviews").insert({
      driver_booking_id: bookingId, driver_id: driverId, customer_id: customerId, rating, comment: comment.trim() || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Thanks for the review");
    onDone();
  };

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Rate your driver</p>
      <div className="mt-2 flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <button key={i} type="button" aria-label={`${i + 1} star`} onClick={() => setRating(i + 1)}>
            <Star className={`h-5 w-5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
          </button>
        ))}
      </div>
      <Textarea className="mt-2" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the drive?" />
      <Button size="sm" className="mt-2" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Submit review"}</Button>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
    confirmed: "bg-blue-100 text-blue-800 border-blue-300",
    rejected: "bg-red-100 text-red-700 border-red-300",
    cancelled: "bg-muted text-muted-foreground",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  return <Badge variant="outline" className={map[s] ?? ""}>{s}</Badge>;
}
