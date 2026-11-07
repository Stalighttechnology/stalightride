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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { NEXT_WASH_STEP, WASH_STEP_LABEL } from "@/lib/wash-steps";
import { toast } from "sonner";
import { Sparkles, MapPin, CalendarCheck, IndianRupee, Star, CheckCircle2, Clock, Navigation, Car, Hourglass } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cleaner-dashboard")({
  component: CleanerDashboard,
  head: () => ({
    meta: [
      { title: "Cleaner dashboard — Synchoo" },
      { name: "description", content: "Accept doorstep wash jobs, track today's schedule and earnings on Synchoo." },
    ],
  }),
});

type Cleaner = Tables<"cleaners">;
type Job = Tables<"wash_bookings"> & { wash_services: { name: string; duration_minutes: number } | null };
type BoardJob = {
  id: string;
  slot_date: string;
  slot_time: string;
  city: string;
  vehicle_label: string | null;
  service_name: string;
  duration_minutes: number;
  provider_earning: number;
};

const DEFAULT_SERVICES = ["Doorstep Car Wash", "Bike Wash", "Interior Detailing", "Foam Wash & Wax"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function CleanerDashboard() {
  const { user } = useSession();
  const [profile, setProfile] = useState<Cleaner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [serviceArea, setServiceArea] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("2");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [board, setBoard] = useState<BoardJob[]>([]);
  const [ratings, setRatings] = useState<number[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: c } = await supabase.from("cleaners").select("*").eq("id", user.id).maybeSingle();
    setProfile(c);
    if (c) {
      setFullName(c.full_name);
      setPhone(c.phone ?? "");
      setCity(c.city);
      setServiceArea(c.service_area ?? "");
      setBio(c.bio ?? "");
      setExperience(String(c.experience_years));
      const [{ data: mine }, { data: open }] = await Promise.all([
        supabase
          .from("wash_bookings")
          .select("*, wash_services:service_id(name, duration_minutes)")
          .eq("cleaner_id", user.id)
          .order("slot_date", { ascending: true })
          .limit(100),
        c.verification_status === "approved" ? supabase.rpc("wash_job_board") : Promise.resolve({ data: [] }),
      ]);
      const myJobs = (mine as Job[]) ?? [];
      setJobs(myJobs);
      setBoard((open as BoardJob[]) ?? []);
      const done = myJobs.filter((j) => j.status === "completed").map((j) => j.id);
      if (done.length) {
        const { data: rv } = await supabase.from("wash_reviews").select("rating").in("wash_booking_id", done);
        setRatings((rv ?? []).map((r) => r.rating));
      } else setRatings([]);
    } else {
      setFullName(user.user_metadata?.full_name || "");
      setPhone(user.phone || "");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("cleaners").upsert({
      id: user.id,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      city: city.trim(),
      service_area: serviceArea.trim() || null,
      bio: bio.trim() || null,
      experience_years: Number(experience) || 0,
      services: profile?.services?.length ? profile.services : DEFAULT_SERVICES,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(profile ? "Profile updated" : "Profile submitted. An admin will verify you shortly.");
    load();
  };

  const toggleAvailability = async (checked: boolean) => {
    if (!profile) return;
    const { error } = await supabase.from("cleaners").update({ available: checked }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success(checked ? "You're online for wash jobs" : "You're offline");
    load();
  };

  const act = async (id: string, call: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    setBusyId(id);
    const { error } = await call();
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(done);
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

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Become a Vehicle Cleaner Partner</h1>
              <p className="text-sm text-muted-foreground">
                Join Synchoo's doorstep washing team. Once an admin verifies you, you can accept jobs in your city.
              </p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Cleaner registration</CardTitle>
              <CardDescription>Your profile is reviewed by our team before you can take jobs.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm
                {...{ fullName, setFullName, phone, setPhone, city, setCity, serviceArea, setServiceArea, bio, setBio, experience, setExperience, saving }}
                onSubmit={saveProfile}
                submitLabel="Submit for verification"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const approved = profile.verification_status === "approved";
  const active = jobs.filter((j) => j.status === "confirmed");
  const completed = jobs.filter((j) => j.status === "completed");
  const earned = completed.reduce((s, j) => s + Number(j.provider_earning ?? 0), 0);
  const todays = active.filter((j) => j.slot_date === today()).sort((a, b) => a.slot_time.localeCompare(b.slot_time));
  const avg = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{profile.full_name}</h1>
                {approved ? (
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Verified cleaner
                  </Badge>
                ) : profile.verification_status === "rejected" ? (
                  <Badge variant="destructive">Verification rejected</Badge>
                ) : (
                  <Badge variant="outline">
                    <Hourglass className="mr-1 h-3 w-3" /> Awaiting verification
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {profile.city}
                {profile.service_area ? ` · ${profile.service_area}` : ""}
              </p>
              {profile.verification_status === "rejected" && profile.rejection_reason && (
                <p className="mt-1 text-xs text-destructive">{profile.rejection_reason}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
            <Switch checked={profile.available} onCheckedChange={toggleAvailability} id="cleaner-online" />
            <Label htmlFor="cleaner-online" className="cursor-pointer text-xs font-medium">
              {profile.available ? <span className="font-semibold text-emerald-600">Online</span> : <span className="text-muted-foreground">Offline</span>}
            </Label>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Clock} label="Active jobs" value={active.length} />
          <Stat icon={CheckCircle2} label="Completed" value={completed.length} />
          <Stat icon={IndianRupee} label="Earned (after commission)" value={currency(earned)} />
          <Stat icon={Star} label="Rating" value={avg ? `${avg.toFixed(1)} / 5 (${ratings.length})` : "No ratings yet"} />
        </div>

        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start bg-muted p-1">
            <TabsTrigger value="jobs">My jobs ({active.length})</TabsTrigger>
            <TabsTrigger value="available">Available ({board.length})</TabsTrigger>
            <TabsTrigger value="schedule">Today</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-3">
            {active.length === 0 ? (
              <Empty icon={Car} title="No active jobs" body="Jobs you accept from Available appear here." />
            ) : (
              active.map((job) => {
                const next = NEXT_WASH_STEP[job.progress ?? "none"];
                return (
                  <Card key={job.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{job.slot_date} · {job.slot_time.slice(0, 5)}</Badge>
                          <span className="text-sm font-semibold">{job.wash_services?.name ?? "Wash"}</span>
                          {job.progress && <Badge variant="secondary">{WASH_STEP_LABEL[job.progress]}</Badge>}
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {job.address}, {job.city}
                        </p>
                        {job.vehicle_label && <p className="mt-1 text-xs font-medium">Vehicle: {job.vehicle_label}</p>}
                        {job.notes && <p className="mt-1 text-xs text-muted-foreground">Note: {job.notes}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              job.lat != null && job.lng != null ? `${job.lat},${job.lng}` : `${job.address}, ${job.city}`,
                            )}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Navigation className="mr-1 h-3.5 w-3.5" /> Navigate
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === job.id}
                          onClick={() =>
                            act(job.id, () => supabase.rpc("advance_wash_job", { _wash_booking_id: job.id, _to: next.to }), `Updated: ${next.label}`)
                          }
                        >
                          {next.label}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-3">
            {!approved ? (
              <Empty icon={Hourglass} title="Awaiting verification" body="You can accept jobs once an admin verifies your profile." />
            ) : !profile.available ? (
              <Empty icon={Clock} title="You're offline" body="Go online to see open wash jobs in your city." />
            ) : board.length === 0 ? (
              <Empty icon={Car} title={`No open jobs in ${profile.city} right now`} body="Paid, approved washes appear here. Check back soon." />
            ) : (
              board.map((req) => (
                <Card key={req.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{req.service_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {req.slot_date} · {req.slot_time.slice(0, 5)} · {req.city} · {req.duration_minutes} min · You earn{" "}
                        {currency(Number(req.provider_earning))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">The address is shown after you accept.</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busyId === req.id}
                      onClick={() => act(req.id, () => supabase.rpc("claim_wash_job", { _wash_booking_id: req.id }), "Job accepted")}
                    >
                      Accept job
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="schedule">
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck className="h-4 w-4 text-brand" /> Today's appointments
              </h3>
              {todays.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing scheduled for today.</p>
              ) : (
                <div className="space-y-3">
                  {todays.map((j) => (
                    <div key={j.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-brand">{j.slot_time.slice(0, 5)}</span>
                        <p className="mt-0.5 text-xs font-medium">
                          {j.wash_services?.name ?? "Wash"}
                          {j.vehicle_label ? ` · ${j.vehicle_label}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{j.address}</p>
                      </div>
                      <Badge variant="outline">{j.progress ? WASH_STEP_LABEL[j.progress] : "Assigned"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-4">
            {user && <PayoutsCard userId={user.id} onChanged={load} />}
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Completed washes</h3>
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
            <Card className="p-4">
              <ProfileForm
                {...{ fullName, setFullName, phone, setPhone, city, setCity, serviceArea, setServiceArea, bio, setBio, experience, setExperience, saving }}
                onSubmit={saveProfile}
                submitLabel="Update profile"
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: React.ReactNode }) {
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

function Empty({ icon: Icon, title, body }: { icon: typeof Clock; title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </Card>
  );
}

type FormProps = {
  fullName: string; setFullName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  city: string; setCity: (v: string) => void;
  serviceArea: string; setServiceArea: (v: string) => void;
  bio: string; setBio: (v: string) => void;
  experience: string; setExperience: (v: string) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
};

function ProfileForm(p: FormProps) {
  return (
    <form onSubmit={p.onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Full name *</Label>
          <Input id="c-name" value={p.fullName} onChange={(e) => p.setFullName(e.target.value)} minLength={2} maxLength={80} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Phone number *</Label>
          <Input id="c-phone" type="tel" value={p.phone} onChange={(e) => p.setPhone(e.target.value)} maxLength={20} placeholder="+91 98765 43210" required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Operating city *</Label>
          <CityPicker value={p.city} onChange={p.setCity} />
          <p className="text-xs text-muted-foreground">You'll see jobs in this city only.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-exp">Experience (years)</Label>
          <Input id="c-exp" type="number" min="0" max="60" value={p.experience} onChange={(e) => p.setExperience(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-area">Service areas / localities</Label>
        <Input id="c-area" value={p.serviceArea} onChange={(e) => p.setServiceArea(e.target.value)} maxLength={200} placeholder="e.g. Koramangala, Indiranagar, HSR Layout" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-bio">About you / equipment</Label>
        <Textarea id="c-bio" rows={3} value={p.bio} onChange={(e) => p.setBio(e.target.value)} maxLength={1000} placeholder="Portable pressure washer, eco foam, vacuum, microfiber kit." />
      </div>
      <Button type="submit" disabled={p.saving} className="w-full sm:w-auto">
        {p.saving ? "Saving..." : p.submitLabel}
      </Button>
    </form>
  );
}
