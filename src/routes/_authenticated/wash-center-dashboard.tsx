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
  Users,
  Settings2,
  Clock,
  Plus,
  Trash2,
  Sparkles,
  Camera,
  Car,
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
}

interface ServicePackage {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
}

interface StaffMember {
  id: string;
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
  const [packages, setPackages] = useState<ServicePackage[]>([
    { id: "1", name: "Express Exterior Foam Wash", category: "car", price: 399, duration: 40 },
    { id: "2", name: "Complete Interior Detailing + Vacuum", category: "car", price: 899, duration: 90 },
    { id: "3", name: "Premium Ceramic Coat & Shine", category: "car", price: 1999, duration: 120 },
    { id: "4", name: "Superbike Deep Foam Wash", category: "bike", price: 299, duration: 30 },
  ]);
  const [newPkgName, setNewPkgName] = useState("");
  const [newPkgPrice, setNewPkgPrice] = useState("");
  const [newPkgDuration, setNewPkgDuration] = useState("45");

  const [staff, setStaff] = useState<StaffMember[]>([
    { id: "s1", name: "Ramesh Kumar", phone: "+91 98801 23456", role: "Lead Washer", active: true },
    { id: "s2", name: "Sunil Gowda", phone: "+91 97412 34567", role: "Interior Detailer", active: true },
  ]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("Detailer");

  // Center wash bookings
  const [centerBookings, setCenterBookings] = useState<any[]>([]);

  const centerStorageKey = user ? `wash_center_${user.id}` : null;

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // 1. Try to load from database first (matching by email/phone or stored metadata)
    supabase
      .from("wash_vendors")
      .select("*")
      .or(`contact_email.eq.${user.email},id.eq.${user.id}`)
      .maybeSingle()
      .then(async ({ data: vendorData }) => {
        let loadedProfile: CenterProfile | null = null;
        if (vendorData) {
          loadedProfile = {
            id: vendorData.id,
            name: vendorData.name,
            city: vendorData.city,
            address: vendorData.notes || "Auto Spa Bay 1",
            contact_phone: vendorData.contact_phone || "",
            contact_email: vendorData.contact_email || user.email || "",
            daily_capacity: vendorData.daily_capacity || 15,
            opening_time: "08:00",
            closing_time: "20:00",
            active: vendorData.active ?? true,
          };
        } else if (centerStorageKey) {
          try {
            const raw = localStorage.getItem(centerStorageKey);
            if (raw) loadedProfile = JSON.parse(raw);
          } catch (e) {
            console.error("Local center load err", e);
          }
        }

        if (loadedProfile) {
          setCenter(loadedProfile);
          setCenterName(loadedProfile.name);
          setCity(loadedProfile.city);
          setAddress(loadedProfile.address);
          setPhone(loadedProfile.contact_phone);
          setEmail(loadedProfile.contact_email);
          setCapacity(String(loadedProfile.daily_capacity));
          setOpeningTime(loadedProfile.opening_time);
          setClosingTime(loadedProfile.closing_time);
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
      });
  }, [user?.id]);

  const saveCenterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const centerId = center?.id || user.id;
    const payload = {
      id: centerId,
      name: centerName.trim(),
      city: city.trim(),
      contact_phone: phone.trim() || null,
      contact_email: email.trim() || null,
      daily_capacity: Number(capacity) || 15,
      notes: address.trim(),
      active: true,
    };

    // Save to wash_vendors table
    const { error } = await supabase.from("wash_vendors").upsert(payload as any);
    if (error) {
      toast.error(error.message);
    }

    const fullProfile: CenterProfile = {
      id: centerId,
      name: centerName.trim(),
      city: city.trim(),
      address: address.trim(),
      contact_phone: phone.trim(),
      contact_email: email.trim(),
      daily_capacity: Number(capacity) || 15,
      opening_time: openingTime,
      closing_time: closingTime,
      active: true,
    };

    if (centerStorageKey) {
      localStorage.setItem(centerStorageKey, JSON.stringify(fullProfile));
    }

    setCenter(fullProfile);
    setSaving(false);
    toast.success("Washing center profile updated successfully!");
  };

  const addPackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim() || !newPkgPrice) return toast.error("Provide package title and price");
    const pkg: ServicePackage = {
      id: String(Date.now()),
      name: newPkgName.trim(),
      category: "car",
      price: Number(newPkgPrice),
      duration: Number(newPkgDuration) || 45,
    };
    setPackages([...packages, pkg]);
    setNewPkgName("");
    setNewPkgPrice("");
    toast.success("Service package added!");
  };

  const deletePackage = (id: string) => {
    setPackages(packages.filter((p) => p.id !== id));
    toast.success("Service package removed");
  };

  const addStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPhone.trim()) return toast.error("Provide staff name and phone");
    const member: StaffMember = {
      id: String(Date.now()),
      name: newStaffName.trim(),
      phone: newStaffPhone.trim(),
      role: newStaffRole,
      active: true,
    };
    setStaff([...staff, member]);
    setNewStaffName("");
    setNewStaffPhone("");
    toast.success("Staff member added!");
  };

  const removeStaff = (id: string) => {
    setStaff(staff.filter((s) => s.id !== id));
    toast.success("Staff member removed");
  };

  const updateBookingStatus = async (id: string, status: "confirmed" | "completed") => {
    const { error } = await supabase
      .from("wash_bookings")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking updated to ${status}`);
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

  // Onboarding screen if not registered
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
              <h1 className="font-display text-2xl font-bold tracking-tight">Register Your Washing Center / Auto Spa</h1>
              <p className="text-sm text-muted-foreground">
                Partner with Synchoo to receive daily wash appointments, manage bays, and grow your local automotive business.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Center Profile & Operating Details</CardTitle>
              <CardDescription>Setup your business listing and bay capacity to start accepting bookings.</CardDescription>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="w-open">Opens At</Label>
                    <Input id="w-open" type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-close">Closes At</Label>
                    <Input id="w-close" type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
                  </div>
                </div>

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? "Registering center..." : "Register Center & Open Dashboard"}
                </Button>
              </form>
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
            <p className="font-display text-2xl font-bold mt-1 text-foreground">4.8 / 5.0</p>
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
                      <Button size="sm" onClick={() => updateBookingStatus(b.id, "completed")}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark Completed
                      </Button>
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
                  <div>
                    <Label className="text-xs">Opens At</Label>
                    <Input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Closes At</Label>
                    <Input type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
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

