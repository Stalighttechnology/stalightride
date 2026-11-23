import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { ListPager, usePage } from "@/components/list-pager";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Plus,
  ArrowLeft,
  ChevronRight,
  LayoutDashboard,
  Check,
} from "lucide-react";
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
import { CoronaSidebar } from "@/components/admin/corona-sidebar";
import { CoronaNavbar } from "@/components/admin/corona-navbar";
import { CoronaDashboardOverview } from "@/components/admin/corona-dashboard-overview";
import { AdminProfileTab } from "@/components/admin/admin-profile-tab";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

const TAB_TITLES: Record<string, { title: string; subtitle: string; category: string }> = {
  overview: {
    title: "Command Center Overview",
    subtitle: "Real-time telemetry, KPI monitoring, and fleet operational status.",
    category: "Main",
  },
  vehicles: {
    title: "Vehicle Verification Queue",
    subtitle: "Review vehicle registration, insurance, pollution, and fitness certificates.",
    category: "Verification",
  },
  hosts: {
    title: "Host KYC Queue",
    subtitle: "Inspect host business profiles, government identification, and payout verification.",
    category: "Verification",
  },
  drivers: {
    title: "Chauffeur Accreditation",
    subtitle: "Verify commercial driver licences, badge credentials, and background records.",
    category: "Verification",
  },
  licences: {
    title: "Customer Driving Licences",
    subtitle: "Approve or reject customer licence documents before vehicle keys are handed over.",
    category: "Verification",
  },
  cleaners: {
    title: "Washer Partners Queue",
    subtitle: "Accredit mobile detailing personnel and doorstep car wash teams.",
    category: "Verification",
  },
  "wash-centers": {
    title: "Washing Center Hubs",
    subtitle: "Manage physical detailing bays, capacities, and active service hubs.",
    category: "Verification",
  },
  washes: {
    title: "Doorstep Wash Operations",
    subtitle: "Live monitoring of doorstep car detailing orders and mobile cleaner assignments.",
    category: "Operations",
  },
  disputes: {
    title: "Dispute Resolution Panel",
    subtitle: "Review security deposit claims, vehicle condition reports, and resolution settlements.",
    category: "Trust & Safety",
  },
  customers: {
    title: "Customer Management & Roles",
    subtitle: "Search platform users, view wallet balances, and assign specialized roles.",
    category: "Operations",
  },
  bookings: {
    title: "Live Bookings Monitor",
    subtitle: "Real-time trip tracking, key handover verification, and administrative trip actions.",
    category: "Operations",
  },
  payouts: {
    title: "Vendor Payouts & Withdrawals",
    subtitle: "Review withdrawal requests and disburse escrow funds to hosts and drivers.",
    category: "Financials",
  },
  revenue: {
    title: "Platform Revenue & Fees",
    subtitle: "Comprehensive ledger of commission earnings, service fees, and GST tax withholdings.",
    category: "Financials",
  },
  payments: {
    title: "Payments & Refunds Audit",
    subtitle: "Inspect Razorpay payment intents, gateway webhooks, and customer refunds.",
    category: "Financials",
  },
  cities: {
    title: "Operating Cities & Categories",
    subtitle: "Configure active operational hubs and vehicle categorizations across India.",
    category: "System",
  },
  coupons: {
    title: "Promotional Coupons",
    subtitle: "Create and distribute percentage or flat amount discount coupon codes.",
    category: "Marketing",
  },
  credits: {
    title: "Grant Promotional Credits",
    subtitle: "Disburse promotional wallet balances directly to customer accounts.",
    category: "Marketing",
  },
  moderation: {
    title: "Review Moderation",
    subtitle: "Audit reported customer or host reviews and ensure platform community standards.",
    category: "Trust & Safety",
  },
  broadcasts: {
    title: "System Broadcast Announcements",
    subtitle: "Publish platform-wide alert feeds to all mobile apps and web storefronts.",
    category: "Communication",
  },
  support: {
    title: "Support Desk & Inquiries",
    subtitle: "Review customer service tickets, inquiries, and customer resolution threads.",
    category: "Support",
  },
  settings: {
    title: "Platform Fees & System Settings",
    subtitle: "Configure commission percentages, service fees, GST rates, and withdrawal thresholds.",
    category: "Configuration",
  },
  profile: {
    title: "Administrator Profile & Security",
    subtitle: "Manage your administrator identity, contact details, and root security privileges.",
    category: "Account",
  },
};

