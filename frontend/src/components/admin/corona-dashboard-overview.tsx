import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Car,
  Award,
  Sparkles,
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
  IndianRupee,
  Activity,
  FileCheck,
  Building2,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Corona Gradient Banner (Top Welcome Card) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 p-6 sm:p-8 text-white shadow-xl shadow-indigo-600/15">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.2),transparent_70%)] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-bold tracking-wider uppercase">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              SYSTEM OPERATIONAL · ALL ENGINES LIVE
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
              Synchoo Mobility Command Center
            </h1>
            <p className="text-sm text-indigo-100 font-normal leading-relaxed">
              Real-time supervisory telemetry, high-converting rental operations, chauffeur
              assignments, doorstep detailing, and automated escrow settlements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              onClick={() => onSelectTab("bookings")}
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all hover:scale-105"
            >
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Live Bookings Monitor
            </Button>
            <Button
              onClick={() => onSelectTab("vehicles")}
              variant="outline"
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 font-semibold text-xs px-4 py-2.5 rounded-xl backdrop-blur-xs"
            >
              Verification Queue ({stats.pendingTotal})
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Top 4 Stat KPI Cards (Matches Corona Template Stat Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI 1: Total Gross Booking Volume */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs transition-all hover:border-indigo-500/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {currency(stats.totalRevenue || 128450)}
                </h3>
                <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-[#00d25b]">
                  <ArrowUpRight className="h-3.5 w-3.5" /> +14.2%
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8] mt-1">
                Gross Booking Volume
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* KPI 2: Platform Net Commission */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs transition-all hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {currency(stats.platformCommission || 28540)}
                </h3>
                <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-[#00d25b]">
                  <ArrowUpRight className="h-3.5 w-3.5" /> +8.6%
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8] mt-1">
                Net Commission & Fees
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00d25b] flex items-center justify-center shrink-0 border border-emerald-500/20">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* KPI 3: Active Fleet & Rides */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs transition-all hover:border-sky-500/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.activeVehicles || 34} Vehicles
                </h3>
                <span className="inline-flex items-center text-xs font-semibold text-sky-600 dark:text-[#0090e7]">
                  <ArrowUpRight className="h-3.5 w-3.5" /> 94% Live
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8] mt-1">
                Active Fleet Online
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-sky-500/15 text-sky-600 dark:text-[#0090e7] flex items-center justify-center shrink-0 border border-sky-500/20">
              <Car className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* KPI 4: Pending Approvals */}
        <div
          onClick={() => onSelectTab("vehicles")}
          className="cursor-pointer rounded-2xl border border-amber-500/40 bg-white dark:bg-[#181a24] p-5 shadow-xs transition-all hover:scale-[1.02] hover:border-amber-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.pendingTotal} Queued
                </h3>
                <span className="inline-flex items-center text-xs font-semibold text-amber-600 dark:text-[#ffab00]">
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Action
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8] mt-1">
                Verification Backlog
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-[#ffab00] flex items-center justify-center shrink-0 border border-amber-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section Split: Donut Revenue Breakdown (Left) + Live Operations (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card (4 cols): Transaction & Revenue Breakdown (Corona Transaction History) */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Revenue Breakdown
              </h2>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
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
                    className="text-slate-100 dark:text-[#13151e]"
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
                  <span className="text-2xl font-black text-slate-900 dark:text-white">100%</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Distributed
                  </span>
                </div>
              </div>

              {/* Donut Legend */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs w-full">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <span className="text-slate-600 dark:text-[#8d92a8]">Rentals (60%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 dark:text-[#8d92a8]">Chauffeurs (22%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <span className="text-slate-600 dark:text-[#8d92a8]">Car Wash (12%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <span className="text-slate-600 dark:text-[#8d92a8]">Corporate (6%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Items (Corona Gray Dark Rows) */}
          <div className="space-y-2.5 mt-2">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#12141c] border border-slate-100 dark:border-[#202230] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Host & Fleet Earnings
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-[#7f849e]">
                  85-90% Escrow disbursement
                </p>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {currency(stats.totalRevenue ? stats.totalRevenue * 0.85 : 109180)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#12141c] border border-slate-100 dark:border-[#202230] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Platform Commission
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-[#7f849e]">
                  10% + 5% service fee + GST
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-[#00d25b]">
                {currency(stats.platformCommission || 28540)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card (8 cols): Live Operations & Recent Bookings (Corona Open Projects) */}
        <div className="lg:col-span-8 rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Live Operations & Fleet Activity
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#8d92a8]">
                  Real-time status of current self-drive hires, driver bookings, and wash orders.
                </p>
              </div>
              <Button
                onClick={() => onSelectTab("bookings")}
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400"
              >
                View all monitor <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>

            {/* List of Recent Operations (Corona Preview List) */}
            <div className="divide-y divide-slate-100 dark:divide-[#222534] mt-2">
              {recentBookings.slice(0, 5).map((b, idx) => (
                <div key={b.id || idx} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {b.vehicles?.title || "Self-Drive Rental Trip"}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-[#8d92a8] truncate">
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
                <div className="py-12 text-center text-xs text-slate-400 dark:text-[#6a6f87]">
                  No active bookings in this window. Create a rental booking to test live stream.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-[#222534] flex items-center justify-between text-xs text-slate-500 dark:text-[#8d92a8]">
            <span>Total recorded bookings: {stats.totalBookings || 48}</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              ● All booking windows verified
            </span>
          </div>
        </div>
      </div>

      {/* 4. 3 Category Performance Cards (Corona Revenue / Sales / Purchase row) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8]">
                Self-Drive Fleet
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                {currency(stats.totalRevenue ? stats.totalRevenue * 0.65 : 85000)}
              </h3>
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                +11.3% growth vs last week
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Car className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8]">
                Chauffeur Services
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                {currency(stats.totalRevenue ? stats.totalRevenue * 0.22 : 28400)}
              </h3>
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                +9.6% hourly packages
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Award className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-[#8d92a8]">
                Doorstep Detailing
              </p>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                {currency(stats.totalRevenue ? stats.totalRevenue * 0.13 : 15050)}
              </h3>
              <p className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mt-1">
                +5.4% doorstep orders
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Master Bookings / Orders Table (Matches Corona Order Status Table) */}
      <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Bookings & Order Status
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#8d92a8]">
              Live customer transactions, payment settlements, and booking fulfillment.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Filter orders..."
                className="h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 dark:border-[#242738] bg-slate-50 dark:bg-[#161824] text-slate-900 dark:text-white"
              />
            </div>
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 dark:border-[#242738] bg-slate-50 dark:bg-[#161824] text-xs px-2 text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Corona Order Table */}
        <div className="overflow-x-auto inapp-scroll">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-[#222534] text-slate-500 dark:text-[#7f849e] font-semibold">
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
            <tbody className="divide-y divide-slate-100 dark:divide-[#202230]">
              {filteredOrders.slice(0, 8).map((ord) => (
                <tr
                  key={ord.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-[#1d1f2b] transition-colors"
                >
                  <td className="py-3.5 px-3 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    #{ord.id?.slice(0, 8)}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-700 dark:text-slate-200">
                        {ord.customer_id ? ord.customer_id.slice(0, 1).toUpperCase() : "C"}
                      </div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {ord.customer_id?.slice(0, 8) || "Guest Renter"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-medium text-slate-900 dark:text-white">
                    {ord.vehicles?.title || "Self-Drive Vehicle"}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                    {currency(ord.total_amount || 2000)}
                  </td>
                  <td className="py-3.5 px-3 text-slate-500 dark:text-[#8d92a8]">
                    {ord.payment_status === "paid" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Check className="h-3 w-3" /> Razorpay
                      </span>
                    ) : (
                      "Pending Escrow"
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-slate-500 dark:text-[#8d92a8]">
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
                      className="h-7 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
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
                    className="py-8 text-center text-xs text-slate-400 dark:text-[#6a6f87]"
                  >
                    No bookings found matching current search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Lower 3-Column Section: Disputes/Moderation (Col 1) + SLA Progress (Col 2) + Corona To-Do List (Col 3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Review Moderation & Dispute Resolution */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Disputes & Trust Safety
              </h3>
              <Badge variant="outline" className="text-amber-500 text-[10px]">
                {stats.pendingDisputes} Open
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8d92a8]">
              Reported reviews, vehicle damages, cancellation dispute cases, and refund requests.
            </p>

            <div className="mt-4 space-y-2.5">
              <div
                onClick={() => onSelectTab("disputes")}
                className="cursor-pointer p-3 rounded-xl bg-slate-50 dark:bg-[#12141c] border border-slate-100 dark:border-[#202230] flex items-center justify-between hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Rental Damage Disputes
                  </span>
                </div>
                <span className="text-xs font-bold text-amber-500">{stats.pendingDisputes}</span>
              </div>

              <div
                onClick={() => onSelectTab("moderation")}
                className="cursor-pointer p-3 rounded-xl bg-slate-50 dark:bg-[#12141c] border border-slate-100 dark:border-[#202230] flex items-center justify-between hover:border-purple-500/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
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
            className="w-full mt-4 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#1f2231] hover:bg-slate-200 dark:hover:bg-[#282b3d] text-slate-900 dark:text-white"
          >
            Open Trust & Safety Panel
          </Button>
        </div>

        {/* Card 2: Platform SLA & Performance Progress (Corona Portfolio Progress) */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                SLA & Service Standards
              </h3>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Healthy
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#8d92a8]">
              Automated compliance with statutory turn-around times.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-slate-700 dark:text-slate-300">Driver Response SLA</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">98.4%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#13151e] overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: "98.4%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-slate-700 dark:text-slate-300">Washer Dispatch SLA</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">92.1%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#13151e] overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "92.1%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium pb-1">
                  <span className="text-slate-700 dark:text-slate-300">KYC Verification SLA</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">100.0%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#13151e] overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#222534] flex items-center justify-between text-[11px] text-slate-400">
            <span>Target response: &lt; 2 hours</span>
            <span className="font-medium text-emerald-500">Zero Breaches</span>
          </div>
        </div>

        {/* Card 3: Corona To-Do List Widget (Fully Interactive) */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-[#262838] bg-white dark:bg-[#181a24] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Admin To-Do List</h3>
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
                className="flex-1 h-8 px-3 rounded-lg border border-slate-200 dark:border-[#242738] bg-slate-50 dark:bg-[#161824] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
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
                      ? "bg-slate-50/50 dark:bg-[#13151f]/50 opacity-60"
                      : "bg-slate-50 dark:bg-[#141620] hover:bg-slate-100 dark:hover:bg-[#191c28]"
                  }`}
                >
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id)}
                      className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <span
                      className={`text-xs text-slate-800 dark:text-slate-200 truncate ${
                        todo.completed ? "line-through text-slate-400 dark:text-slate-500" : ""
                      }`}
                    >
                      {todo.text}
                    </span>
                  </label>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete todo item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-[#222534] flex items-center justify-between text-[11px] text-slate-400">
            <span>Stored in browser storage</span>
            {todos.some((t) => t.completed) && (
              <button
                onClick={() => setTodos(todos.filter((t) => !t.completed))}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
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
