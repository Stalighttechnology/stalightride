import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { VendorMaintenanceTab } from "@/components/vendor-maintenance";

export const Route = createFileRoute("/_authenticated/vendor/")({ component: VendorDashboard });

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

  // Dedicated Host Dashboard Sidebar Tab State
  const [activeTab, setActiveTab] = useState<
    "fleet" | "calendar" | "analytics" | "bookings" | "payouts" | "maintenance" | "reviews" | "kyc"
  >("fleet");

  const load = async () => {
    if (!user) return;
    const [{ data: vend }, { data: vhs }, { data: bks }] = await Promise.all([
      supabase.from("vendors").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("vehicles").select("*, vehicle_images(url,sort_order)").eq("vendor_id", user.id).order("created_at", { ascending: false }),
      supabase.from("bookings").select("*, vehicles(title)").eq("vendor_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setVendor(vend);
    setVehicles(vhs ?? []);
    setBookings(bks ?? []);
    if (vend) { setBusinessName(vend.business_name); setBio(vend.bio ?? ""); }

    // Payouts
    const { data: pts } = await supabase
      .from("payouts")
      .select("*")
      .eq("vendor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setPayouts(pts ?? []);

    // Reviews for all vendor vehicles
    const vehicleIds = (vhs ?? []).map((v: any) => v.id);
    if (vehicleIds.length > 0) {
      const { data: rvs } = await supabase
        .from("reviews")
        .select("*, vehicles(title)")
        .in("vehicle_id", vehicleIds);
      setVendorReviews(rvs ?? []);
    } else {
      setVendorReviews([]);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const saveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const payload = { id: user.id, business_name: businessName, bio };
    const { error } = await supabase.from("vendors").upsert(payload);
    if (error) toast.error(error.message);
    else {
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "vendor" as const }, { onConflict: "user_id,role" });
      toast.success("Host profile saved");
      load();
    }
    setSaving(false);
  };

  if (!user) return null;

  const earnings = (bookings ?? [])
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + Number(b.total_price), 0);

  const rated = (vehicles ?? []).filter((v) => Number(v.review_count) > 0);
  const avgRating = rated.length
    ? rated.reduce((s, v) => s + Number(v.avg_rating), 0) / rated.length
    : undefined;

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
          <h1 className="font-display text-3xl font-semibold">Become a host</h1>
          <p className="mt-1 text-muted-foreground">Set up your host profile to start listing vehicles.</p>
          <Card className="mt-6">
            <CardContent className="p-6">
              <form onSubmit={saveVendor} className="space-y-4">
                <div>
                  <Label>Business / display name</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
                </div>
                <div>
                  <Label>Short bio</Label>
                  <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell renters about yourself" />
                </div>
                <Button type="submit" className="w-full shadow-glow" disabled={saving}>
                  {saving ? "Saving…" : "Create host profile"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const sidebarNavItems = [
    { id: "fleet", label: "Fleet & Vehicles", icon: Car, badge: String(vehicles?.length ?? 0) },
    { id: "calendar", label: "Availability Calendar", icon: Calendar },
    { id: "analytics", label: "Analytics & Revenue", icon: BarChart3 },
    { id: "bookings", label: "Bookings & Activity", icon: ClipboardList, badge: String(bookings?.length ?? 0) },
    { id: "payouts", label: "Payouts & Income", icon: Wallet },
    { id: "maintenance", label: "Fleet Health", icon: Wrench },
    { id: "reviews", label: "Guest Reviews", icon: Star, badge: String(vendorReviews?.length ?? 0) },
    { id: "kyc", label: "Host Verification", icon: ShieldCheck, badge: vendor.kyc_status === "approved" ? "Verified" : "Pending" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-brand/30 text-brand bg-brand/10">
                <LayoutDashboard className="mr-1 h-3.5 w-3.5" /> Host Console
              </Badge>
              {vendor.kyc_status === "approved" ? (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Verified Host
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  Verification Pending
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              {vendor.business_name}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Manage your fleet, view real-time trip handovers, track earnings, and maintain vehicle health.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <Link to="/scan">
                <ScanLine className="mr-1.5 h-4 w-4" /> Scan QR Handover
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl bg-brand text-brand-foreground hover:bg-brand/90">
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
                    <p className="font-semibold text-sm truncate">{vendor.business_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {avgRating ? `⭐ ${avgRating.toFixed(1)} / 5.0 Rating` : "New Fleet Host"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/80 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Earnings:</span>
                  <span className="font-bold text-foreground">{currency(earnings)}</span>
                </div>
              </Card>

              {/* Sidebar Navigation */}
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0" aria-label="Host navigation">
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
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`} />
                        <span>{item.label}</span>
                      </div>
                      {"badge" in item && (
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-[10px] px-1.5 py-0 ${
                            isActive ? "bg-white/20 text-brand-foreground border-transparent" : "text-muted-foreground"
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
                <Button asChild variant="outline" size="sm" className="w-full justify-start text-xs">
                  <Link to="/vendor/vehicles/new">
                    <Plus className="mr-2 h-3.5 w-3.5 text-brand" /> Add New Vehicle
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start text-xs">
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
                <div className="grid grid-cols-3 gap-3">
                  <Stat icon={Car} label="Fleet Size" value={vehicles?.length ?? 0} />
                  <Stat icon={Calendar} label="Total Bookings" value={bookings?.length ?? 0} />
                  <Stat icon={DollarSign} label="Gross Earnings" value={currency(earnings)} />
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Car className="h-4 w-4 text-brand" /> Your Listed Vehicles
                      </CardTitle>
                      <CardDescription>Live status, daily rental pricing, and guest booking links</CardDescription>
                    </div>
                    <Button asChild size="sm">
                      <Link to="/vendor/vehicles/new">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add Vehicle
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {!vehicles && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-40 rounded-2xl" />
                        ))}
                      </div>
                    )}
                    {vehicles && vehicles.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No vehicles listed yet. Click "Add Vehicle" to create your first listing!
                      </div>
                    )}
                    {vehicles && vehicles.length > 0 && <VehiclesGrid vehicles={vehicles} />}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 2: Availability Calendar */}
            {activeTab === "calendar" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-brand" /> Fleet Availability & Blackout Dates
                    </CardTitle>
                    <CardDescription>Block off dates for maintenance or personal use</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {vehicles && vehicles.length > 0 ? (
                      <AvailabilityCalendar vehicles={vehicles.map((v) => ({ id: v.id, title: v.title }))} />
                    ) : (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Add a vehicle to manage its availability calendar.
                      </div>
                    )}
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
                    <CardDescription>Monthly bookings breakdown, revenue progression, and ratings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HostAnalytics bookings={bookings ?? []} avgRating={avgRating} />
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
                        <ClipboardList className="h-4 w-4 text-brand" /> Rental Bookings & Guest Activity
                      </CardTitle>
                      <CardDescription>Recent reservations, trip windows, and payment statuses</CardDescription>
                    </div>
                    <Badge variant="outline">{bookings?.length ?? 0} Total</Badge>
                  </CardHeader>
                  <CardContent>
                    {!bookings || bookings.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">No bookings recorded yet.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {bookings.map((b) => (
                          <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{b.vehicles?.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{b.start_date} → {b.end_date}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-foreground">{currency(b.total_price)}</p>
                              <Badge variant="outline" className="mt-1 text-[10px]">{b.status}</Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
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
                      <Wallet className="h-4 w-4 text-brand" /> Host Payout Transfers
                    </CardTitle>
                    <CardDescription>Earnings are credited directly to your registered bank account after check-out</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {payouts === null && <Skeleton className="h-32 rounded-2xl" />}
                    {payouts !== null && payouts.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No payouts yet. Earnings are deposited automatically after each completed trip.
                      </p>
                    )}
                    {payouts !== null && payouts.length > 0 && (
                      <ul className="divide-y divide-border">
                        {payouts.map((p) => (
                          <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3.5">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-emerald-600">{currency(p.amount)}</p>
                              <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
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
                    <CardDescription>Track insurance, fitness, permit expiry dates and service logs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <VendorMaintenanceTab vehicles={vehicles ?? []} />
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
                        <Star className="h-4 w-4 text-amber-500 fill-amber-400" /> Renter Reviews & Ratings
                      </CardTitle>
                      <CardDescription>Customer feedback on vehicle cleanliness, performance, and communication</CardDescription>
                    </div>
                    {avgRating && (
                      <Badge variant="secondary" className="text-amber-700 bg-amber-50">
                        ⭐ {avgRating.toFixed(1)} Average
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    {vendorReviews === null && <Skeleton className="h-32 rounded-2xl" />}
                    {vendorReviews !== null && vendorReviews.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">No guest reviews yet.</p>
                    )}
                    {vendorReviews !== null && vendorReviews.length > 0 && (
                      <div className="space-y-3">
                        {vendorReviews.map((r) => (
                          <div key={r.id} className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                            <p className="text-xs font-semibold text-foreground">{(r.vehicles as any)?.title}</p>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3.5 w-3.5 ${i < Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                                />
                              ))}
                              <span className="ml-1 text-xs font-semibold">{r.rating}</span>
                            </div>
                            {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                            <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
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
                      <ShieldCheck className="h-4 w-4 text-brand" /> Host Identity & KYC Verification
                    </CardTitle>
                    <CardDescription>Verified hosts enjoy priority search ranking and instant instant payout approval</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <KycCard vendor={vendor} userId={user.id} onDone={load} />
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

function VehiclesGrid({ vehicles }: { vehicles: any[] }) {
  const paths = vehicles.map((v) => v.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url);
  const urls = useSignedUrls("vehicle-images", paths);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((v) => {
        const img = v.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
        const url = img ? urls[img.url] : null;
        return (
          <Card key={v.id} className="overflow-hidden">
            <div className="aspect-[16/9] overflow-hidden bg-muted">
              {url && <img src={url} alt="" className="h-full w-full object-cover" />}
            </div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{v.city}</div>
                </div>
                <Badge variant={v.verification_status === "approved" ? "secondary" : v.verification_status === "rejected" ? "destructive" : "outline"}>
                  {v.verification_status === "approved" ? (v.status === "active" ? "Live" : v.status) : v.verification_status === "rejected" ? "Rejected" : "Pending review"}
                </Badge>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>{currency(v.price_daily)} / day</span>
                <Link to="/vehicle/$id" params={{ id: v.id }} className="text-foreground hover:underline">View</Link>
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
    const { error: upErr } = await supabase.storage.from("kyc-docs").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("vendors").update({ id_document_url: path, kyc_status: "pending" } as any).eq("id", userId);
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
          <p className="text-xs text-muted-foreground">Your identity has been approved by our team.</p>
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
            {status === "rejected" && <p className="text-xs text-destructive">Rejected — please upload a clearer document.</p>}
          </div>
        </div>
        {status !== "pending" && (
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
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
