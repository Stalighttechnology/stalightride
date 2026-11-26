import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Tables } from "@/lib/db-types";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { calculateDriverPrice, type DriverRateType } from "@/lib/driver-pricing";
import { ChargeLines, CouponField, type AppliedCoupon } from "@/components/charges-summary";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { ZoomBookingCalendar } from "@/components/zoom-booking-calendar";
import { MapPicker } from "@/components/map-picker";
import { toast } from "sonner";
import {
  Star,
  MapPin,
  BadgeCheck,
  Clock,
  ShieldCheck,
  Languages,
  Car,
  Compass,
  Route as RouteIcon,
  Heart,
  Building2,
} from "lucide-react";
import { useSavedDrivers } from "@/hooks/use-saved-items";
import { z } from "zod";

const driverSearch = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  rateType: z.enum(["hourly", "daily"]).optional(),
  tripType: z.string().optional(),
});

export const Route = createFileRoute("/driver/$id")({
  validateSearch: driverSearch,
  component: DriverProfile,
  head: () => ({
    meta: [
      { title: "Driver profile — Hire a verified driver | Synchoo" },
      {
        name: "description",
        content:
          "View a verified Synchoo driver's experience, languages, rating and rates, then book them by the hour or day.",
      },
      { property: "og:title", content: "Driver profile — Hire a verified driver | Synchoo" },
      {
        property: "og:description",
        content:
          "View a verified Synchoo driver's experience, languages, rating and rates, then book them.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

const TRIP_TYPES = [
  { id: "city", label: "City run" },
  { id: "outstation", label: "Outstation" },
  { id: "airport", label: "Airport transfer" },
  { id: "corporate", label: "Corporate" },
  { id: "events", label: "Events / Wedding" },
];

function DriverProfile() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const { isDriverSaved, toggleSaveDriver } = useSavedDrivers();
  const isSaved = isDriverSaved(id);

  const search = Route.useSearch();
  const [driver, setDriver] = useState<Tables<"public_drivers"> | null | undefined>(undefined);
  const [reviews, setReviews] = useState<any[] | null>(null);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [rateType, setRateType] = useState<DriverRateType>(search.rateType ?? "daily");
  const [tripType, setTripType] = useState(search.tripType ?? "city");
  const [startDate, setStartDate] = useState(search.startDate ?? today());
  const [endDate, setEndDate] = useState(search.endDate ?? search.startDate ?? today());
  const [startTime, setStartTime] = useState(search.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(search.endTime ?? "18:00");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPin, setPickupPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    if (!user) return;
    api
      .from("profiles")
      .select("membership_plan")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.membership_plan) setMembershipPlan(data.membership_plan);
      });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await api.from("public_drivers").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      setDriver(data ?? null);
      const { data: rv, count } = await api
        .from("driver_reviews")
        .select("id,rating,comment,created_at,customer_id,driver_response,driver_response_at", {
          count: "exact",
        })
        .eq("driver_id", id)
        .order("created_at", { ascending: false })
        .range(0, 9);
      if (cancelled) return;
      setReviewsTotal(count ?? 0);
      const rows = rv ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.customer_id)));
      let names: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await api
          .from("public_profiles")
          .select("id,full_name,avatar_url")
          .in("id", ids);
        names = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      setReviews(rows.map((r) => ({ ...r, profile: names[r.customer_id] })));
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadMoreReviews = async () => {
    if (!id || !reviews || loadingMoreReviews) return;
    const n = reviews.length;
    setLoadingMoreReviews(true);
    try {
      const { data: rv, count } = await api
        .from("driver_reviews")
        .select("id,rating,comment,created_at,customer_id,driver_response,driver_response_at", {
          count: "exact",
        })
        .eq("driver_id", id)
        .order("created_at", { ascending: false })
        .range(n, n + 9);
      if (count != null) setReviewsTotal(count);
      const rows = rv ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.customer_id)));
      let names: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await api
          .from("public_profiles")
          .select("id,full_name,avatar_url")
          .in("id", ids);
        names = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      const newReviews = rows.map((r) => ({ ...r, profile: names[r.customer_id] }));
      setReviews((prev) => [...(prev ?? []), ...newReviews]);
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  // Keep the customer's view of driver availability in sync in real time.
  useEffect(() => {
    const channel = api
      .channel(`public_drivers:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_drivers", filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === "DELETE") setDriver(null);
          else setDriver(payload.new as Tables<"public_drivers">);
        },
      )
      .subscribe();
    return () => {
      api.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (rateType === "hourly") setEndDate(startDate);
  }, [rateType, startDate]);

  const price = useMemo(
    () =>
      calculateDriverPrice({
        rateType,
        startDate,
        endDate,
        startTime,
        endTime,
        hourlyRate: driver?.hourly_rate,
        dailyRate: driver?.daily_rate,
      }),
    [rateType, startDate, endDate, startTime, endTime, driver],
  );

  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  // Auto-apply pending reward coupon from rewards page
  useEffect(() => {
    const pending = sessionStorage.getItem("synchoo_pending_coupon");
    if (!pending || coupon) return;
    const trimmed = pending.trim();
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
        toast.success(`Reward voucher ${trimmed} applied to your driver booking!`);
      }
    });
  }, [coupon]);

  const hire = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (price.error || price.subtotal <= 0)
      return toast.error(price.error ?? "Choose a valid duration");

    // 2h minimum notice check
    const startDateTime = new Date(`${startDate}T${startTime}:00+05:30`).getTime();
    if (startDateTime < Date.now() + 2 * 60 * 60 * 1000) {
      return toast.error("Pickup must be at least 2 hours from now");
    }

    setSubmitting(true);
    const { data: created, error } = await api
      .from("driver_bookings")
      .insert({
        driver_id: id,
        customer_id: user.id,
        rate_type: rateType,
        trip_type: tripType,
        start_date: startDate,
        end_date: rateType === "hourly" ? startDate : endDate,
        start_time: startTime,
        end_time: endTime,
        hours: price.hours,
        days: price.days,
        pickup_address: pickupAddress.trim() || null,
        pickup_lat: pickupPin.lat,
        pickup_lng: pickupPin.lng,
        notes: notes.trim() || null,
        // Money columns are recalculated by the database (tg_price_driver_booking).
        total_price: price.subtotal,
        coupon_code: coupon?.code ?? null,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error) return toast.error(error.message);

    if (billToCorporate && corporateAccount && created?.id) {
      try {
        const { data: corpTrip, error: corpErr } = await api.rpc("create_corporate_trip", {
          _company_id: corporateAccount.companyId,
          _booking_id: null,
          _driver_booking_id: created.id,
          _wash_booking_id: null,
          _service_type: "chauffeur",
          _amount: price.subtotal,
          _force_personal: false,
        });
        if (corpErr) {
          toast.error(`Corporate billing note: ${corpErr.message}`);
        } else if (corpTrip && (!corpTrip.in_policy || corpTrip.status === "pending")) {
          toast.info("Chauffeur booking submitted for corporate manager approval (2-hour approval window).");
        } else {
          toast.success("Billed to corporate account!");
        }
      } catch (corpEx: any) {
        toast.error(corpEx?.message || "Corporate billing check failed");
      }
    }

    if (coupon?.code) {
      try {
        sessionStorage.removeItem("synchoo_pending_coupon");
        const sKey = user.id ? `synchoo_rewards_${user.id}` : "synchoo_rewards_guest";
        const saved = localStorage.getItem(`${sKey}_vouchers`);
        if (saved) {
          const list = JSON.parse(saved);
          const updated = list.map((item: any) =>
            item.code.toUpperCase() === coupon.code.toUpperCase()
              ? {
                  ...item,
                  used: true,
                  usedAt: new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }),
                }
              : item,
          );
          localStorage.setItem(`${sKey}_vouchers`, JSON.stringify(updated));
        }
      } catch {}
    }

    // respond_by = deadline(created_at, start, 1 hour)
    const deadlineMs = Math.min(Date.now() + 60 * 60 * 1000, startDateTime - 60 * 60 * 1000);
    const respondByTime = new Date(deadlineMs).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
    toast.success(`Request sent — driver responds by ${respondByTime}`);
    navigate({ to: "/hires" });
  };

  if (driver === undefined) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (driver === null) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-medium">This driver is currently offline</p>
          <p className="mt-1 text-sm text-muted-foreground">
            They've paused new hires or are not accepting bookings right now. Plenty of verified
            drivers are available.
          </p>
          <Button asChild className="mt-4">
            <Link to="/drivers">See available drivers</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={driver.photo_url ?? undefined} alt={driver.full_name} />
                    <AvatarFallback className="text-xl">
                      {driver.full_name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-display text-2xl font-semibold">{driver.full_name}</h1>
                      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </Badge>
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-emerald-500/40 text-emerald-600"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Available for hire
                      </Badge>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {driver.city}
                      </span>
                      <span>
                        {driver.experience_years} yr{driver.experience_years === 1 ? "" : "s"}{" "}
                        experience
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {Number(driver.avg_rating).toFixed(1)} ({driver.review_count})
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSaveDriver(driver.id, driver.full_name)}
                    className={`transition-all duration-200 ${
                      isSaved
                        ? "border-rose-300 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400"
                        : "hover:border-rose-300 hover:text-rose-500"
                    }`}
                  >
                    <Heart
                      className={`mr-2 h-4 w-4 transition-transform duration-200 ${
                        isSaved ? "fill-rose-500 text-rose-500 scale-110" : ""
                      }`}
                    />
                    {isSaved ? "Saved" : "Save"}
                  </Button>
                </div>

                {driver.bio && <p className="mt-4 whitespace-pre-line text-sm">{driver.bio}</p>}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <InfoRow
                    icon={Languages}
                    label="Languages"
                    value={(driver.languages ?? []).join(", ") || "—"}
                  />
                  <InfoRow
                    icon={Car}
                    label="Drives"
                    value={(driver.vehicle_types ?? []).join(", ") || "—"}
                  />
                  {driver.service_area && (
                    <InfoRow icon={Compass} label="Service area" value={driver.service_area} />
                  )}
                  {Array.isArray(driver.trip_types) && driver.trip_types.length > 0 && (
                    <InfoRow
                      icon={RouteIcon}
                      label="Trip types"
                      value={driver.trip_types.join(", ")}
                    />
                  )}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Driving licence and identity documents verified by the Synchoo team before this
                  profile went live.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="font-display text-lg font-semibold">Reviews</h2>
                {!reviews && <Skeleton className="mt-4 h-24" />}
                {reviews && reviews.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>
                )}
                <ul className="mt-4 space-y-4">
                  {(reviews ?? []).map((r) => (
                    <li key={r.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(r.profile?.full_name ?? "U").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {r.profile?.full_name ?? "Rider"}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                            />
                          ))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {r.comment && <p className="mt-1.5 text-sm">{r.comment}</p>}
                      {r.driver_response && (
                        <div className="mt-2 rounded-md bg-muted p-2 text-xs">
                          <span className="font-medium">Driver replied:</span> {r.driver_response}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {reviews && reviews.length < reviewsTotal && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMoreReviews}
                      disabled={loadingMoreReviews}
                    >
                      {loadingMoreReviews ? "Loading reviews…" : "Show more reviews"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="lg:sticky lg:top-20">
              <CardContent className="p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-semibold">
                    {currency(driver.daily_rate)}
                    <span className="text-sm font-normal text-muted-foreground">/day</span>
                  </p>
                  {Number(driver.hourly_rate) > 0 && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {currency(driver.hourly_rate)}/hr
                    </p>
                  )}
                </div>

                <Tabs
                  value={rateType}
                  onValueChange={(v) => setRateType(v as DriverRateType)}
                  className="mt-4"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="daily">By day</TabsTrigger>
                    <TabsTrigger value="hourly" disabled={!(Number(driver.hourly_rate) > 0)}>
                      By hour
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="mt-4 space-y-3">
                  <div>
                    <Label className="text-xs">Trip type</Label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {TRIP_TYPES.map((t) => (
                        <Button
                          key={t.id}
                          type="button"
                          size="sm"
                          variant={tripType === t.id ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setTripType(t.id)}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1">
                    <ZoomBookingCalendar
                      startDate={startDate}
                      endDate={rateType === "hourly" ? startDate : endDate}
                      startTime={startTime}
                      endTime={endTime}
                      onStartDateChange={setStartDate}
                      onEndDateChange={(d) => {
                        if (rateType !== "hourly") setEndDate(d);
                      }}
                      onStartTimeChange={setStartTime}
                      onEndTimeChange={setEndTime}
                      singleDateMode={rateType === "hourly"}
                      startTimeLabel="Start Time"
                      endTimeLabel="End Time"
                      itemTitle={`Hire ${driver.full_name}`}
                      itemSubtitle={`${driver.city} · ${rateType === "hourly" ? "Hourly Service" : "Daily Service"}`}
                      continueButtonLabel="CONFIRM SCHEDULE"
                      onContinue={() => {
                        document.getElementById("driver-pickup-address")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    />
                  </div>
                  <div id="driver-pickup-address">
                    <Label className="text-xs">Pickup address</Label>
                    <MapPicker
                      value={pickupPin}
                      address={pickupAddress}
                      onChange={(v) => {
                        setPickupPin({ lat: v.lat, lng: v.lng });
                        if (v.address) setPickupAddress(v.address);
                      }}
                      onAddressChange={setPickupAddress}
                      mapHeight="h-48"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Trip details, vehicle type, luggage…"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
                  {price.error ? (
                    <p className="text-xs text-destructive">{price.error}</p>
                  ) : (
                    <>
                      {price.lines.map((l) => (
                        <div key={l.label} className="flex justify-between text-muted-foreground">
                          <span>{l.label}</span>
                          <span>{currency(l.value)}</span>
                        </div>
                      ))}
                      <ChargeLines
                        base={price.subtotal}
                        coupon={coupon}
                        totalLabel="Total"
                        membershipPlan={membershipPlan}
                      />
                      <div className="pt-2">
                        <CouponField value={coupon} onChange={setCoupon} service="driver" />
                      </div>
                    </>
                  )}
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

                <Button
                  className="mt-4 w-full"
                  disabled={submitting || !!price.error}
                  onClick={hire}
                >
                  {!user
                    ? "Sign in to hire"
                    : submitting
                      ? "Sending request…"
                      : "Request this driver"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  No charge until the driver accepts your request.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
