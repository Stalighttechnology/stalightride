import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { HostAnalytics, type HostDashboardStats } from "@/components/host-analytics";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { usePage, ListPager } from "@/components/list-pager";
import { Switch } from "@/components/ui/switch";
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
  AlertTriangle,
  Zap,
  Loader2,
  Trash2,
  Eye,
  Play,
  Pause,
  Clock,
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
    base_price: 5500,
    service_fee: 500,
    provider_earning: 4851,
    total_price: 6500,
    payment_status: "unpaid",
    status: "pending",
  },
  {
    id: "b-demo-1",
    vehicles: { title: "Hyundai Creta SX(O) AT" },
    start_date: "Today, 10:00 AM",
    end_date: "10 Nov 2026, 08:00 PM",
    base_price: 7000,
    service_fee: 700,
    provider_earning: 6174,
    total_price: 8400,
    payment_status: "paid",
    status: "confirmed",
  },
  {
    id: "b-demo-2",
    vehicles: { title: "Tata Nexon EV Max" },
    start_date: "04 Nov 2026",
    end_date: "05 Nov 2026",
    base_price: 1800,
    service_fee: 180,
    provider_earning: 1587,
    total_price: 2200,
    payment_status: "paid",
    status: "completed",
  },
  {
    id: "b-demo-3",
    vehicles: { title: "Mahindra Thar 4x4" },
    start_date: "01 Nov 2026",
    end_date: "03 Nov 2026",
    base_price: 5800,
    service_fee: 580,
    provider_earning: 5115,
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

function formatTimeLeft(target: string | Date | null | undefined, now: number) {
  if (!target) return "";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "Expired";
  const totalMins = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function VendorDashboard() {
  const { user } = useSession();
  const [vendor, setVendor] = useState<any>(null);
  const [stats, setStats] = useState<HostDashboardStats | null>(null);
  const [vehicles, setVehicles] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const [payouts, setPayouts] = useState<any[] | null>(null);
  const [vendorReviews, setVendorReviews] = useState<any[] | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [responseStats, setResponseStats] = useState<any>(null);
  const [isReactivating, setIsReactivating] = useState(false);
  const [demoVehicles, setDemoVehicles] = useState<any[]>(SAMPLE_VEHICLES);

  const routerLocation = useRouterState({ select: (s) => s.location });

  const validTabs = [
    "fleet",
    "calendar",
    "analytics",
    "bookings",
    "payouts",
    "maintenance",
    "reviews",
    "kyc",
  ] as const;
  type HostTab = (typeof validTabs)[number];

  const getInitialTab = (): HostTab => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as HostTab;
      if (t && validTabs.includes(t)) {
        return t;
      }
    }
    return "fleet";
  };

  const vehiclesPager = usePage(12);
  const bookingsPager = usePage(10);
  const payoutsPager = usePage(10);
  const reviewsPager = usePage(10);

  // Dedicated Host Dashboard Sidebar Tab State
  const [activeTab, setActiveTab] = useState<HostTab>(getInitialTab);

  // Sync tab with URL search parameter changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as HostTab;
      if (t && validTabs.includes(t)) {
        setActiveTab(t);
      }
    }
  }, [routerLocation.search]);

  // Listen for direct tab switch events (e.g. from notification clicks while already on /vendor)
  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as HostTab;
      if (tab && validTabs.includes(tab)) {
        setActiveTab(tab);
      }
    };
    window.addEventListener("synchoo:tab-change", onTabChange);
    return () => window.removeEventListener("synchoo:tab-change", onTabChange);
  }, []);

  const handleTabClick = (tabId: HostTab) => {
    setActiveTab(tabId);
    vehiclesPager.setPage(0);
    bookingsPager.setPage(0);
    payoutsPager.setPage(0);
    reviewsPager.setPage(0);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tabId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleTabChange = handleTabClick;

  const loadStats = async () => {
    if (!user) return;
    const { data } = await api.rpc("host_dashboard_stats");
    if (data) setStats(data as HostDashboardStats);
    const { data: rStats } = await api.rpc("host_response_stats", { _vendor_id: user.id });
    if (rStats) setResponseStats(rStats);
  };

  const loadVendor = async () => {
    if (!user) return;
    const { data: vend } = await api.from("vendors").select("*").eq("id", user.id).maybeSingle();
    setVendor(vend);
    if (vend) {
      setBusinessName(vend.business_name);
      setBio(vend.bio ?? "");
    }
  };

  const loadVehicles = async () => {
    if (!user) return;
    const { data, count } = await api
      .from("vehicles")
      .select("*, vehicle_images(url,sort_order)", { count: "exact" })
      .eq("vendor_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(vehiclesPager.from, vehiclesPager.to);

    const storeKey = `synchoo_deleted_vehicles_${user.id}`;
    let deletedIds: string[] = [];
    try {
      deletedIds = JSON.parse(localStorage.getItem(storeKey) || "[]");
    } catch {}
    const filteredVehicles = (data ?? []).filter((item: any) => !deletedIds.includes(item.id));
    setVehicles(filteredVehicles);
    vehiclesPager.setTotal(count ?? 0);
  };

  const loadBookings = async () => {
    if (!user) return;
    // Pending requests: own query capped at 100
    const { data: pend } = await api
      .from("bookings")
      .select("*, vehicles(title)")
      .eq("vendor_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    setPendingBookings(pend ?? []);

    // All other bookings: paged with usePage(10)
    const { data: others, count } = await api
      .from("bookings")
      .select("*, vehicles(title)", { count: "exact" })
      .eq("vendor_id", user.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .range(bookingsPager.from, bookingsPager.to);
    setBookings(others ?? []);
    bookingsPager.setTotal(count ?? 0);
  };

  const loadPayouts = async () => {
    if (!user) return;
    const { data, count } = await api
      .from("withdrawals")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(payoutsPager.from, payoutsPager.to);
    setPayouts(data ?? []);
    payoutsPager.setTotal(count ?? 0);
  };

  const loadReviews = async () => {
    if (!user) return;
    const { data: vhs } = await api
      .from("vehicles")
      .select("id")
      .eq("vendor_id", user.id)
      .eq("is_deleted", false);
    const vehicleIds = (vhs ?? []).map((v: any) => v.id);
    if (vehicleIds.length > 0) {
      const { data, count } = await api
        .from("reviews")
        .select("*, vehicles(title)", { count: "exact" })
        .in("vehicle_id", vehicleIds)
        .order("created_at", { ascending: false })
        .range(reviewsPager.from, reviewsPager.to);
      setVendorReviews(data ?? []);
      reviewsPager.setTotal(count ?? 0);
    } else {
      setVendorReviews([]);
      reviewsPager.setTotal(0);
    }
  };

  const load = async () => {
    await Promise.all([
      loadVendor(),
      loadStats(),
      loadVehicles(),
      loadBookings(),
      loadPayouts(),
      loadReviews(),
    ]);
  };

  useEffect(() => {
    if (user?.id) {
      loadVendor();
      loadStats();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadVehicles();
  }, [user?.id, vehiclesPager.page]);

  useEffect(() => {
    if (user?.id) loadBookings();
  }, [user?.id, bookingsPager.page]);

  useEffect(() => {
    if (user?.id) loadPayouts();
  }, [user?.id, payoutsPager.page]);

  useEffect(() => {
    if (user?.id) loadReviews();
  }, [user?.id, reviewsPager.page]);

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

  const isRegisteredHost = Boolean(vendor);

  const decideBooking = async (id: string, status: "confirmed" | "rejected") => {
    const target = [...pendingBookings, ...(bookings ?? [])].find((x: any) => x.id === id);
    if (target?.respond_by && Date.now() > new Date(target.respond_by).getTime()) {
      toast.error("This request has expired");
      return;
    }
    setProcessingBookingId(id);
    try {
      if (!isRegisteredHost) {
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

  const handleTogglePause = async (v: any) => {
    const nextStatus = v.status === "paused" ? "active" : "paused";
    const { error } = await api.from("vehicles").update({ status: nextStatus }).eq("id", v.id);
    if (error) {
      toast.error("Failed to update vehicle status: " + error.message);
      return;
    }
    setVehicles((prev) =>
      prev ? prev.map((item) => (item.id === v.id ? { ...item, status: nextStatus } : item)) : prev,
    );
    toast.success(nextStatus === "paused" ? `${v.title} paused` : `${v.title} reactivated!`);
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    setIsDeleting(true);
    try {
      if (!isRegisteredHost) {
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
          await api.from("vehicles").update({ status: "paused", is_deleted: true }).eq("id", vehicleId);
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

  const handleReactivateListings = async () => {
    if (!user) return;
    setIsReactivating(true);
    try {
      const { error } = await api.rpc("reactivate_vendor_listings", { _vendor_id: user.id });
      if (error) throw error;
      toast.success("Listings re-activated! Your vehicles are live.");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to re-activate listings");
    } finally {
      setIsReactivating(false);
    }
  };

  const handleToggleInstantBook = async (vehicle: any, val: boolean) => {
    try {
      const { error } = await api.from("vehicles").update({ instant_book: val }).eq("id", vehicle.id);
      if (error) throw error;
      setVehicles((prev) => (prev ? prev.map((v) => (v.id === vehicle.id ? { ...v, instant_book: val } : v)) : prev));
      toast.success(val ? "Instant Book enabled" : "Instant Book disabled");
    } catch (err: any) {
      toast.error(err.message || "Failed to update Instant Book setting");
    }
  };

  // Resolve display data (HV-22 / GAP-30: unregistered users see their real empty state, no mock fleet or fake verified badge)
  const displayVendor = vendor || {
    business_name: businessName || "New Host",
    bio: "",
    kyc_status: "pending",
  };

  const displayVehicles = vehicles ?? [];
  const displayBookings = useMemo(() => {
    const list = [...(bookings ?? [])];
    return list.sort((a: any, b: any) => {
      const aPending = a.status === "pending";
      const bPending = b.status === "pending";
      if (aPending && bPending) {
        const aTime = a.respond_by ? new Date(a.respond_by).getTime() : Infinity;
        const bTime = b.respond_by ? new Date(b.respond_by).getTime() : Infinity;
        return aTime - bTime;
      }
      if (aPending) return -1;
      if (bPending) return 1;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [bookings]);
  const displayPayouts = payouts ?? [];
  const displayReviews = vendorReviews ?? [];

  // Net of commission; from host_dashboard_stats()
  const earnings = Number(stats?.earnings ?? 0);
  const totalBookings = Number(stats?.total_bookings ?? 0);
  const pendingCount = Number(stats?.pending_count ?? pendingBookings.length);

  const rated = displayVehicles.filter((v: any) => Number(v.review_count) > 0);
  const avgRating = rated.length
    ? rated.reduce((s: number, v: any) => s + Number(v.avg_rating), 0) / rated.length
    : 0;

  const sidebarNavItems = [
    { id: "fleet", label: "Fleet & Vehicles", icon: Car, badge: String(vehiclesPager.total) },
    { id: "calendar", label: "Availability Calendar", icon: Calendar },
    { id: "analytics", label: "Analytics & Revenue", icon: BarChart3 },
    {
      id: "bookings",
      label: "Bookings & Activity",
      icon: ClipboardList,
      badge: pendingCount > 0 ? String(pendingCount) : String(totalBookings),
    },
    { id: "payouts", label: "Payouts & Income", icon: Wallet, badge: String(payoutsPager.total) },
    { id: "maintenance", label: "Fleet Health", icon: Wrench },
    { id: "reviews", label: "Guest Reviews", icon: Star, badge: String(reviewsPager.total) },
    {
      id: "kyc",
      label: "Host Verification",
      icon: ShieldCheck,
      badge: isRegisteredHost && displayVendor.kyc_status === "approved" ? "Verified" : "Pending",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        {/* Onboarding Banner for Non-Registered Hosts */}
        {!isRegisteredHost && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-brand/30 bg-brand/10">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-brand shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Host Profile Not Registered
                </p>
                <p className="text-xs text-muted-foreground">
                  Register your host business and complete KYC verification to list vehicles and receive rental bookings.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild size="sm" className="rounded-xl">
                <Link to="/earn">
                  Get Started on /earn
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowProfileForm(!showProfileForm)}
                className="text-xs rounded-xl"
              >
                <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                {showProfileForm ? "Close Form" : "Host Quick Setup"}
              </Button>
            </div>
          </div>
        )}

        {/* Listings Paused Warning Banner */}
        {displayVendor?.listings_paused_at && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Your listings are paused
                </p>
                <p className="text-xs text-muted-foreground">
                  Your listings were paused because 3 requests expired without a response. Turn them back on from your dashboard.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleReactivateListings}
              disabled={isReactivating}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shrink-0 text-xs font-semibold px-4"
            >
              {isReactivating ? "Re-activating..." : "Re-activate listings"}
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

                <div className="mt-3 pt-3 border-t border-border/80 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Earnings:</span>
                    <span className="font-bold text-foreground">{currency(earnings)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Response Rate:</span>
                    <span className="font-semibold text-foreground">
                      {responseStats && responseStats.request_count > 0 && responseStats.response_rate != null
                        ? `${Math.round(responseStats.response_rate * 100)}%`
                        : "—"}
                    </span>
                  </div>
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
                      onClick={() => handleTabClick(item.id)}
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
                      onClick={() => handleTabClick("bookings")}
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                    >
                      Review Requests
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat icon={Car} label="Fleet Size" value={vehiclesPager.total} />
                  <Stat icon={Calendar} label="Total Bookings" value={totalBookings} />
                  <Stat icon={DollarSign} label="Gross Earnings" value={currency(earnings)} />
                  <Stat
                    icon={Clock}
                    label="Response Rate"
                    value={
                      responseStats && responseStats.request_count > 0 && responseStats.response_rate != null
                        ? `${Math.round(responseStats.response_rate * 100)}%`
                        : "100%"
                    }
                  />
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
                  <CardContent className="space-y-4">
                    <VehiclesGrid
                      vehicles={displayVehicles}
                      onTogglePause={handleTogglePause}
                      onToggleInstantBook={handleToggleInstantBook}
                      onDelete={(v) => setVehicleToDelete(v)}
                      isDeletingId={isDeleting ? vehicleToDelete?.id : null}
                    />
                    <ListPager {...vehiclesPager} />
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
                    <HostAnalytics stats={stats} avgRating={avgRating} />
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
                      <Badge variant="outline">{totalBookings} Total</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pendingCount > 0 && (
                      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300">
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
                      {pendingBookings.length === 0 && displayBookings.length === 0 ? (
                        <li className="py-8 text-center text-sm text-muted-foreground">
                          No rental bookings yet.
                        </li>
                      ) : (
                        <>
                          {pendingBookings.map((b: any) => {
                            const isExpired = b.respond_by ? now > new Date(b.respond_by).getTime() : false;
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
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] font-medium ${
                                        isExpired
                                          ? "bg-destructive/10 text-destructive border-destructive/30"
                                          : "bg-amber-500/10 text-amber-700 border-amber-300"
                                      }`}
                                    >
                                      {isExpired
                                        ? "Request expired"
                                        : b.respond_by
                                          ? `Respond within ${formatTimeLeft(b.respond_by, now)}`
                                          : "Needs approval"}
                                    </Badge>
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
                                        variant="outline"
                                        className="text-[10px] capitalize bg-amber-50 text-amber-700 border-amber-300"
                                      >
                                        pending
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                                      disabled={isProcessing || isExpired}
                                      onClick={() => decideBooking(b.id, "confirmed")}
                                      title={isExpired ? "This request has expired" : undefined}
                                    >
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      {isProcessing ? "Approving…" : "Approve"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
                                      disabled={isProcessing || isExpired}
                                      onClick={() => decideBooking(b.id, "rejected")}
                                      title={isExpired ? "This request has expired" : undefined}
                                    >
                                      <X className="mr-1 h-3.5 w-3.5" />
                                      Decline
                                    </Button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                          {displayBookings.map((b: any) => {
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
                                      {currency(b.provider_earning ?? (b.base_price ? Number(b.base_price) * 0.882 : b.total_price))}
                                      <span className="text-[10px] font-normal text-muted-foreground ml-1">(Your payout)</span>
                                    </p>
                                    {Number(b.service_fee) > 0 && (
                                      <p className="text-[10px] text-muted-foreground">
                                        Fee {currency(b.service_fee)} to Admin
                                      </p>
                                    )}
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
                                </div>
                              </li>
                            );
                          })}
                        </>
                      )}
                    </ul>
                    <ListPager {...bookingsPager} />
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
                  <CardContent className="space-y-4">
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
                    <ListPager {...payoutsPager} />
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
                  <CardContent className="space-y-4">
                    {displayReviews.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No reviews yet.</p>
                    ) : (
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
                    )}
                    <ListPager {...reviewsPager} />
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
  onTogglePause,
  onToggleInstantBook,
  isDeletingId,
}: {
  vehicles: any[];
  onDelete?: (vehicle: any) => void;
  onTogglePause?: (vehicle: any) => void;
  onToggleInstantBook?: (vehicle: any, val: boolean) => void;
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
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
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
              <div className="mt-4 pt-3 border-t border-border/60 space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground text-sm sm:text-base">
                      {currency(v.price_daily)}
                    </span>
                    <span className="text-xs text-muted-foreground"> / day</span>
                  </div>
                  {v.instant_book && (
                    <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">
                      <Zap className="h-2.5 w-2.5 fill-current" /> Instant
                    </Badge>
                  )}
                </div>
                {onToggleInstantBook && (
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-muted/30 border border-border/50 text-xs">
                    <div className="space-y-0.5 pr-2 min-w-0">
                      <span className="font-medium text-foreground flex items-center gap-1 text-xs">
                        <Zap className="h-3 w-3 text-amber-500 fill-current shrink-0" /> Instant Book
                      </span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Guests are confirmed immediately; you can't decline.
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(v.instant_book)}
                      onCheckedChange={(checked) => onToggleInstantBook(v, checked)}
                      aria-label="Toggle Instant Book"
                    />
                  </div>
                )}
                <div className="flex items-center gap-1.5 w-full">
                  {v.verification_status === "approved" && onTogglePause && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 px-2 text-xs rounded-lg min-w-0 gap-1.5 [&_svg]:size-3.5"
                      onClick={() => onTogglePause(v)}
                      title={v.status === "paused" ? "Reactivate vehicle" : "Pause vehicle"}
                    >
                      {v.status === "paused" ? (
                        <>
                          <Play className="text-emerald-600 shrink-0" />
                          <span className="truncate">Reactivate</span>
                        </>
                      ) : (
                        <>
                          <Pause className="text-amber-600 shrink-0" />
                          <span className="truncate">Pause</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 px-2 text-xs rounded-lg min-w-0 gap-1.5 [&_svg]:size-3.5"
                  >
                    <Link to="/vehicle/$id" params={{ id: v.id }}>
                      <Eye className="shrink-0" />
                      <span className="truncate">View</span>
                    </Link>
                  </Button>
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isDeletingId === v.id}
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 rounded-lg shrink-0 flex items-center justify-center [&_svg]:size-3.5"
                      onClick={() => onDelete(v)}
                      title="Delete vehicle listing"
                      aria-label="Delete vehicle listing"
                    >
                      {isDeletingId === v.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
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