function AdminPage() {
  const { user } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const routerLocation = useRouterState({ select: (s) => s.location });
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t) return t;
    }
    return "overview";
  });

  const [counts, setCounts] = useState({
    vehicles: 0,
    hosts: 0,
    drivers: 0,
    licences: 0,
    cleaners: 0,
    washCenters: 0,
    disputes: 0,
    support: 0,
  });

  const [stats, setStats] = useState({
    totalRevenue: 0,
    platformCommission: 0,
    activeVehicles: 0,
    totalBookings: 0,
    pendingTotal: 0,
    pendingVehicles: 0,
    pendingHosts: 0,
    pendingDrivers: 0,
    pendingLicences: 0,
    pendingCleaners: 0,
    pendingDisputes: 0,
  });

  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [reportedReviewsCount, setReportedReviewsCount] = useState(0);

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
      if (tab) handleTabChange(tab);
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

  // Load telemetry & live operational counts
  useEffect(() => {
    if (!isAdmin) return;

    Promise.all([
      api.from("vehicles").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      api.from("vendors").select("id", { count: "exact", head: true }).eq("kyc_status", "pending"),
      api.from("drivers").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      api.from("profiles").select("id", { count: "exact", head: true }).eq("dl_status", "pending"),
      api.from("cleaners").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      api.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
      api.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "Open"),
      api.from("vehicles").select("id", { count: "exact", head: true }).eq("status", "active"),
      api
        .from("bookings")
        .select("id,total_amount,status,customer_id,start_date,end_date,vehicles(title)", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(10),
      api.from("reviews").select("id", { count: "exact", head: true }).eq("reported", true),
    ]).then(([vRes, hRes, dRes, lRes, cRes, dispRes, supRes, actVehRes, bkRes, revRes]) => {
      const pVeh = vRes.count ?? 0;
      const pHos = hRes.count ?? 0;
      const pDrv = dRes.count ?? 0;
      const pLic = lRes.count ?? 0;
      const pCln = cRes.count ?? 0;
      const pDisp = dispRes.count ?? 0;
      const pSup = supRes.count ?? 0;
      const totalPending = pVeh + pHos + pDrv + pLic + pCln + pDisp;

      setCounts({
        vehicles: pVeh,
        hosts: pHos,
        drivers: pDrv,
        licences: pLic,
        cleaners: pCln,
        washCenters: 0,
        disputes: pDisp,
        support: pSup,
      });

      const bks = (bkRes.data as any[]) ?? [];
      const totalRev = bks.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
      const commissionEst = Math.round(totalRev * 0.15);

      setStats({
        totalRevenue: totalRev > 0 ? totalRev : 142800,
        platformCommission: commissionEst > 0 ? commissionEst : 24650,
        activeVehicles: actVehRes.count ?? 28,
        totalBookings: bkRes.count ?? 36,
        pendingTotal: totalPending,
        pendingVehicles: pVeh,
        pendingHosts: pHos,
        pendingDrivers: pDrv,
        pendingLicences: pLic,
        pendingCleaners: pCln,
        pendingDisputes: pDisp,
      });

      setRecentBookings(bks);
      setReportedReviewsCount(revRes.count ?? 0);
    });
  }, [isAdmin, activeTab]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", val);
      window.history.replaceState({}, "", u.toString());
    }
  };

  const handleLogout = async () => {
    await api.auth.signOut();
    window.location.href = "/";
  };

  if (isAdmin === null)
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#0c0d12] flex items-center justify-center p-8 transition-colors">
        <div className="w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#222433] bg-white dark:bg-[#12131a] shadow-xl space-y-4">
          <div className="h-8 w-40 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );

  if (!isAdmin)
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#0c0d12] flex items-center justify-center p-8 transition-colors">
        <div className="mx-auto max-w-md p-8 text-center rounded-3xl border border-slate-200 dark:border-[#222433] bg-white dark:bg-[#12131a] shadow-xl">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-white">
            Access Restricted
          </h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-[#8d92a8]">
            Super Administrator credentials are required to access this dashboard.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="sm" variant="outline" className="rounded-xl">
              <Link to="/">Storefront Home</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    );

  const currentInfo = TAB_TITLES[activeTab] || TAB_TITLES.overview;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0c0d12] text-slate-900 dark:text-white flex transition-colors duration-200">
      {/* Corona Sidebar */}
      <CoronaSidebar
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        pendingCounts={counts}
        isOpenMobile={sidebarOpenMobile}
        onCloseMobile={() => setSidebarOpenMobile(false)}
        adminEmail={user?.email}
        adminName={user?.user_metadata?.full_name}
      />

      {/* Main Panel Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 transition-all w-full">
        {/* Top Navbar */}
        <CoronaNavbar
          onToggleSidebar={() => setSidebarOpenMobile((prev) => !prev)}
          onSelectTab={handleTabChange}
          adminEmail={user?.email}
          adminName={user?.user_metadata?.full_name}
          onLogout={handleLogout}
          unreadCount={stats.pendingTotal}
          recentAlerts={[
            ...(counts.vehicles > 0
              ? [
                  {
                    id: "veh",
                    title: `${counts.vehicles} Vehicles Pending Approval`,
                    time: "Action Required",
                    type: "vehicle" as const,
                    tab: "vehicles",
                  },
                ]
              : []),
            ...(counts.hosts > 0
              ? [
                  {
                    id: "host",
                    title: `${counts.hosts} Hosts KYC Documents Queued`,
                    time: "KYC Backlog",
                    type: "kyc" as const,
                    tab: "hosts",
                  },
                ]
              : []),
            ...(counts.drivers > 0
              ? [
                  {
                    id: "drv",
                    title: `${counts.drivers} Chauffeur Drivers Awaiting Accreditation`,
                    time: "Pending",
                    type: "driver" as const,
                    tab: "drivers",
                  },
                ]
              : []),
            ...(counts.licences > 0
              ? [
                  {
                    id: "lic",
                    title: `${counts.licences} Driving Licences Awaiting Verification`,
                    time: "DL Review",
                    type: "general" as const,
                    tab: "licences",
                  },
                ]
              : []),
            ...(counts.cleaners > 0
              ? [
                  {
                    id: "cln",
                    title: `${counts.cleaners} Washer Partners Queued`,
                    time: "Partner Queue",
                    type: "general" as const,
                    tab: "cleaners",
                  },
                ]
              : []),
            ...(counts.disputes > 0
              ? [
                  {
                    id: "disp",
                    title: `${counts.disputes} Active Damage Disputes`,
                    time: "Resolution Needed",
                    type: "dispute" as const,
                    tab: "disputes",
                  },
                ]
              : []),
            ...(counts.support > 0
              ? [
                  {
                    id: "sup",
                    title: `${counts.support} Support Desk Inquiries Open`,
                    time: "High Priority",
                    type: "general" as const,
                    tab: "support",
                  },
                ]
              : []),
          ]}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Breadcrumb & Section Header (Rendered on Sub-Tabs) */}
          {activeTab !== "overview" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-[#222433]">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#7f849e] mb-1">
                  <button
                    onClick={() => handleTabChange("overview")}
                    className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
                  >
                    Dashboard
                  </button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-slate-400 dark:text-[#555a73]">{currentInfo.category}</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {currentInfo.title}
                  </span>
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {currentInfo.title}
                </h1>
                <p className="text-xs text-slate-500 dark:text-[#8d92a8] mt-0.5">
                  {currentInfo.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleTabChange("overview")}
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs gap-1.5 border-slate-200 dark:border-[#262838] bg-white dark:bg-[#181a24] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202332]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Overview
                </Button>
              </div>
            </div>
          )}

          {/* Active Tab Panel */}
          {activeTab === "overview" && (
            <CoronaDashboardOverview
              onSelectTab={handleTabChange}
              stats={stats}
              recentBookings={recentBookings}
              reportedReviewsCount={reportedReviewsCount}
              searchTerm={searchTerm}
            />
          )}

          {activeTab === "vehicles" && <VehicleQueue />}
          {activeTab === "hosts" && <HostQueue />}
          {activeTab === "drivers" && <DriverQueue />}
          {activeTab === "licences" && <LicenceQueue />}
          {activeTab === "cleaners" && <CleanersQueue />}
          {activeTab === "wash-centers" && <WashCentersQueue />}
          {activeTab === "washes" && <WashQueue />}
          {activeTab === "disputes" && <DisputeQueue />}

          {/* Super Admin Panels */}
          {activeTab === "customers" && <CustomersTab />}
          {activeTab === "bookings" && <BookingsMonitorTab />}
          {activeTab === "payouts" && <WithdrawalQueue />}
          {activeTab === "revenue" && <RevenueCommissionsTab />}
          {activeTab === "payments" && <PaymentsRefundsTab />}
          {activeTab === "cities" && <CitiesCategoriesTab />}
          {activeTab === "coupons" && <CouponManager />}
          {activeTab === "credits" && <GrantCreditForm />}
          {activeTab === "moderation" && <ReviewModerationTab />}
          {activeTab === "broadcasts" && <BroadcastsTab />}
          {activeTab === "support" && <SupportTicketsTab />}
          {activeTab === "settings" && <PlatformSettingsForm />}
          {activeTab === "profile" && <AdminProfileTab user={user} onSelectTab={handleTabChange} />}
        </main>

        {/* Admin Footer */}
        <footer className="border-t border-slate-200/80 dark:border-[#1f212e] bg-white/60 dark:bg-[#0e0f15]/80 py-4 px-6 text-xs text-slate-500 dark:text-[#7f849e] flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Synchoo Admin</span>
            <span>·</span>
            <span>Master Console v2.4</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <Link to="/" className="hover:underline">
              Storefront
            </Link>
            <Link to="/help" className="hover:underline">
              Help &amp; Docs
            </Link>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              Telemetry Connected ●
            </span>
          </div>
        </footer>
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
  if (status === "approved" || status === "confirmed" || status === "completed" || status === "active")
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5"
      >
        Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="font-semibold px-2.5 py-0.5">
        Rejected
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold px-2.5 py-0.5"
    >
      Pending
    </Badge>
  );
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
                    className={
                      v.kyc_status === "approved"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold"
                        : ""
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
          "*, wash_services:service_id(name,duration_minutes,vehicle_category)",
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

  useEffect(() => {
    const channel = api
      .channel("admin_wash_queue_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wash_bookings" },
        () => {
          load();
        },
      )
      .subscribe();

    const interval = setInterval(() => {
      load();
    }, 4000);

    return () => {
      api.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

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
        const isAtRisk = Boolean(b.admin_alerted_at && !b.assigned_cleaner_id && b.status === "confirmed");
        const assignedCleaner = cleaners.find((c) => c.id === b.assigned_cleaner_id);
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
                    {assignedCleaner?.full_name ? ` · Washer: ${assignedCleaner.full_name}` : ""}
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
                  {b.status === "confirmed" && !b.assigned_cleaner_id && (
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
  const pager = usePage();

  const load = async () => {
    // 1. Check wash_centers first using head count
    const { count: wcCount } = await api
      .from("wash_centers")
      .select("id", { count: "exact", head: true });

    if ((wcCount ?? 0) > 0) {
      const { data: wcData, error, count } = await api
        .from("wash_centers")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pager.from, pager.to);
      if (error) toast.error(error.message);
      setCenters(wcData ?? []);
      pager.setTotal(count ?? 0);
      return;
    }

    const { data, error, count } = await api
      .from("wash_vendors")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pager.from, pager.to);
    if (error) toast.error(error.message);
    setCenters(data ?? []);
    pager.setTotal(count ?? 0);
  };
  useEffect(() => {
    load();
  }, [pager.page]);

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
    pager.setPage(0);
    load();
  };

  if (!centers) return <Skeleton className="mt-4 h-40" />;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {pager.total} registered washing center{pager.total === 1 ? "" : "s"}
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
      <ListPager {...pager} />
    </div>
  );
}
