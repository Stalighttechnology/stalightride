import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { HostAnalytics } from "@/components/host-analytics";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { toast } from "sonner";
import {
  Plus,
  Car,
  DollarSign,
  Calendar,
  ShieldCheck,
  ScanLine,
  Star,
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Wrench,
  Wallet,
  Sparkles,
  Info,
  UserCheck,
  Check,
  X,
  AlertCircle,
  Trash2,
  Eye,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VendorMaintenanceTab } from "@/components/vendor-maintenance";

export const Route = createFileRoute("/_authenticated/vendor/")({ component: VendorDashboard });

const SAMPLE_VEHICLES = [
  {
    id: "v-demo-1",
    title: "Hyundai Creta SX(O) AT 2024",
    city: "Bengaluru",
    price_daily: 2800,
    verification_status: "approved",
    status: "active",
    avg_rating: 4.9,
    review_count: 14,
    vehicle_images: [{ url: "creta.jpg", sort_order: 1 }],
  },
  {
    id: "v-demo-2",
    title: "Tata Nexon EV Max Dark Edition",
    city: "Bengaluru",
    price_daily: 2200,
    verification_status: "approved",
    status: "active",
    avg_rating: 4.8,
    review_count: 8,
    vehicle_images: [{ url: "nexon.jpg", sort_order: 1 }],
  },
  {
    id: "v-demo-3",
    title: "Mahindra Thar 4x4 Hard Top Diesel",
    city: "Bengaluru",
    price_daily: 3500,
    verification_status: "approved",
    status: "active",
    avg_rating: 5.0,
    review_count: 22,
    vehicle_images: [{ url: "thar.jpg", sort_order: 1 }],
  },
];

const SAMPLE_BOOKINGS = [
  {
    id: "b-demo-0",
    vehicles: { title: "Mahindra Thar 4x4 Petrol AT" },
    start_date: "14 Nov 2026",
    end_date: "16 Nov 2026",
    total_price: 6500,
    payment_status: "unpaid",
    status: "pending",
  },
  {
    id: "b-demo-1",
    vehicles: { title: "Hyundai Creta SX(O) AT" },
    start_date: "Today, 10:00 AM",
    end_date: "10 Nov 2026, 08:00 PM",
    total_price: 8400,
    payment_status: "paid",
    status: "confirmed",
  },
  {
    id: "b-demo-2",
    vehicles: { title: "Tata Nexon EV Max" },
    start_date: "04 Nov 2026",
    end_date: "05 Nov 2026",
    total_price: 2200,
    payment_status: "paid",
    status: "completed",
  },
  {
    id: "b-demo-3",
    vehicles: { title: "Mahindra Thar 4x4" },
    start_date: "01 Nov 2026",
    end_date: "03 Nov 2026",
    total_price: 7000,
    payment_status: "paid",
    status: "completed",
  },
];

const SAMPLE_PAYOUTS = [
  { id: "p-1", amount: 14800, created_at: "2026-11-05T10:00:00Z", status: "Processed" },
  { id: "p-2", amount: 22400, created_at: "2026-10-28T14:30:00Z", status: "Processed" },
  { id: "p-3", amount: 9200, created_at: "2026-10-15T09:15:00Z", status: "Processed" },
];

const SAMPLE_REVIEWS = [
  {
    id: "r-1",
    vehicles: { title: "Hyundai Creta SX(O) AT" },
    rating: 5,
    comment: "Car was delivered sparkling clean with a full tank! Pick-up via QR was super fast.",
    created_at: "2026-11-05T18:00:00Z",
  },
  {
    id: "r-2",
    vehicles: { title: "Tata Nexon EV Max" },
    rating: 5,
    comment: "Great EV range and charging cable was neatly kept in boot. Host was responsive.",
    created_at: "2026-11-04T12:00:00Z",
  },
  {
    id: "r-3",
    vehicles: { title: "Mahindra Thar 4x4" },
    rating: 4.8,
    comment: "Loved the weekend drive to Coorg. Vehicle condition was top notch.",
    created_at: "2026-11-02T19:30:00Z",
  },
];

