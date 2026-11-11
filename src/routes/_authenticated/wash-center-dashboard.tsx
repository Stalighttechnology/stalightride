import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { CityPicker } from "@/components/city-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  CalendarCheck,
  IndianRupee,
  Star,
  CheckCircle2,
  CircleSlash,
  Users,
  Settings2,
  Clock,
  Plus,
  Trash2,
  Sparkles,
  Camera,
  Car,
  AlertCircle,
  Edit,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/wash-center-dashboard")({
  component: WashCenterDashboard,
  head: () => ({
    meta: [
      { title: "Washing Center Dashboard — Synchoo" },
      { name: "description", content: "Manage your auto spa and washing center, service packages, calendar, staff and payouts on Synchoo." },
    ],
  }),
});

interface CenterProfile {
  id: string;
  name: string;
  city: string;
  address: string;
  contact_phone: string;
  contact_email: string;
  daily_capacity: number;
  opening_time: string;
  closing_time: string;
  active: boolean;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  avg_rating: number;
  review_count: number;
}

interface ServicePackage {
  id: string;
  center_id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
}

interface StaffMember {
  id: string;
  center_id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
}

export function WashCenterDashboard() {
  const { user } = useSession();
  const [center, setCenter] = useState<CenterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Center form state
  const [centerName, setCenterName] = useState("");
  const [city, setCity] = useState("Bangalore");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [capacity, setCapacity] = useState("15");
  const [openingTime, setOpeningTime] = useState("08:00");
  const [closingTime, setClosingTime] = useState("20:00");

  // Packages & Staff state
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [newPkgName, setNewPkgName] = useState("");
  const [newPkgPrice, setNewPkgPrice] = useState("");
  const [newPkgDuration, setNewPkgDuration] = useState("45");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("Detailer");

  // Center wash bookings
  const [centerBookings, setCenterBookings] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const loadData = async () => {
      // 1. Fetch center profile from database
      const { data: centerData, error: centerErr } = await supabase
        .from("wash_centers")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (centerErr) {
        console.error("Failed to load wash center profile from db", centerErr);
      }

      if (centerData) {
        const loaded: CenterProfile = {
          id: centerData.id,
          name: centerData.name,
          city: centerData.city || "Bangalore",
          address: centerData.address || "",
          contact_phone: centerData.contact_phone || "",
          contact_email: centerData.contact_email || user.email || "",
          daily_capacity: centerData.daily_capacity || 15,
          opening_time: centerData.opening_time || "08:00",
          closing_time: centerData.closing_time || "20:00",
          active: centerData.active ?? false,
          verification_status: centerData.verification_status,
          rejection_reason: centerData.rejection_reason,
          avg_rating: Number(centerData.avg_rating) || 0,
          review_count: centerData.review_count || 0,
        };
        setCenter(loaded);
        setCenterName(loaded.name);
        setCity(loaded.city);
        setAddress(loaded.address);
        setPhone(loaded.contact_phone);
        setEmail(loaded.contact_email);
        setCapacity(String(loaded.daily_capacity));
        setOpeningTime(loaded.opening_time);
        setClosingTime(loaded.closing_time);

        // Load packages
        const { data: pkgData } = await supabase
          .from("wash_center_packages")
          .select("*")
          .eq("center_id", user.id)
          .order("created_at", { ascending: true });
        if (pkgData) {
          setPackages(pkgData.map((p) => ({
            id: p.id,
            center_id: p.center_id,
            name: p.name,
            category: p.category,
            price: Number(p.price),
            duration: p.duration,
          })));
        }

        // Load staff
        const { data: stData } = await supabase
          .from("wash_center_staff")
          .select("*")
          .eq("center_id", user.id)
          .order("created_at", { ascending: true });
        if (stData) {
          setStaff(stData.map((s) => ({
            id: s.id,
            center_id: s.center_id,
            name: s.name,
            phone: s.phone || "",
            role: s.role,
            active: s.active,
          })));
        }
      } else {
        setEmail(user.email || "");
      }

      // Load wash bookings
      const { data: bData } = await supabase
        .from("wash_bookings")
        .select("*, wash_services:service_id(name, duration_minutes, vehicle_category)")
        .order("created_at", { ascending: false })
        .limit(50);
      setCenterBookings(bData || []);
      setLoading(false);
    };

    loadData();
  }, [user?.id]);

  const saveCenterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const centerPayload = {
      id: user.id,
      name: centerName.trim(),
      city: city.trim() || "Bangalore",
      address: address.trim() || null,
      contact_phone: phone.trim() || null,
      contact_email: email.trim() || null,
      daily_capacity: Number(capacity) || 15,
      opening_time: openingTime || "08:00",
      closing_time: closingTime || "20:00",
      active: center?.active ?? false,
      verification_status: center?.verification_status ?? ("pending" as const),
    };

    const { error } = await supabase.from("wash_centers").upsert(centerPayload);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const updatedProfile: CenterProfile = {
      ...centerPayload,
      address: centerPayload.address || "",
      contact_phone: centerPayload.contact_phone || "",
      contact_email: centerPayload.contact_email || "",
      rejection_reason: center?.rejection_reason || null,
      avg_rating: center?.avg_rating || 0,
      review_count: center?.review_count || 0,
    };

    setCenter(updatedProfile);
    setIsEditing(false);
    toast.success(
      updatedProfile.verification_status === "approved"
        ? "Washing center profile updated successfully!"
        : "Center registered! Awaiting admin verification."
    );
  };

  const addPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newPkgName.trim() || !newPkgPrice) return toast.error("Provide package title and price");

    const payload = {
      center_id: user.id,
      name: newPkgName.trim(),
      category: "car",
      price: Number(newPkgPrice),
      duration: Number(newPkgDuration) || 45,
    };

    const { data, error } = await supabase.from("wash_center_packages").insert(payload).select().single();
    if (error) return toast.error(error.message);

    setPackages([...packages, {
      id: data.id,
      center_id: data.center_id,
      name: data.name,
      category: data.category,
      price: Number(data.price),
      duration: data.duration,
    }]);
    setNewPkgName("");
    setNewPkgPrice("");
    toast.success("Service package added!");
  };

  const deletePackage = async (id: string) => {
    const { error } = await supabase.from("wash_center_packages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setPackages(packages.filter((p) => p.id !== id));
    toast.success("Service package removed");
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newStaffName.trim() || !newStaffPhone.trim()) return toast.error("Provide staff name and phone");

    const payload = {
      center_id: user.id,
      name: newStaffName.trim(),
      phone: newStaffPhone.trim(),
      role: newStaffRole || "Detailer",
      active: true,
    };

    const { data, error } = await supabase.from("wash_center_staff").insert(payload).select().single();
    if (error) return toast.error(error.message);

    setStaff([...staff, {
      id: data.id,
      center_id: data.center_id,
      name: data.name,
      phone: data.phone || "",
      role: data.role,
      active: data.active,
    }]);
    setNewStaffName("");
    setNewStaffPhone("");
    toast.success("Staff member added!");
  };

  const removeStaff = async (id: string) => {
    const { error } = await supabase.from("wash_center_staff").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setStaff(staff.filter((s) => s.id !== id));
    toast.success("Staff member removed");
  };

  const updateBookingStatus = async (id: string, status: "confirmed" | "completed" | "rejected") => {
    const { error } = await supabase
      .from("wash_bookings")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking ${status === "confirmed" ? "approved" : status}`);
    setCenterBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status, completed_at: status === "completed" ? new Date().toISOString() : null } : b))
    );
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

  // Onboarding or Editing screen
  if (!center || isEditing) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {center ? "Edit Washing Center Profile" : "Register Your Washing Center / Auto Spa"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {center
                    ? "Update facility details, bay capacity, and working hours."
                    : "Partner with Synchoo to receive daily wash appointments, manage bays, and grow your local automotive business."}
                </p>
              </div>
            </div>
            {center && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Center Profile & Operating Details</CardTitle>
              <CardDescription>Setup your business listing and bay capacity to submit for verification.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveCenterProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="w-name">Washing Center Name *</Label>
                    <Input id="w-name" value={centerName} onChange={(e) => setCenterName(e.target.value)} placeholder="AutoShine Spa & Detailing" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>City *</Label>
                    <CityPicker value={city} onChange={setCity} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="w-addr">Full Facility Address *</Label>
                  <Input id="w-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Plot 42, 100ft Road, Indiranagar" required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="w-phone">Contact Phone *</Label>
                    <Input id="w-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-email">Business Email</Label>
                    <Input id="w-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@autoshine.in" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="w-cap">Daily Bay Capacity (Cars/day)</Label>
                    <Input id="w-cap" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="w-open">Opens At</Label>
                    <TimePicker id="w-open" value={openingTime} onChange={setOpeningTime} placeholder="Opens at" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="w-close">Closes At</Label>
                    <TimePicker id="w-close" value={closingTime} onChange={setClosingTime} placeholder="Closes at" />
                  </div>
                </div>

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Saving center profile..." : center ? "Update Center Profile" : "Register Center & Submit for Verification"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Awaiting Verification screen
  if (center.verification_status === "pending") {
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
                <h1 className="font-display text-2xl font-bold tracking-tight">{center.name}</h1>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  Awaiting Verification
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your washing center registration is under review by the Synchoo admin team.
              </p>
            </div>
          </div>

          <Card className="border-amber-500/30">
            <CardHeader className="bg-amber-500/5 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Awaiting Facility Verification
              </CardTitle>
              <CardDescription>
                Once approved, your auto spa will be activated on the Synchoo washing network, and you will be able to manage booking queues, service packages, and staff technicians.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Center Name</span>
                  <span className="font-semibold">{center.name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">City & Address</span>
                  <span className="text-right text-xs max-w-[260px] truncate">{center.address}, {center.city}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Contact</span>
                  <span>{center.contact_phone || center.contact_email || "Not specified"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Bay Capacity</span>
                  <span>{center.daily_capacity} cars / day</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Operating Hours</span>
                  <span>{center.opening_time} – {center.closing_time}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setIsEditing(true)}>
                <Edit className="mr-1.5 h-4 w-4" /> Edit Facility Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Application Rejected screen
  if (center.verification_status === "rejected") {
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
                  <CardTitle className="text-lg text-red-700 dark:text-red-400">Application Rejected</CardTitle>
                  <CardDescription>
                    {center.rejection_reason || "Your washing center could not be verified with the current information."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Please verify your address, contact phone, and operating capacity, then re-submit your profile for administrator review.
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
  const activeJobs = centerBookings.filter((b) => b.status === "confirmed");
  const completedJobs = centerBookings.filter((b) => b.status === "completed");
  const grossEarnings = completedJobs.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  const netEarnings = grossEarnings * 0.85;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Center Title Card */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{center.name}</h1>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Verified Partner
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <MapPin className="h-3 w-3" /> {center.address}, {center.city} · Capacity: {center.daily_capacity} bays/day
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs py-1 px-3">
              <Clock className="mr-1 h-3 w-3" /> {center.opening_time} – {center.closing_time}
            </Badge>
          </div>
        </div>

        {/* Center Key Metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Car className="h-4 w-4" />
              <span className="text-xs">Active Washes</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{activeJobs.length}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Completed Washes</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{completedJobs.length}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs">Net Center Earnings</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(netEarnings)}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-xs">Rating Score</span>
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">
              {Number(center.avg_rating) > 0 ? `${Number(center.avg_rating).toFixed(1)} / 5.0` : "New"}
            </p>
          </Card>
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="bookings" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="bookings">Bookings Queue ({activeJobs.length})</TabsTrigger>
            <TabsTrigger value="services">Services & Pricing ({packages.length})</TabsTrigger>
            <TabsTrigger value="staff">Staff Management ({staff.length})</TabsTrigger>
            <TabsTrigger value="earnings">Earnings & Payouts</TabsTrigger>
            <TabsTrigger value="profile">Profile & Facility</TabsTrigger>
          </TabsList>

          {/* Bookings Queue */}
          <TabsContent value="bookings" className="space-y-3">
            {activeJobs.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No active wash appointments in queue.
              </Card>
            ) : (
              activeJobs.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-sky-50 text-sky-700">
                          {b.slot_date} · {b.slot_time}
                        </Badge>
                        <span className="font-semibold text-sm">{b.wash_services?.name || "Foam Wash"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Vehicle: {b.vehicle_label || "Customer Vehicle"} · Payout: {currency(Number(b.price) * 0.85)}
                      </p>
                      <p className="text-xs text-muted-foreground">{b.address}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {b.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs"
                            onClick={() => updateBookingStatus(b.id, "confirmed")}
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
                            onClick={() => updateBookingStatus(b.id, "rejected")}
                          >
                            <CircleSlash className="mr-1.5 h-4 w-4" /> Decline
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => updateBookingStatus(b.id, "completed")}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark Completed
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Services & Pricing */}
          <TabsContent value="services" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Add Custom Service Package</h3>
              <form onSubmit={addPackage} className="grid gap-3 sm:grid-cols-4 items-end">
                <div>
                  <Label className="text-xs">Package Name</Label>
                  <Input value={newPkgName} onChange={(e) => setNewPkgName(e.target.value)} placeholder="Teflon Coating" required />
                </div>
                <div>
                  <Label className="text-xs">Price (₹)</Label>
                  <Input type="number" min="1" value={newPkgPrice} onChange={(e) => setNewPkgPrice(e.target.value)} placeholder="1499" required />
                </div>
                <div>
                  <Label className="text-xs">Duration (mins)</Label>
                  <Input type="number" min="15" value={newPkgDuration} onChange={(e) => setNewPkgDuration(e.target.value)} />
                </div>
                <Button type="submit">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Package
                </Button>
              </form>
            </Card>

            <div className="grid gap-2">
              {packages.map((pkg) => (
                <Card key={pkg.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {currency(pkg.price)} · Approx {pkg.duration} minutes · {pkg.category.toUpperCase()}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deletePackage(pkg.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Staff Management */}
          <TabsContent value="staff" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Add Washing Technician</h3>
              <form onSubmit={addStaff} className="grid gap-3 sm:grid-cols-4 items-end">
                <div>
                  <Label className="text-xs">Full Name</Label>
                  <Input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Santosh B." required />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} placeholder="+91 98765 00000" required />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Input value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)} placeholder="Detailer" />
                </div>
                <Button type="submit">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Staff
                </Button>
              </form>
            </Card>

            <div className="grid gap-2">
              {staff.map((s) => (
                <Card key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{s.name}</p>
                      <Badge variant="outline">{s.role}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.phone}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeStaff(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Earnings & Payouts */}
          <TabsContent value="earnings">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3">Revenue Breakdown</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Gross Wash Turnaround</span>
                    <span className="font-semibold">{currency(grossEarnings)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Synchoo Platform Commission (15%)</span>
                    <span className="text-muted-foreground">−{currency(grossEarnings * 0.15)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold text-sm">
                    <span>Net Center Revenue</span>
                    <span className="text-brand">{currency(netEarnings)}</span>
                  </div>
                </div>
                <Button className="w-full mt-4" size="sm" onClick={() => toast.success("Payout withdrawal requested successfully!")}>
                  Withdraw to Business Account
                </Button>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3">Recent Washes Log</h3>
                {completedJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No completed wash appointments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {completedJobs.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex justify-between items-center text-xs py-1 border-b border-border">
                        <div>
                          <p className="font-medium">{c.wash_services?.name || "Wash Service"}</p>
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

          {/* Profile & Facility */}
          <TabsContent value="profile">
            <Card className="p-4">
              <form onSubmit={saveCenterProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Center Name</Label>
                    <Input value={centerName} onChange={(e) => setCenterName(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Address</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Daily Bays Capacity</Label>
                    <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Opens At</Label>
                    <TimePicker value={openingTime} onChange={setOpeningTime} placeholder="Opens at" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Closes At</Label>
                    <TimePicker value={closingTime} onChange={setClosingTime} placeholder="Closes at" />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

