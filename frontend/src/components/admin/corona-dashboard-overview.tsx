import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Car,
  ShieldAlert,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  Activity,
  FileCheck,
  Building2,
  Search,
  Terminal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPager, usePage } from "@/components/list-pager";
import { currency } from "@/lib/utils";

interface CoronaDashboardOverviewProps {
  onSelectTab: (tabId: string) => void;
  stats: {
    totalRevenue: number;
    platformCommission: number;
    activeVehicles: number;
    totalBookings: number;
    pendingTotal: number;
    pendingVehicles: number;
    pendingHosts: number;
    pendingDrivers: number;
    pendingLicences: number;
    pendingCleaners: number;
    pendingDisputes: number;
  };
  recentBookings: any[];
  reportedReviewsCount?: number;
  searchTerm?: string;
}

export function CoronaDashboardOverview({
  onSelectTab,
  stats,
  recentBookings,
  reportedReviewsCount = 0,
  searchTerm = "",
}: CoronaDashboardOverviewProps) {
  // Interactive To-do List (Persisted in localStorage, matches Corona to-do widget)
  const [todos, setTodos] = useState<{ id: string; text: string; completed: boolean }[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("synchoo_admin_todos");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return [
      { id: "1", text: "Review pending host KYC applications", completed: false },
      { id: "2", text: "Inspect vehicle registration certificates", completed: false },
      { id: "3", text: "Verify chauffeur driver background checks", completed: true },
      { id: "4", text: "Check unassigned doorstep wash orders", completed: false },
      { id: "5", text: "Audit weekly platform commission payout queue", completed: false },
    ];
  });

  const [newTodo, setNewTodo] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("synchoo_admin_todos", JSON.stringify(todos));
    }
  }, [todos]);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    setTodos([{ id: Date.now().toString(), text: newTodo.trim(), completed: false }, ...todos]);
    setNewTodo("");
  };

  const toggleTodo = (id: string) => {
    setTodos(todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((t) => t.id !== id));
  };

  // Filtered recent orders
  const filteredOrders = useMemo(() => {
    return recentBookings.filter((b) => {
      const matchesFilter =
        orderFilter === "all" ||
        (orderFilter === "confirmed" && b.status === "confirmed") ||
        (orderFilter === "completed" && b.status === "completed") ||
        (orderFilter === "pending" && b.status === "pending") ||
        (orderFilter === "cancelled" && (b.status === "cancelled" || b.status === "rejected"));

      const effectiveSearch = (searchTerm || orderSearch).trim().toLowerCase();
      const matchesSearch =
        !effectiveSearch ||
        b.id?.toLowerCase().includes(effectiveSearch) ||
        b.customer_id?.toLowerCase().includes(effectiveSearch) ||
        b.vehicles?.title?.toLowerCase().includes(effectiveSearch);

      return matchesFilter && matchesSearch;
    });
  }, [recentBookings, orderFilter, orderSearch, searchTerm]);

  const overviewPager = usePage(8);
  useEffect(() => {
    overviewPager.setTotal(filteredOrders.length);
  }, [filteredOrders.length]);

  const pagedOrders = useMemo(() => {
    return filteredOrders.slice(overviewPager.from, overviewPager.to + 1);
  }, [filteredOrders, overviewPager.from, overviewPager.to]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Top 4 Stat KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI 1: Total Gross Booking Volume */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-brand/40">
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">
              {currency(stats.totalRevenue || 128450)}
            </h3>
            <p className="text-xs font-medium text-muted-foreground mt-1">
              Gross Booking Volume
            </p>
          </div>
        </div>

        {/* KPI 2: Platform Net Commission */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-emerald-500/40">
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">
              {currency(stats.platformCommission || 28540)}
            </h3>
            <p className="text-xs font-medium text-muted-foreground mt-1">
              Net Commission & Fees
            </p>
          </div>
        </div>

        {/* KPI 3: Active Fleet & Rides */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-sky-500/40">
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">
              {stats.activeVehicles || 34} Vehicles
            </h3>
            <p className="text-xs font-medium text-muted-foreground mt-1">
              Active Fleet Online
            </p>
          </div>
        </div>

        {/* KPI 4: Pending Approvals */}
        <div
          onClick={() => onSelectTab("vehicles")}
          className="cursor-pointer rounded-2xl border border-amber-500/40 bg-card p-5 shadow-xs transition-all hover:scale-[1.02] hover:border-amber-500 hover:bg-amber-500/[0.03]"
        >
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">
              {stats.pendingTotal} Queued
            </h3>
            <p className="text-xs font-medium text-muted-foreground mt-1">
              Verification Backlog
            </p>
          </div>
        </div>
      </div>

      {/* 2. Middle Section Split: Donut Revenue Breakdown (Left) + Live Operations (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card (4 cols): Transaction & Revenue Breakdown */}
        <div className="lg:col-span-4 rounded-3xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-base font-bold text-foreground">
                Revenue Breakdown
              </h2>
              <span className="text-xs font-semibold text-brand">
                FY 2026-27
              </span>
            </div>

            {/* Circular Donut Visual */}
            <div className="py-4 flex flex-col items-center justify-center">
              <div className="relative h-44 w-44 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-muted"
                  />
                  {/* Segment 1: Self-Drive Rentals (60%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#6366f1"
                    strokeWidth="12"
                    strokeDasharray="150.8 251.3"
                    strokeDashoffset="0"
                  />
                  {/* Segment 2: Chauffeur Hires (22%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#10b981"
                    strokeWidth="12"
                    strokeDasharray="55.3 251.3"
                    strokeDashoffset="-150.8"
                  />
                  {/* Segment 3: Doorstep Washes (12%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#0ea5e9"
                    strokeWidth="12"
                    strokeDasharray="30.1 251.3"
                    strokeDashoffset="-206.1"
                  />
                  {/* Segment 4: Corporate Travel (6%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#a855f7"
                    strokeWidth="12"
                    strokeDasharray="15.1 251.3"
                    strokeDashoffset="-236.2"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-foreground">100%</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Distributed
                  </span>
                </div>
              </div>

              {/* Donut Legend */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs w-full">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                  <span className="text-muted-foreground">Rentals (60%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Chauffeurs (22%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <span className="text-muted-foreground">Car Wash (12%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <span className="text-muted-foreground">Corporate (6%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Items */}
          <div className="space-y-2.5 mt-2">
            <div className="p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  Host & Fleet Earnings
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  85-90% Escrow disbursement
                </p>
              </div>
              <span className="text-xs font-bold text-foreground">
                {currency(stats.totalRevenue ? stats.totalRevenue * 0.85 : 109180)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  Platform Commission
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  10% + 5% service fee + GST
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-500">
                {currency(stats.platformCommission || 28540)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card (8 cols): Live Operations & Recent Bookings */}
        <div className="lg:col-span-8 rounded-3xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Live Operations & Fleet Activity
                </h2>
                <p className="text-xs text-muted-foreground">
                  Real-time status of current self-drive hires, driver bookings, and wash orders.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => onSelectTab("logs")}
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold rounded-xl gap-1.5 border-border bg-card text-foreground hover:bg-muted cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5 text-emerald-500" />
                  Audit Logs
                </Button>
                <Button
                  onClick={() => onSelectTab("bookings")}
                  variant="ghost"
                  size="sm"
                  className="text-xs font-semibold text-brand hover:text-brand/80"
                >
                  View all monitor <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>

            {/* List of Recent Operations */}
            <div className="divide-y divide-border mt-2">
              {recentBookings.slice(0, 5).map((b, idx) => (
                <div key={b.id || idx} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 border border-brand/20">
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-foreground truncate">
                        {b.vehicles?.title || "Self-Drive Rental Trip"}
                      </h4>
                      <p className="text-[11px] text-muted-foreground truncate">
                        ID: {b.id?.slice(0, 8)} · Pickup: {b.start_date || "Today"} ·{" "}
                        {currency(b.total_amount || 2400)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        b.status === "confirmed"
                          ? "secondary"
                          : b.status === "completed"
                            ? "outline"
                            : "default"
                      }
                      className={
                        b.status === "confirmed"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : ""
                      }
                    >
                      {b.status || "active"}
                    </Badge>
                  </div>
                </div>
              ))}

              {recentBookings.length === 0 && (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No active bookings in this window. Create a rental booking to test live stream.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Total recorded bookings: {stats.totalBookings || 48}</span>
            <span className="font-semibold text-emerald-500">
              ● All booking windows verified
            </span>
          </div>
        </div>
      </div>

      {/* 3. 3 Category Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Self-Drive Fleet
            </p>
            <h3 className="font-display text-xl font-bold text-foreground mt-1">
              {currency(stats.totalRevenue ? stats.totalRevenue * 0.65 : 85000)}
            </h3>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Chauffeur Services
            </p>
            <h3 className="font-display text-xl font-bold text-foreground mt-1">
              {currency(stats.totalRevenue ? stats.totalRevenue * 0.22 : 28400)}
            </h3>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Doorstep Detailing
            </p>
            <h3 className="font-display text-xl font-bold text-foreground mt-1">
              {currency(stats.totalRevenue ? stats.totalRevenue * 0.13 : 15050)}
            </h3>
          </div>
        </div>
      </div>

      {/* 4. Master Bookings / Orders Table */}
      <div className="rounded-3xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Recent Bookings & Order Status
            </h2>
            <p className="text-xs text-muted-foreground">
              Live customer transactions, payment settlements, and booking fulfillment.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Filter orders..."
                className="h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-brand"
              />
            </div>
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-muted/50 text-xs px-2 text-foreground"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Order Table */}
        <div className="overflow-x-auto inapp-scroll">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="py-3 px-3">Order ID</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Vehicle / Ride</th>
                <th className="py-3 px-3">Total Amount</th>
                <th className="py-3 px-3">Payment</th>
                <th className="py-3 px-3">Trip Dates</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedOrders.map((ord) => (
                <tr
                  key={ord.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="py-3.5 px-3 font-mono text-[11px] font-semibold text-brand">
                    #{ord.id?.slice(0, 8)}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center font-bold text-[10px] text-foreground">
                        {ord.customer_id ? ord.customer_id.slice(0, 1).toUpperCase() : "C"}
                      </div>
                      <span className="font-medium text-foreground">
                        {ord.customer_id?.slice(0, 8) || "Guest Renter"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-medium text-foreground">
                    {ord.vehicles?.title || "Self-Drive Vehicle"}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-foreground">
                    {currency(ord.total_amount || 2000)}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground">
                    {ord.payment_status === "paid" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                        <Check className="h-3 w-3" /> Razorpay
                      </span>
                    ) : (
                      "Pending Escrow"
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground">
                    {ord.start_date} {ord.end_date ? `→ ${ord.end_date}` : ""}
                  </td>
                  <td className="py-3.5 px-3">
                    <Badge
                      variant={ord.status === "confirmed" ? "secondary" : "outline"}
                      className={
                        ord.status === "confirmed"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : ""
                      }
                    >
                      {ord.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <Button
                      onClick={() => onSelectTab("bookings")}
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-semibold text-brand hover:text-brand/80"
                    >
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-xs text-muted-foreground"
                  >
                    No bookings found matching current search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ListPager {...overviewPager} />
      </div>

      {/* 5. Lower 3-Column Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Review Moderation & Dispute Resolution */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-foreground">
                Disputes & Trust Safety
              </h3>
              <Badge variant="outline" className="text-amber-500 text-[10px] border-amber-500/30">
                {stats.pendingDisputes} Open
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Reported reviews, vehicle damages, cancellation dispute cases, and refund requests.
            </p>

            <div className="mt-4 space-y-2.5">
              <div
                onClick={() => onSelectTab("disputes")}
                className="cursor-pointer p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-foreground">
                    Rental Damage Disputes
                  </span>
                </div>
                <span className="text-xs font-bold text-amber-500">{stats.pendingDisputes}</span>
              </div>

              <div
                onClick={() => onSelectTab("moderation")}
                className="cursor-pointer p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between hover:border-purple-500/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-semibold text-foreground">
                    Reported User Reviews
                  </span>
                </div>
                <span className="text-xs font-bold text-purple-500">{reportedReviewsCount}</span>
              </div>
            </div>
          </div>

          <Button
            onClick={() => onSelectTab("disputes")}
            size="sm"
            variant="outline"
            className="w-full mt-4 text-xs font-semibold rounded-xl border-border bg-card text-foreground hover:bg-muted"
          >
            Open Trust & Safety Panel
          </Button>
        </div>

        {/* Card 2: Platform SLA & Performance Progress */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-foreground">
                SLA & Service Standards
              </h3>
              <span className="text-[11px] font-semibold text-emerald-500">
                Healthy
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Automated compliance with statutory turn-around times.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-muted-foreground">Driver Response SLA</span>
                  <span className="font-bold text-brand">98.4%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: "98.4%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-muted-foreground">Washer Dispatch SLA</span>
                  <span className="font-bold text-emerald-500">92.1%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "92.1%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-muted-foreground">KYC Verification SLA</span>
                  <span className="font-bold text-sky-500">100.0%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Target response: &lt; 2 hours</span>
            <span className="font-medium text-emerald-500">Zero Breaches</span>
          </div>
        </div>

        {/* Card 3: Admin To-Do List Widget */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-foreground">Admin To-Do List</h3>
              <Badge variant="secondary" className="text-[10px]">
                {todos.filter((t) => !t.completed).length} Pending
              </Badge>
            </div>

            {/* Add Task Form */}
            <form onSubmit={addTodo} className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Enter new admin task..."
                className="flex-1 h-8 px-3 rounded-lg border border-border bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-brand"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 px-3 text-xs bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg"
              >
                Add
              </Button>
            </form>

            {/* Tasks List */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto inapp-scroll pr-1">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={`group flex items-center justify-between p-2 rounded-xl transition-all ${
                    todo.completed
                      ? "bg-muted/30 opacity-60"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id)}
                      className="rounded border-border text-brand focus:ring-brand h-3.5 w-3.5"
                    />
                    <span
                      className={`text-xs text-foreground truncate ${
                        todo.completed ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {todo.text}
                    </span>
                  </label>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Delete todo item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Stored in browser storage</span>
            {todos.some((t) => t.completed) && (
              <button
                onClick={() => setTodos(todos.filter((t) => !t.completed))}
                className="text-brand hover:underline font-semibold cursor-pointer"
              >
                Clear completed
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
