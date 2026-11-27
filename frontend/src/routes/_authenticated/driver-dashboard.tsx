import { CityPicker } from "@/components/city-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { usePage, ListPager } from "@/components/list-pager";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Upload,
  IndianRupee,
  CalendarCheck,
  Star,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Camera,
  Eye,
  Check,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/driver-dashboard")({
  component: DriverDashboard,
  head: () => ({
    meta: [
      { title: "Driver dashboard — Synchoo" },
      {
        name: "description",
        content:
          "Manage your driver profile, licence verification, hire requests and earnings on Synchoo.",
      },
      { property: "og:title", content: "Driver dashboard — Synchoo" },
      {
        property: "og:description",
        content: "Manage your driver profile, verification, hire requests and earnings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TRIP_TYPE_OPTIONS = ["outstation", "airport", "corporate", "events"] as const;

const emptyDriver = {
  full_name: "",
  phone: "",
  city: "",
  bio: "",
  experience_years: 0,
  languages: [] as string[],
  vehicle_types: [] as string[],
  photo_url: "",
  hourly_rate: 0,
  daily_rate: 0,
  dl_number: "",
  dl_expiry: "",
  dl_front_url: null as string | null,
  dl_back_url: null as string | null,
  id_document_url: null as string | null,
  trip_types: [] as string[],
  service_area: "",
};

function formatTimeLeft(target: string | Date | null | undefined, now: number) {
  if (!target) return "";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "Expired";
  const totalMins = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function DriverDashboard() {
  const { user } = useSession();
  const confirm = useConfirm();
  const [driver, setDriver] = useState<any>(null);
  const [stats, setStats] = useState<{
    total: number;
    pending_count: number;
    upcoming_count: number;
    earnings: number;
  } | null>(null);
  const [form, setForm] = useState<any>(emptyDriver);
  const [hires, setHires] = useState<any[] | null>(null);
  const [pendingHires, setPendingHires] = useState<any[]>([]);
  const [upcomingHires, setUpcomingHires] = useState<any[]>([]);
  const [historyHires, setHistoryHires] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);

  const routerLocation = useRouterState({ select: (s) => s.location });
  const driverTabs = ["upcoming", "history", "ratings"] as const;
  type DriverTab = (typeof driverTabs)[number];

  const [activeTab, setActiveTab] = useState<DriverTab>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as DriverTab;
      if (t && driverTabs.includes(t)) return t;
    }
    return "upcoming";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as DriverTab;
      if (t && driverTabs.includes(t)) setActiveTab(t);
    }
  }, [routerLocation.search]);

  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as DriverTab;
      if (tab && driverTabs.includes(tab)) setActiveTab(tab);
    };
    window.addEventListener("synchoo:tab-change", onTabChange);
    return () => window.removeEventListener("synchoo:tab-change", onTabChange);
  }, []);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);

  const historyPager = usePage(10);
  const ratingsPager = usePage(10);

  const submitDriverReply = async (reviewId: string) => {
    if (!replyText.trim()) {
      toast.error("Please enter a reply");
      return;
    }
    setSavingReply(true);
    try {
      const now = new Date().toISOString();
      const { error } = await api
        .from("driver_reviews")
        .update({
          driver_response: replyText.trim(),
          driver_response_at: now,
        })
        .eq("id", reviewId);

      if (error) {
        toast.error(error.message);
        return;
      }

      setRatings((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, driver_response: replyText.trim(), driver_response_at: now }
            : r,
        ),
      );
      toast.success("Reply saved successfully!");
      setReplyingReviewId(null);
      setReplyText("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save reply");
    } finally {
      setSavingReply(false);
    }
  };

  const loadStats = async () => {
    if (!user) return;
    const { data } = await api.rpc("driver_dashboard_stats");
    if (data) setStats(data as any);
  };

  const loadDriver = async () => {
    if (!user) return;
    const { data: d } = await api.from("drivers").select("*").eq("id", user.id).maybeSingle();
    setDriver(d ?? null);
    if (d)
      setForm({
        ...emptyDriver,
        ...d,
        dl_expiry: d.dl_expiry ?? "",
        trip_types: d.trip_types ?? [],
        service_area: d.service_area ?? "",
      });
    else setForm({ ...emptyDriver, full_name: user.user_metadata?.full_name ?? "" });
  };

  const loadPendingHires = async () => {
    if (!user) return;
    const { data } = await api
      .from("driver_bookings")
      .select("*")
      .eq("driver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    setPendingHires(data ?? []);
  };

  const loadUpcomingHires = async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await api
      .from("driver_bookings")
      .select("*")
      .eq("driver_id", user.id)
      .eq("status", "confirmed")
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(100);
    setUpcomingHires(data ?? []);
  };

  const loadHistoryHires = async () => {
    if (!user) return;
    const { data, count } = await api
      .from("driver_bookings")
      .select("*", { count: "exact" })
      .eq("driver_id", user.id)
      .in("status", ["completed", "cancelled", "rejected"])
      .order("start_date", { ascending: false })
      .range(historyPager.from, historyPager.to);
    setHistoryHires(data ?? []);
    historyPager.setTotal(count ?? 0);
  };

  const loadRatings = async () => {
    if (!user) return;
    const { data, count } = await api
      .from("driver_reviews")
      .select("*", { count: "exact" })
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false })
      .range(ratingsPager.from, ratingsPager.to);
    setRatings(data ?? []);
    ratingsPager.setTotal(count ?? 0);
  };

  const load = async () => {
    if (!user) return;
    await Promise.all([
      loadDriver(),
      loadStats(),
      loadPendingHires(),
      loadUpcomingHires(),
      loadHistoryHires(),
      loadRatings(),
    ]);
    setHires([]);
    setLoaded(true);
  };

  useEffect(() => {
    if (user?.id) {
      loadDriver();
      loadStats();
      loadPendingHires();
      loadUpcomingHires();
      setHires([]);
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadHistoryHires();
  }, [user?.id, historyPager.page]);

  useEffect(() => {
    if (user?.id) loadRatings();
  }, [user?.id, ratingsPager.page]);

  const docUrls = useSignedUrls("verification-docs", [
    form.dl_front_url,
    form.dl_back_url,
    form.id_document_url,
  ]);

  const uploadDoc = async (kind: "dl-front" | "dl-back" | "id", file: File) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/driver-${kind}-${Date.now()}.${ext}`;
    const { error } = await api.storage
      .from("verification-docs")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return path;
  };

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/driver-photo-${Date.now()}.${ext}`;
    const { error } = await api.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = await api.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (data?.signedUrl) setForm((f: any) => ({ ...f, photo_url: data.signedUrl }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.full_name.trim() || !form.city.trim())
      return toast.error("Name and city are required");
    if (!form.phone?.trim()) return toast.error("Phone number is required");
    if (form.experience_years === "" || Number(form.experience_years) < 0)
      return toast.error("Years of experience is required");
    if (Number(form.hourly_rate) <= 0) return toast.error("Set an hourly rate");
    if (Number(form.daily_rate) <= 0) return toast.error("Set a daily rate");
    if (!form.dl_number || !form.dl_expiry)
      return toast.error("Licence number and expiry are required");
    if (!form.dl_front_url || !form.dl_back_url)
      return toast.error("Upload both sides of your licence");
    if (!form.id_document_url) return toast.error("Upload a government ID (Aadhaar / passport)");
    setSaving(true);
    const payload = {
      id: user.id,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      city: form.city.trim(),
      bio: form.bio || null,
      experience_years: Number(form.experience_years) || 0,
      languages:
        typeof form.languages === "string"
          ? form.languages
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : form.languages,
      vehicle_types:
        typeof form.vehicle_types === "string"
          ? form.vehicle_types
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : form.vehicle_types,
      photo_url: form.photo_url || null,
      hourly_rate: Number(form.hourly_rate) || 0,
      daily_rate: Number(form.daily_rate),
      dl_number: form.dl_number,
      dl_expiry: form.dl_expiry,
      dl_front_url: form.dl_front_url,
      dl_back_url: form.dl_back_url,
      id_document_url: form.id_document_url,
      trip_types: Array.isArray(form.trip_types) ? form.trip_types : [],
      service_area: form.service_area || null,
    };
    const { error } = await api.from("drivers").upsert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(driver ? "Profile updated" : "Profile submitted for verification");
    load();
  };

  const setStatus = async (active: boolean) => {
    if (!user) return;
    const { error } = await api
      .from("drivers")
      .update({ status: active ? "active" : "paused" })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success(active ? "You're live and bookable" : "Paused — you won't appear in search");
    load();
  };

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const decide = async (id: string, status: "confirmed" | "rejected" | "completed") => {
    const target = [...(pendingHires ?? []), ...(upcomingHires ?? []), ...(historyHires ?? [])].find(
      (x: any) => x.id === id,
    );
    if (status === "confirmed" && target?.respond_by && Date.now() > new Date(target.respond_by).getTime()) {
      return toast.error("This request has expired and can no longer be approved");
    }
    const { error } = await api.from("driver_bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "rejected" ? "Hire request declined" : `Hire ${status}`);
    load();
  };

  const cancelHire = async (h: any) => {
    const paid = h.payment_status === "paid";
    const ok = await confirm({
      title: "Cancel this hire?",
      description: paid
        ? "The customer gets a full refund and you won't receive an earning for it."
        : "Are you sure you want to cancel this hire assignment?",
      confirmText: "Cancel hire",
      cancelText: "Keep hire",
      variant: "destructive",
    });
    if (!ok) return;
    const { data, error } = await api.rpc("cancel_driver_booking", { _driver_booking_id: h.id });
    if (error) return toast.error(error.message);
    const refund = Number((data as { refund?: number } | null)?.refund ?? 0);
    toast.success(
      refund > 0
        ? `Hire cancelled — ${currency(refund)} refunded to the customer`
        : "Hire cancelled",
    );
    load();
  };

  if (!user || !loaded)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="p-8">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );

  const vs = driver?.verification_status ?? "none";
  // Net of commission; from driver_dashboard_stats()
  const earnings = Number(stats?.earnings ?? 0);
  const totalHires = Number(stats?.total ?? 0);
  const pendingCount = Number(stats?.pending_count ?? pendingHires.length);
  const locked = vs === "pending";

  const toggleTripType = (type: string) => {
    const current: string[] = Array.isArray(form.trip_types) ? form.trip_types : [];
    const updated = current.includes(type)
      ? current.filter((t: string) => t !== type)
      : [...current, type];
    setForm({ ...form, trip_types: updated });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Driver dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {driver
                ? "Manage your profile, availability and hire requests."
                : "Create your driver profile to start getting hired."}
            </p>
          </div>
          <VerifyBadge status={vs} />
        </div>

        {/* Pending Hires Action Banner */}
        {pendingHires.length > 0 && (
          <div className="rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/25">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">
                    {pendingHires.length} driver hire request{pendingHires.length > 1 ? "s" : ""}{" "}
                    awaiting your approval
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Review trip dates and reporting location below to approve or decline.
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 font-semibold"
              >
                Action Required
              </Badge>
            </div>
          </div>
        )}

        {driver && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={CalendarCheck} label="Hires" value={totalHires} />
            <Stat icon={IndianRupee} label="Earnings" value={currency(earnings)} />
            <Stat
              icon={Star}
              label="Rating"
              value={`${Number(driver.avg_rating).toFixed(1)} (${driver.review_count})`}
            />
          </div>
        )}

        {driver && vs === "rejected" && driver.rejection_reason && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Verification rejected</p>
            <p className="text-xs">{driver.rejection_reason}</p>
          </div>
        )}

        {driver && vs === "approved" && (
          <Card>
            <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5">
              <div className="min-w-0">
                <p className="font-medium">Availability</p>
                <p className="text-xs text-muted-foreground">
                  {driver.status === "active"
                    ? "You're shown as Available for hire — customers can book you right now."
                    : "You're offline. Customers can't hire you until you switch this on."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={driver.status === "active"}
                  onCheckedChange={setStatus}
                  aria-label="Availability"
                />
                <Badge
                  variant="outline"
                  className={
                    driver.status === "active"
                      ? "gap-1.5 border-emerald-500/40 text-emerald-600"
                      : "gap-1.5"
                  }
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${driver.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`}
                  />
                  {driver.status === "active" ? "Available" : "Offline"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending hire requests awaiting decision */}
        {pendingHires.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <span>Pending Hire Requests ({pendingHires.length})</span>
              </h2>
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold text-xs"
              >
                Action Required
              </Badge>
            </div>
            <ul className="grid gap-3">
              {[...pendingHires]
                .sort((a, b) => {
                  const aTime = a.respond_by ? new Date(a.respond_by).getTime() : Infinity;
                  const bTime = b.respond_by ? new Date(b.respond_by).getTime() : Infinity;
                  return aTime - bTime;
                })
                .map((h) => {
                  const isExpired = h.respond_by ? now > new Date(h.respond_by).getTime() : false;
                  return (
                    <Card key={h.id} className="border-amber-200/60 dark:border-amber-900/40 shadow-xs">
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-base">
                                {currency(h.provider_earning ?? h.total_price)} ·{" "}
                                {h.rate_type === "hourly"
                                  ? `${h.hours} hour(s)`
                                  : `${h.days} day(s)`}
                                <span className="text-xs font-normal text-muted-foreground ml-1.5">(Driver payout)</span>
                              </p>
                              {h.trip_type && (
                                <Badge
                                  variant="secondary"
                                  className="capitalize text-xs font-normal"
                                >
                                  🚗 {h.trip_type}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              📅 {h.start_date}
                              {h.end_date !== h.start_date ? ` → ${h.end_date}` : ""} ·{" "}
                              {String(h.start_time).slice(0, 5)}–{String(h.end_time).slice(0, 5)}
                            </p>
                            {h.pickup_address && (
                              <p className="text-xs text-muted-foreground mt-0.5">📍 {h.pickup_address}</p>
                            )}
                            {h.notes && <p className="mt-1 text-sm bg-muted/40 p-2 rounded-md">Note: {h.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {h.respond_by && (
                              <Badge
                                variant="outline"
                                className={`text-xs font-medium ${
                                  isExpired
                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300"
                                }`}
                              >
                                <Clock className="mr-1 h-3 w-3 inline" />
                                {isExpired ? "Request expired" : `Respond within ${formatTimeLeft(h.respond_by, now)}`}
                              </Badge>
                            )}
                            <Badge variant="outline" className="capitalize">{h.status}</Badge>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs"
                            disabled={isExpired}
                            onClick={() => decide(h.id, "confirmed")}
                            title={isExpired ? "This request has expired and cannot be approved" : undefined}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve Hire
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
                            onClick={() => decide(h.id, "rejected")}
                          >
                            <CircleSlash className="mr-1.5 h-4 w-4" /> {isExpired ? "Dismiss Expired" : "Decline"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </ul>
          </div>
        )}

        <Card>
          <CardContent className="p-6">
            <h2 className="font-display text-lg font-semibold">
              Driver profile &amp; verification
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Changing your licence or ID documents sends your profile back for admin review.
            </p>
            <form onSubmit={save} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 ring-2 ring-border/80 shadow-xs">
                  <AvatarImage src={form.photo_url || undefined} />
                  <AvatarFallback>{(form.full_name || "D").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:border-primary/50">
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (e.target) e.target.value = "";
                        if (f) uploadPhoto(f);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG or WebP</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Full name</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label required>Phone</Label>
                  <Input
                    value={form.phone ?? ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label required>City</Label>
                  <CityPicker value={form.city} onChange={(c) => setForm({ ...form, city: c })} />
                </div>
                <div>
                  <Label required>Years of experience</Label>
                  <Input
                    type="number"
                    min={0}
                    required
                    value={form.experience_years}
                    onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                  />
                </div>
                <div>
                  <Label required>Hourly rate (₹)</Label>
                  <Input
                    type="number"
                    min={1}
                    required
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  />
                </div>
                <div>
                  <Label required>Daily rate (₹)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.daily_rate}
                    onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Languages (comma separated)</Label>
                  <Input
                    value={
                      Array.isArray(form.languages) ? form.languages.join(", ") : form.languages
                    }
                    onChange={(e) => setForm({ ...form, languages: e.target.value })}
                    placeholder="Hindi, English, Telugu"
                  />
                </div>
                <div>
                  <Label>Vehicle types you drive</Label>
                  <Input
                    value={
                      Array.isArray(form.vehicle_types)
                        ? form.vehicle_types.join(", ")
                        : form.vehicle_types
                    }
                    onChange={(e) => setForm({ ...form, vehicle_types: e.target.value })}
                    placeholder="Hatchback, Sedan, SUV"
                  />
                </div>
              </div>

              <div>
                <Label>Trip types</Label>
                <div className="mt-2 flex flex-wrap gap-4">
                  {TRIP_TYPE_OPTIONS.map((type) => (
                    <label
                      key={type}
                      className="flex cursor-pointer items-center gap-2 text-sm capitalize"
                    >
                      <input
                        type="checkbox"
                        checked={Array.isArray(form.trip_types) && form.trip_types.includes(type)}
                        onChange={() => toggleTripType(type)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Service area (e.g. Bangalore + 100 km)</Label>
                <Input
                  value={form.service_area ?? ""}
                  onChange={(e) => setForm({ ...form, service_area: e.target.value })}
                  placeholder="Bangalore + 100 km"
                />
              </div>

              <div>
                <Label>About you</Label>
                <Textarea
                  rows={3}
                  value={form.bio ?? ""}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Experience, routes you know well, driving style…"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Licence number</Label>
                  <Input
                    value={form.dl_number ?? ""}
                    disabled={locked}
                    required
                    onChange={(e) => setForm({ ...form, dl_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label required>Licence expiry</Label>
                  <DatePicker
                    value={form.dl_expiry ?? ""}
                    disabled={locked}
                    onChange={(d) => setForm({ ...form, dl_expiry: d })}
                    minDate={new Date()}
                    placeholder="Select licence expiry"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <DocUpload
                  label="Licence front"
                  path={form.dl_front_url}
                  signed={form.dl_front_url ? docUrls[form.dl_front_url] : null}
                  disabled={locked}
                  onFile={async (f) => {
                    const p = await uploadDoc("dl-front", f);
                    if (p) setForm((cur: any) => ({ ...cur, dl_front_url: p }));
                  }}
                />
                <DocUpload
                  label="Licence back"
                  path={form.dl_back_url}
                  signed={form.dl_back_url ? docUrls[form.dl_back_url] : null}
                  disabled={locked}
                  onFile={async (f) => {
                    const p = await uploadDoc("dl-back", f);
                    if (p) setForm((cur: any) => ({ ...cur, dl_back_url: p }));
                  }}
                />
                <DocUpload
                  label="Government ID"
                  path={form.id_document_url}
                  signed={form.id_document_url ? docUrls[form.id_document_url] : null}
                  disabled={locked}
                  onFile={async (f) => {
                    const p = await uploadDoc("id", f);
                    if (p) setForm((cur: any) => ({ ...cur, id_document_url: p }));
                  }}
                />
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : driver ? "Save profile" : "Submit for verification"}
              </Button>
              {locked && (
                <p className="text-xs text-muted-foreground">
                  Documents are locked while your profile is under review.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <section>
          <h2 className="font-display text-xl font-semibold">Hire requests</h2>
          {!loaded && <Skeleton className="mt-4 h-32 rounded-2xl" />}
          {loaded && (
            <Tabs
              value={activeTab}
              onValueChange={(val: any) => {
                setActiveTab(val);
                historyPager.setPage(0);
                ratingsPager.setPage(0);
                if (typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.set("tab", val);
                  window.history.replaceState({}, "", u.toString());
                }
              }}
              className="mt-4"
            >
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="ratings">Ratings</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming">
                {upcomingHires.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No upcoming confirmed hires.</p>
                )}
                <ul className="mt-4 grid gap-3">
                  {upcomingHires.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {currency(h.provider_earning)} ·{" "}
                                {h.rate_type === "hourly"
                                  ? `${h.hours} hour(s)`
                                  : `${h.days} day(s)`}
                                <span className="text-xs font-normal text-muted-foreground ml-1.5">(Driver payout)</span>
                              </p>
                              {h.trip_type && (
                                <Badge
                                  variant="secondary"
                                  className="capitalize text-xs font-normal"
                                >
                                  🚗 {h.trip_type}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {h.start_date}
                              {h.end_date !== h.start_date ? ` → ${h.end_date}` : ""} ·{" "}
                              {String(h.start_time).slice(0, 5)}–{String(h.end_time).slice(0, 5)}
                            </p>
                            {h.pickup_address && (
                              <p className="text-xs text-muted-foreground">📍 {h.pickup_address}</p>
                            )}
                            {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{h.status}</Badge>
                            {h.payment_status === "paid" && (
                              <Badge className="bg-emerald-600 text-white">Paid</Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {h.status === "confirmed" && h.payment_status === "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decide(h.id, "completed")}
                            >
                              Mark completed
                            </Button>
                          )}
                          {h.status === "confirmed" && (
                            <Button size="sm" variant="ghost" onClick={() => cancelHire(h)}>
                              Cancel hire
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="history">
                {historyHires.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No completed or cancelled hires yet.
                  </p>
                )}
                <ul className="mt-4 grid gap-3">
                  {historyHires.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {currency(h.provider_earning)}
                                <span className="text-xs font-normal text-muted-foreground ml-1.5">(Driver payout)</span>
                              </p>
                              {h.trip_type && (
                                <Badge
                                  variant="secondary"
                                  className="capitalize text-xs font-normal"
                                >
                                  🚗 {h.trip_type}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {h.start_date}
                              {h.end_date !== h.start_date ? ` → ${h.end_date}` : ""}
                            </p>
                            {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={h.status === "completed" ? "secondary" : "destructive"}>
                              {h.status}
                            </Badge>
                            {h.payment_status === "paid" && (
                              <Badge className="bg-emerald-600 text-white">Paid</Badge>
                            )}
                            {h.payment_status === "refunded" && (
                              <Badge
                                variant="outline"
                                className="border-emerald-300 text-emerald-700"
                              >
                                Refunded
                              </Badge>
                            )}
                            {h.payment_status === "partially_refunded" && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700">
                                Partly refunded
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </ul>
                <ListPager {...historyPager} />
              </TabsContent>

              <TabsContent value="ratings">
                {ratings.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No ratings yet.</p>
                )}
                <ul className="mt-4 grid gap-3">
                  {ratings.map((r) => (
                    <Card key={r.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${i < Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                              />
                            ))}
                            <span className="ml-1 text-sm font-medium">{r.rating}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}

                        {r.driver_response && (
                          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                            <p className="font-semibold text-foreground">Driver replied:</p>
                            <p className="mt-0.5 text-muted-foreground">{r.driver_response}</p>
                          </div>
                        )}

                        {replyingReviewId === r.id ? (
                          <div className="mt-3 space-y-2">
                            <Textarea
                              placeholder="Write your response to this review..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              className="text-xs"
                              rows={2}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={savingReply || !replyText.trim()}
                                onClick={() => submitDriverReply(r.id)}
                              >
                                {savingReply && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                Post Reply
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setReplyingReviewId(null);
                                  setReplyText("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setReplyingReviewId(r.id);
                                setReplyText(r.driver_response || "");
                              }}
                            >
                              {r.driver_response ? "Edit Reply" : "Reply"}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </ul>
                <ListPager {...ratingsPager} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function VerifyBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
        <ShieldCheck className="h-3 w-3" />
        Verified
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Under review
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" />
        Rejected
      </Badge>
    );
  return <Badge variant="outline">Not submitted</Badge>;
}

function DocUpload({
  label,
  path,
  signed,
  onFile,
  disabled,
}: {
  label: string;
  path: string | null;
  signed: string | null | undefined;
  onFile: (f: File) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    inputRef.current?.click();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {path && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" /> Attached
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 15 * 1024 * 1024) {
              toast.error(`"${f.name}" exceeds the 15MB limit.`);
              return;
            }
            onFile(f);
          }
        }}
      />

      {path && signed ? (
        <div className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-md">
          <img
            src={signed}
            alt={label}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />

          {/* Quick Action Overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="h-8 gap-1.5 text-xs bg-background/90 text-foreground hover:bg-background shadow-md backdrop-blur-md"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPicker}
                className="h-8 gap-1.5 text-xs bg-background/90 text-foreground hover:bg-background shadow-md backdrop-blur-md"
              >
                <Camera className="h-3.5 w-3.5" /> Retake
              </Button>
            )}
          </div>

          <div className="absolute top-2 left-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            {label}
          </div>
        </div>
      ) : path ? (
        <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-border bg-muted/20 text-center">
          <p className="text-xs font-medium text-foreground">File uploaded</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Generating secure preview...</p>
        </div>
      ) : (
        <div
          onClick={openPicker}
          className={`group flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-4 text-center transition-all duration-200 ${
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:border-primary/60 hover:bg-muted/40 hover:scale-[1.01] active:scale-[0.99] dark:bg-muted/10 dark:hover:bg-muted/25"
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-200 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/20">
            <Camera className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-foreground">Upload {label}</span>
          <span className="text-[10px] text-muted-foreground">Clear photo showing text & photo</span>
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 bg-card border-border text-card-foreground">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              {label} Preview
            </DialogTitle>
          </DialogHeader>
          {signed && (
            <div className="relative aspect-video max-h-[60vh] w-full overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
              <img src={signed} alt={label} className="h-full w-full object-contain" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setModalOpen(false);
                  openPicker();
                }}
                className="gap-1.5 text-xs"
              >
                <Camera className="h-3.5 w-3.5" /> Replace Photo
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
