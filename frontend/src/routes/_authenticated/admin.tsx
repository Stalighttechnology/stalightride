import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ListPager, usePage } from "@/components/list-pager";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, ExternalLink, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CouponManager,
  GrantCreditForm,
  PlatformSettingsForm,
  WithdrawalQueue,
} from "@/components/admin/money-tabs";
import { CustomersTab } from "@/components/admin/customers-tab";
import { BookingsMonitorTab } from "@/components/admin/bookings-monitor-tab";
import { CitiesCategoriesTab } from "@/components/admin/cities-categories-tab";
import { RevenueCommissionsTab } from "@/components/admin/revenue-commissions-tab";
import { PaymentsRefundsTab } from "@/components/admin/payments-refunds-tab";
import { ReviewModerationTab } from "@/components/admin/review-moderation-tab";
import { BroadcastsTab } from "@/components/admin/broadcasts-tab";
import { SupportTicketsTab } from "@/components/admin/support-tickets-tab";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

function AdminPage() {
  const { user } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const routerLocation = useRouterState({ select: (s) => s.location });
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t) return t;
    }
    return "vehicles";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t) setActiveTab(t);
    }
  }, [routerLocation.search]);

  useEffect(() => {
    const onTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("synchoo:tab-change", onTabChange);
    return () => window.removeEventListener("synchoo:tab-change", onTabChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .rpc("has_role", { _user_id: user.id, _role: "admin" as any })
      .then(({ data }) => setIsAdmin(!!data));
  }, [user?.id]);

  if (isAdmin === null)
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="p-8">
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  if (!isAdmin)
    return (
      <div className="min-h-screen">
        <SiteHeader />
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold">Super Admin Console</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Platform-wide verifications, customer management, booking monitoring, financial
              reports, and system settings.
            </p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val: string) => {
            setActiveTab(val);
            if (typeof window !== "undefined") {
              const u = new URL(window.location.href);
              u.searchParams.set("tab", val);
              window.history.replaceState({}, "", u.toString());
            }
          }}
          className="space-y-4"
        >
          <TabsList className="flex w-full items-center justify-start gap-1 p-1.5 rounded-xl h-auto bg-muted overflow-x-auto no-scrollbar">
            {/* Verification Queues */}
            <TabsTrigger value="vehicles" className="text-xs px-2.5 py-1.5">
              Vehicles
            </TabsTrigger>
            <TabsTrigger value="hosts" className="text-xs px-2.5 py-1.5">
              Hosts (KYC)
            </TabsTrigger>
            <TabsTrigger value="drivers" className="text-xs px-2.5 py-1.5">
              Drivers
            </TabsTrigger>
            <TabsTrigger value="licences" className="text-xs px-2.5 py-1.5">
              Licences
            </TabsTrigger>
            <TabsTrigger value="cleaners" className="text-xs px-2.5 py-1.5">
              Cleaners
            </TabsTrigger>
            <TabsTrigger value="wash-centers" className="text-xs px-2.5 py-1.5">
              Wash Centers
            </TabsTrigger>
            <TabsTrigger value="washes" className="text-xs px-2.5 py-1.5">
              Wash Orders
            </TabsTrigger>
            <TabsTrigger value="disputes" className="text-xs px-2.5 py-1.5">
              Disputes
            </TabsTrigger>

            {/* Super Admin Management */}
            <TabsTrigger value="customers" className="text-xs px-2.5 py-1.5 font-medium">
              Customers
            </TabsTrigger>
            <TabsTrigger value="bookings" className="text-xs px-2.5 py-1.5 font-medium">
              Bookings Monitor
            </TabsTrigger>
            <TabsTrigger value="payouts" className="text-xs px-2.5 py-1.5 font-medium">
              Payouts
            </TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs px-2.5 py-1.5 font-medium">
              Revenue & Fees
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs px-2.5 py-1.5 font-medium">
              Payments & Refunds
            </TabsTrigger>
            <TabsTrigger value="cities" className="text-xs px-2.5 py-1.5 font-medium">
              Cities & Categories
            </TabsTrigger>
            <TabsTrigger value="coupons" className="text-xs px-2.5 py-1.5 font-medium">
              Coupons
            </TabsTrigger>
            <TabsTrigger value="credits" className="text-xs px-2.5 py-1.5 font-medium">
              Promo credit
            </TabsTrigger>
            <TabsTrigger value="moderation" className="text-xs px-2.5 py-1.5 font-medium">
              Reviews
            </TabsTrigger>
            <TabsTrigger value="broadcasts" className="text-xs px-2.5 py-1.5 font-medium">
              Broadcasts
            </TabsTrigger>
            <TabsTrigger value="support" className="text-xs px-2.5 py-1.5 font-medium">
              Support Tickets
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs px-2.5 py-1.5 font-medium">
              Fees & settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles">
            <VehicleQueue />
          </TabsContent>
          <TabsContent value="hosts">
            <HostQueue />
          </TabsContent>
          <TabsContent value="drivers">
            <DriverQueue />
          </TabsContent>
          <TabsContent value="licences">
            <LicenceQueue />
          </TabsContent>
          <TabsContent value="cleaners">
            <CleanersQueue />
          </TabsContent>
          <TabsContent value="wash-centers">
            <WashCentersQueue />
          </TabsContent>
          <TabsContent value="washes">
            <WashQueue />
          </TabsContent>
          <TabsContent value="disputes">
            <DisputeQueue />
          </TabsContent>

          {/* Super Admin Content Panels */}
          <TabsContent value="customers">
            <CustomersTab />
          </TabsContent>
          <TabsContent value="bookings">
            <BookingsMonitorTab />
          </TabsContent>
          <TabsContent value="payouts">
            <WithdrawalQueue />
          </TabsContent>
          <TabsContent value="revenue">
            <RevenueCommissionsTab />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentsRefundsTab />
          </TabsContent>
          <TabsContent value="cities">
            <CitiesCategoriesTab />
          </TabsContent>
          <TabsContent value="coupons">
            <CouponManager />
          </TabsContent>
          <TabsContent value="credits">
            <GrantCreditForm />
          </TabsContent>
          <TabsContent value="moderation">
            <ReviewModerationTab />
          </TabsContent>
          <TabsContent value="broadcasts">
            <BroadcastsTab />
          </TabsContent>
          <TabsContent value="support">
            <SupportTicketsTab />
          </TabsContent>
          <TabsContent value="settings">
            <PlatformSettingsForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function VehicleQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const load = async () => {
    const { data, error, count } = await api
      .from("vehicles")
      .select(
        "id,title,brand,model,year,city,vendor_id,rc_url,insurance_url,pollution_url,fitness_url,verification_status,rejection_reason,created_at,vendors:vendor_id(business_name,kyc_status)" as any,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const paths = (items ?? []).flatMap((v) =>
    [v.rc_url, v.insurance_url, v.pollution_url, v.fitness_url].filter(Boolean),
  );
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await api
      .from("vehicles")
      .update({
        verification_status: status,
        rejection_reason: reason,
        verified_at: status === "approved" ? new Date().toISOString() : null,
        status: status === "approved" ? "active" : "draft",
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Vehicle ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">Nothing to review.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((v) => (
        <Card key={v.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/vehicle/$id"
                    params={{ id: v.id }}
                    className="font-medium hover:underline"
                  >
                    {v.title}
                  </Link>
                  <StatusBadge status={v.verification_status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.brand} {v.model} · {v.year} · {v.city} · Host:{" "}
                  {v.vendors?.business_name ?? v.vendor_id.slice(0, 8)} · KYC:{" "}
                  {v.vendors?.kyc_status ?? "—"}
                </p>
              </div>
              <div className="flex gap-2">
                {v.verification_status !== "approved" && (
                  <Button size="sm" onClick={() => decide(v.id, "approved")}>
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Approve
                  </Button>
                )}
                {v.verification_status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => decide(v.id, "rejected")}>
                    Reject
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <DocLink label="RC" url={v.rc_url ? signed[v.rc_url] : null} />
              <DocLink label="Insurance" url={v.insurance_url ? signed[v.insurance_url] : null} />
              <DocLink label="Pollution" url={v.pollution_url ? signed[v.pollution_url] : null} />
              <DocLink label="Fitness" url={v.fitness_url ? signed[v.fitness_url] : null} />
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function LicenceQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const load = async () => {
    const { data, count } = await api
      .from("profiles")
      .select(
        "id,full_name,dl_number,dl_expiry,dl_front_url,dl_back_url,dl_status,dl_rejection_reason" as any,
        { count: "exact" },
      )
      .in("dl_status" as any, ["pending", "rejected", "approved"])
      .order("dl_status", { ascending: true } as any)
      .order("id")
      .range(pager.from, pager.to);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const paths = (items ?? []).flatMap((p) => [p.dl_front_url, p.dl_back_url].filter(Boolean));
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await api
      .from("profiles")
      .update({
        dl_status: status,
        dl_rejection_reason: reason,
        dl_verified_at: status === "approved" ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Licence ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  const pending = items.filter((p) => p.dl_status === "pending");
  if (pending.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">Nothing pending.</p>;

  return (
    <div className="mt-4 space-y-3">
      {pending.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{p.full_name || p.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  Licence: {p.dl_number} · Expiry: {p.dl_expiry}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(p.id, "approved")}>
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(p.id, "rejected")}>
                  Reject
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {p.dl_front_url && signed[p.dl_front_url] && (
                <a href={signed[p.dl_front_url]} target="_blank" rel="noreferrer">
                  <img
                    src={signed[p.dl_front_url]}
                    className="aspect-[16/10] w-full rounded-md border object-cover"
                    alt="front"
                  />
                </a>
              )}
              {p.dl_back_url && signed[p.dl_back_url] && (
                <a href={signed[p.dl_back_url]} target="_blank" rel="noreferrer">
                  <img
                    src={signed[p.dl_back_url]}
                    className="aspect-[16/10] w-full rounded-md border object-cover"
                    alt="back"
                  />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
        Approved
      </Badge>
    );
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
function DocLink({ label, url }: { label: string; url: string | null | undefined }) {
  if (!url)
    return (
      <span className="rounded border border-dashed border-border px-2 py-1 text-muted-foreground">
        {label}: —
      </span>
    );
  return (
    <a
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-accent"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function DisputeQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const load = async () => {
    const { data, count } = await api
      .from("disputes")
      .select("*, bookings(id,vehicles(title))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const resolve = async (id: string) => {
    const resolution = window.prompt("Resolution notes (visible to both parties)?");
    if (!resolution?.trim()) return;
    const { error } = await api
      .from("disputes")
      .update({
        status: "resolved",
        resolution: resolution.trim(),
        resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dispute resolved");
    load();
  };
  const startReview = async (id: string) => {
    const { error } = await api
      .from("disputes")
      .update({ status: "in_review" } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked in review");
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">No disputes filed.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((d) => (
        <DisputeCard
          key={d.id}
          d={d}
          onResolve={() => resolve(d.id)}
          onReview={() => startReview(d.id)}
        />
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function DisputeCard({
  d,
  onResolve,
  onReview,
}: {
  d: any;
  onResolve: () => void;
  onReview: () => void;
}) {
  const urls = useSignedUrls("trip-photos", d.photos ?? []);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{d.subject}</p>
            <p className="text-xs text-muted-foreground">
              {d.category} · {d.bookings?.vehicles?.title ?? "—"} ·{" "}
              {new Date(d.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={d.status === "resolved" ? "secondary" : "outline"}>{d.status}</Badge>
            {d.status === "open" && (
              <Button size="sm" variant="outline" onClick={onReview}>
                Mark in review
              </Button>
            )}
            {d.status !== "resolved" && (
              <Button size="sm" onClick={onResolve}>
                <ShieldCheck className="mr-1 h-3 w-3" />
                Resolve
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm">{d.detail}</p>
        {d.photos && d.photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {d.photos.map((p: string) => (
              <a
                key={p}
                href={urls[p] ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg border"
              >
                {urls[p] && <img src={urls[p]!} alt="" className="h-full w-full object-cover" />}
              </a>
            ))}
          </div>
        )}
        {d.resolution && (
          <div className="mt-3 rounded-md bg-muted p-3 text-sm">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Resolution
            </span>
            <p className="mt-1 whitespace-pre-line">{d.resolution}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HostQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const load = async () => {
    const { data, error, count } = await api
      .from("vendors")
      .select("id,business_name,bio,kyc_status,id_document_url,payout_email,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const paths = (items ?? []).map((v) => v.id_document_url).filter(Boolean);
  const signed = useSignedUrls("kyc-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await api
      .from("vendors")
      .update({ kyc_status: status } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Host ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">No hosts yet.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((v) => (
        <Card key={v.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{v.business_name}</p>
                  <Badge
                    variant={
                      v.kyc_status === "approved"
                        ? "secondary"
                        : v.kyc_status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {v.kyc_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.bio || "No bio"} · Joined {new Date(v.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                {v.kyc_status !== "approved" && (
                  <Button size="sm" onClick={() => decide(v.id, "approved")}>
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Approve host
                  </Button>
                )}
                {v.kyc_status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => decide(v.id, "rejected")}>
                    Reject
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs">
              <DocLink
                label="ID document"
                url={v.id_document_url ? signed[v.id_document_url] : null}
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function DriverQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const load = async () => {
    const { data, error, count } = await api
      .from("drivers")
      .select(
        "id,full_name,city,phone,experience_years,hourly_rate,daily_rate,dl_number,dl_expiry,dl_front_url,dl_back_url,id_document_url,verification_status,status,rejection_reason,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const paths = (items ?? []).flatMap((d) =>
    [d.dl_front_url, d.dl_back_url, d.id_document_url].filter(Boolean),
  );
  const signed = useSignedUrls("verification-docs", paths);

  const decide = async (id: string, status: "approved" | "rejected") => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    const { error } = await api
      .from("drivers")
      .update({
        verification_status: status,
        rejection_reason: reason,
        verified_at: status === "approved" ? new Date().toISOString() : null,
        status: status === "approved" ? "active" : "draft",
      } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Driver ${status}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0)
    return <p className="mt-6 text-sm text-muted-foreground">No driver applications yet.</p>;

  return (
    <div className="mt-4 space-y-3">
      {items.map((d) => (
        <Card key={d.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{d.full_name}</p>
                  <StatusBadge status={d.verification_status} />
                  <Badge variant="outline">{d.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.city} · {d.experience_years} yrs · ₹{d.hourly_rate}/hr · ₹{d.daily_rate}/day ·
                  Licence {d.dl_number ?? "—"} (exp {d.dl_expiry ?? "—"})
                </p>
              </div>
              <div className="flex gap-2">
                {d.verification_status !== "approved" && (
                  <Button size="sm" onClick={() => decide(d.id, "approved")}>
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Approve
                  </Button>
                )}
                {d.verification_status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => decide(d.id, "rejected")}>
                    Reject
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <DocLink label="Licence front" url={d.dl_front_url ? signed[d.dl_front_url] : null} />
              <DocLink label="Licence back" url={d.dl_back_url ? signed[d.dl_back_url] : null} />
              <DocLink
                label="Government ID"
                url={d.id_document_url ? signed[d.id_document_url] : null}
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function WashQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data, error, count }, { data: cl }] = await Promise.all([
      api
        .from("wash_bookings")
        .select(
          "*, wash_services:service_id(name,duration_minutes,vehicle_category), cleaners:cleaner_id(full_name,phone,city)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(pager.from, pager.to),
      api
        .from("cleaners")
        .select("id,full_name,city,avg_rating")
        .eq("verification_status", "approved")
        .order("full_name"),
    ]);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
    setCleaners((cl as any) ?? []);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const handleAdminAssign = async (washId: string) => {
    const cleanerId = assign[washId];
    if (!cleanerId) return toast.error("Select a washer first");
    setBusy(washId);
    try {
      const { error } = await api.rpc("admin_assign_wash_cleaner", {
        _wash_booking_id: washId,
        _cleaner_id: cleanerId,
      } as any);
      if (error) throw error;
      toast.success("Washer assigned successfully");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to assign washer");
    } finally {
      setBusy(null);
    }
  };

  const decide = async (b: any, decision: "rejected" | "completed") => {
    let note: string | null = null;
    if (decision === "rejected") {
      note = window.prompt("Reason for cancellation / refund?") || null;
      if (!note) return;
    }
    setBusy(b.id);
    const { error } = await api.rpc("admin_decide_wash_booking", {
      _wash_booking_id: b.id,
      _decision: decision,
      _note: note,
    } as any);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(
      decision === "rejected"
        ? "Cancelled and refunded"
        : "Marked completed",
    );
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;

  return (
    <div className="mt-4 space-y-3">
      {items.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No wash bookings yet.</p>
      )}
      {items.map((b) => {
        const isAtRisk = Boolean(b.admin_alerted_at && !b.cleaner_id && b.status === "confirmed");
        return (
          <Card key={b.id} className={isAtRisk ? "border-amber-500/50 bg-amber-500/5" : ""}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{b.wash_services?.name ?? "Vehicle wash"}</p>
                    <Badge
                      variant={
                        b.status === "confirmed"
                          ? "secondary"
                          : b.status === "rejected" || b.status === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {b.status}
                    </Badge>
                    {b.payment_status === "paid" && (
                      <Badge className="bg-emerald-600 text-white">Paid</Badge>
                    )}
                    {(b.payment_status === "refunded" ||
                      b.payment_status === "partially_refunded") && (
                      <Badge variant="outline">{b.payment_status}</Badge>
                    )}
                    {isAtRisk && (
                      <Badge variant="destructive" className="animate-pulse">
                        At risk: unassigned
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.slot_date} at {String(b.slot_time).slice(0, 5)} · {b.city} · ₹{b.price}
                    {b.cleaners?.full_name ? ` · Washer: ${b.cleaners.full_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    📍 {b.address}
                    {b.vehicle_label ? ` · ${b.vehicle_label}` : ""}
                  </p>
                  {b.notes && <p className="mt-1 text-xs">📝 {b.notes}</p>}
                  {b.cancellation_reason && (
                    <p className="mt-1 text-xs text-destructive">
                      Cancelled: {b.cancellation_reason}
                    </p>
                  )}
                  {b.rejection_reason && (
                    <p className="mt-1 text-xs text-destructive">
                      Rejected: {b.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.status === "pending" && (
                    <span className="text-xs text-muted-foreground">
                      Awaiting payment{b.pay_by ? ` (pay by ${new Date(b.pay_by).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ""}
                    </span>
                  )}
                  {b.status === "confirmed" && !b.cleaner_id && (
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Assign washer partner"
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={assign[b.id] ?? ""}
                        onChange={(e) => setAssign({ ...assign, [b.id]: e.target.value })}
                      >
                        <option value="">{isAtRisk ? "At risk — assign washer…" : "Assign washer…"}</option>
                        {cleaners
                          .filter((c) => !b.city || c.city.toLowerCase() === b.city.toLowerCase())
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name} ({c.city} · ⭐{Number(c.avg_rating || 5).toFixed(1)})
                            </option>
                          ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={busy === b.id || !assign[b.id]}
                        onClick={() => handleAdminAssign(b.id)}
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                  {b.status === "confirmed" && (
                    <>
                      {b.payment_status === "paid" && b.progress !== "completed" && (
                        <Button
                          size="sm"
                          disabled={busy === b.id}
                          onClick={() => decide(b, "completed")}
                        >
                          Mark completed
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === b.id}
                        onClick={() => decide(b, "rejected")}
                      >
                        Cancel & refund
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <ListPager {...pager} />
    </div>
  );
}

function CleanersQueue() {
  const [items, setItems] = useState<any[] | null>(null);
  const pager = usePage();
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error, count } = await api
      .from("cleaners")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    if (error) toast.error(error.message);
    setItems((data as any) ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    let reason: string | null = null;
    if (decision === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    setBusy(id);
    const { error } = await api.rpc("verify_cleaner", {
      _cleaner_id: id,
      _decision: decision,
      _rejection_reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Cleaner application ${decision}`);
    load();
  };

  if (!items) return <Skeleton className="mt-4 h-40" />;
  if (items.length === 0)
    return (
      <p className="mt-6 text-sm text-muted-foreground">No cleaner partner applications yet.</p>
    );

  return (
    <div className="mt-4 space-y-3">
      {items.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.full_name}</p>
                  <StatusBadge status={c.verification_status} />
                  <Badge
                    variant={c.available ? "secondary" : "outline"}
                    className={c.available ? "bg-emerald-50 text-emerald-700" : ""}
                  >
                    {c.available ? "Online" : "Offline"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.city} · {c.experience_years} yrs exp · Area: {c.service_area || "Citywide"}{" "}
                  {c.phone ? `· ${c.phone}` : ""}
                </p>
                {c.bio && <p className="text-xs text-muted-foreground mt-1 italic">"{c.bio}"</p>}
                {c.rejection_reason && (
                  <p className="text-xs text-red-500 mt-1">
                    Rejection reason: {c.rejection_reason}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {c.verification_status !== "approved" && (
                  <Button
                    size="sm"
                    disabled={busy === c.id}
                    onClick={() => decide(c.id, "approved")}
                  >
                    <ShieldCheck className="mr-1 h-3 w-3" /> Approve
                  </Button>
                )}
                {c.verification_status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === c.id}
                    onClick={() => decide(c.id, "rejected")}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <ListPager {...pager} />
    </div>
  );
}

function WashCentersQueue() {
  const [centers, setCenters] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [capacity, setCapacity] = useState("10");

  const load = async () => {
    // 1. Check wash_centers first
    const { data: wcData } = await api
      .from("wash_centers")
      .select("*")
      .order("created_at", { ascending: false });

    if (wcData && wcData.length > 0) {
      setCenters(wcData);
      return;
    }

    const { data, error } = await api
      .from("wash_vendors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setCenters(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const decideCenter = async (id: string, decision: "approved" | "rejected") => {
    let reason: string | null = null;
    if (decision === "rejected") {
      reason = window.prompt("Rejection reason?") || null;
      if (!reason) return;
    }
    setBusy(id);
    const { error } = await api.rpc("verify_wash_center", {
      _center_id: id,
      _decision: decision,
      _rejection_reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Wash center application ${decision}`);
    load();
  };

  const toggleActive = async (center: any) => {
    setBusy(center.id);
    const table = center.verification_status !== undefined ? "wash_centers" : "wash_vendors";
    const { error } = await api
      .from(table as any)
      .update({ active: !center.active } as any)
      .eq("id", center.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(!center.active ? "Wash center verified & activated" : "Wash center deactivated");
    load();
  };

  const addCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim()) return toast.error("Name and city are required");
    const { error } = await api.from("wash_vendors").insert({
      name: name.trim(),
      city: city.trim(),
      contact_phone: phone.trim() || null,
      daily_capacity: Number(capacity) || 10,
      active: true,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Washing center added and verified");
    setName("");
    setCity("");
    setPhone("");
    setShowAdd(false);
    load();
  };

  if (!centers) return <Skeleton className="mt-4 h-40" />;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {centers.length} registered washing center{centers.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add washing center
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={addCenter}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
            >
              <div>
                <Label className="text-xs">Center Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="AutoShine Hub"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bangalore"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Contact Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Daily Capacity</Label>
                  <Input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    min={1}
                  />
                </div>
                <Button type="submit" className="mt-auto">
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {centers.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No washing centers registered yet.</p>
      ) : (
        <div className="grid gap-3">
          {centers.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{c.name}</p>
                    {c.verification_status ? (
                      <StatusBadge status={c.verification_status} />
                    ) : (
                      <Badge
                        variant={c.active ? "secondary" : "outline"}
                        className={c.active ? "bg-emerald-50 text-emerald-700" : ""}
                      >
                        {c.active ? "Verified / Active" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    City: {c.city} · Capacity: {c.daily_capacity} washes/day{" "}
                    {c.contact_phone ? `· ${c.contact_phone}` : ""}
                  </p>
                  {c.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1">
                      Rejection reason: {c.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {c.verification_status ? (
                    <>
                      {c.verification_status !== "approved" && (
                        <Button
                          size="sm"
                          disabled={busy === c.id}
                          onClick={() => decideCenter(c.id, "approved")}
                        >
                          <ShieldCheck className="mr-1 h-3 w-3" /> Approve
                        </Button>
                      )}
                      {c.verification_status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === c.id}
                          onClick={() => decideCenter(c.id, "rejected")}
                        >
                          Reject
                        </Button>
                      )}
                      {c.verification_status === "approved" && (
                        <Button
                          size="sm"
                          variant={c.active ? "outline" : "default"}
                          disabled={busy === c.id}
                          onClick={() => toggleActive(c)}
                        >
                          {c.active ? "Deactivate" : "Approve & Activate"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant={c.active ? "outline" : "default"}
                      disabled={busy === c.id}
                      onClick={() => toggleActive(c)}
                    >
                      {c.active ? "Deactivate" : "Approve & Activate"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
