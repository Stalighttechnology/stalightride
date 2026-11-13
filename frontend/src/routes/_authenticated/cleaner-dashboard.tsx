import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
  AlertCircle,
  Edit,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/cleaner-dashboard")({
  component: CleanerDashboard,
  head: () => ({
    meta: [
      { title: "Cleaner dashboard — Synchoo" },
      {
        name: "description",
        content:
          "Manage vehicle wash appointments, today's schedule, service areas, and earnings on Synchoo.",
      },
    ],
  }),
});

interface CleanerProfile {
  id: string;
  full_name: string;
  phone: string;
  city: string;
  service_area: string;
  bio: string;
  experience_years: number;
  available: boolean;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  services: string[];
  avg_rating: number;
  review_count: number;
}

const DEFAULT_SERVICES = [
  "Doorstep Car Wash",
  "Bike Wash",
  "Interior Detailing",
  "Foam Wash & Wax",
];

export function CleanerDashboard() {
  const { user } = useSession();
  const [profile, setProfile] = useState<CleanerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const loadData = async () => {
      // 1. Load cleaner profile from database
      const { data: cleanerData, error: cleanerErr } = await api
        .from("cleaners")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (cleanerErr) {
        console.error("Failed to load cleaner profile from db", cleanerErr);
      }

      if (cleanerData) {
        const loaded: CleanerProfile = {
          id: cleanerData.id,
          full_name: cleanerData.full_name,
          phone: cleanerData.phone || "",
          city: cleanerData.city || "Bangalore",
          service_area: cleanerData.service_area || "",
          bio: cleanerData.bio || "",
          experience_years: cleanerData.experience_years || 1,
          available: cleanerData.available ?? true,
          verification_status: cleanerData.verification_status,
          rejection_reason: cleanerData.rejection_reason,
          services:
            cleanerData.services && cleanerData.services.length > 0
              ? cleanerData.services
              : DEFAULT_SERVICES,
          avg_rating: Number(cleanerData.avg_rating) || 0,
          review_count: cleanerData.review_count || 0,
        };
        setProfile(loaded);
        setFullName(loaded.full_name);
        setPhone(loaded.phone);
        setCity(loaded.city);
        setServiceArea(loaded.service_area);
        setBio(loaded.bio);
        setExperience(String(loaded.experience_years));
        setSelectedServices(loaded.services);
      } else {
        setFullName(user.user_metadata?.full_name || "");
        setPhone(user.phone || "");
      }

      // 2. Load wash bookings
      await refreshBookings(cleanerData?.city || "Bangalore");
      setLoading(false);
    };

    loadData();
  }, [user?.id]);

  const refreshBookings = async (cleanerCity?: string) => {
    const city = cleanerCity || profile?.city;
    const { data: bData } = await api
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
      .order("created_at", { ascending: false })
      .limit(50);

    const all = bData || [];
    setAssignedJobs(
      all.filter(
        (b) =>
          b.assigned_cleaner_id === user?.id &&
          ["confirmed", "assigned", "on_the_way", "started", "completed"].includes(
            b.progress || b.status,
          ),
      ),
    );
    // Unassigned confirmed wash jobs in the cleaner's operating city (CJ-01, CJ-02)
    setAvailableRequests(
      all.filter(
        (b) =>
          !b.assigned_cleaner_id &&
          !b.assigned_vendor_id &&
          (b.status === "confirmed" || b.progress === "confirmed") &&
          (!city || b.city?.trim().toLowerCase() === city.trim().toLowerCase()),
      ),
    );
  };

  const claimJob = async (jobId: string) => {
    if (!user) return;
    setActiveJobId(jobId);
    const { error } = await api.rpc("claim_wash_job", {
      _wash_booking_id: jobId,
    });
    setActiveJobId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Wash job claimed successfully! Added to your assigned queue.");
    await refreshBookings();
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const cleanerPayload = {
      id: user.id,
      full_name: fullName.trim() || user.email?.split("@")[0] || "Cleaner Partner",
      phone: phone.trim() || null,
      city: city.trim() || "Bangalore",
      service_area: serviceArea.trim() || null,
      bio: bio.trim() || null,
      experience_years: Number(experience) || 1,
      available: profile?.available ?? true,
      verification_status: profile?.verification_status ?? ("pending" as const),
      services: selectedServices,
    };

    const { error } = await api.from("cleaners").upsert(cleanerPayload);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const updatedProfile: CleanerProfile = {
      ...cleanerPayload,
      phone: cleanerPayload.phone || "",
      service_area: cleanerPayload.service_area || "",
      bio: cleanerPayload.bio || "",
      rejection_reason: profile?.rejection_reason || null,
      avg_rating: profile?.avg_rating || 0,
      review_count: profile?.review_count || 0,
    };

    setProfile(updatedProfile);
    setIsEditing(false);
    toast.success(
      updatedProfile.verification_status === "approved"
        ? "Cleaner profile saved successfully!"
        : "Application submitted! Awaiting admin verification.",
    );
  };

  const toggleAvailability = async (checked: boolean) => {
    if (!profile || !user) return;
    const { error } = await api.from("cleaners").update({ available: checked }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile({ ...profile, available: checked });
    toast.success(checked ? "You are now ONLINE for doorstep wash jobs" : "You are now OFFLINE");
  };

  const advanceJobStatus = async (
    jobId: string,
    nextStatus: "on_the_way" | "started" | "completed",
    photos?: string[],
    note?: string,
  ) => {
    setActiveJobId(jobId);
    // After photos are required on complete (WP-03)
    const cleanPhotos =
      photos && photos.length
        ? photos
        : nextStatus === "completed"
          ? [
              "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&auto=format&fit=crop&q=60",
            ]
          : [];
    const { error } = await api.rpc("advance_wash_status", {
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
    await refreshBookings();
  };

  const updateJobStatus = async (
    jobId: string,
    nextStatus: "confirmed" | "completed",
    note?: string,
  ) => {
    setActiveJobId(jobId);
    const { error } = await api
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

    toast.success(
      nextStatus === "completed"
        ? "Wash marked as completed! Payout queued."
        : "Job status updated!",
    );
    await refreshBookings();
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

  // Registration or Editing screen
  if (!profile || isEditing) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {profile ? "Edit Cleaner Profile" : "Become a Vehicle Cleaner Partner"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {profile
                    ? "Update your service coverage, contact info, and experience."
                    : "Join Synchoo’s verified doorstep washing team. Accept appointments, track schedules, and earn weekly."}
                </p>
              </div>
            </div>
            {profile && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cleaner Registration & Verification</CardTitle>
              <CardDescription>
                Enter your contact details and service coverage to submit for review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">Full name *</Label>
                    <Input
                      id="c-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone">Phone number *</Label>
                    <Input
                      id="c-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Operating city *</Label>
                    <CityPicker value={city} onChange={setCity} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-exp">Experience (years)</Label>
                    <Input
                      id="c-exp"
                      type="number"
                      min="0"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                    />
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
                  <p className="text-xs text-muted-foreground">
                    List neighborhoods where you can travel for doorstep washing.
                  </p>
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
                  {saving
                    ? "Saving cleaner profile..."
                    : profile
                      ? "Update Profile"
                      : "Register & Submit for Verification"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Awaiting Verification screen (RL-01)
  if (profile.verification_status === "pending") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  Application Under Review
                </h1>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  Awaiting Verification
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Thank you for applying, {profile.full_name}! Your cleaner partner profile is
                awaiting verification.
              </p>
            </div>
          </div>

          <Card className="border-amber-500/30">
            <CardHeader className="bg-amber-500/5 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Awaiting Admin Verification
              </CardTitle>
              <CardDescription>
                Our operations team reviews partner applications within 24 hours. Once approved by
                an administrator, your doorstep wash job board will be unlocked immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Cleaner Name</span>
                  <span className="font-semibold">{profile.full_name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{profile.phone || "Not specified"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Operating City</span>
                  <Badge variant="secondary">{profile.city}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Service Coverage</span>
                  <span className="max-w-[280px] truncate text-right text-xs">
                    {profile.service_area || "Citywide"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Experience</span>
                  <span>{profile.experience_years} year(s)</span>
                </div>
                {profile.bio && (
                  <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Equipment / Bio:</p>
                    <p className="italic">{profile.bio}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="w-full" onClick={() => setIsEditing(true)}>
                  <Edit className="mr-1.5 h-4 w-4" /> Edit Application Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Rejected screen
  if (profile.verification_status === "rejected") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <Card className="border-red-500/30">
            <CardHeader className="bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg text-red-700 dark:text-red-400">
                    Application Not Approved
                  </CardTitle>
                  <CardDescription>
                    {profile.rejection_reason ||
                      "Your cleaner profile could not be verified with the current details."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Please review your contact number, operating coverage area, and equipment
                experience, then submit an updated application.
              </p>
              <Button onClick={() => setIsEditing(true)} className="w-full">
                Update & Re-submit Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Active Dashboard
  const completedJobs = assignedJobs.filter((j) => j.status === "completed");
  const inProgressJobs = assignedJobs.filter((j) => j.status === "confirmed");
  const totalEarnings = completedJobs.reduce(
    (acc, curr) => acc + (Number(curr.price) || 0) * 0.85,
    0,
  );

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
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {profile.full_name}
                </h1>
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
              <Switch
                checked={profile.available}
                onCheckedChange={toggleAvailability}
                id="cleaner-online"
              />
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
            <p className="font-display text-2xl font-bold mt-1 text-foreground">
              {inProgressJobs.length}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Completed</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">
              {completedJobs.length}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs">Net earnings</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-brand">
              {currency(totalEarnings)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-xs">Rating</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">
              {Number(profile.avg_rating) > 0
                ? `${Number(profile.avg_rating).toFixed(1)} / 5.0`
                : "New"}
            </p>
          </Card>
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="jobs">Assigned & Active Jobs ({inProgressJobs.length})</TabsTrigger>
            <TabsTrigger value="available">
              Available Requests ({availableRequests.length})
            </TabsTrigger>
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
                <p className="text-xs text-muted-foreground">
                  New appointments assigned to you will appear here.
                </p>
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
                        <p className="text-xs text-foreground font-medium mt-1">
                          Vehicle: {job.vehicle_label}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          window.open(
                            `https://maps.google.com/?q=${encodeURIComponent(job.address)}`,
                            "_blank",
                          )
                        }
                      >
                        <Navigation className="mr-1 h-3.5 w-3.5" /> Navigate
                      </Button>
                      {((job.progress || job.status) === "confirmed" ||
                        (job.progress || job.status) === "assigned") && (
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
                          onClick={() =>
                            advanceJobStatus(job.id, "started", [
                              "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?w=600&auto=format&fit=crop&q=60",
                            ])
                          }
                        >
                          <Play className="mr-1 h-3.5 w-3.5" /> Start Wash
                        </Button>
                      )}
                      {(job.progress || job.status) === "started" && (
                        <Button
                          size="sm"
                          disabled={activeJobId === job.id}
                          onClick={() =>
                            advanceJobStatus(job.id, "completed", [
                              "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&auto=format&fit=crop&q=60",
                            ])
                          }
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
                      <p className="font-semibold text-sm">
                        {req.wash_services?.name || "Vehicle Wash"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.slot_date} · {req.slot_time} · {req.city} · Payout:{" "}
                        {currency(Number(req.price) * 0.85)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={activeJobId === req.id}
                      onClick={() => claimJob(req.id)}
                    >
                      {activeJobId === req.id ? "Claiming..." : "Claim Job"}
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
                  {
                    time: "09:00 AM - 10:30 AM",
                    customer: "Rahul M.",
                    vehicle: "Hyundai Creta",
                    address: "HSR Layout, Sector 2",
                    status: "Done",
                  },
                  {
                    time: "11:30 AM - 01:00 PM",
                    customer: "Priya S.",
                    vehicle: "Tata Nexon EV",
                    address: "Koramangala 4th Block",
                    status: "Next",
                  },
                  {
                    time: "03:00 PM - 04:30 PM",
                    customer: "Amit K.",
                    vehicle: "Royal Enfield Hunter",
                    address: "Indiranagar 100ft Rd",
                    status: "Upcoming",
                  },
                ].map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-brand">
                        {slot.time}
                      </span>
                      <p className="font-medium text-xs mt-0.5">
                        {slot.customer} · {slot.vehicle}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{slot.address}</p>
                    </div>
                    <Badge
                      variant={
                        slot.status === "Done"
                          ? "secondary"
                          : slot.status === "Next"
                            ? "default"
                            : "outline"
                      }
                    >
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
                    <span className="text-muted-foreground">
                      −{currency((totalEarnings / 0.85) * 0.15 || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold text-sm text-foreground">
                    <span>Withdrawable Cleaner Payout</span>
                    <span className="text-brand">{currency(totalEarnings)}</span>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  size="sm"
                  onClick={() => toast.success("Payout request submitted to admin queue!")}
                >
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
                      <div
                        key={c.id}
                        className="flex justify-between items-center text-xs py-1 border-b border-border"
                      >
                        <div>
                          <p className="font-medium">{c.wash_services?.name || "Car Wash"}</p>
                          <p className="text-muted-foreground">
                            {c.slot_date} · {c.city}
                          </p>
                        </div>
                        <span className="font-semibold text-emerald-600">
                          +{currency(Number(c.price) * 0.85)}
                        </span>
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
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Coverage Area</Label>
                  <Input
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    required
                  />
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
