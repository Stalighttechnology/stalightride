import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

function AdminPage() {
  const { user } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as any }).then(({ data }) => setIsAdmin(!!data));
  }, [user?.id]);

  if (isAdmin === null) return <div className="min-h-screen"><SiteHeader /><div className="p-8"><Skeleton className="h-40" /></div></div>;
  if (!isAdmin) return (
    <div className="min-h-screen"><SiteHeader />
      <div className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Admins only.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Admin verification</h1>
        <Tabs defaultValue="vehicles" className="mt-6">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 p-1.5 rounded-xl h-auto bg-muted">
            <TabsTrigger value="vehicles" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Vehicles</TabsTrigger>
            <TabsTrigger value="hosts" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Hosts (KYC)</TabsTrigger>
            <TabsTrigger value="drivers" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Drivers</TabsTrigger>
            <TabsTrigger value="licences" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Driving licences</TabsTrigger>
            <TabsTrigger value="washes" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Vehicle wash</TabsTrigger>
            <TabsTrigger value="disputes" className="text-xs sm:text-sm px-2.5 sm:px-3 py-1.5">Disputes</TabsTrigger>
          </TabsList>
          <TabsContent value="vehicles"><VehicleQueue /></TabsContent>
          <TabsContent value="hosts"><HostQueue /></TabsContent>
          <TabsContent value="drivers"><DriverQueue /></TabsContent>
          <TabsContent value="licences"><LicenceQueue /></TabsContent>
          <TabsContent value="washes"><WashQueue /></TabsContent>
          <TabsContent value="disputes"><DisputeQueue /></TabsContent>


        </Tabs>

      </div>
    </div>
  );
}

function VehicleQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,title,brand,model,year,city,vendor_id,rc_url,insurance_url,pollution_url,fitness_url,verification_status,rejection_reason,created_at,vendors:vendor_id(business_name,kyc_status)" as any)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);

  };
  useEffect(() => { load(); }, []);

  const paths = (items ?? []).flatMap((v) => [v.rc_url, v.insurance_url, v.pollution_url, v.fitness_url].filter(Boolean));
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await supabase.from("vehicles").update({
      verification_status: status,
      rejection_reason: reason,
      verified_at: status === "approved" ? new Date().toISOString() : null,
      status: status === "approved" ? "active" : "draft",
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Vehicle ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0) return <p className="mt-6 text-sm text-muted-foreground">Nothing to review.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((v) => (
        <Card key={v.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Link to="/vehicle/$id" params={{ id: v.id }} className="font-medium hover:underline">{v.title}</Link>
                <StatusBadge status={v.verification_status} />
              </div>
              <p className="text-xs text-muted-foreground">{v.brand} {v.model} · {v.year} · {v.city} · Host: {v.vendors?.business_name ?? v.vendor_id.slice(0, 8)} · KYC: {v.vendors?.kyc_status ?? "—"}</p>
            </div>
            <div className="flex gap-2">
              {v.verification_status !== "approved" && <Button size="sm" onClick={() => decide(v.id, "approved")}><ShieldCheck className="mr-1 h-3 w-3" />Approve</Button>}
              {v.verification_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => decide(v.id, "rejected")}>Reject</Button>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <DocLink label="RC" url={v.rc_url ? signed[v.rc_url] : null} />
            <DocLink label="Insurance" url={v.insurance_url ? signed[v.insurance_url] : null} />
            <DocLink label="Pollution" url={v.pollution_url ? signed[v.pollution_url] : null} />
            <DocLink label="Fitness" url={v.fitness_url ? signed[v.fitness_url] : null} />
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function LicenceQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,dl_number,dl_expiry,dl_front_url,dl_back_url,dl_status,dl_rejection_reason" as any)
      .in("dl_status" as any, ["pending", "rejected", "approved"])
      .order("dl_status", { ascending: true } as any)
      .limit(200);
    setItems((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const paths = (items ?? []).flatMap((p) => [p.dl_front_url, p.dl_back_url].filter(Boolean));
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await supabase.from("profiles").update({
      dl_status: status, dl_rejection_reason: reason, dl_verified_at: status === "approved" ? new Date().toISOString() : null,
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Licence ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  const pending = items.filter((p) => p.dl_status === "pending");
  if (pending.length === 0) return <p className="mt-6 text-sm text-muted-foreground">Nothing pending.</p>;

  return (
    <div className="mt-4 space-y-3">
      {pending.map((p) => (
        <Card key={p.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{p.full_name || p.id.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">Licence: {p.dl_number} · Expiry: {p.dl_expiry}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(p.id, "approved")}><ShieldCheck className="mr-1 h-3 w-3" />Approve</Button>
              <Button size="sm" variant="outline" onClick={() => decide(p.id, "rejected")}>Reject</Button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {p.dl_front_url && signed[p.dl_front_url] && <a href={signed[p.dl_front_url]} target="_blank" rel="noreferrer"><img src={signed[p.dl_front_url]} className="aspect-[16/10] w-full rounded-md border object-cover" alt="front" /></a>}
            {p.dl_back_url && signed[p.dl_back_url] && <a href={signed[p.dl_back_url]} target="_blank" rel="noreferrer"><img src={signed[p.dl_back_url]} className="aspect-[16/10] w-full rounded-md border object-cover" alt="back" /></a>}
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
function DocLink({ label, url }: { label: string; url: string | null | undefined }) {
  if (!url) return <span className="rounded border border-dashed border-border px-2 py-1 text-muted-foreground">{label}: —</span>;
  return <a className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent" href={url} target="_blank" rel="noreferrer">{label}<ExternalLink className="h-3 w-3" /></a>;
}

function DisputeQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
    const { data } = await supabase
      .from("disputes")
      .select("*, bookings(id,vehicles(title))")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id: string) => {
    const resolution = window.prompt("Resolution notes (visible to both parties)?");
    if (!resolution?.trim()) return;
    const { error } = await supabase
      .from("disputes")
      .update({ status: "resolved", resolution: resolution.trim(), resolved_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dispute resolved");
    load();
  };
  const startReview = async (id: string) => {
    const { error } = await supabase.from("disputes").update({ status: "in_review" } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked in review");
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0) return <p className="mt-6 text-sm text-muted-foreground">No disputes filed.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((d) => (
        <DisputeCard key={d.id} d={d} onResolve={() => resolve(d.id)} onReview={() => startReview(d.id)} />
      ))}
    </div>
  );
}

function DisputeCard({ d, onResolve, onReview }: { d: any; onResolve: () => void; onReview: () => void }) {
  const urls = useSignedUrls("trip-photos", d.photos ?? []);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{d.subject}</p>
            <p className="text-xs text-muted-foreground">
              {d.category} · {d.bookings?.vehicles?.title ?? "—"} · {new Date(d.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={d.status === "resolved" ? "secondary" : "outline"}>{d.status}</Badge>
            {d.status === "open" && <Button size="sm" variant="outline" onClick={onReview}>Mark in review</Button>}
            {d.status !== "resolved" && <Button size="sm" onClick={onResolve}><ShieldCheck className="mr-1 h-3 w-3" />Resolve</Button>}
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm">{d.detail}</p>
        {d.photos && d.photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {d.photos.map((p: string) => (
              <a key={p} href={urls[p] ?? "#"} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border">
                {urls[p] && <img src={urls[p]!} alt="" className="h-full w-full object-cover" />}
              </a>
            ))}
          </div>
        )}
        {d.resolution && (
          <div className="mt-3 rounded-md bg-muted p-3 text-sm">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Resolution</span>
            <p className="mt-1 whitespace-pre-line">{d.resolution}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HostQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
    const { data, error } = await supabase
      .from("vendors")
      .select("id,business_name,bio,kyc_status,id_document_url,payout_email,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const paths = (items ?? []).map((v) => v.id_document_url).filter(Boolean);
  const signed = useSignedUrls("kyc-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("vendors").update({ kyc_status: status } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Host ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0) return <p className="mt-6 text-sm text-muted-foreground">No hosts yet.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((v) => (
        <Card key={v.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{v.business_name}</p>
                <Badge variant={v.kyc_status === "approved" ? "secondary" : v.kyc_status === "rejected" ? "destructive" : "outline"}>{v.kyc_status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{v.bio || "No bio"} · Joined {new Date(v.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-2">
              {v.kyc_status !== "approved" && <Button size="sm" onClick={() => decide(v.id, "approved")}><ShieldCheck className="mr-1 h-3 w-3" />Approve host</Button>}
              {v.kyc_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => decide(v.id, "rejected")}>Reject</Button>}
            </div>
          </div>
          <div className="mt-3 text-xs">
            <DocLink label="ID document" url={v.id_document_url ? signed[v.id_document_url] : null} />
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function DriverQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select("id,full_name,city,phone,experience_years,hourly_rate,daily_rate,dl_number,dl_expiry,dl_front_url,dl_back_url,id_document_url,verification_status,status,rejection_reason,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const paths = (items ?? []).flatMap((d) => [d.dl_front_url, d.dl_back_url, d.id_document_url].filter(Boolean));
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await supabase.from("drivers").update({
      verification_status: status,
      rejection_reason: reason,
      verified_at: status === "approved" ? new Date().toISOString() : null,
      status: status === "approved" ? "active" : "draft",
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Driver ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0) return <p className="mt-6 text-sm text-muted-foreground">No driver applications yet.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((d) => (
        <Card key={d.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{d.full_name}</p>
                <StatusBadge status={d.verification_status} />
                <Badge variant="outline">{d.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {d.city} · {d.experience_years} yrs · ₹{d.hourly_rate}/hr · ₹{d.daily_rate}/day · Licence {d.dl_number ?? "—"} (exp {d.dl_expiry ?? "—"})
              </p>
            </div>
            <div className="flex gap-2">
              {d.verification_status !== "approved" && <Button size="sm" onClick={() => decide(d.id, "approved")}><ShieldCheck className="mr-1 h-3 w-3" />Approve</Button>}
              {d.verification_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => decide(d.id, "rejected")}>Reject</Button>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <DocLink label="Licence front" url={d.dl_front_url ? signed[d.dl_front_url] : null} />
            <DocLink label="Licence back" url={d.dl_back_url ? signed[d.dl_back_url] : null} />
            <DocLink label="Government ID" url={d.id_document_url ? signed[d.id_document_url] : null} />
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function WashQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data, error }, { data: p }] = await Promise.all([
      supabase
        .from("wash_bookings")
        .select("*, wash_services:service_id(name,duration_minutes,vehicle_category), wash_vendors:assigned_vendor_id(name,contact_phone,city)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("wash_vendors").select("id,name,city,daily_capacity,contact_phone,active").eq("active", true).order("name"),
    ]);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    setPartners((p as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const decide = async (b: any, decision: "confirmed" | "rejected" | "completed") => {
    let note: string | null = null;
    let vendorId: string | null = null;
    if (decision === "confirmed") {
      vendorId = assign[b.id] ?? null;
      if (!vendorId) return toast.error("Assign a washer partner first");
      note = window.prompt("Note for the customer (optional)?") || null;
    }
    if (decision === "rejected") {
      note = window.prompt("Reason (no washer available, out of area, ...)?") || null;
      if (!note) return;
    }
    setBusy(b.id);
    const { error } = await supabase.rpc("admin_decide_wash_booking", {
      _wash_booking_id: b.id,
      _decision: decision,
      _vendor_id: vendorId,
      _note: note,
    } as any);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(decision === "confirmed" ? "Approved — customer can pay now" : decision === "rejected" ? "Rejected" : "Marked completed");
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;

  return (
    <div className="mt-4 space-y-3">
      {partners.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No active washer partners yet — add them in the backend `wash_vendors` table to approve bookings.
        </p>
      )}
      {items.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No wash bookings yet.</p>}
      {items.map((b) => (
        <Card key={b.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{b.wash_services?.name ?? "Vehicle wash"}</p>
                <Badge variant={b.status === "confirmed" ? "secondary" : b.status === "rejected" ? "destructive" : "outline"}>{b.status}</Badge>
                {b.payment_status === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
                {(b.payment_status === "refunded" || b.payment_status === "partially_refunded") && <Badge variant="outline">{b.payment_status}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {b.slot_date} at {String(b.slot_time).slice(0, 5)} · {b.city} · ₹{b.price}
                {b.wash_vendors?.name ? ` · Partner: ${b.wash_vendors.name}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">📍 {b.address}{b.vehicle_label ? ` · ${b.vehicle_label}` : ""}</p>
              {b.notes && <p className="mt-1 text-xs">📝 {b.notes}</p>}
              {b.rejection_reason && <p className="mt-1 text-xs text-destructive">Rejected: {b.rejection_reason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {b.status === "pending" && (
                <>
                  <select
                    aria-label="Assign washer partner"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={assign[b.id] ?? ""}
                    onChange={(e) => setAssign({ ...assign, [b.id]: e.target.value })}
                  >
                    <option value="">Assign washer…</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · {p.city} ({p.daily_capacity}/day)</option>
                    ))}
                  </select>
                  <Button size="sm" disabled={busy === b.id} onClick={() => decide(b, "confirmed")}>
                    <ShieldCheck className="mr-1 h-3 w-3" />Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === b.id} onClick={() => decide(b, "rejected")}>Reject</Button>
                </>
              )}
              {b.status === "confirmed" && (
                <>
                  {b.payment_status === "paid"
                    ? <Button size="sm" disabled={busy === b.id} onClick={() => decide(b, "completed")}>Mark completed</Button>
                    : <span className="text-xs text-muted-foreground">Waiting for customer payment</span>}
                  <Button size="sm" variant="outline" disabled={busy === b.id} onClick={() => decide(b, "rejected")}>Cancel & refund</Button>
                </>
              )}
            </div>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
