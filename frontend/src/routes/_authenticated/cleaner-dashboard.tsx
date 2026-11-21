import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
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
import { usePage, ListPager } from "@/components/list-pager";
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
  Loader2,
} from "lucide-react";
import { MapPicker } from "@/components/map-picker";
import { InspectionPhotoUploader } from "@/components/inspection-photo-uploader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  base_lat?: number | null;
  base_lng?: number | null;
  radius_km?: number;
}

const DEFAULT_SERVICES = [
  "Doorstep Car Wash",
  "Bike Wash",
  "Interior Detailing",
  "Foam Wash & Wax",
];

function CleanerDashboard() {
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
  const [baseLat, setBaseLat] = useState<number | null>(null);
  const [baseLng, setBaseLng] = useState<number | null>(null);
  const [baseAddress, setBaseAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(8);

  // Bookings & stats state
  const [assignedJobs, setAssignedJobs] = useState<any[]>([]);
  const [availableRequests, setAvailableRequests] = useState<any[]>([]);
  const [pastJobs, setPastJobs] = useState<any[]>([]);
  const [totalCompletedCount, setTotalCompletedCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [grossVolume, setGrossVolume] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [completingJob, setCompletingJob] = useState<any | null>(null);
  const [washPhotos, setWashPhotos] = useState<File[]>([]);
  const [washNotes, setWashNotes] = useState("");
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  const routerLocation = useRouterState({ select: (s) => s.location });

  const cleanerTabs = ["jobs", "available", "schedule", "earnings", "profile"] as const;
  type CleanerTab = (typeof cleanerTabs)[number];

  const [activeTab, setActiveTab] = useState<CleanerTab>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as CleanerTab;
      if (t && cleanerTabs.includes(t)) return t;
    }
    return "jobs";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as CleanerTab;
      if (t && cleanerTabs.includes(t)) setActiveTab(t);
    }
  }, [routerLocation.search]);

  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as CleanerTab;
      if (tab && cleanerTabs.includes(tab)) setActiveTab(tab);
    };
    window.addEventListener("synchoo:tab-change", onTabChange);
    return () => window.removeEventListener("synchoo:tab-change", onTabChange);
  }, []);

  const pastJobsPager = usePage(10);

  const loadPastJobs = async () => {
    if (!user) return;
    const { data, count } = await api
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)", { count: "exact" })
      .eq("assigned_cleaner_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .range(pastJobsPager.from, pastJobsPager.to);

    setPastJobs(data ?? []);
    pastJobsPager.setTotal(count ?? 0);
  };

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
          base_lat: cleanerData.base_lat ?? null,
          base_lng: cleanerData.base_lng ?? null,
          radius_km: Number(cleanerData.radius_km) || 8,
        };
        setProfile(loaded);
        setFullName(loaded.full_name);
        setPhone(loaded.phone);
        setCity(loaded.city);
        setServiceArea(loaded.service_area);
        setBio(loaded.bio);
        setExperience(String(loaded.experience_years));
        setSelectedServices(loaded.services);
        setBaseLat(loaded.base_lat ?? null);
        setBaseLng(loaded.base_lng ?? null);
        setRadiusKm(loaded.radius_km ?? 8);
      } else {
        setFullName(user.user_metadata?.full_name || "");
        setPhone(user.phone || "");
      }

      // 2. Load wash bookings
      await refreshBookings();
      setLoading(false);
    };

    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const channel = api
      .channel("cleaner_job_board_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wash_bookings" },
        () => {
          refreshBookings();
        },
      )
      .subscribe();

    const interval = setInterval(() => {
      refreshBookings();
    }, 4000);

    return () => {
      api.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadPastJobs();
  }, [user?.id, pastJobsPager.page]);

  const refreshBookings = async () => {
    // Active jobs assigned to this cleaner
    const { data: assigned } = await api
      .from("wash_bookings")
      .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
      .eq("assigned_cleaner_id", user?.id)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100);

    setAssignedJobs(assigned || []);

    // Available jobs from the tiered dispatch board
    const { data: boardData, error: boardErr } = await api.rpc("wash_job_board");
    if (!boardErr && boardData) {
      setAvailableRequests(boardData);
    }

    // Summary of all completed earnings
    const { data: completedSummary } = await api
      .from("wash_bookings")
      .select("provider_earning, base_price")
      .eq("assigned_cleaner_id", user?.id)
      .eq("status", "completed");

    const comp = completedSummary || [];
    setTotalCompletedCount(comp.length);
    setTotalEarnings(comp.reduce((acc: number, curr: any) => acc + Number(curr.provider_earning || 0), 0));
    setGrossVolume(comp.reduce((acc: number, curr: any) => acc + Number(curr.base_price || 0), 0));

    await loadPastJobs();
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

  const releaseJob = async (job: any) => {
    if (!user) return;
    const time = job.slot_time ? String(job.slot_time).slice(0, 8) : "00:00:00";
    const slotStart = new Date(`${job.slot_date}T${time.length === 5 ? time + ":00" : time}+05:30`);
    const hoursLeft = (slotStart.getTime() - Date.now()) / (3600 * 1000);
    const isLate = hoursLeft < 12;

    const ok = window.confirm(
      isLate
        ? "Warning: This wash job starts in less than 12 hours. Releasing it now will count as a late strike (2 strikes in 30 days exclude you from priority Tier 1 dispatch). Do you want to release it?"
        : "Are you sure you want to release this wash job back to the available job board?"
    );
    if (!ok) return;

    setActiveJobId(job.id);
    const { error } = await api.rpc("release_wash_job", {
      _wash_booking_id: job.id,
    });
    setActiveJobId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isLate ? "Job released with a late strike." : "Job released back to the job board.");
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
      base_lat: baseLat,
      base_lng: baseLng,
      radius_km: radiusKm,
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
      base_lat: cleanerPayload.base_lat,
      base_lng: cleanerPayload.base_lng,
      radius_km: cleanerPayload.radius_km,
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

  const handleCompleteWithPhotos = async () => {
    if (!completingJob) return;
    setSubmittingCompletion(true);
    try {
      const paths: string[] = [];
      for (let i = 0; i < washPhotos.length; i++) {
        const f = washPhotos[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `wash/${completingJob.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await api.storage.from("trip-photos").upload(path, f, { upsert: false });
        if (upErr) throw upErr;
        paths.push(path);
      }
      await advanceJobStatus(completingJob.id, "completed", paths, washNotes);
      setCompletingJob(null);
      setWashPhotos([]);
      setWashNotes("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to upload completion photos");
    } finally {
      setSubmittingCompletion(false);
    }
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
                  <Label>Base Location & Dispatch Center</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Pin your central location to receive jobs dispatching near your location.
                  </p>
                  <MapPicker
                    value={{ lat: baseLat, lng: baseLng }}
                    address={baseAddress}
                    onAddressChange={setBaseAddress}
                    onChange={(v) => {
                      setBaseLat(v.lat);
                      setBaseLng(v.lng);
                      if (v.address) setBaseAddress(v.address);
                    }}
                    mapHeight="h-44"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="c-radius">Service Radius (km)</Label>
                  <Input
                    id="c-radius"
                    type="number"
                    min="1"
                    max="100"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value) || 8)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Jobs within this radius from your base location will unlock in Tier 2 dispatch.
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayScheduleJobs = assignedJobs.filter(
    (j) => j.slot_date === todayStr || (!j.slot_date && j.created_at?.slice(0, 10) === todayStr),
  );

  const formatSlotTime = (timeStr?: string) => {
    if (!timeStr) return "Scheduled";
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h, 10);
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${String(displayHour).padStart(2, "0")}:${m || "00"} ${ampm}`;
  };

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
              {totalCompletedCount}
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
        <Tabs
          value={activeTab}
          onValueChange={(val: any) => {
            setActiveTab(val);
            pastJobsPager.setPage(0);
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.set("tab", val);
              window.history.replaceState({}, "", u.toString());
            }
          }}
          className="space-y-4"
        >
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
                        <>
                          <Button
                            size="sm"
                            disabled={activeJobId === job.id}
                            onClick={() => advanceJobStatus(job.id, "on_the_way")}
                          >
                            <Navigation className="mr-1 h-3.5 w-3.5" /> On the Way
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={activeJobId === job.id}
                            onClick={() => releaseJob(job)}
                          >
                            Release job
                          </Button>
                        </>
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
                          onClick={() => {
                            setCompletingJob(job);
                            setWashPhotos([]);
                            setWashNotes("");
                          }}
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
                        {req.service_name || req.wash_services?.name || "Vehicle Wash"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.slot_date} · {String(req.slot_time).slice(0, 5)} · {req.area || req.city}
                        {req.distance_km != null ? ` · ${req.distance_km} km away` : ""}
                        {" · Payout: "}
                        <span className="font-semibold text-foreground">
                          {currency(Number(req.payout ?? req.provider_earning ?? 0))}
                        </span>
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
              {todayScheduleJobs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <CalendarCheck className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No appointments scheduled for today</p>
                  <p className="text-xs mt-1">
                    You have no wash jobs scheduled for today. Check Available Requests to claim open jobs.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayScheduleJobs.map((slot) => {
                    const isDone = slot.status === "completed" || slot.progress === "completed";
                    const isInProgress =
                      slot.progress === "started" || slot.progress === "on_the_way";
                    const statusLabel = isDone ? "Done" : isInProgress ? "In Progress" : "Upcoming";
                    const badgeVariant = isDone
                      ? "secondary"
                      : isInProgress
                        ? "default"
                        : "outline";

                    return (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                      >
                        <div>
                          <span className="font-mono text-xs font-semibold text-brand">
                            {formatSlotTime(slot.slot_time)}
                          </span>
                          <p className="font-medium text-xs mt-0.5">
                            {slot.vehicle_label || slot.wash_services?.name || "Vehicle wash"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {slot.address || slot.city || "Customer location"}
                          </p>
                        </div>
                        <Badge variant={badgeVariant}>{statusLabel}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
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
                    <span className="font-semibold">{currency(grossVolume)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Platform commission + GST</span>
                    <span className="text-muted-foreground">
                      −{currency(grossVolume - totalEarnings)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold text-sm text-foreground">
                    <span>Withdrawable Cleaner Payout</span>
                    <span className="text-brand">{currency(totalEarnings)}</span>
                  </div>
                </div>
                <Button asChild className="w-full mt-4" size="sm">
                  <Link to="/wallet">Withdraw to Bank / UPI</Link>
                </Button>
              </Card>

              <Card className="p-4 space-y-4">
                <h3 className="font-semibold text-sm mb-2">Past Completed Washes</h3>
                {pastJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No completed washes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pastJobs.map((c) => (
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
                          +{currency(Number(c.provider_earning || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <ListPager {...pastJobsPager} />
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Coverage Area / Localities</Label>
                    <Input
                      value={serviceArea}
                      onChange={(e) => setServiceArea(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Service Radius (km)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Number(e.target.value) || 8)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Base Location (Dispatch Center)</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Pin your central home/base location for calculating job distance.
                  </p>
                  <MapPicker
                    value={{ lat: baseLat, lng: baseLng }}
                    address={baseAddress}
                    onAddressChange={setBaseAddress}
                    onChange={(v) => {
                      setBaseLat(v.lat);
                      setBaseLng(v.lng);
                      if (v.address) setBaseAddress(v.address);
                    }}
                    mapHeight="h-44"
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

        {/* Wash Completion Proof Photos Dialog (Swiggy / Zomato style inspection) */}
        <Dialog open={!!completingJob} onOpenChange={(open) => !open && setCompletingJob(null)}>
          <DialogContent className="max-w-2xl p-4 sm:p-6 bg-card border-border text-card-foreground">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                Complete Wash &amp; Submit Proof Photos
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Take or upload photos of the cleaned vehicle to record spotless completion for the customer and queue your payout.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <InspectionPhotoUploader
                files={washPhotos}
                onChange={setWashPhotos}
                maxPhotos={6}
                label="Completion photos"
                description="Upload clean photos of the vehicle (exterior finish, sparkling wheels, and vacuumed cabin)."
                recommendedTags={[
                  "Exterior front & hood",
                  "Side & gleaming wheels",
                  "Rear & glass",
                  "Interior cabin",
                ]}
                tagLabel="Suggested angles:"
                disabled={submittingCompletion}
              />

              <div className="space-y-1">
                <Label className="text-xs font-medium">Completion notes (optional)</Label>
                <Textarea
                  placeholder="e.g. Completed thorough exterior foam wash, tire dressing, and interior wipe down."
                  value={washNotes}
                  onChange={(e) => setWashNotes(e.target.value)}
                  rows={2}
                  className="text-xs bg-background"
                  disabled={submittingCompletion}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompletingJob(null)}
                disabled={submittingCompletion}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCompleteWithPhotos}
                disabled={submittingCompletion}
                className="gap-1.5 text-xs"
              >
                {submittingCompletion ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading &amp; Completing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm &amp; Complete Job
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
