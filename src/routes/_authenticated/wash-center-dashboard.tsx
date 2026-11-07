import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { CityPicker } from "@/components/city-picker";
import { PayoutsCard } from "@/components/payouts-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { NEXT_WASH_STEP, WASH_STEP_LABEL } from "@/lib/wash-steps";
import { toast } from "sonner";
import { Building2, MapPin, IndianRupee, Star, CheckCircle2, Clock, Plus, Trash2, Car, Hourglass, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wash-center-dashboard")({
  component: WashCenterDashboard,
  head: () => ({
    meta: [
      { title: "Washing Center Dashboard — Synchoo" },
      { name: "description", content: "Manage your washing center's bookings, staff and payouts on Synchoo." },
    ],
  }),
});

type Center = Tables<"wash_vendors">;
type Staff = Tables<"wash_center_staff">;
type Job = Tables<"wash_bookings"> & { wash_services: { name: string; duration_minutes: number } | null };

function WashCenterDashboard() {
  const { user } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    city: "Bengaluru",
    address: "",
    contact_phone: "",
    contact_email: "",
    daily_capacity: "15",
    opening_time: "08:00",
    closing_time: "20:00",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [staff, setStaff] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState({ name: "", phone: "", role: "Washer" });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ratings, setRatings] = useState<number[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: c } = await supabase.from("wash_vendors").select("*").eq("owner_id", user.id).maybeSingle();
    setCenter(c);
    if (c) {
      setForm({
        name: c.name,
        city: c.city,
        address: c.address ?? "",
        contact_phone: c.contact_phone ?? "",
        contact_email: c.contact_email ?? "",
        daily_capacity: String(c.daily_capacity),
        opening_time: c.opening_time?.slice(0, 5) ?? "08:00",
        closing_time: c.closing_time?.slice(0, 5) ?? "20:00",
      });
      const [{ data: st }, { data: bk }] = await Promise.all([
        supabase.from("wash_center_staff").select("*").eq("vendor_id", c.id).order("created_at"),
        supabase
          .from("wash_bookings")
          .select("*, wash_services:service_id(name, duration_minutes)")
          .eq("assigned_vendor_id", c.id)
          .order("slot_date", { ascending: true })
          .limit(100),
      ]);
      setStaff(st ?? []);
      const all = (bk as Job[]) ?? [];
      setJobs(all);
      const done = all.filter((j) => j.status === "completed").map((j) => j.id);
      if (done.length) {
        const { data: rv } = await supabase.from("wash_reviews").select("rating").in("wash_booking_id", done);
        setRatings((rv ?? []).map((r) => r.rating));
      } else setRatings([]);
    } else {
      setForm((f) => ({ ...f, contact_email: user.email ?? "" }));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      address: form.address.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      daily_capacity: Math.max(1, Number(form.daily_capacity) || 1),
      opening_time: form.opening_time || null,
      closing_time: form.closing_time || null,
    };
    // A new center starts inactive; an admin activates it (DB guard enforces this).
    const { error } = center
      ? await supabase.from("wash_vendors").update(payload).eq("id", center.id)
      : await supabase.from("wash_vendors").insert({ ...payload, owner_id: user.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(center ? "Center details saved" : "Center registered. An admin will verify it shortly.");
    load();
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!center) return;
    const { error } = await supabase.from("wash_center_staff").insert({
      vendor_id: center.id,
      name: newStaff.name.trim(),
      phone: newStaff.phone.trim() || null,
      role: newStaff.role.trim() || "Washer",
    });
    if (error) return toast.error(error.message);
    setNewStaff({ name: "", phone: "", role: "Washer" });
    toast.success("Staff member added");
    load();
  };

  const removeStaff = async (id: string) => {
    const { error } = await supabase.from("wash_center_staff").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Staff member removed");
    load();
  };

  const advance = async (job: Job) => {
    const next = NEXT_WASH_STEP[job.progress ?? "none"];
    setBusyId(job.id);
    const { error } = await supabase.rpc("advance_wash_job", { _wash_booking_id: job.id, _to: next.to });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(`Updated: ${next.label}`);
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  const profileForm = (submitLabel: string) => (
    <form onSubmit={saveCenter} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="w-name">Center name *</Label>
          <Input id="w-name" value={form.name} onChange={(e) => set("name")(e.target.value)} maxLength={80} placeholder="AutoShine Spa & Detailing" required />
        </div>
        <div className="space-y-1.5">
          <Label>City *</Label>
          <CityPicker value={form.city} onChange={set("city")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="w-addr">Facility address *</Label>
        <Input id="w-addr" value={form.address} onChange={(e) => set("address")(e.target.value)} maxLength={300} placeholder="Plot 42, 100ft Road, Indiranagar" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="w-phone">Contact phone *</Label>
          <Input id="w-phone" type="tel" value={form.contact_phone} onChange={(e) => set("contact_phone")(e.target.value)} placeholder="+91 98765 43210" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-email">Business email</Label>
          <Input id="w-email" type="email" value={form.contact_email} onChange={(e) => set("contact_email")(e.target.value)} placeholder="contact@autoshine.in" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="w-cap">Daily capacity (vehicles)</Label>
          <Input id="w-cap" type="number" min="1" value={form.daily_capacity} onChange={(e) => set("daily_capacity")(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-open">Opens at</Label>
          <Input id="w-open" type="time" value={form.opening_time} onChange={(e) => set("opening_time")(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-close">Closes at</Label>
          <Input id="w-close" type="time" value={form.closing_time} onChange={(e) => set("closing_time")(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );

  if (!center) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Register your washing center</h1>
              <p className="text-sm text-muted-foreground">
                Once an admin verifies your center, Synchoo can assign doorstep and drop-in wash bookings to you.
              </p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Center profile</CardTitle>
              <CardDescription>Reviewed by our team before bookings are assigned to you.</CardDescription>
            </CardHeader>
            <CardContent>{profileForm("Submit for verification")}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const active = jobs.filter((j) => j.status === "confirmed" && j.payment_status === "paid");
  const completed = jobs.filter((j) => j.status === "completed");
  const earned = completed.reduce((s, j) => s + Number(j.provider_earning ?? 0), 0);
  const avg = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{center.name}</h1>
                {center.active ? (
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Verified partner
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <Hourglass className="mr-1 h-3 w-3" /> Awaiting verification
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {center.address ? `${center.address}, ` : ""}
                {center.city} · {center.daily_capacity} vehicles/day
              </p>
            </div>
          </div>
          {center.opening_time && center.closing_time && (
            <Badge variant="outline" className="px-3 py-1 text-xs">
              <Clock className="mr-1 h-3 w-3" /> {center.opening_time.slice(0, 5)} – {center.closing_time.slice(0, 5)}
            </Badge>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Car} label="Active washes" value={active.length} />
          <Stat icon={CheckCircle2} label="Completed" value={completed.length} />
          <Stat icon={IndianRupee} label="Earned (after commission)" value={currency(earned)} />
          <Stat icon={Star} label="Rating" value={avg ? `${avg.toFixed(1)} / 5 (${ratings.length})` : "No ratings yet"} />
        </div>

        <Tabs defaultValue="bookings" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start bg-muted p-1">
            <TabsTrigger value="bookings">Bookings ({active.length})</TabsTrigger>
            <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
            <TabsTrigger value="services">Packages</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="space-y-3">
            {!center.active ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Bookings are assigned to your center once an admin verifies it.
              </Card>
            ) : active.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">No paid wash bookings in your queue.</Card>
            ) : (
              active.map((b) => {
                const next = NEXT_WASH_STEP[b.progress ?? "none"];
                return (
                  <Card key={b.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{b.slot_date} · {b.slot_time.slice(0, 5)}</Badge>
                          <span className="text-sm font-semibold">{b.wash_services?.name ?? "Wash"}</span>
                          {b.progress && <Badge variant="secondary">{WASH_STEP_LABEL[b.progress]}</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {b.vehicle_label ? `Vehicle: ${b.vehicle_label} · ` : ""}You earn {currency(Number(b.provider_earning ?? 0))}
                        </p>
                        <p className="text-xs text-muted-foreground">{b.address}, {b.city}</p>
                      </div>
                      <Button size="sm" disabled={busyId === b.id} onClick={() => advance(b)}>
                        {next.label}
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Add staff member</h3>
              <form onSubmit={addStaff} className="grid items-end gap-3 sm:grid-cols-4">
                <div>
                  <Label className="text-xs">Full name</Label>
                  <Input value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} minLength={2} maxLength={80} required />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input type="tel" value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} maxLength={20} />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Input value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })} maxLength={40} />
                </div>
                <Button type="submit">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </form>
            </Card>
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff added yet.</p>
            ) : (
              <div className="grid gap-2">
                {staff.map((s) => (
                  <Card key={s.id} className="flex items-center justify-between p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{s.name}</p>
                        <Badge variant="outline">{s.role}</Badge>
                      </div>
                      {s.phone && <p className="mt-0.5 text-xs text-muted-foreground">{s.phone}</p>}
                    </div>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => removeStaff(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="services">
            <Card className="p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Custom packages are coming soon</p>
              <p className="text-xs text-muted-foreground">
                For now, customers book Synchoo's standard wash services and the booking is assigned to your center.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-4">
            {user && <PayoutsCard userId={user.id} onChanged={load} />}
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Completed washes</h3>
              {completed.length === 0 ? (
                <p className="text-xs text-muted-foreground">No completed washes yet.</p>
              ) : (
                <div className="space-y-2">
                  {completed.slice(-10).reverse().map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b border-border py-1 text-xs">
                      <div>
                        <p className="font-medium">{c.wash_services?.name ?? "Wash"}</p>
                        <p className="text-muted-foreground">{c.slot_date} · {c.city}</p>
                      </div>
                      <span className="font-semibold text-emerald-600">+{currency(Number(c.provider_earning ?? 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <Card className="p-4">{profileForm("Save changes")}</Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 font-display text-xl font-bold text-foreground">{value}</p>
    </Card>
  );
}
