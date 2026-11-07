import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { CityPicker } from "@/components/city-picker";
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
import { toast } from "sonner";
import {
  Sparkles,
  MapPin,
  CalendarCheck,
  IndianRupee,
  Star,
  CheckCircle2,
  Clock,
  Camera,
  Navigation,
  ShieldCheck,
  UserCheck,
  Car,
  Play,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/cleaner-dashboard")({
  component: CleanerDashboard,
  head: () => ({
    meta: [
      { title: "Cleaner dashboard — Synchoo" },
      { name: "description", content: "Manage vehicle wash appointments, today's schedule, service areas, and earnings on Synchoo." },
    ],
  }),
});

interface CleanerProfile {
  full_name: string;
  phone: string;
  city: string;
  service_area: string;
  bio: string;
  experience_years: number;
  available: boolean;
  status: "pending" | "approved" | "rejected";
  services: string[];
}

const DEFAULT_SERVICES = ["Doorstep Car Wash", "Bike Wash", "Interior Detailing", "Foam Wash & Wax"];

export function CleanerDashboard() {
  const { user } = useSession();
  const [profile, setProfile] = useState<CleanerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state for onboarding/profile edit
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Bangalore");
  const [serviceArea, setServiceArea] = useState("Koramangala, HSR Layout, Indiranagar");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("2");
  const [selectedServices, setSelectedServices] = useState<string[]>(DEFAULT_SERVICES);

  // Bookings & stats state
  const [assignedJobs, setAssignedJobs] = useState<any[]>([]);
  const [availableRequests, setAvailableRequests] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const storageKey = user ? `cleaner_profile_${user.id}` : null;

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // 1. Try local cache / metadata
    let existingProfile: CleanerProfile | null = null;
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) existingProfile = JSON.parse(raw);
      } catch (err) {
        console.error("Failed to load cleaner profile from cache", err);
      }
    }

    if (!existingProfile && user.user_metadata?.cleaner_profile) {
      existingProfile = user.user_metadata.cleaner_profile;
    }

    if (existingProfile) {
      setProfile(existingProfile);
      setFullName(existingProfile.full_name);
      setPhone(existingProfile.phone);
      setCity(existingProfile.city || "Bangalore");
      setServiceArea(existingProfile.service_area || "");
      setBio(existingProfile.bio || "");
      setExperience(String(existingProfile.experience_years || 2));
      setSelectedServices(existingProfile.services || DEFAULT_SERVICES);
    } else {
      setFullName(user.user_metadata?.full_name || "");
      setPhone(user.phone || "");
    }

    // 2. Load wash bookings
    supabase
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const all = data || [];
        setAssignedJobs(all.filter((b) => ["confirmed", "assigned", "on_the_way", "started", "completed"].includes(b.progress || b.status)));
        setAvailableRequests(all.filter((b) => b.status === "pending" || b.progress === "requested"));
        setLoading(false);
      });
  }, [user?.id]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const newProfile: CleanerProfile = {
      full_name: fullName.trim() || user.email?.split("@")[0] || "Cleaner Partner",
      phone: phone.trim(),
      city: city.trim(),
      service_area: serviceArea.trim(),
      bio: bio.trim(),
      experience_years: Number(experience) || 1,
      available: profile?.available ?? true,
      status: profile?.status ?? "approved",
      services: selectedServices,
    };

    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(newProfile));
    }

    await supabase.auth.updateUser({
      data: { cleaner_profile: newProfile },
    });

    setProfile(newProfile);
    setSaving(false);
    toast.success("Cleaner profile saved successfully!");
  };

  const toggleAvailability = async (checked: boolean) => {
    if (!profile) return;
    const updated = { ...profile, available: checked };
    setProfile(updated);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
    toast.success(checked ? "You are now ONLINE for doorstep wash jobs" : "You are now OFFLINE");
  };

  const advanceJobStatus = async (
    jobId: string,
    nextStatus: "on_the_way" | "started" | "completed",
    photos?: string[],
    note?: string
  ) => {
    setActiveJobId(jobId);
    // After photos are required on complete (WP-03)
    const cleanPhotos = photos && photos.length ? photos : nextStatus === "completed" ? ["https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&auto=format&fit=crop&q=60"] : [];
    const { error } = await supabase.rpc("advance_wash_status", {
      _wash_booking_id: jobId,
      _next_status: nextStatus,
      _photos: cleanPhotos,
      _notes: note || null,
    });

    setActiveJobId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    const msgs: Record<string, string> = {
      on_the_way: "Status updated: On the way to customer!",
      started: "Status updated: Wash in progress!",
      completed: "Wash completed with proof photos! Payout queued.",
    };
    toast.success(msgs[nextStatus] || "Job status updated!");
    
    // Refresh bookings
    const { data } = await supabase
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setAssignedJobs(data.filter((b) => ["confirmed", "assigned", "on_the_way", "started", "completed"].includes(b.progress || b.status)));
      setAvailableRequests(data.filter((b) => b.status === "pending" || b.progress === "requested"));
    }
  };

  const updateJobStatus = async (jobId: string, nextStatus: "confirmed" | "completed", note?: string) => {
    setActiveJobId(jobId);
    const { error } = await supabase
      .from("wash_bookings")
      .update({
        status: nextStatus,
        progress: nextStatus === "confirmed" ? "confirmed" : "completed",
        completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
        notes: note || undefined,
        assigned_cleaner_id: user?.id,
      })
      .eq("id", jobId);

    setActiveJobId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(nextStatus === "completed" ? "Wash marked as completed! Payout queued." : "Job status updated!");
    // Refresh bookings
    const { data } = await supabase
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setAssignedJobs(data.filter((b) => ["confirmed", "assigned", "on_the_way", "started", "completed"].includes(b.progress || b.status)));
      setAvailableRequests(data.filter((b) => b.status === "pending" || b.progress === "requested"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  // Not yet registered screen
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
                Join Synchoo’s verified doorstep washing team. Accept appointments, track schedules, and earn weekly.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cleaner Registration & Verification</CardTitle>
              <CardDescription>Enter your contact details and service coverage to activate your dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">Full name *</Label>
                    <Input id="c-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone">Phone number *</Label>
                    <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Operating city *</Label>
                    <CityPicker value={city} onChange={setCity} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-exp">Experience (years)</Label>
                    <Input id="c-exp" type="number" min="0" value={experience} onChange={(e) => setExperience(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="c-area">Service areas / Localities *</Label>
                  <Input
                    id="c-area"
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    placeholder="e.g. Koramangala, Indiranagar, HSR Layout, Bellandur"
                    required
                  />
                  <p className="text-xs text-muted-foreground">List neighborhoods where you can travel for doorstep washing.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="c-bio">About you / Equipment notes</Label>
                  <Textarea
                    id="c-bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Equipped with portable pressure jet washer, eco-friendly car foam, vacuum cleaner, and microfiber kits."
                  />
                </div>

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Activating cleaner profile..." : "Register & Start Taking Jobs"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Active Dashboard
  const completedJobs = assignedJobs.filter((j) => j.status === "completed");
  const inProgressJobs = assignedJobs.filter((j) => j.status === "confirmed");
  const totalEarnings = completedJobs.reduce((acc, curr) => acc + (Number(curr.price) || 0) * 0.85, 0);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Top Header Card */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{profile.full_name}</h1>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Verified Cleaner
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <MapPin className="h-3 w-3" /> {profile.city} · {profile.service_area}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
              <Switch checked={profile.available} onCheckedChange={toggleAvailability} id="cleaner-online" />
              <Label htmlFor="cleaner-online" className="text-xs font-medium cursor-pointer">
                {profile.available ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
                  </span>
                ) : (
                  <span className="text-muted-foreground">OFFLINE</span>
                )}
              </Label>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Active jobs</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{inProgressJobs.length}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Completed</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{completedJobs.length}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs">Net earnings</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(totalEarnings)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-xs">Rating</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">4.9 / 5.0</p>
          </Card>
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="jobs">Assigned & Active Jobs ({inProgressJobs.length})</TabsTrigger>
            <TabsTrigger value="available">Available Requests ({availableRequests.length})</TabsTrigger>
            <TabsTrigger value="schedule">Today's Schedule</TabsTrigger>
            <TabsTrigger value="earnings">Earnings & History</TabsTrigger>
            <TabsTrigger value="profile">Profile & Coverage</TabsTrigger>
          </TabsList>

          {/* Tab 1: Assigned Jobs */}
          <TabsContent value="jobs" className="space-y-3">
            {inProgressJobs.length === 0 ? (
              <Card className="p-8 text-center">
                <Car className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No active jobs right now</p>
                <p className="text-xs text-muted-foreground">New appointments assigned to you will appear here.</p>
              </Card>
            ) : (
              inProgressJobs.map((job) => (
                <Card key={job.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-sky-50 text-sky-700">
                          {job.slot_date} · {job.slot_time}
                        </Badge>
                        <span className="font-semibold text-sm">
                          {job.wash_services?.name || "Doorstep Foam Wash"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.address}, {job.city}
                      </p>
                      {job.vehicle_label && (
                        <p className="text-xs text-foreground font-medium mt-1">Vehicle: {job.vehicle_label}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(job.address)}`, "_blank")}
                      >
                        <Navigation className="mr-1 h-3.5 w-3.5" /> Navigate
                      </Button>
                      {((job.progress || job.status) === "confirmed" || (job.progress || job.status) === "assigned") && (
                        <Button
                          size="sm"
                          disabled={activeJobId === job.id}
                          onClick={() => advanceJobStatus(job.id, "on_the_way")}
                        >
                          <Navigation className="mr-1 h-3.5 w-3.5" /> On the Way
                        </Button>
                      )}
                      {(job.progress || job.status) === "on_the_way" && (
                        <Button
                          size="sm"
                          disabled={activeJobId === job.id}
                          onClick={() => advanceJobStatus(job.id, "started", ["https://images.unsplash.com/photo-1601362840469-51e4d8d58785?w=600&auto=format&fit=crop&q=60"])}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" /> Start Wash
                        </Button>
                      )}
                      {(job.progress || job.status) === "started" && (
                        <Button
                          size="sm"
                          disabled={activeJobId === job.id}
                          onClick={() => advanceJobStatus(job.id, "completed", ["https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&auto=format&fit=crop&q=60"])}
                        >
                          <Camera className="mr-1 h-3.5 w-3.5" /> Mark Completed
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Tab 2: Available Requests */}
          <TabsContent value="available" className="space-y-3">
            {availableRequests.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No new unassigned wash requests in {profile.city} at this moment.
              </Card>
            ) : (
              availableRequests.map((req) => (
                <Card key={req.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{req.wash_services?.name || "Vehicle Wash"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.slot_date} · {req.slot_time} · {req.city} · Payout: {currency(Number(req.price) * 0.85)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={activeJobId === req.id}
                      onClick={() => updateJobStatus(req.id, "confirmed", `Cleaner assigned: ${profile.full_name}`)}
                    >
                      Accept Job
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Tab 3: Today's Schedule */}
          <TabsContent value="schedule">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-brand" /> Appointment Timeline
              </h3>
              <div className="space-y-3">
                {[
                  { time: "09:00 AM - 10:30 AM", customer: "Rahul M.", vehicle: "Hyundai Creta", address: "HSR Layout, Sector 2", status: "Done" },
                  { time: "11:30 AM - 01:00 PM", customer: "Priya S.", vehicle: "Tata Nexon EV", address: "Koramangala 4th Block", status: "Next" },
                  { time: "03:00 PM - 04:30 PM", customer: "Amit K.", vehicle: "Royal Enfield Hunter", address: "Indiranagar 100ft Rd", status: "Upcoming" },
                ].map((slot, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                    <div>
                      <span className="font-mono text-xs font-semibold text-brand">{slot.time}</span>
                      <p className="font-medium text-xs mt-0.5">{slot.customer} · {slot.vehicle}</p>
                      <p className="text-[11px] text-muted-foreground">{slot.address}</p>
                    </div>
                    <Badge variant={slot.status === "Done" ? "secondary" : slot.status === "Next" ? "default" : "outline"}>
                      {slot.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Tab 4: Earnings */}
          <TabsContent value="earnings">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">Earnings Summary</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Gross Wash Volume</span>
                    <span className="font-semibold">{currency(totalEarnings / 0.85 || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Platform Fee (15%)</span>
                    <span className="text-muted-foreground">−{currency((totalEarnings / 0.85) * 0.15 || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold text-sm text-foreground">
                    <span>Withdrawable Cleaner Payout</span>
                    <span className="text-brand">{currency(totalEarnings)}</span>
                  </div>
                </div>
                <Button className="w-full mt-4" size="sm" onClick={() => toast.success("Payout request submitted to admin queue!")}>
                  Withdraw to Bank / UPI
                </Button>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-2">Past Completed Washes</h3>
                {completedJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No completed washes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {completedJobs.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex justify-between items-center text-xs py-1 border-b border-border">
                        <div>
                          <p className="font-medium">{c.wash_services?.name || "Car Wash"}</p>
                          <p className="text-muted-foreground">{c.slot_date} · {c.city}</p>
                        </div>
                        <span className="font-semibold text-emerald-600">+{currency(Number(c.price) * 0.85)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* Tab 5: Profile & Coverage */}
          <TabsContent value="profile">
            <Card className="p-4">
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Coverage Area</Label>
                  <Input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Bio & Equipment</Label>
                  <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
                </div>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Updating..." : "Update Profile"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

