import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Star, MapPin, BadgeCheck, Clock, ShieldCheck, Languages, Car } from "lucide-react";

export const Route = createFileRoute("/driver/$id")({
  component: DriverProfile,
  head: () => ({
    meta: [
      { title: "Driver profile — Hire a verified driver | Synchoo" },
      { name: "description", content: "View a verified Synchoo driver's experience, languages, rating and rates, then book them by the hour or day." },
      { property: "og:title", content: "Driver profile — Hire a verified driver | Synchoo" },
      { property: "og:description", content: "View a verified Synchoo driver's experience, languages, rating and rates, then book them." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

function DriverProfile() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();

  const [driver, setDriver] = useState<any | null | undefined>(undefined);
  const [reviews, setReviews] = useState<any[] | null>(null);
  const [rateType, setRateType] = useState<DriverRateType>("daily");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [pickupAddress, setPickupAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("public_drivers").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      setDriver(data ?? null);
      const { data: rv } = await supabase
        .from("driver_reviews")
        .select("id,rating,comment,created_at,customer_id,driver_response,driver_response_at")
        .eq("driver_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      const ids = Array.from(new Set((rv ?? []).map((r) => r.customer_id)));
      let names: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("public_profiles").select("id,full_name,avatar_url").in("id", ids);
        names = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      setReviews((rv ?? []).map((r) => ({ ...r, profile: names[r.customer_id] })));
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Keep the customer's view of driver availability in sync in real time.
  useEffect(() => {
    const channel = supabase
      .channel(`public_drivers:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "public_drivers", filter: `id=eq.${id}` }, (payload) => {
        if (payload.eventType === "DELETE") setDriver(null);
        else setDriver(payload.new as any);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  const hire = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (price.error || price.subtotal <= 0) return toast.error(price.error ?? "Choose a valid duration");
    setSubmitting(true);
    const { error } = await supabase.from("driver_bookings").insert({
      driver_id: id,
      customer_id: user.id,
      rate_type: rateType,
      start_date: startDate,
      end_date: rateType === "hourly" ? startDate : endDate,
      start_time: startTime,
      end_time: endTime,
      hours: price.hours,
      days: price.days,
      pickup_address: pickupAddress || null,
      notes: notes || null,
      // Money columns are recalculated by the database (tg_price_driver_booking).
      total_price: price.subtotal,
      coupon_code: coupon?.code ?? null,
    } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent — you'll pay once the driver accepts");
    navigate({ to: "/hires" });
  };

  if (driver === undefined) {
    return (
      <div className="min-h-screen"><SiteHeader />
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><Skeleton className="h-64 rounded-2xl" /></div>
      </div>
    );
  }
  if (driver === null) {
    return (
      <div className="min-h-screen"><SiteHeader />
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-medium">This driver is currently offline</p>
          <p className="mt-1 text-sm text-muted-foreground">
            They've paused new hires or are not accepting bookings right now. Plenty of verified drivers are available.
          </p>
          <Button asChild className="mt-4"><Link to="/drivers">See available drivers</Link></Button>
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
            <Card><CardContent className="p-6">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={driver.photo_url ?? undefined} alt={driver.full_name} />
                  <AvatarFallback className="text-xl">{driver.full_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl font-semibold">{driver.full_name}</h1>
                    <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
                      <BadgeCheck className="h-3 w-3" />Verified
                    </Badge>
                    <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Available for hire
                    </Badge>

                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{driver.city}</span>
                    <span>{driver.experience_years} yr{driver.experience_years === 1 ? "" : "s"} experience</span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {Number(driver.avg_rating).toFixed(1)} ({driver.review_count})
                    </span>
                  </p>
                </div>
              </div>

              {driver.bio && <p className="mt-4 whitespace-pre-line text-sm">{driver.bio}</p>}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoRow icon={Languages} label="Languages" value={(driver.languages ?? []).join(", ") || "—"} />
                <InfoRow icon={Car} label="Drives" value={(driver.vehicle_types ?? []).join(", ") || "—"} />
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Driving licence and identity documents verified by the Synchoo team before this profile went live.
              </div>
            </CardContent></Card>

            <Card><CardContent className="p-6">
              <h2 className="font-display text-lg font-semibold">Reviews</h2>
              {!reviews && <Skeleton className="mt-4 h-24" />}
              {reviews && reviews.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>}
              <ul className="mt-4 space-y-4">
                {(reviews ?? []).map((r) => (
                  <li key={r.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={r.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{(r.profile?.full_name ?? "U").charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{r.profile?.full_name ?? "Rider"}</span>
                      <span className="flex items-center gap-0.5 text-xs">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
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
            </CardContent></Card>
          </div>

          <div>
            <Card className="lg:sticky lg:top-20"><CardContent className="p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xl font-semibold">{currency(driver.daily_rate)}<span className="text-sm font-normal text-muted-foreground">/day</span></p>
                {Number(driver.hourly_rate) > 0 && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" />{currency(driver.hourly_rate)}/hr</p>
                )}
              </div>

              <Tabs value={rateType} onValueChange={(v) => setRateType(v as DriverRateType)} className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="daily">By day</TabsTrigger>
                  <TabsTrigger value="hourly" disabled={!(Number(driver.hourly_rate) > 0)}>By hour</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Start date</Label>
                    <Input type="date" min={today()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">End date</Label>
                    <Input type="date" min={startDate} value={rateType === "hourly" ? startDate : endDate} disabled={rateType === "hourly"} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Start time</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">End time</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Pickup address</Label>
                  <Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Where should the driver report?" />
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Trip details, vehicle type, luggage…" />
                </div>
              </div>

              <div className="mt-4 space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
                {price.error ? (
                  <p className="text-xs text-destructive">{price.error}</p>
                ) : (
                  <>
                    {price.lines.map((l) => (
                      <div key={l.label} className="flex justify-between text-muted-foreground">
                        <span>{l.label}</span><span>{currency(l.value)}</span>
                      </div>
                    ))}
                    <ChargeLines base={price.subtotal} coupon={coupon} totalLabel="Total" />
                    <div className="pt-2"><CouponField value={coupon} onChange={setCoupon} /></div>
                  </>
                )}
              </div>

              <Button className="mt-4 w-full" disabled={submitting || !!price.error} onClick={hire}>
                {!user ? "Sign in to hire" : submitting ? "Sending request…" : "Request this driver"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                No charge until the driver accepts your request.
              </p>
            </CardContent></Card>
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
