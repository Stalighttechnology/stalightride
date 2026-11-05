import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Car, DollarSign, Calendar, ShieldCheck, ScanLine, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


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
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
          <h1 className="font-display text-3xl font-semibold">Become a host</h1>
          <p className="mt-1 text-muted-foreground">Set up your host profile to start listing vehicles.</p>
          <Card className="mt-6"><CardContent className="p-6">
            <form onSubmit={saveVendor} className="space-y-4">
              <div>
                <Label>Business / display name</Label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
              </div>
              <div>
                <Label>Short bio</Label>
                <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell renters about yourself" />
              </div>
              <Button type="submit" className="w-full shadow-glow" disabled={saving}>{saving ? "Saving…" : "Create host profile"}</Button>
            </form>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pb-8">
        <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">Host dashboard</h1>
            <p className="truncate text-sm text-muted-foreground">Welcome, {vendor.business_name}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button asChild variant="outline" className="rounded-xl"><Link to="/scan"><ScanLine className="mr-1.5 h-4 w-4" />Scan QR</Link></Button>
            <Button asChild className="rounded-xl shadow-glow"><Link to="/vendor/vehicles/new"><Plus className="mr-1.5 h-4 w-4" />Add vehicle</Link></Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat icon={Car} label="Vehicles" value={vehicles?.length ?? 0} />
          <Stat icon={Calendar} label="Bookings" value={bookings?.length ?? 0} />
          <Stat icon={DollarSign} label="Earnings" value={currency(earnings)} />
        </div>


        <KycCard vendor={vendor} userId={user.id} onDone={load} />

        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <HostAnalytics bookings={bookings ?? []} avgRating={avgRating} />
          {vehicles && vehicles.length > 0 ? (
            <AvailabilityCalendar vehicles={vehicles.map((v) => ({ id: v.id, title: v.title }))} />
          ) : (
            <Card className="rounded-2xl"><CardContent className="p-6 text-sm text-muted-foreground">
              Add a vehicle to manage its availability calendar.
            </CardContent></Card>
          )}
        </div>

        <div className="mt-8">
          <Tabs defaultValue="vehicles">
            <TabsList>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="vehicles">
              <section className="mt-4">
                {!vehicles && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>}
                {vehicles && vehicles.length === 0 && <p className="mt-4 text-muted-foreground">No vehicles yet.</p>}
                {vehicles && vehicles.length > 0 && (
                  <VehiclesGrid vehicles={vehicles} />
                )}
              </section>
            </TabsContent>

            <TabsContent value="activity">
              <section className="mt-4">
                {!bookings || bookings.length === 0 ? (
                  <p className="mt-4 text-muted-foreground">No bookings yet.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-border rounded-2xl border border-border/60 bg-card">
                    {bookings.map((b) => (
                      <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{b.vehicles?.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{b.start_date} → {b.end_date}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">{currency(b.total_price)}</p>
                          <Badge variant="outline" className="mt-1">{b.status}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="payouts">
              <section className="mt-4">
                {payouts === null && <Skeleton className="h-32 rounded-2xl" />}
                {payouts !== null && payouts.length === 0 && (
                  <p className="mt-4 text-muted-foreground">No payouts yet. Earnings are credited after each trip.</p>
                )}
                {payouts !== null && payouts.length > 0 && (
                  <ul className="divide-y divide-border rounded-2xl border border-border/60 bg-card">
                    {payouts.map((p) => (
                      <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{currency(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline">{p.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="reviews">
              <section className="mt-4">
                {vendorReviews === null && <Skeleton className="h-32 rounded-2xl" />}
                {vendorReviews !== null && vendorReviews.length === 0 && (
                  <p className="mt-4 text-muted-foreground">No reviews yet.</p>
                )}
                {vendorReviews !== null && vendorReviews.length > 0 && (
                  <ul className="grid gap-3">
                    {vendorReviews.map((r) => (
                      <Card key={r.id}><CardContent className="p-4">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{(r.vehicles as any)?.title}</p>
                        <div className="flex items-center gap-1 mb-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${i < Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                            />
                          ))}
                          <span className="ml-1 text-sm font-medium">{r.rating}</span>
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                      </CardContent></Card>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card><CardContent className="flex items-center gap-4 p-4 sm:p-5">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-semibold sm:text-2xl">{value}</div>
      </div>
    </CardContent></Card>
  );
}


function VehiclesGrid({ vehicles }: { vehicles: any[] }) {
  const paths = vehicles.map((v) => v.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url);
  const urls = useSignedUrls("vehicle-images", paths);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((v) => {
        const img = v.vehicle_images?.slice().sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
        const url = img ? urls[img.url] : null;
        return (
          <Card key={v.id}>
            <div className="aspect-[16/9] overflow-hidden rounded-t-lg bg-muted">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>
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
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-500" />
        <div>
          <p className="text-sm font-medium">Verified host</p>
          <p className="text-xs text-muted-foreground">Your identity has been approved by our team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
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
