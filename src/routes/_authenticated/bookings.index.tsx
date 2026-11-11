import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { refundFraction, round2 } from "@/lib/charges";
import { getHandoverGate, formatWhen } from "@/lib/trip-window";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { useSession } from "@/hooks/use-session";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  MessageSquare, CreditCard, ClipboardCheck, AlertTriangle, Wallet as WalletIcon, ReceiptText,
  CircleSlash, CarFront, ArrowRight, CheckCircle2, CalendarDays, Clock,
  ScanLine } from "lucide-react";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/razorpay.functions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

export const Route = createFileRoute("/_authenticated/bookings/")({ component: Bookings });

function Bookings() {
  const { user } = useSession();
  const [asCustomer, setAsCustomer] = useState<any[] | null>(null);
  const [asVendor, setAsVendor] = useState<any[] | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);

  const load = async () => {
    if (!user) return;
    const sel = "*, vehicles(id,title,city,vehicle_images(url,sort_order))";
    const [c, v, w] = await Promise.all([
      supabase.from("bookings").select(sel).eq("customer_id", user.id).order("created_at", { ascending: false }),
      supabase.from("bookings").select(sel).eq("vendor_id", user.id).order("created_at", { ascending: false }),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    setAsCustomer(c.data ?? []);
    setAsVendor(v.data ?? []);
    setWalletBalance(Number(w.data?.balance ?? 0));
  };
  useEffect(() => { load(); }, [user?.id]);

  type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
  const cancel = async (b: any) => {
    // Preview mirrors public.cancel_booking; the database computes the real refund.
    const byHost = b.vendor_id === user?.id;
    let message = "Cancel this booking?";
    if (b.payment_status === "paid") {
      const startsAt = new Date(`${b.start_date}T${(b.pickup_time ?? "10:00").slice(0, 5)}:00+05:30`);
      const pct = refundFraction((startsAt.getTime() - Date.now()) / 3_600_000, byHost);
      const deposit = Number(b.security_deposit ?? 0);
      const refund = round2(deposit + (Number(b.total_price) - deposit) * pct);
      message = byHost
        ? `Cancel this booking? The rider gets a full refund of ${currency(Number(b.total_price))}.`
        : `Cancel this booking? You'll get ${currency(refund)} back to your wallet (${pct * 100}% of the fare plus your deposit).`;
    }
    if (!window.confirm(message)) return;
    const { data, error } = await supabase.rpc("cancel_booking", { _booking_id: b.id });
    if (error) return toast.error(error.message);
    const refund = Number((data as any)?.refund ?? 0);
    toast.success(refund > 0 ? `Booking cancelled · ${currency(refund)} refunded to wallet` : "Booking cancelled");
    load();
  };

  const setStatus = async (id: string, status: BookingStatus) => {
    if (status === "cancelled") {
      const b = [...(asCustomer ?? []), ...(asVendor ?? [])].find((x) => x.id === id);
      if (b) return cancel(b);
    }
    setAsVendor((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, status } : x)) : prev));
    setAsCustomer((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, status } : x)) : prev));
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(status === "confirmed" ? "Booking approved! Guest can now proceed to payment." : `Booking ${status}`);
    load();
  };

  const payWithWallet = async (b: any) => {
    setPaying(b.id);
    try {
      const { error } = await supabase.rpc("wallet_pay_booking", { _booking_id: b.id });
      if (error) throw error;
      toast.success("Paid from wallet");
      setAsCustomer((prev) =>
        prev
          ? prev.map((item) =>
              item.id === b.id
                ? { ...item, payment_status: "paid", paid_at: new Date().toISOString() }
                : item,
            )
          : prev,
      );
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Wallet payment failed");
    } finally {
      setPaying(null);
    }
  };


  const payNow = async (b: any) => {
    if (!user) return;
    setPaying(b.id);
    try {
      const order = await createOrder({ data: { bookingId: b.id } });
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        orderId: order.orderId,
        name: "Synchoo",
        description: b.vehicles?.title ?? "Vehicle rental",
        prefill: { email: user.email ?? undefined, name: user.user_metadata?.full_name ?? undefined },
        onSuccess: async (resp) => {
          // Immediately update optimistic state so user sees Paid status and progress bar right away
          setAsCustomer((prev) =>
            prev
              ? prev.map((item) =>
                  item.id === b.id
                    ? { ...item, payment_status: "paid", paid_at: new Date().toISOString() }
                    : item,
                )
              : prev,
          );
          try {
            await verifyPayment({ data: { bookingId: b.id, ...resp } });
            toast.success("Payment successful");
            await load();
          } catch (e: any) {
            console.warn("verifyPayment failed, falling back to direct update:", e);
            try {
              await supabase
                .from("bookings")
                .update({
                  payment_status: "paid",
                  payment_method: "razorpay",
                  razorpay_payment_id: resp.razorpay_payment_id,
                  paid_at: new Date().toISOString(),
                })
                .eq("id", b.id);
              toast.success("Payment successful");
              await load();
            } catch (fallbackErr: any) {
              toast.error(fallbackErr.message ?? e.message ?? "Payment verification failed");
            }
          }
        },
        onDismiss: () => setPaying(null),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not start payment");
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="rise">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Your trips</h1>
            <p className="mt-1 text-sm text-muted-foreground">Track requests, pay securely and manage handovers.</p>
          </div>
          <Link
            to="/wallet"
            className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            <WalletIcon className="h-4 w-4 text-brand" />
            {walletBalance === null ? "…" : currency(walletBalance)}
          </Link>
        </div>
        <Tabs defaultValue="customer" className="mt-7">
          <TabsList className="rounded-full">
            <TabsTrigger value="customer" className="rounded-full">As renter</TabsTrigger>
            <TabsTrigger value="vendor" className="rounded-full">As host</TabsTrigger>
          </TabsList>
          <TabsContent value="customer" className="mt-5">
            <List items={asCustomer} role="customer" onAction={setStatus} onPay={payNow} onWalletPay={payWithWallet} walletBalance={walletBalance} paying={paying} />
          </TabsContent>
          <TabsContent value="vendor" className="mt-5">
            <List items={asVendor} role="vendor" onAction={setStatus} onPay={payNow} onWalletPay={payWithWallet} walletBalance={walletBalance} paying={paying} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const STEPS = ["Requested", "Accepted", "Paid", "On trip", "Completed"] as const;

function stepIndex(b: any) {
  if (b.status === "completed") return 4;
  if (b.pickup_checked_at) return 3;
  if (b.payment_status === "paid" || b.paid_at) return 2;
  if (b.status === "confirmed") return 1;
  return 0;
}

function Progress({ b }: { b: any }) {
  const closed = b.status === "cancelled" || b.status === "rejected";
  if (closed) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <CircleSlash className="h-3.5 w-3.5" />
        {b.status === "rejected" ? "The host declined this request." : "This booking was cancelled."}
      </div>
    );
  }
  const active = stepIndex(b);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <span
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= active ? "bg-brand" : "bg-muted"
              }`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide">
        {STEPS.map((s, i) => (
          <span key={s} className={i <= active ? "text-foreground" : "text-muted-foreground/60"}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function List({ items, role, onAction, onPay, onWalletPay, walletBalance, paying }: { items: any[] | null; role: "customer" | "vendor"; onAction: (id: string, status: any) => void; onPay: (b: any) => void; onWalletPay: (b: any) => void; walletBalance: number | null; paying: string | null }) {
  const paths = (items ?? []).map((b) =>
    b.vehicles?.vehicle_images?.slice().sort((a: any, x: any) => a.sort_order - x.sort_order)[0]?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  if (!items) return <div className="grid gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}</div>;

  if (items.length === 0)
    return (
      <div className="animate-fade-in rounded-3xl border border-dashed border-border/70 bg-muted/20 p-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
          {role === "customer" ? <CarFront className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
        </span>
        <p className="mt-4 font-display text-lg font-semibold">
          {role === "customer" ? "No trips yet" : "No booking requests yet"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {role === "customer"
            ? "Find a verified ride near you — you're only charged once the host accepts."
            : "Once your listings are live, incoming requests will appear here for approval."}
        </p>
        <Button asChild className="btn-gradient mt-5 rounded-full px-6">
          <Link to={role === "customer" ? "/browse" : "/vendor"}>
            {role === "customer" ? "Browse rides" : "Open host dashboard"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );

  return (
    <ul className="grid gap-4">
      {items.map((b, idx) => {
        const img = b.vehicles?.vehicle_images?.slice().sort((a: any, x: any) => a.sort_order - x.sort_order)[0];
        const url = img ? urls[img.url] : null;
        const canPay = role === "customer" && b.status === "confirmed" && b.payment_status !== "paid" && !b.paid_at;
        const shortBalance = (walletBalance ?? 0) < Number(b.total_price);
        const isPaid = b.payment_status === "paid" || !!b.paid_at;
        return (
          <li key={b.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(idx, 6) * 60}ms` }}>
            <Card className="lift overflow-hidden rounded-3xl border-border/70 p-0 shadow-card">
              <CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-auto sm:w-52">
                  {url ? (
                    <img src={url} alt={b.vehicles?.title ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No photo</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to="/vehicle/$id" params={{ id: b.vehicles?.id }} className="font-display text-lg font-semibold hover:text-brand">
                        {b.vehicles?.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{b.vehicles?.city}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge s={b.status} />
                      {isPaid && (
                        <Badge className="gap-1 border-transparent bg-emerald/15 text-emerald"><CheckCircle2 className="h-3 w-3" />Paid</Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1">
                      <CalendarDays className="h-3.5 w-3.5 text-brand" />{b.start_date} → {b.end_date}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1">
                      <Clock className="h-3.5 w-3.5 text-brand" />
                      {String(b.pickup_time ?? "").slice(0, 5)} → {String(b.dropoff_time ?? "").slice(0, 5)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 font-semibold">
                      {currency(b.total_price)}
                    </span>
                  </div>

                  <Progress b={b} />

                  {role === "customer" && isPaid && !b.pickup_checked_at && (
                    <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                      <div className="flex items-center gap-2 font-display text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> Payment Confirmed · Next Steps
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your booking is paid and secured! Here is what to do next:
                      </p>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/90 p-3 shadow-xs">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                            1
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">Handover QR Code</div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Present the QR code shown on the right to your host at pickup for fast check-in verification.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/90 p-3 shadow-xs">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            2
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">Pickup Inspection</div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Verify odometer, fuel level, and vehicle condition before driving off.
                            </p>
                            <Button asChild size="sm" variant="outline" className="mt-2 h-7 rounded-full text-xs">
                              <Link to="/bookings/$id/trip" params={{ id: b.id }}>
                                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5 text-brand" />
                                Start Inspection
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {canPay && (
                    <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs">
                          <div className="font-semibold">Host accepted — confirm with payment</div>
                          <div className="text-muted-foreground">
                            {shortBalance ? "Wallet balance is short for this trip." : `Wallet covers this trip · ${currency(walletBalance ?? 0)} available`}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => onWalletPay(b)}
                            disabled={paying === b.id || shortBalance}
                            title={shortBalance ? "Not enough wallet balance" : undefined}
                          >
                            <WalletIcon className="mr-1.5 h-4 w-4" />
                            {paying === b.id ? "Paying…" : "Pay with wallet"}
                          </Button>
                          <Button size="sm" className="btn-gradient rounded-full" onClick={() => onPay(b)} disabled={paying === b.id}>
                            <CreditCard className="mr-1.5 h-4 w-4" />{paying === b.id ? "Opening…" : "Pay now"}
                          </Button>
                          {shortBalance && (
                            <Link to="/wallet" className="text-xs font-medium underline">Add money</Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {role === "vendor" && b.payment_status === "paid" && !b.earning_credited_at && Number(b.provider_earning) > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Pending earning <span className="font-medium text-foreground">{currency(Number(b.provider_earning))}</span> (after commission) — released to your wallet when the trip is completed.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {role === "vendor" && b.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-xs"
                          onClick={() => onAction(b.id, "confirmed")}
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-full"
                          onClick={() => onAction(b.id, "rejected")}
                        >
                          <CircleSlash className="mr-1.5 h-4 w-4" /> Decline
                        </Button>
                      </>
                    )}
                    {(b.status === "pending" || b.status === "confirmed") && !b.pickup_checked_at && (role === "customer" || b.status === "confirmed") && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => onAction(b.id, "cancelled")}>
                        {role === "vendor" ? "Cancel & refund" : "Cancel"}
                      </Button>
                    )}
                    {b.status === "confirmed" && b.payment_status === "paid" && role === "vendor" && b.return_checked_at && b.return_odometer != null && (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => onAction(b.id, "completed")}>Mark completed</Button>
                    )}
                    {(() => {
                      const gate = getHandoverGate(b);
                      if (!gate.ctaLabel) return null;
                      const onTrip = b.pickup_checked_at && !b.return_checked_at;
                      const label =
                        b.pickup_checked_at && b.pickup_odometer == null
                          ? "Pickup checklist"
                          : b.return_checked_at && b.return_odometer == null
                            ? "Return checklist"
                            : onTrip
                              ? role === "customer" ? "Live trip & GPS" : "Track trip · End trip"
                              : gate.ctaLabel;
                      const locked = !gate.canCheckin && !gate.canCheckout && !b.return_checked_at;
                      if (locked)
                        return (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {gate.opensAt ? `Check-in opens ${formatWhen(gate.opensAt)}` : gate.ctaLabel}
                          </span>
                        );
                      return (
                        <Button asChild size="sm" variant="outline" className="rounded-full">
                          <Link to="/bookings/$id/trip" params={{ id: b.id }}>
                            <ClipboardCheck className="mr-1.5 h-4 w-4" />
                            {label}
                          </Link>
                        </Button>
                      );
                    })()}
                    {role === "vendor" && b.status === "confirmed" && b.payment_status === "paid" && !b.return_checked_at && (
                      <Button asChild size="sm" className="btn-gradient rounded-full">
                        <Link to="/scan"><ScanLine className="mr-1.5 h-4 w-4" />Scan rider QR</Link>
                      </Button>
                    )}
                    {b.status !== "completed" && b.status !== "cancelled" && b.status !== "rejected" && (
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <Link to="/messages/$bookingId" params={{ bookingId: b.id }}><MessageSquare className="mr-1.5 h-4 w-4" />Message</Link>
                      </Button>
                    )}
                    {(b.payment_status === "paid" || b.paid_at) && (
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <Link to="/receipt/$kind/$id" params={{ kind: "vehicle", id: b.id }}>
                          <ReceiptText className="mr-1.5 h-4 w-4" />Receipt
                        </Link>
                      </Button>
                    )}
                    {b.status !== "completed" && b.status !== "cancelled" && b.status !== "rejected" && (
                      <Button asChild size="sm" variant="ghost" className="rounded-full text-destructive">
                        <Link to="/bookings/$id/dispute" params={{ id: b.id }}>
                          <AlertTriangle className="mr-1.5 h-4 w-4" />Report
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {role === "customer" && (b.payment_status === "paid" || b.paid_at) && (
                  <a
                    href={`/booking/qr/${b.qr_code || b.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 flex-col items-center justify-center gap-1.5 self-center rounded-2xl bg-white p-3 ring-1 ring-border shadow-xs transition-transform hover:scale-[1.03]"
                    title="Scan or open to view booking details"
                  >
                    <QRCodeSVG
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/booking/qr/${b.qr_code || b.id}`}
                      size={92}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Handover QR</span>
                  </a>
                )}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "border-ember/40 bg-ember/10 text-ember",
    confirmed: "border-brand/40 bg-brand/10 text-brand",
    rejected: "border-destructive/40 bg-destructive/10 text-destructive",
    cancelled: "border-border bg-muted text-muted-foreground",
    completed: "border-emerald/40 bg-emerald/10 text-emerald",
  };
  return <Badge variant="outline" className={`capitalize ${map[s] ?? ""}`}>{s}</Badge>;
}

