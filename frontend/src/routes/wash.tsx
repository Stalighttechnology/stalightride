import { CityPicker } from "@/components/city-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { ChargeLines, CouponField, type AppliedCoupon } from "@/components/charges-summary";
import { useSelectedCity } from "@/components/city-selector";
import { toast } from "sonner";
import { Droplets, Clock, ShieldCheck, MapPin, CalendarClock, Sparkles, Wallet as WalletIcon, CreditCard, Building2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { z } from "zod";
import { MapPicker } from "@/components/map-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createWashRazorpayOrder, verifyWashRazorpayPayment } from "@/lib/actions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

const searchSchema = z.object({
  city: z.string().optional(),
  date: z.string().optional(),
  slot: z.string().optional(),
  coupon: z.string().optional(),
});

export const Route = createFileRoute("/wash")({
  validateSearch: searchSchema,
  component: WashPage,
  head: () => ({
    meta: [
      { title: "Vehicle wash & detailing at your doorstep — Synchoo" },
      {
        name: "description",
        content:
          "Book a doorstep bike, scooter, car or EV wash slot in minutes. Our team confirms a washer partner for your slot, then you pay by wallet or card.",
      },
      { property: "og:title", content: "Vehicle wash & detailing — Synchoo" },
      {
        property: "og:description",
        content: "Doorstep vehicle wash slots, confirmed by our team before you pay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

const CATEGORY_LABEL: Record<string, string> = {
  bike: "Bike",
  motorcycle: "Motorcycle",
  scooter: "Scooter",
  car: "Car",
  ev: "Electric",
};

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function WashPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { city: selectedCity } = useSelectedCity();
  const [services, setServices] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [membershipPlan, setMembershipPlan] = useState<string>("free");
  const [corporateAccount, setCorporateAccount] = useState<{ companyId: string; companyName: string } | null>(null);
  const [billToCorporate, setBillToCorporate] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setCorporateAccount(null);
      setBillToCorporate(false);
      return;
    }
    api
      .from("company_members")
      .select("company_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .then(async ({ data: mems }) => {
        if (mems && mems.length > 0) {
          const { data: comp } = await api
            .from("companies")
            .select("id, name, status")
            .eq("id", mems[0].company_id)
            .single();
          if (comp && comp.status === "active") {
            setCorporateAccount({ companyId: comp.id, companyName: comp.name });
          }
        }
      });
  }, [user?.id]);
  const [freeWashApplied, setFreeWashApplied] = useState<boolean>(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    id: string;
    price: number;
    name: string;
  } | null>(null);
  const [form, setForm] = useState({
    city: search.city ?? "",
    address: "",
    lat: null as number | null,
    lng: null as number | null,
    vehicle_label: "",
    slot_date: search.date ?? todayISO(),
    slot_time: search.slot ?? "10:00",
    notes: "",
  });

  useEffect(() => {
    if (search.city || search.date || search.slot) {
      setForm((f) => ({
        ...f,
        ...(search.city ? { city: search.city } : {}),
        ...(search.date ? { slot_date: search.date } : {}),
        ...(search.slot ? { slot_time: search.slot } : {}),
      }));
    }
  }, [search.city, search.date, search.slot]);

  // Prefill the city from the top-bar city selector, then from the saved profile city.
  useEffect(() => {
    if (selectedCity) setForm((f) => (f.city ? f : { ...f, city: selectedCity }));
  }, [selectedCity]);

  // Auto-apply voucher from search params or session storage
  useEffect(() => {
    const voucherParam = search.coupon || sessionStorage.getItem("synchoo_pending_wash_coupon");
    if (!voucherParam) return;
    const trimmed = voucherParam.trim();
    api.rpc("validate_coupon", { _code: trimmed }).then(({ data, error }) => {
      const res = data as {
        valid?: boolean;
        code?: string;
        percent_off?: number | null;
        amount_off?: number | null;
      } | null;
      if (!error && res?.valid) {
        setCoupon({
          code: res.code ?? trimmed.toUpperCase(),
          percent_off: res.percent_off ?? null,
          amount_off: res.amount_off ?? null,
        });
        toast.success(`Reward voucher ${trimmed} applied! Free foam wash unlocked.`);
      }
    });
  }, [search.coupon]);

  useEffect(() => {
    if (!user) return;
    api
      .from("profiles")
      .select("city,membership_plan")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.city) setForm((f) => (f.city ? f : { ...f, city: data.city as string }));
        if (data?.membership_plan) setMembershipPlan(data.membership_plan as string);
      });
  }, [user]);

  useEffect(() => {
    api
      .from("wash_services")
      .select("id,name,description,vehicle_category,price,duration_minutes,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        const list = data ?? [];
        setServices(list);
        if (list.length > 0) {
          const hasVoucher = Boolean(search.coupon || sessionStorage.getItem("synchoo_pending_wash_coupon"));
          const target = hasVoucher
            ? list.find((s) => s.vehicle_category === "car" && s.name.toLowerCase().includes("express")) ||
              list.find((s) => s.vehicle_category === "car") ||
              list[0]
            : list[0];
          setSelected((prev) => prev ?? target.id);
        }
      });
  }, [search.coupon]);

  const service = useMemo(
    () => (services ?? []).find((s) => s.id === selected) ?? null,
    [services, selected],
  );

  useEffect(() => {
    if (!user) return;
    api
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setWalletBalance(Number(data.balance) || 0);
      });
  }, [user]);

  const payWallet = async (bookingId: string) => {
    setPaying(true);
    const { error } = await api.rpc("wallet_pay_wash_booking", { _wash_booking_id: bookingId } as any);
    setPaying(false);
    if (error) return toast.error(error.message);
    toast.success("Paid successfully from wallet! Finding a nearby washer partner.");
    navigate({ to: "/washes" });
  };

  const payCard = async (bookingId: string, serviceName: string) => {
    if (!user) return;
    setPaying(true);
    try {
      const order = await createWashRazorpayOrder({ data: { washBookingId: bookingId } });
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        orderId: order.orderId,
        name: "Synchoo",
        description: serviceName,
        prefill: {
          email: user.email ?? undefined,
          name: user.user_metadata?.full_name ?? undefined,
        },
        onSuccess: async (resp) => {
          try {
            await verifyWashRazorpayPayment({ data: { washBookingId: bookingId, ...resp } });
            toast.success("Payment successful! Finding a nearby washer partner.");
            navigate({ to: "/washes" });
          } catch (e: any) {
            toast.error(e.message ?? "Payment verification failed");
          }
        },
        onDismiss: () => setPaying(false),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not start card payment");
    } finally {
      setPaying(false);
    }
  };

  const submit = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (!service) return toast.error("Choose a wash package");
    if (!form.city.trim() || !form.address.trim()) return toast.error("Add your city and address");
    if (form.lat == null || form.lng == null) return toast.error("Please pin your exact address on the map");
    if (!form.slot_date || !form.slot_time) return toast.error("Pick a slot date and time");

    const timePart = form.slot_time.length === 5 ? `${form.slot_time}:00` : form.slot_time;
    const slotStart = new Date(`${form.slot_date}T${timePart}+05:30`);
    if (slotStart.getTime() < Date.now() + 2 * 3600 * 1000) {
      return toast.error("Slot must be at least 2 hours in the future");
    }

    setSaving(true);
    const { data: created, error } = await api.from("wash_bookings").insert({
      customer_id: user.id,
      service_id: service.id,
      city: form.city.trim(),
      address: form.address.trim(),
      lat: form.lat,
      lng: form.lng,
      vehicle_label: form.vehicle_label.trim() || null,
      slot_date: form.slot_date,
      slot_time: form.slot_time,
      notes: form.notes.trim() || null,
      // Money columns are recalculated by the database (tg_price_wash_booking).
      price: service.price,
      coupon_code: coupon?.code ?? null,
    } as any).select("id, price").single();
    setSaving(false);
    if (error) return toast.error(error.message);

    // Mark claimed voucher as used in rewards storage
    if (coupon?.code) {
      try {
        const sKey = user.id ? `synchoo_rewards_${user.id}` : "synchoo_rewards_guest";
        const saved = localStorage.getItem(`${sKey}_vouchers`);
        if (saved) {
          const list = JSON.parse(saved);
          const updated = list.map((v: any) =>
            v.code.toUpperCase() === coupon.code.toUpperCase()
              ? {
                  ...v,
                  used: true,
                  usedAt: new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }),
                }
              : v,
          );
          localStorage.setItem(`${sKey}_vouchers`, JSON.stringify(updated));
        }
        sessionStorage.removeItem("synchoo_pending_wash_coupon");
      } catch {}
    }

    if (billToCorporate && corporateAccount && created?.id) {
      try {
        const { data: corpTrip, error: corpErr } = await api.rpc("create_corporate_trip", {
          _company_id: corporateAccount.companyId,
          _booking_id: null,
          _driver_booking_id: null,
          _wash_booking_id: created.id,
          _service_type: "wash",
          _amount: created.price || service.price,
          _force_personal: false,
        });
        if (corpErr) {
          toast.error(`Corporate billing note: ${corpErr.message}`);
        } else if (corpTrip && (!corpTrip.in_policy || corpTrip.status === "pending")) {
          toast.info("Doorstep wash booking submitted for corporate manager approval (2-hour approval window).");
        } else {
          toast.success("Billed to corporate account!");
        }
      } catch (corpEx: any) {
        toast.error(corpEx?.message || "Corporate billing check failed");
      }
      navigate({ to: "/washes" });
      return;
    }

    const isFree = coupon && (coupon.percent_off === 100 || Number(service.price) <= Number(coupon.amount_off ?? 0));
    if (isFree || Number(created?.price ?? service.price) <= 0) {
      toast.success("Free wash booked successfully with your reward voucher!");
      navigate({ to: "/washes" });
      return;
    }

    toast.success("Wash slot reserved! Please complete payment to notify nearby washers.");
    setPendingPayment({
      id: created.id,
      price: Number(created.price ?? service.price),
      name: service.name,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-border bg-muted/40">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <Badge variant="outline" className="mb-3 gap-1.5">
            <Droplets className="h-3.5 w-3.5" /> Doorstep service
          </Badge>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Vehicle wash & detailing
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pick a package and a slot. Pay now; we'll assign a nearby washer and notify you.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: CalendarClock,
                t: "1. Choose package & slot",
                d: "Choose package, date, time and pin your address.",
              },
              {
                icon: ShieldCheck,
                t: "2. Pay now",
                d: "Pay securely by wallet or card (15 min payment window).",
              },
              {
                icon: Droplets,
                t: "3. Nearby washer assigned",
                d: "A verified partner claims your slot and arrives at your door.",
              },
            ].map((s) => (
              <div key={s.t} className="rounded-2xl border border-border bg-card p-4">
                <s.icon className="h-5 w-5 text-primary" />
                <p className="mt-2 text-sm font-medium">{s.t}</p>
                <p className="text-xs text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Choose a package</h2>
          {!services && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          )}
          {services && services.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No wash packages are available right now.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(services ?? []).map((s) => {
              const active = selected === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={active}
                  className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
                    active ? "border-primary ring-2 ring-primary/30" : "border-border"
                  } bg-card`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.name}</p>
                    <Badge variant="secondary">
                      {CATEGORY_LABEL[s.vehicle_category] ?? s.vehicle_category}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-semibold">{currency(s.price)}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {s.duration_minutes} min
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-semibold">Book your slot</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {service
                ? `${service.name} · ${currency(service.price)}`
                : "Select a package to continue"}
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wash-city">City</Label>
                <CityPicker
                  id="wash-city"
                  value={form.city}
                  onChange={(c) => setForm({ ...form, city: c })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Address where we should come</Label>
                <MapPicker
                  value={{ lat: form.lat, lng: form.lng }}
                  address={form.address}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, lat: v.lat, lng: v.lng, address: v.address ?? f.address }))
                  }
                  onAddressChange={(address) => setForm((f) => ({ ...f, address }))}
                  mapHeight="h-48"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wash-vehicle">Vehicle (optional)</Label>
                <Input
                  id="wash-vehicle"
                  value={form.vehicle_label}
                  onChange={(e) => setForm({ ...form, vehicle_label: e.target.value })}
                  placeholder="Hyundai i20 · KA01AB1234"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Wash date</Label>
                  <DatePicker
                    value={form.slot_date}
                    onChange={(d) => setForm((prev) => ({ ...prev, slot_date: d }))}
                    minDate={new Date()}
                    placeholder="Select wash date"
                    className="h-9 rounded-xl text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Wash slot time</Label>
                  <TimePicker
                    value={form.slot_time}
                    onChange={(t) => setForm((prev) => ({ ...prev, slot_time: t }))}
                    slots={SLOTS}
                    className="h-9 rounded-xl text-xs"
                  />
                </div>
              </div>
              <div className="grid gap-1.5 pt-2">
                <Label htmlFor="wash-notes">Notes (optional)</Label>
                <Textarea
                  id="wash-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Flat / building, parking level, gate code, pet hair, etc."
                />
              </div>
            </div>

            {service && (
              <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                {(membershipPlan === "plus" || membershipPlan === "black") && (
                  <div className="mb-3 rounded-lg border border-brand/40 bg-brand/10 p-3 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 text-brand shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {membershipPlan === "black" ? "Black VIP Perk" : "Synchoo Plus Perk"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {membershipPlan === "black"
                            ? "3 free doorstep detailing washes per month included"
                            : "1 free doorstep foam wash every month included"}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={freeWashApplied ? "secondary" : "default"}
                      className="shrink-0 text-xs h-7 px-2.5"
                      onClick={() => {
                        const next = !freeWashApplied;
                        setFreeWashApplied(next);
                        if (next) {
                          setCoupon({ code: "MEMBERSHIP_FREE_WASH", percent_off: 100, amount_off: null });
                        } else if (coupon?.code === "MEMBERSHIP_FREE_WASH") {
                          setCoupon(null);
                        }
                      }}
                    >
                      {freeWashApplied ? "Perk Applied" : "Apply Free Wash"}
                    </Button>
                  </div>
                )}
                {coupon && coupon.code !== "MEMBERSHIP_FREE_WASH" && (
                  <div className="mb-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 text-brand shrink-0" />
                      <div>
                        <p className="font-semibold text-brand flex items-center gap-1.5">
                          <span>Reward Voucher Applied:</span>
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-brand/20">{coupon.code}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {coupon.code.startsWith("SYN-WASH")
                            ? "Free Doorstep Pressure Foam Wash (100% off)"
                            : coupon.percent_off != null
                              ? `${coupon.percent_off}% discount applied`
                              : `₹${coupon.amount_off} discount applied`}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setCoupon(null)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>{service.name}</span>
                  <span className="tabular-nums">{currency(service.price)}</span>
                </div>
                <div className="mt-1.5">
                  <ChargeLines
                    base={Number(service.price)}
                    coupon={coupon}
                    membershipPlan={membershipPlan}
                  />
                </div>
                {!freeWashApplied && (
                  <div className="mt-3">
                    <CouponField value={coupon} onChange={setCoupon} service="wash" />
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              <MapPin className="mb-1 h-3.5 w-3.5" />
              {coupon && (coupon.percent_off === 100 || Number(service?.price ?? 0) <= Number(coupon.amount_off ?? 0))
                ? "Free wash voucher applied! Total payable is ₹0. No payment required."
                : "Pay now; we'll assign a nearby washer and notify you. If no washer claims before your slot, you receive a full refund to your wallet."}
            </div>

            {user && corporateAccount && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">Corporate Mobility</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    {corporateAccount.companyName}
                  </Badge>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={billToCorporate}
                    onChange={(e) => setBillToCorporate(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Bill to corporate account (subject to policy)</span>
                </label>
              </div>
            )}

            {user ? (
              <Button className="mt-4 w-full" disabled={saving || !service} onClick={submit}>
                {saving
                  ? "Booking…"
                  : coupon && (coupon.percent_off === 100 || Number(service?.price ?? 0) <= Number(coupon.amount_off ?? 0))
                    ? "Book Free Wash with Voucher"
                    : "Book and pay now"}
              </Button>
            ) : (
              <Button asChild className="mt-4 w-full">
                <Link to="/auth">Sign in to book a wash</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Immediate Payment Dialog */}
      <Dialog
        open={Boolean(pendingPayment)}
        onOpenChange={(open) => {
          if (!open && !paying) {
            setPendingPayment(null);
            navigate({ to: "/washes" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete wash payment</DialogTitle>
            <DialogDescription>
              Pay {pendingPayment ? currency(pendingPayment.price) : ""} to confirm your slot and dispatch to nearby washer partners.
            </DialogDescription>
          </DialogHeader>

          {pendingPayment && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="font-semibold text-sm">{pendingPayment.name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Payable amount:</span>
                  <span className="font-bold text-foreground text-sm">{currency(pendingPayment.price)}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled={paying || walletBalance === null || walletBalance < pendingPayment.price}
                  onClick={() => payWallet(pendingPayment.id)}
                >
                  <WalletIcon className="mr-2 h-4 w-4 text-emerald-600" />
                  <span>Pay with Wallet {walletBalance !== null ? `(Balance: ${currency(walletBalance)})` : ""}</span>
                </Button>
                {walletBalance !== null && walletBalance < pendingPayment.price && (
                  <p className="text-[11px] text-muted-foreground px-1">
                    Insufficient wallet balance. Top up or pay with Card/UPI.
                  </p>
                )}

                <Button
                  className="w-full justify-start"
                  disabled={paying}
                  onClick={() => payCard(pendingPayment.id, pendingPayment.name)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Pay via Card / UPI (Razorpay)</span>
                </Button>
              </div>

              <div className="pt-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  disabled={paying}
                  onClick={() => {
                    setPendingPayment(null);
                    navigate({ to: "/washes" });
                  }}
                >
                  Pay later from My Washes (within 15 minutes)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
