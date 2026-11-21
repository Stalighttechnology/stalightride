import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ListPager, usePage } from "@/components/list-pager";
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
import { useActiveRole } from "@/hooks/use-active-role";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  MessageSquare,
  CreditCard,
  ClipboardCheck,
  AlertTriangle,
  Wallet as WalletIcon,
  ReceiptText,
  CircleSlash,
  CarFront,
  ArrowRight,
  CheckCircle2,
  CalendarDays,
  Clock,
  ScanLine,
  Navigation,
} from "lucide-react";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/actions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/bookings/")({ component: Bookings });

function Bookings() {
  const { user } = useSession();
  const { activeRole } = useActiveRole();
  const confirm = useConfirm();
  const [asCustomer, setAsCustomer] = useState<any[] | null>(null);
  const [asVendor, setAsVendor] = useState<any[] | null>(null);
  const customerPager = usePage(10);
  const vendorPager = usePage(10);
  const [paying, setPaying] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [membershipPlan, setMembershipPlan] = useState<string>("free");
  const [now, setNow] = useState(() => Date.now());

  const routerLocation = useRouterState({ select: (s) => s.location });
  const [activeTab, setActiveTab] = useState<"customer" | "vendor">(() => {
    if (activeRole === "host") return "vendor";
    if (activeRole !== "admin") return "customer";
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t === "customer" || t === "vendor") return t;
    }
    return "customer";
  });

  useEffect(() => {
    if (activeRole === "host") {
      setActiveTab("vendor");
    } else if (activeRole !== "admin") {
      setActiveTab("customer");
    } else if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t === "customer" || t === "vendor") setActiveTab(t);
    }
  }, [routerLocation.search, activeRole]);

  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab === "customer" || tab === "vendor") setActiveTab(tab);
    };
    window.addEventListener("synchoo:tab-change", onTabChange);
    return () => window.removeEventListener("synchoo:tab-change", onTabChange);
  }, []);
  const createOrder = createRazorpayOrder;
  const verifyPayment = verifyRazorpayPayment;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const load = async () => {
    if (!user) return;
    const sel = "*, vehicles(id,title,city,address,lat,lng,vehicle_images(url,sort_order))";
    const [c, v, w, p] = await Promise.all([
      api
        .from("bookings")
        .select(sel, { count: "exact" })
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .range(customerPager.from, customerPager.to),
      api
        .from("bookings")
        .select(sel, { count: "exact" })
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false })
        .range(vendorPager.from, vendorPager.to),
      api.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      api.from("profiles").select("membership_plan").eq("id", user.id).maybeSingle(),
    ]);
    setAsCustomer(c.data ?? []);
    setAsVendor(v.data ?? []);
    customerPager.setTotal(c.count ?? 0);
    vendorPager.setTotal(v.count ?? 0);
    setWalletBalance(Number(w.data?.balance ?? 0));
    if (p.data?.membership_plan) setMembershipPlan(p.data.membership_plan);
  };
  useEffect(() => {
    load();
  }, [user?.id, customerPager.page, vendorPager.page]);

  type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
  const cancel = async (b: any) => {
    // Preview mirrors public.cancel_booking; the database computes the real refund.
    const byHost = b.vendor_id === user?.id;
    let description = "Are you sure you want to cancel this booking request?";
    if (b.payment_status === "paid") {
      const startsAt = new Date(
        `${b.start_date}T${(b.pickup_time ?? "10:00").slice(0, 5)}:00+05:30`,
      );
      const pct = refundFraction(
        (startsAt.getTime() - Date.now()) / 3_600_000,
        byHost,
        membershipPlan,
      );
      const deposit = Number(b.security_deposit ?? 0);
      const refund = round2(deposit + (Number(b.total_price) - deposit) * pct);
      description = byHost
        ? `The rider gets a full refund of ${currency(Number(b.total_price))}.`
        : `You'll get ${currency(refund)} back to your wallet (${pct * 100}% of the fare plus your deposit).`;
    }
    const ok = await confirm({
      title: "Cancel this booking?",
      description,
      confirmText: "Cancel booking",
      cancelText: "Keep booking",
      variant: "destructive",
    });
    if (!ok) return;
    const { data, error } = await api.rpc("cancel_booking", { _booking_id: b.id });
    if (error) return toast.error(error.message);
    const refund = Number((data as any)?.refund ?? 0);
    toast.success(
      refund > 0
        ? `Booking cancelled · ${currency(refund)} refunded to wallet`
        : "Booking cancelled",
    );
    load();
  };

  const setStatus = async (id: string, status: BookingStatus) => {
    if (status === "cancelled") {
      const b = [...(asCustomer ?? []), ...(asVendor ?? [])].find((x) => x.id === id);
      if (b) return cancel(b);
    }
    setAsVendor((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, status } : x)) : prev));
    setAsCustomer((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, status } : x)) : prev));
    const { error } = await api.from("bookings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(
      status === "confirmed"
        ? "Booking approved! Guest can now proceed to payment."
        : `Booking ${status}`,
    );
    load();
  };

  const payWithWallet = async (b: any) => {
    setPaying(b.id);
    try {
      const { error } = await api.rpc("wallet_pay_booking", { _booking_id: b.id });
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
        prefill: {
          email: user.email ?? undefined,
          name: user.user_metadata?.full_name ?? undefined,
        },
        onSuccess: async (resp) => {
          try {
            await verifyPayment({ data: { bookingId: b.id, ...resp } });
            toast.success("Payment successful");
            await load();
          } catch (e: any) {
            toast.error(e.message ?? "Payment verification failed");
            await load();
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
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {activeRole === "host" ? "Host trips & handovers" : "Your trips"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeRole === "host"
                ? "Track reservations on your vehicles, verify check-ins, and manage handovers."
                : "Track requests, pay securely and manage handovers."}
            </p>
          </div>
          <Link
            to="/wallet"
            className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            <WalletIcon className="h-4 w-4 text-brand" />
            {walletBalance === null ? "…" : currency(walletBalance)}
          </Link>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(val: any) => {
            setActiveTab(val);
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.set("tab", val);
              window.history.replaceState({}, "", u.toString());
            }
          }}
          className="mt-7"
        >
          {activeRole === "admin" && (
            <TabsList className="rounded-full">
              <TabsTrigger value="customer" className="rounded-full">
                As renter
              </TabsTrigger>
              <TabsTrigger value="vendor" className="rounded-full">
                As host
              </TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="customer" className="mt-5">
            <List
              items={asCustomer}
              role="customer"
              onAction={setStatus}
              onPay={payNow}
              onWalletPay={payWithWallet}
              walletBalance={walletBalance}
              paying={paying}
              now={now}
            />
            <ListPager {...customerPager} />
          </TabsContent>
          <TabsContent value="vendor" className="mt-5">
            <List
              items={asVendor}
              role="vendor"
              onAction={setStatus}
              onPay={payNow}
              onWalletPay={payWithWallet}
              walletBalance={walletBalance}
              paying={paying}
              now={now}
            />
            <ListPager {...vendorPager} />
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

function formatCountdown(target: string | Date | null | undefined, now: number) {
  if (!target) return "";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "Expired";
  const totalMins = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function Progress({ b }: { b: any }) {
  const closed = b.status === "cancelled" || b.status === "rejected";
  if (closed) {
    const isTimeout =
      b.cancellation_reason === "host_no_response" ||
      b.cancellation_reason === "payment_timeout";
    const friendlyReason =
      b.status === "rejected"
        ? "The host declined this request."
        : b.cancellation_reason === "host_no_response"
          ? "The host did not respond in time, so the request expired."
          : b.cancellation_reason === "payment_timeout"
            ? "The payment window closed before payment was completed."
            : "This booking was cancelled.";

    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CircleSlash className="h-3.5 w-3.5 shrink-0" />
          <span>{friendlyReason}</span>
        </div>
        {isTimeout && (
          <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs">
            <Link
              to="/browse"
              search={{
                city: b.vehicles?.city,
                from: b.start_date,
                to: b.end_date,
                pickupTime: b.pickup_time,
                dropoffTime: b.dropoff_time,
              }}
            >
              Find similar cars
            </Link>
          </Button>
        )}
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
          <span key={s} className={i <= active ? "text-foreground" : "text-muted-foreground/60"}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function List({
  items,
  role,
  onAction,
  onPay,
  onWalletPay,
  walletBalance,
  paying,
  now,
}: {
  items: any[] | null;
  role: "customer" | "vendor";
  onAction: (id: string, status: any) => void;
  onPay: (b: any) => void;
  onWalletPay: (b: any) => void;
  walletBalance: number | null;
  paying: string | null;
  now: number;
}) {
  const navigate = useNavigate();
  const paths = (items ?? []).map(
    (b) =>
      b.vehicles?.vehicle_images?.slice().sort((a: any, x: any) => a.sort_order - x.sort_order)[0]
        ?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  if (!items)
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-3xl" />
        ))}
      </div>
    );

  if (items.length === 0)
    return (
      <div className="animate-fade-in rounded-3xl border border-dashed border-border/70 bg-muted/20 p-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
          {role === "customer" ? (
            <CarFront className="h-5 w-5" />
          ) : (
            <ClipboardCheck className="h-5 w-5" />
          )}
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
        const img = b.vehicles?.vehicle_images
          ?.slice()
          .sort((a: any, x: any) => a.sort_order - x.sort_order)[0];
        const url = img ? urls[img.url] : null;
        const canPay =
          role === "customer" &&
          b.status === "confirmed" &&
          b.payment_status !== "paid" &&
          !b.paid_at;
        const shortBalance = (walletBalance ?? 0) < Number(b.total_price);
        const isPaid = b.payment_status === "paid" || !!b.paid_at;
        const handleCardClick = (e: React.MouseEvent) => {
          const target = e.target as HTMLElement;
          // Ignore clicks on buttons, links, inputs, and interactive controls
          if (target.closest("button, a, input, textarea, select, [role='button']")) {
            return;
          }
          if (b.vehicles?.id) {
            navigate({ to: "/vehicle/$id", params: { id: b.vehicles.id } });
          }
        };

        return (
          <li
            key={b.id}
            className="animate-fade-in"
            style={{ animationDelay: `${Math.min(idx, 6) * 60}ms` }}
          >
            <Card
              onClick={handleCardClick}
              role={b.vehicles?.id ? "link" : undefined}
              tabIndex={b.vehicles?.id ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleCardClick(e as any);
                }
              }}
              className="lift group cursor-pointer overflow-hidden rounded-3xl border-border/70 p-0 shadow-card transition-all duration-200 hover:border-brand/50 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-auto sm:w-52">
                  {url ? (
                    <img
                      src={url}
                      alt={b.vehicles?.title ?? ""}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      No photo
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to="/vehicle/$id"
                        params={{ id: b.vehicles?.id }}
                        className="font-display text-lg font-semibold hover:text-brand"
                      >
                        {b.vehicles?.title}
                      </Link>
                      {b.status === "confirmed" && (b.vehicles?.address || b.vehicles?.lat) ? (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{[b.vehicles.address, b.vehicles.city].filter(Boolean).join(", ")}</span>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              b.vehicles.lat && b.vehicles.lng
                                ? `${b.vehicles.lat},${b.vehicles.lng}`
                                : [b.vehicles.address, b.vehicles.city].filter(Boolean).join(", "),
                            )}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                          >
                            <Navigation className="h-3 w-3" /> Get directions
                          </a>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">{b.vehicles?.city}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge s={b.status} />
                      {isPaid && (
                        <Badge className="gap-1 border-transparent bg-emerald/15 text-emerald">
                          <CheckCircle2 className="h-3 w-3" />
                          Paid
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1">
                      <CalendarDays className="h-3.5 w-3.5 text-brand" />
                      {b.start_date} → {b.end_date}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1">
                      <Clock className="h-3.5 w-3.5 text-brand" />
                      {String(b.pickup_time ?? "").slice(0, 5)} →{" "}
                      {String(b.dropoff_time ?? "").slice(0, 5)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 font-semibold">
                      {currency(b.total_price)}
                    </span>
                  </div>

                  <Progress b={b} />

                  {b.status === "pending" && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {b.respond_by
                          ? `Waiting for host, responds by ${formatWhen(new Date(b.respond_by))} (${formatCountdown(b.respond_by, now)})`
                          : "Waiting for host, responds shortly"}
                      </span>
                    </div>
                  )}

                  {role === "vendor" &&
                    b.status === "confirmed" &&
                    b.payment_status !== "paid" &&
                    b.pay_by && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs text-brand">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Pay by {formatWhen(new Date(b.pay_by))} ({formatCountdown(b.pay_by, now)})
                        </span>
                      </div>
                    )}

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
                            <div className="text-xs font-semibold text-foreground">
                              Handover QR Code
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Present the QR code shown on the right to your host at pickup for fast
                              check-in verification.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/90 p-3 shadow-xs">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            2
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">
                              Pickup Inspection
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Verify odometer, fuel level, and vehicle condition before driving off.
                            </p>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 rounded-full text-xs"
                            >
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

                  {canPay && (() => {
                    const payExpired = b.pay_by ? now > new Date(b.pay_by).getTime() : false;
                    return (
                      <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs">
                            <div className="font-semibold">Host accepted — confirm with payment</div>
                            {b.pay_by && (
                              <div
                                className={`mt-0.5 flex items-center gap-1.5 font-medium ${
                                  payExpired ? "text-destructive" : "text-brand"
                                }`}
                              >
                                <Clock className="h-3.5 w-3.5" />
                                {payExpired
                                  ? `Payment window closed (Pay by ${formatWhen(new Date(b.pay_by))})`
                                  : `Pay by ${formatWhen(new Date(b.pay_by))} (${formatCountdown(b.pay_by, now)})`}
                              </div>
                            )}
                            <div className="mt-0.5 text-muted-foreground">
                              {shortBalance
                                ? "Wallet balance is short for this trip."
                                : `Wallet covers this trip · ${currency(walletBalance ?? 0)} available`}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => onWalletPay(b)}
                              disabled={paying === b.id || shortBalance || payExpired}
                              title={
                                payExpired
                                  ? "Payment window has closed"
                                  : shortBalance
                                    ? "Not enough wallet balance"
                                    : undefined
                              }
                            >
                              <WalletIcon className="mr-1.5 h-4 w-4" />
                              {paying === b.id ? "Paying…" : "Pay with wallet"}
                            </Button>
                            <Button
                              size="sm"
                              className="btn-gradient rounded-full"
                              onClick={() => onPay(b)}
                              disabled={paying === b.id || payExpired}
                              title={payExpired ? "Payment window has closed" : undefined}
                            >
                              <CreditCard className="mr-1.5 h-4 w-4" />
                              {paying === b.id ? "Opening…" : "Pay now"}
                            </Button>
                            {shortBalance && (
                              <Link to="/wallet" className="text-xs font-medium underline">
                                Add money
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {role === "vendor" &&
                    b.payment_status === "paid" &&
                    !b.earning_credited_at &&
                    Number(b.provider_earning) > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Pending earning{" "}
                        <span className="font-medium text-foreground">
                          {currency(Number(b.provider_earning))}
                        </span>{" "}
                        (after commission) — released to your wallet when the trip is completed.
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
                    {(b.status === "pending" || b.status === "confirmed") &&
                      !b.pickup_checked_at &&
                      (role === "customer" || b.status === "confirmed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => onAction(b.id, "cancelled")}
                        >
                          {role === "vendor" ? "Cancel & refund" : "Cancel"}
                        </Button>
                      )}
                    {b.status === "confirmed" &&
                      b.payment_status === "paid" &&
                      role === "vendor" &&
                      b.return_checked_at &&
                      b.return_odometer != null && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => onAction(b.id, "completed")}
                        >
                          Mark completed
                        </Button>
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
                              ? role === "customer"
                                ? "Live trip & GPS"
                                : "Track trip · End trip"
                              : gate.ctaLabel;
                      const locked = !gate.canCheckin && !gate.canCheckout && !b.return_checked_at;
                      if (locked)
                        return (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {gate.opensAt
                              ? `Check-in opens ${formatWhen(gate.opensAt)}`
                              : gate.ctaLabel}
                          </span>
                        );
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild size="sm" variant="outline" className="rounded-full">
                            <Link to="/bookings/$id/trip" params={{ id: b.id }}>
                              <ClipboardCheck className="mr-1.5 h-4 w-4" />
                              {label}
                            </Link>
                          </Button>
                          {onTrip && (
                            <Button asChild size="sm" className="btn-gradient rounded-full">
                              <Link
                                to="/bookings/$id/trip"
                                params={{ id: b.id }}
                                search={{ action: "return" } as any}
                              >
                                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                {role === "customer" ? "End ride early" : "Complete trip"}
                              </Link>
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                    {role === "vendor" &&
                      b.status === "confirmed" &&
                      b.payment_status === "paid" &&
                      !b.return_checked_at && (
                        <Button asChild size="sm" className="btn-gradient rounded-full">
                          <Link to="/scan">
                            <ScanLine className="mr-1.5 h-4 w-4" />
                            Scan rider QR
                          </Link>
                        </Button>
                      )}
                    {b.status !== "completed" &&
                      b.status !== "cancelled" &&
                      b.status !== "rejected" && (
                        <Button asChild size="sm" variant="ghost" className="rounded-full">
                          <Link to="/messages/$bookingId" params={{ bookingId: b.id }}>
                            <MessageSquare className="mr-1.5 h-4 w-4" />
                            Message
                          </Link>
                        </Button>
                      )}
                    {(b.payment_status === "paid" || b.paid_at) && (
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <Link to="/receipt/$kind/$id" params={{ kind: "vehicle", id: b.id }}>
                          <ReceiptText className="mr-1.5 h-4 w-4" />
                          Receipt
                        </Link>
                      </Button>
                    )}
                    {b.status !== "completed" &&
                      b.status !== "cancelled" &&
                      b.status !== "rejected" && (
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-destructive"
                        >
                          <Link to="/bookings/$id/dispute" params={{ id: b.id }}>
                            <AlertTriangle className="mr-1.5 h-4 w-4" />
                            Report
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
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Handover QR
                    </span>
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
  return (
    <Badge variant="outline" className={`capitalize ${map[s] ?? ""}`}>
      {s}
    </Badge>
  );
}