function VendorDashboard() {
  const { user } = useSession();
  const [vendor, setVendor] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [payouts, setPayouts] = useState<any[] | null>(null);
  const [vendorReviews, setVendorReviews] = useState<any[] | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [demoVehicles, setDemoVehicles] = useState<any[]>(SAMPLE_VEHICLES);

  // Dedicated Host Dashboard Sidebar Tab State
  const [activeTab, setActiveTab] = useState<
    "fleet" | "calendar" | "analytics" | "bookings" | "payouts" | "maintenance" | "reviews" | "kyc"
  >("fleet");

  const load = async () => {
    if (!user) return;
    const [{ data: vend }, { data: vhs }, { data: bks }] = await Promise.all([
      api.from("vendors").select("*").eq("id", user.id).maybeSingle(),
      api
        .from("vehicles")
        .select("*, vehicle_images(url,sort_order)")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false }),
      api
        .from("bookings")
        .select("*, vehicles(title)")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setVendor(vend);
    const storeKey = user ? `synchoo_deleted_vehicles_${user.id}` : "";
    let deletedIds: string[] = [];
    if (storeKey) {
      try {
        deletedIds = JSON.parse(localStorage.getItem(storeKey) || "[]");
      } catch {}
    }
    const filteredVehicles = (vhs ?? []).filter((item: any) => !deletedIds.includes(item.id));
    setVehicles(filteredVehicles);
    setBookings(bks ?? []);
    if (vend) {
      setBusinessName(vend.business_name);
      setBio(vend.bio ?? "");
    }

    // Withdrawals (money phase 1 — admin-approved payouts)
    const { data: pts } = await api
      .from("withdrawals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setPayouts(pts ?? []);

    // Reviews for all vendor vehicles
    const vehicleIds = (vhs ?? []).map((v: any) => v.id);
    if (vehicleIds.length > 0) {
      const { data: rvs } = await api
        .from("reviews")
        .select("*, vehicles(title)")
        .in("vehicle_id", vehicleIds);
      setVendorReviews(rvs ?? []);
    } else {
      setVendorReviews([]);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const saveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Please sign in to register your host profile");
    setSaving(true);
    const payload = { id: user.id, business_name: businessName, bio };
    const { error } = await api.from("vendors").upsert(payload);
    if (error) toast.error(error.message);
    else {
      await api
        .from("user_roles")
        .upsert({ user_id: user.id, role: "vendor" as const }, { onConflict: "user_id,role" });
      toast.success("Host profile saved successfully!");
      setShowProfileForm(false);
      load();
    }
    setSaving(false);
  };

  const decideBooking = async (id: string, status: "confirmed" | "rejected") => {
    setProcessingBookingId(id);
    try {
      if (isDemo) {
        setBookings((prev) => {
          const base = prev ?? SAMPLE_BOOKINGS;
          return base.map((b) => (b.id === id ? { ...b, status } : b));
        });
        toast.success(
          status === "confirmed"
            ? "Booking approved! Guest can now proceed to payment."
            : "Booking declined",
        );
        return;
      }
      // Optimistically update UI
      setBookings((prev) => (prev ? prev.map((b) => (b.id === id ? { ...b, status } : b)) : prev));
      const { error } = await api.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
      toast.success(
        status === "confirmed"
          ? "Booking approved! Guest can now proceed to payment."
          : "Booking declined",
      );
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update booking status");
      await load();
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    setIsDeleting(true);
    try {
      if (isDemo) {
        setDemoVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
        toast.success("Vehicle deleted successfully");
        setVehicleToDelete(null);
        return;
      }

      // 1. Check for active or upcoming bookings
      const { data: activeBookings, error: bErr } = await api
        .from("bookings")
        .select("id, status")
        .eq("vehicle_id", vehicleId)
        .in("status", ["pending", "confirmed"]);

      if (bErr) throw bErr;

      if (activeBookings && activeBookings.length > 0) {
        toast.error(
          "Cannot delete vehicle with active or upcoming reservations. Please complete or cancel them first.",
        );
        return;
      }

      // 2. Remove storage images if any
      const target = vehicles?.find((x) => x.id === vehicleId);
      const imagePaths = target?.vehicle_images?.map((img: any) => img.url).filter(Boolean);
      if (imagePaths && imagePaths.length > 0) {
        try {
          await api.storage.from("vehicle-images").remove(imagePaths);
        } catch {
          // non-blocking storage cleanup
        }
      }

      // 3. Delete vehicle from database (cascades to vehicle_images, availability_blocks, vehicle_features, etc.)
      const { error: delErr } = await api.from("vehicles").delete().eq("id", vehicleId);
      if (delErr) {
        if (
          delErr.code === "23503" ||
          delErr.message?.includes("foreign key") ||
          delErr.message?.includes("violates foreign key constraint")
        ) {
          // Soft-delete to preserve historical booking records while removing it completely from host's listings
          await api.from("vehicles").update({ status: "paused" }).eq("id", vehicleId);
          if (user?.id) {
            const storeKey = `synchoo_deleted_vehicles_${user.id}`;
            try {
              const currentDeleted: string[] = JSON.parse(localStorage.getItem(storeKey) || "[]");
              if (!currentDeleted.includes(vehicleId)) {
                currentDeleted.push(vehicleId);
                localStorage.setItem(storeKey, JSON.stringify(currentDeleted));
              }
            } catch {}
          }
          setVehicles((prev) => (prev ? prev.filter((v) => v.id !== vehicleId) : prev));
          setVehicleToDelete(null);
          toast.success("Vehicle deleted successfully");
          return;
        } else {
          throw delErr;
        }
      }

      if (user?.id) {
        const storeKey = `synchoo_deleted_vehicles_${user.id}`;
        try {
          const currentDeleted: string[] = JSON.parse(localStorage.getItem(storeKey) || "[]");
          if (!currentDeleted.includes(vehicleId)) {
            currentDeleted.push(vehicleId);
            localStorage.setItem(storeKey, JSON.stringify(currentDeleted));
          }
        } catch {}
      }

      toast.success("Vehicle deleted successfully");
      setVehicles((prev) => (prev ? prev.filter((v) => v.id !== vehicleId) : prev));
      setVehicleToDelete(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete vehicle");
    } finally {
      setIsDeleting(false);
    }
  };

  // Resolve display data (use database data if present, or demo fleet data for immediate preview)
  const isDemo = !vendor;
  const displayVendor = vendor || {
    business_name: businessName || "Apex Fleet Hosts",
    bio: "Verified vehicle host managing cars and SUVs in Bengaluru",
    kyc_status: "approved",
  };

  // Sample data is only for visitors who haven't registered as a host yet;
  // a real host with no bookings must see zeros, not fake numbers.
  const displayVehicles = isDemo ? demoVehicles : (vehicles ?? []);
  const displayBookings = isDemo ? (bookings ?? SAMPLE_BOOKINGS) : (bookings ?? []);
  const displayPayouts = isDemo ? SAMPLE_PAYOUTS : (payouts ?? []);
  const displayReviews = isDemo ? SAMPLE_REVIEWS : (vendorReviews ?? []);

  // Net of commission; excludes customer fees and deposits.
  const earnings = displayBookings
    .filter((b: any) => b.payment_status === "paid" || b.payment_status === "partially_refunded")
    .reduce((s: number, b: any) => s + Number(b.provider_earning ?? b.total_price ?? 0), 0);

  const rated = displayVehicles.filter((v: any) => Number(v.review_count) > 0);
  const avgRating = rated.length
    ? rated.reduce((s: number, v: any) => s + Number(v.avg_rating), 0) / rated.length
    : isDemo
      ? 4.9
      : 0;

  const pendingCount = displayBookings.filter((b: any) => b.status === "pending").length;

  const sidebarNavItems = [
    { id: "fleet", label: "Fleet & Vehicles", icon: Car, badge: String(displayVehicles.length) },
    { id: "calendar", label: "Availability Calendar", icon: Calendar },
    { id: "analytics", label: "Analytics & Revenue", icon: BarChart3 },
    {
      id: "bookings",
      label: "Bookings & Activity",
      icon: ClipboardList,
      badge: pendingCount > 0 ? String(pendingCount) : String(displayBookings.length),
    },
    { id: "payouts", label: "Payouts & Income", icon: Wallet },
    { id: "maintenance", label: "Fleet Health", icon: Wrench },
    { id: "reviews", label: "Guest Reviews", icon: Star, badge: String(displayReviews.length) },
    {
      id: "kyc",
      label: "Host Verification",
      icon: ShieldCheck,
      badge: displayVendor.kyc_status === "approved" ? "Verified" : "Pending",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        {/* Demo Mode / Registration Banner */}
        {isDemo && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-brand/30 bg-brand/10">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-brand shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Host Dashboard Demo Mode Active
                </p>
                <p className="text-xs text-muted-foreground">
                  Explore how fleet management, live availability, payouts, and bookings work. Click
                  below to register your own listings.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowProfileForm(!showProfileForm)}
              className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0 text-xs"
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              {showProfileForm ? "Close Form" : "Set Up Live Host Profile"}
            </Button>
          </div>
        )}

        {/* Profile Creation Form Card (when toggled) */}
        {showProfileForm && (
          <Card className="border-brand/40 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Set Up Your Synchoo Host Profile</CardTitle>
              <CardDescription>
                Enter your business or display name to begin publishing vehicle listings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveVendor} className="space-y-4 max-w-xl">
                <div>
                  <Label className="text-xs">Business or Display Name</Label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Apex Fleet Rentals"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Host Bio</Label>
                  <Textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell renters about your vehicles and pickup location"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving} size="sm">
                    {saving ? "Saving…" : "Save Live Host Profile"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProfileForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-brand/30 text-brand bg-brand/10">
                <LayoutDashboard className="mr-1 h-3.5 w-3.5" /> Host Console
              </Badge>
              {displayVendor.kyc_status === "approved" ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  <ShieldCheck className="mr-1 h-3 w-3" /> Verified Host
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  Verification Pending
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              {displayVendor.business_name}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Manage your fleet, view real-time trip handovers, track earnings, and maintain vehicle
              health.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <Link to="/scan">
                <ScanLine className="mr-1.5 h-4 w-4" /> Scan QR Handover
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Link to="/vendor/vehicles/new">
                <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle
              </Link>
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Host Dashboard Layout with Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Host Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Host Summary Card */}
              <Card className="p-4 border-brand/20 bg-brand/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                    <Car className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{displayVendor.business_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ⭐ {avgRating.toFixed(1)} / 5.0 Rating
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/80 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Earnings:</span>
                  <span className="font-bold text-foreground">{currency(earnings)}</span>
                </div>
              </Card>

              {/* Sidebar Navigation */}
              <nav
                className="flex flex-row lg:flex-col gap-1 overflow-x-auto no-scrollbar inapp-scroll pb-2 lg:pb-0"
                aria-label="Host navigation"
              >
                {sidebarNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap text-left ${
                        isActive
                          ? "bg-brand text-brand-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {"badge" in item && (
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-[10px] px-2 py-0 shrink-0 font-medium ${
                            isActive
                              ? "bg-white/20 text-brand-foreground border-transparent"
                              : item.id === "bookings" && pendingCount > 0
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 font-semibold"
                                : "text-muted-foreground"
                          }`}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Quick Actions in Sidebar */}
              <div className="hidden lg:grid gap-2 pt-2 border-t border-border/60">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                >
                  <Link to="/vendor/vehicles/new">
                    <Plus className="mr-2 h-3.5 w-3.5 text-brand" /> Add New Vehicle
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                >
                  <Link to="/scan">
                    <ScanLine className="mr-2 h-3.5 w-3.5 text-brand" /> Scan QR Handover
                  </Link>
                </Button>
              </div>
            </div>
          </aside>

          {/* Right Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Fleet & Vehicles */}
            {activeTab === "fleet" && (
              <div className="space-y-6">
                {pendingCount > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {pendingCount} requested ride{pendingCount === 1 ? "" : "s"} awaiting your
                          approval
                        </p>
                        <p className="text-xs opacity-90">
                          Review and approve incoming reservations so guests can complete their
                          payment.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setActiveTab("bookings")}
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                    >
                      Review Requests
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <Stat icon={Car} label="Fleet Size" value={displayVehicles.length} />
                  <Stat icon={Calendar} label="Total Bookings" value={displayBookings.length} />
                  <Stat icon={DollarSign} label="Gross Earnings" value={currency(earnings)} />
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Car className="h-4 w-4 text-brand" /> Your Listed Vehicles
                      </CardTitle>
                      <CardDescription>
                        Live status, daily rental pricing, and guest booking links
                      </CardDescription>
                    </div>
                    <Button asChild size="sm">
                      <Link to="/vendor/vehicles/new">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add Vehicle
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <VehiclesGrid
                      vehicles={displayVehicles}
                      onDelete={(v) => setVehicleToDelete(v)}
                      isDeletingId={isDeleting ? vehicleToDelete?.id : null}
                    />
                  </CardContent>
                </Card>

                {/* Delete Confirmation Dialog */}
                <AlertDialog
                  open={!!vehicleToDelete}
                  onOpenChange={(open) => !open && !isDeleting && setVehicleToDelete(null)}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="h-5 w-5" /> Delete Vehicle Listing?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>
                          Are you sure you want to delete{" "}
                          <span className="font-semibold text-foreground">
                            {vehicleToDelete?.title}
                          </span>
                          ?
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This will permanently delete this vehicle from your fleet, including all
                          uploaded photos and specifications. This action cannot be undone.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.preventDefault();
                          if (vehicleToDelete) {
                            handleDeleteVehicle(vehicleToDelete.id);
                          }
                        }}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {isDeleting ? "Deleting..." : "Delete Vehicle"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* Tab 2: Availability Calendar */}
            {activeTab === "calendar" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-brand" /> Fleet Availability & Blackout
                      Dates
                    </CardTitle>
                    <CardDescription>
                      Block off dates for maintenance or personal use
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AvailabilityCalendar
                      vehicles={displayVehicles.map((v: any) => ({ id: v.id, title: v.title }))}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 3: Performance & Analytics */}
            {activeTab === "analytics" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-brand" /> Host Revenue & Performance
                    </CardTitle>
                    <CardDescription>
                      Monthly bookings breakdown, revenue progression, and ratings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HostAnalytics bookings={displayBookings} avgRating={avgRating} />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 4: Bookings & Trips */}
            {activeTab === "bookings" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-brand" /> Rental Bookings & Guest
                        Activity
                      </CardTitle>
                      <CardDescription>
                        Recent reservations, trip windows, and payment statuses
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {pendingCount > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-700 border-amber-300"
                        >
                          {pendingCount} Pending
                        </Badge>
                      )}
                      <Badge variant="outline">{displayBookings.length} Total</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pendingCount > 0 && (
                      <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>
                            You have <strong>{pendingCount}</strong> requested ride
                            {pendingCount === 1 ? "" : "s"} waiting for your approval. Guests can
                            pay once you approve.
                          </span>
                        </div>
                      </div>
                    )}
                    <ul className="divide-y divide-border">
                      {displayBookings.length === 0 ? (
                        <li className="py-8 text-center text-sm text-muted-foreground">
                          No rental bookings yet.
                        </li>
                      ) : (
                        displayBookings.map((b: any) => {
                          const isPending = b.status === "pending";
                          const isProcessing = processingBookingId === b.id;
                          return (
                            <li
                              key={b.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 first:pt-1 last:pb-1"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold">
                                    {b.vehicles?.title ?? "Vehicle"}
                                  </p>
                                  {isPending && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300 font-medium"
                                    >
                                      Needs approval
                                    </Badge>
                                  )}
                                </div>
                                <p className="truncate text-xs text-muted-foreground mt-0.5">
                                  {b.start_date} → {b.end_date}
                                  {b.pickup_time && b.dropoff_time && (
                                    <span className="ml-1.5 opacity-80">
                                      ({String(b.pickup_time).slice(0, 5)} -{" "}
                                      {String(b.dropoff_time).slice(0, 5)})
                                    </span>
                                  )}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                                <div className="text-left sm:text-right">
                                  <p className="text-sm font-bold text-foreground">
                                    {currency(b.total_price)}
                                  </p>
                                  <div className="flex items-center gap-1.5 sm:justify-end mt-0.5">
                                    <Badge
                                      variant={
                                        b.status === "confirmed"
                                          ? "default"
                                          : b.status === "completed"
                                            ? "secondary"
                                            : b.status === "rejected" || b.status === "cancelled"
                                              ? "destructive"
                                              : "outline"
                                      }
                                      className={`text-[10px] capitalize ${
                                        b.status === "confirmed"
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                          : b.status === "pending"
                                            ? "bg-amber-50 text-amber-700 border-amber-300"
                                            : ""
                                      }`}
                                    >
                                      {b.status}
                                    </Badge>
                                    {b.payment_status === "paid" && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                                      >
                                        Paid
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {isPending && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                                      disabled={isProcessing}
                                      onClick={() => decideBooking(b.id, "confirmed")}
                                    >
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      {isProcessing ? "Approving…" : "Approve"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
                                      disabled={isProcessing}
                                      onClick={() => decideBooking(b.id, "rejected")}
                                    >
                                      <X className="mr-1 h-3.5 w-3.5" />
                                      Decline
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 5: Payouts */}
            {activeTab === "payouts" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-brand" /> Withdrawals
                    </CardTitle>
                    <CardDescription>
                      Earnings are credited to your wallet when each trip completes. Withdraw them
                      from the{" "}
                      <Link to="/wallet" className="underline">
                        Wallet
                      </Link>
                      .
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {displayPayouts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
                    )}
                    <ul className="divide-y divide-border">
                      {displayPayouts.map((p: any) => (
                        <li
                          key={p.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-emerald-600">
                              {currency(p.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString()}
                              {p.method && ` · ${p.method === "upi" ? p.upi_id : "Bank transfer"}`}
                              {p.reference && ` · Ref ${p.reference}`}
                            </p>
                          </div>
                          <Badge
                            variant={
                              p.status === "paid"
                                ? "secondary"
                                : p.status === "rejected"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-[10px]"
                          >
                            {p.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 6: Fleet Health & Maintenance */}
            {activeTab === "maintenance" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-brand" /> Fleet Maintenance & Document Health
                    </CardTitle>
                    <CardDescription>
                      Track insurance, fitness, permit expiry dates and service logs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <VendorMaintenanceTab vehicles={displayVehicles} />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 7: Guest Reviews */}
            {activeTab === "reviews" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-400" /> Renter Reviews &
                        Ratings
                      </CardTitle>
                      <CardDescription>
                        Customer feedback on vehicle cleanliness, performance, and communication
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-amber-700 bg-amber-50">
                      ⭐ {avgRating.toFixed(1)} Average
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {displayReviews.map((r: any) => (
                        <div
                          key={r.id}
                          className="p-3.5 rounded-xl border border-border bg-card space-y-1.5"
                        >
                          <p className="text-xs font-semibold text-foreground">
                            {(r.vehicles as any)?.title}
                          </p>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3.5 w-3.5 ${i < Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                              />
                            ))}
                            <span className="ml-1 text-xs font-semibold">{r.rating}</span>
                          </div>
                          {r.comment && (
                            <p className="text-xs text-muted-foreground">{r.comment}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 8: Host KYC & Verification */}
            {activeTab === "kyc" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-brand" /> Host Identity & KYC
                      Verification
                    </CardTitle>
                    <CardDescription>
                      Verified hosts enjoy priority search ranking and instant payout approval
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <KycCard
                      vendor={displayVendor}
                      userId={user?.id || "demo-host"}
                      onDone={load}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-semibold sm:text-2xl">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function VehiclesGrid({
  vehicles,
  onDelete,
  isDeletingId,
}: {
  vehicles: any[];
  onDelete?: (vehicle: any) => void;
  isDeletingId?: string | null;
}) {
  const paths = vehicles.map(
    (v) => v.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url,
  );
  const urls = useSignedUrls("vehicle-images", paths);

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Car className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold">No vehicles listed yet</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          List your vehicle to start accepting rental bookings and earning as a verified host.
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link to="/vendor/vehicles/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Vehicle
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {vehicles.map((v) => {
        const img = v.vehicle_images
          ?.slice()
          .sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
        const url = img ? urls[img.url] : null;
        return (
          <Card
            key={v.id}
            className="overflow-hidden group hover:border-brand/40 transition-colors flex flex-col justify-between"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
              {url ? (
                <img
                  src={url}
                  alt={v.title}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground">
                  <Car className="h-8 w-8 opacity-40" />
                </div>
              )}
            </div>
            <CardContent className="p-4 flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-foreground">{v.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {v.city || "Operating city unassigned"}
                    </div>
                  </div>
                  <Badge
                    variant={
                      v.verification_status === "approved"
                        ? "secondary"
                        : v.verification_status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                    className="shrink-0 text-[11px]"
                  >
                    {v.verification_status === "approved"
                      ? v.status === "active"
                        ? "Live"
                        : v.status
                      : v.verification_status === "rejected"
                        ? "Rejected"
                        : "Pending review"}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-foreground text-sm sm:text-base">
                    {currency(v.price_daily)}
                  </span>
                  <span className="text-xs text-muted-foreground"> / day</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs rounded-lg"
                  >
                    <Link to="/vehicle/$id" params={{ id: v.id }}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> View
                    </Link>
                  </Button>
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isDeletingId === v.id}
                      className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 rounded-lg shrink-0"
                      onClick={() => onDelete(v)}
                      title="Delete vehicle listing"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {isDeletingId === v.id ? "Deleting..." : "Delete"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function KycCard({ vendor, userId, onDone }: { vendor: any; userId: string; onDone: () => void }) {
  const [uploading, setUploading] = useState(false);
  const status = vendor.kyc_status as string;

  const upload = async (file: File) => {
    setUploading(true);
    const path = `${userId}/id-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error: upErr } = await api.storage
      .from("kyc-docs")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { error } = await api
      .from("vendors")
      .update({ id_document_url: path, kyc_status: "pending" } as any)
      .eq("id", userId);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Document submitted for verification");
    onDone();
  };

  if (status === "approved") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-500" />
        <div>
          <p className="text-sm font-medium">Verified host</p>
          <p className="text-xs text-muted-foreground">
            Your identity has been approved by our team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-yellow-500" />
          <div>
            <p className="text-sm font-medium">
              Identity verification: {status === "pending" ? "under review" : status}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "pending"
                ? "Our team is reviewing your document. Listings stay in draft until approval."
                : "Upload a government ID (Aadhaar / passport / driving licence) to get verified."}
            </p>
            {status === "rejected" && (
              <p className="text-xs text-destructive">
                Rejected — please upload a clearer document.
              </p>
            )}
          </div>
        </div>
        {status !== "pending" && (
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
            <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              {uploading ? "Uploading…" : "Upload ID"}
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
