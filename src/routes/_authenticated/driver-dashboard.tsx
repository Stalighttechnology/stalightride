import { CityPicker } from "@/components/city-picker";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Clock, Upload, IndianRupee, CalendarCheck, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/driver-dashboard")({
  component: DriverDashboard,
  head: () => ({
    meta: [
      { title: "Driver dashboard — Synchoo" },
      { name: "description", content: "Manage your driver profile, licence verification, hire requests and earnings on Synchoo." },
      { property: "og:title", content: "Driver dashboard — Synchoo" },
      { property: "og:description", content: "Manage your driver profile, verification, hire requests and earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TRIP_TYPE_OPTIONS = ["outstation", "airport", "corporate", "events"] as const;

const emptyDriver = {
  full_name: "", phone: "", city: "", bio: "", experience_years: 0,
  languages: [] as string[], vehicle_types: [] as string[], photo_url: "",
  hourly_rate: 0, daily_rate: 0, dl_number: "", dl_expiry: "",
  dl_front_url: null as string | null, dl_back_url: null as string | null, id_document_url: null as string | null,
  trip_types: [] as string[],
  service_area: "",
};

function DriverDashboard() {
  const { user } = useSession();
  const [driver, setDriver] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyDriver);
  const [hires, setHires] = useState<any[] | null>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: d }, { data: h }, { data: r }] = await Promise.all([
      supabase.from("drivers").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("driver_bookings").select("*").eq("driver_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("driver_reviews").select("*").eq("driver_id", user.id),
    ]);
    setDriver(d ?? null);
    if (d) setForm({ ...emptyDriver, ...d, dl_expiry: d.dl_expiry ?? "", trip_types: d.trip_types ?? [], service_area: d.service_area ?? "" });
    else setForm({ ...emptyDriver, full_name: user.user_metadata?.full_name ?? "" });
    setHires(h ?? []);
    setRatings(r ?? []);
    setLoaded(true);
  };
  useEffect(() => { load(); }, [user?.id]);

  const docUrls = useSignedUrls("verification-docs", [form.dl_front_url, form.dl_back_url, form.id_document_url]);

  const uploadDoc = async (kind: "dl-front" | "dl-back" | "id", file: File) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/driver-${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("verification-docs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return null; }
    return path;
  };

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/driver-photo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (data?.signedUrl) setForm((f: any) => ({ ...f, photo_url: data.signedUrl }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.full_name.trim() || !form.city.trim()) return toast.error("Name and city are required");
    if (Number(form.daily_rate) <= 0) return toast.error("Set a daily rate");
    if (!form.dl_number || !form.dl_expiry) return toast.error("Licence number and expiry are required");
    if (!form.dl_front_url || !form.dl_back_url) return toast.error("Upload both sides of your licence");
    if (!form.id_document_url) return toast.error("Upload a government ID (Aadhaar / passport)");
    setSaving(true);
    const payload = {
      id: user.id,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      city: form.city.trim(),
      bio: form.bio || null,
      experience_years: Number(form.experience_years) || 0,
      languages: typeof form.languages === "string" ? form.languages.split(",").map((s: string) => s.trim()).filter(Boolean) : form.languages,
      vehicle_types: typeof form.vehicle_types === "string" ? form.vehicle_types.split(",").map((s: string) => s.trim()).filter(Boolean) : form.vehicle_types,
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
    const { error } = await supabase.from("drivers").upsert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(driver ? "Profile updated" : "Profile submitted for verification");
    load();
  };

  const setStatus = async (active: boolean) => {
    if (!user) return;
    const { error } = await supabase.from("drivers").update({ status: active ? "active" : "paused" }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success(active ? "You're live and bookable" : "Paused — you won't appear in search");
    load();
  };

  const decide = async (id: string, status: "confirmed" | "rejected" | "completed") => {
    const { error } = await supabase.from("driver_bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Hire ${status}`);
    load();
  };

  const cancelHire = async (h: any) => {
    const paid = h.payment_status === "paid";
    if (!window.confirm(paid
      ? `Cancel this hire? The customer gets a full refund of ${currency(h.total_price)}, deducted from your wallet.`
      : "Cancel this hire?")) return;
    const { data, error } = await supabase.rpc("cancel_driver_booking", { _driver_booking_id: h.id });
    if (error) return toast.error(error.message);
    const refund = Number((data as { refund?: number } | null)?.refund ?? 0);
    toast.success(refund > 0 ? `Hire cancelled — ${currency(refund)} refunded to the customer` : "Hire cancelled");
    load();
  };

  if (!user || !loaded) return <div className="min-h-screen"><SiteHeader /><div className="p-8"><Skeleton className="h-64 rounded-2xl" /></div></div>;

  const vs = driver?.verification_status ?? "none";
  const earnings = (hires ?? []).filter((h) => h.payment_status === "paid").reduce((s, h) => s + Number(h.total_price), 0);
  const locked = vs === "pending";

  const today = new Date().toISOString().slice(0, 10);
  const upcomingHires = (hires ?? []).filter((h) => h.status === "confirmed" && h.start_date >= today);
  const historyHires = (hires ?? []).filter((h) => h.status === "completed" || h.status === "cancelled");

  const toggleTripType = (type: string) => {
    const current: string[] = Array.isArray(form.trip_types) ? form.trip_types : [];
    const updated = current.includes(type) ? current.filter((t: string) => t !== type) : [...current, type];
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
              {driver ? "Manage your profile, availability and hire requests." : "Create your driver profile to start getting hired."}
            </p>
          </div>
          <VerifyBadge status={vs} />
        </div>

        {driver && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={CalendarCheck} label="Hires" value={hires?.length ?? 0} />
            <Stat icon={IndianRupee} label="Earnings" value={currency(earnings)} />
            <Stat icon={Star} label="Rating" value={`${Number(driver.avg_rating).toFixed(1)} (${driver.review_count})`} />
          </div>
        )}

        {driver && vs === "rejected" && driver.rejection_reason && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Verification rejected</p>
            <p className="text-xs">{driver.rejection_reason}</p>
          </div>
        )}

        {driver && vs === "approved" && (
          <Card><CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5">
            <div className="min-w-0">
              <p className="font-medium">Availability</p>
              <p className="text-xs text-muted-foreground">
                {driver.status === "active"
                  ? "You're shown as Available for hire — customers can book you right now."
                  : "You're offline. Customers can't hire you until you switch this on."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch checked={driver.status === "active"} onCheckedChange={setStatus} aria-label="Availability" />
              <Badge
                variant="outline"
                className={driver.status === "active" ? "gap-1.5 border-emerald-500/40 text-emerald-600" : "gap-1.5"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${driver.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                {driver.status === "active" ? "Available" : "Offline"}
              </Badge>
            </div>
          </CardContent></Card>
        )}


        <Card><CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold">Driver profile &amp; verification</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Changing your licence or ID documents sends your profile back for admin review.
          </p>
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={form.photo_url || undefined} />
                <AvatarFallback>{(form.full_name || "D").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
                Upload photo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>City</Label><CityPicker value={form.city} onChange={(c) => setForm({ ...form, city: c })} /></div>
              <div><Label>Years of experience</Label><Input type="number" min={0} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} /></div>
              <div><Label>Hourly rate (₹)</Label><Input type="number" min={0} value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
              <div><Label>Daily rate (₹)</Label><Input type="number" min={0} value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} required /></div>
              <div><Label>Languages (comma separated)</Label><Input value={Array.isArray(form.languages) ? form.languages.join(", ") : form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="Hindi, English, Telugu" /></div>
              <div><Label>Vehicle types you drive</Label><Input value={Array.isArray(form.vehicle_types) ? form.vehicle_types.join(", ") : form.vehicle_types} onChange={(e) => setForm({ ...form, vehicle_types: e.target.value })} placeholder="Hatchback, Sedan, SUV" /></div>
            </div>

            <div>
              <Label>Trip types</Label>
              <div className="mt-2 flex flex-wrap gap-4">
                {TRIP_TYPE_OPTIONS.map((type) => (
                  <label key={type} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
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

            <div><Label>About you</Label><Textarea rows={3} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Experience, routes you know well, driving style…" /></div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Licence number</Label><Input value={form.dl_number ?? ""} disabled={locked} onChange={(e) => setForm({ ...form, dl_number: e.target.value })} /></div>
              <div><Label>Licence expiry</Label><Input type="date" value={form.dl_expiry ?? ""} disabled={locked} onChange={(e) => setForm({ ...form, dl_expiry: e.target.value })} /></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <DocUpload label="Licence front" path={form.dl_front_url} signed={form.dl_front_url ? docUrls[form.dl_front_url] : null} disabled={locked}
                onFile={async (f) => { const p = await uploadDoc("dl-front", f); if (p) setForm({ ...form, dl_front_url: p }); }} />
              <DocUpload label="Licence back" path={form.dl_back_url} signed={form.dl_back_url ? docUrls[form.dl_back_url] : null} disabled={locked}
                onFile={async (f) => { const p = await uploadDoc("dl-back", f); if (p) setForm({ ...form, dl_back_url: p }); }} />
              <DocUpload label="Government ID" path={form.id_document_url} signed={form.id_document_url ? docUrls[form.id_document_url] : null} disabled={locked}
                onFile={async (f) => { const p = await uploadDoc("id", f); if (p) setForm({ ...form, id_document_url: p }); }} />
            </div>

            <Button type="submit" disabled={saving}>{saving ? "Saving…" : driver ? "Save profile" : "Submit for verification"}</Button>
            {locked && <p className="text-xs text-muted-foreground">Documents are locked while your profile is under review.</p>}
          </form>
        </CardContent></Card>

        <section>
          <h2 className="font-display text-xl font-semibold">Hire requests</h2>
          {!hires && <Skeleton className="mt-4 h-32 rounded-2xl" />}
          {hires !== null && (
            <Tabs defaultValue="upcoming" className="mt-4">
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="ratings">Ratings</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming">
                {upcomingHires.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No upcoming confirmed hires.</p>}
                <ul className="mt-4 grid gap-3">
                  {upcomingHires.map((h) => (
                    <Card key={h.id}><CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{currency(h.total_price)} · {h.rate_type === "hourly" ? `${h.hours} hour(s)` : `${h.days} day(s)`}</p>
                          <p className="text-xs text-muted-foreground">
                            {h.start_date}{h.end_date !== h.start_date ? ` → ${h.end_date}` : ""} · {String(h.start_time).slice(0, 5)}–{String(h.end_time).slice(0, 5)}
                          </p>
                          {h.pickup_address && <p className="text-xs text-muted-foreground">📍 {h.pickup_address}</p>}
                          {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{h.status}</Badge>
                          {h.payment_status === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {h.status === "confirmed" && h.payment_status === "paid" && (
                          <Button size="sm" variant="outline" onClick={() => decide(h.id, "completed")}>Mark completed</Button>
                        )}
                        {h.status === "confirmed" && (
                          <Button size="sm" variant="ghost" onClick={() => cancelHire(h)}>Cancel hire</Button>
                        )}
                      </div>
                    </CardContent></Card>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="history">
                {historyHires.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No completed or cancelled hires yet.</p>}
                <ul className="mt-4 grid gap-3">
                  {historyHires.map((h) => (
                    <Card key={h.id}><CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{currency(h.total_price)}</p>
                          <p className="text-xs text-muted-foreground">
                            {h.start_date}{h.end_date !== h.start_date ? ` → ${h.end_date}` : ""}
                          </p>
                          {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={h.status === "completed" ? "secondary" : "destructive"}>{h.status}</Badge>
                          {h.payment_status === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
                          {h.payment_status === "refunded" && <Badge variant="outline" className="border-emerald-300 text-emerald-700">Refunded</Badge>}
                          {h.payment_status === "partially_refunded" && <Badge variant="outline" className="border-amber-300 text-amber-700">Partly refunded</Badge>}
                        </div>
                      </div>
                    </CardContent></Card>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="ratings">
                {ratings.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No ratings yet.</p>}
                <ul className="mt-4 grid gap-3">
                  {ratings.map((r) => (
                    <Card key={r.id}><CardContent className="p-4">
                      <div className="flex items-center gap-1 mb-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                          />
                        ))}
                        <span className="ml-1 text-sm font-medium">{r.rating}</span>
                      </div>
                      {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                    </CardContent></Card>
                  ))}
                </ul>
              </TabsContent>
            </Tabs>
          )}

          {/* Pending hires (not yet confirmed) shown outside tabs for quick action */}
          {hires !== null && (hires ?? []).filter((h) => h.status === "pending").length > 0 && (
            <div className="mt-6">
              <h3 className="font-medium text-sm mb-3">Pending requests</h3>
              <ul className="grid gap-3">
                {(hires ?? []).filter((h) => h.status === "pending").map((h) => (
                  <Card key={h.id}><CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{currency(h.total_price)} · {h.rate_type === "hourly" ? `${h.hours} hour(s)` : `${h.days} day(s)`}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.start_date}{h.end_date !== h.start_date ? ` → ${h.end_date}` : ""} · {String(h.start_time).slice(0, 5)}–{String(h.end_time).slice(0, 5)}
                        </p>
                        {h.pickup_address && <p className="text-xs text-muted-foreground">📍 {h.pickup_address}</p>}
                        {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                      </div>
                      <Badge variant="outline">{h.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => decide(h.id, "confirmed")}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(h.id, "rejected")}>Decline</Button>
                    </div>
                  </CardContent></Card>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5" /></div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>
    </CardContent></Card>
  );
}

function VerifyBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700"><ShieldCheck className="h-3 w-3" />Verified</Badge>;
  if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Under review</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Rejected</Badge>;
  return <Badge variant="outline">Not submitted</Badge>;
}

function DocUpload({ label, path, signed, onFile, disabled }: { label: string; path: string | null; signed: string | null | undefined; onFile: (f: File) => void | Promise<void>; disabled?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <label className={`mt-1 flex aspect-[16/10] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/50"}`}>
        {path && signed ? <img src={signed} alt={label} className="h-full w-full object-cover" />
          : path ? <span className="text-xs text-muted-foreground">Uploaded</span>
          : <span className="flex items-center gap-2 text-xs text-muted-foreground"><Upload className="h-4 w-4" />Choose file</span>}
        <input type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
    </div>
  );
}
