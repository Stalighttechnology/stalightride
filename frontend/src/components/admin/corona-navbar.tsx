import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Menu,
  Search,
  Plus,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Settings,
  Tag,
  Radio,
  Coins,
  ShieldCheck,
  Building2,
  ExternalLink,
  X,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export interface SearchableModule {
  id: string;
  label: string;
  category: string;
  keywords: string[];
}

export const ADMIN_SEARCH_MODULES: SearchableModule[] = [
  { id: "overview", label: "Dashboard Overview & Telemetry", category: "Navigation", keywords: ["home", "stats", "kpi", "overview", "revenue", "command"] },
  { id: "vehicles", label: "Vehicle Verification Queue", category: "Verification", keywords: ["cars", "rc", "insurance", "fitness", "pollution", "verify", "fleet", "reg"] },
  { id: "hosts", label: "Host KYC Queue", category: "Verification", keywords: ["vendor", "identity", "pan", "aadhaar", "host", "business", "kyc"] },
  { id: "drivers", label: "Chauffeur Drivers Accreditation", category: "Verification", keywords: ["badge", "licence", "chauffeur", "drivers", "commercial", "hire"] },
  { id: "licences", label: "Customer Driving Licences", category: "Verification", keywords: ["dl", "customer licence", "driving", "permit", "upload"] },
  { id: "cleaners", label: "Washer Partners Queue", category: "Verification", keywords: ["cleaners", "doorstep", "detailing", "washer", "personnel"] },
  { id: "wash-centers", label: "Washing Center Hubs", category: "Verification", keywords: ["center", "bay", "hub", "slot", "wash station", "capacity"] },
  { id: "disputes", label: "Trip Damage Disputes", category: "Verification", keywords: ["damage", "claim", "dispute", "arbitration", "penalty", "security deposit"] },
  { id: "bookings", label: "Bookings Monitor", category: "Operations", keywords: ["trips", "orders", "active bookings", "schedule", "rentals"] },
  { id: "washes", label: "Doorstep Washes Monitor", category: "Operations", keywords: ["wash orders", "cleanings", "doorstep", "slots"] },
  { id: "customers", label: "Customers & Role Management", category: "Operations", keywords: ["users", "roles", "members", "accounts", "profiles", "permissions"] },
  { id: "revenue", label: "Revenue & Platform Commissions", category: "Financials", keywords: ["earnings", "commissions", "tax", "gst", "accounting", "ledger"] },
  { id: "payments", label: "Payments & Refunds", category: "Financials", keywords: ["transactions", "refunds", "gateway", "razorpay", "receipts"] },
  { id: "payouts", label: "Vendor & Driver Payouts", category: "Financials", keywords: ["withdrawals", "bank transfer", "wallet", "payout queue"] },
  { id: "coupons", label: "Coupons & Discounts", category: "System", keywords: ["promo", "voucher", "discount code", "offer", "percentage"] },
  { id: "credits", label: "Promotional Credits", category: "System", keywords: ["grant", "credit", "wallet balance", "reward", "cashback"] },
  { id: "cities", label: "Cities & Service Hubs", category: "System", keywords: ["location", "bangalore", "mumbai", "delhi", "zones", "geo"] },
  { id: "moderation", label: "Review Moderation", category: "System", keywords: ["reviews", "ratings", "reported", "flags", "feedback", "stars"] },
  { id: "broadcasts", label: "Platform Broadcasts", category: "System", keywords: ["announcement", "banner", "push", "alert", "notice", "toast"] },
  { id: "support", label: "Support Desk & Tickets", category: "System", keywords: ["helpdesk", "tickets", "customer support", "inquiries", "issues"] },
  { id: "settings", label: "Platform Fees & System Settings", category: "System", keywords: ["commission rate", "gst", "fee", "threshold", "rules", "configuration"] },
  { id: "profile", label: "Administrator Profile & Account", category: "Account", keywords: ["admin profile", "my account", "credentials", "photo", "name", "password", "security", "admin"] },
];

interface CoronaNavbarProps {
  onToggleSidebar: () => void;
  onSelectTab: (tabId: string) => void;
  adminEmail?: string;
  adminName?: string;
  onLogout?: () => void;
  unreadCount?: number;
  recentAlerts?: {
    id: string;
    title: string;
    time: string;
    type: "vehicle" | "kyc" | "driver" | "dispute" | "general";
    tab: string;
  }[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
}

export function CoronaNavbar({
  onToggleSidebar,
  onSelectTab,
  adminEmail,
  adminName,
  onLogout,
  unreadCount = 0,
  recentAlerts = [],
  searchTerm,
  onSearchChange,
}: CoronaNavbarProps) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Filter modules based on searchTerm
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? ADMIN_SEARCH_MODULES.filter(
        (m) =>
          m.label.toLowerCase().includes(normalizedQuery) ||
          m.category.toLowerCase().includes(normalizedQuery) ||
          m.keywords.some((k) => k.toLowerCase().includes(normalizedQuery)),
      ).slice(0, 7)
    : [];

  // Close search popup on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectModule = (id: string) => {
    onSelectTab(id);
    onSearchChange("");
    setSearchFocused(false);
    setMobileSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white/95 dark:bg-[#11131a]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-[#222433] px-4 sm:px-6 flex items-center justify-between gap-3 transition-colors duration-200">
      {/* Left: Sidebar Toggle & Search Bar */}
      <div className="flex items-center gap-3 flex-1 min-w-0" ref={searchContainerRef}>
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-[#8d92a8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1c27] transition-colors lg:hidden"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Global Live Search Bar (Desktop & Tablet) */}
        <div className="relative w-full max-w-xs sm:max-w-md hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-[#6a6f87]" />
          <input
            type="text"
            value={searchTerm}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setSearchFocused(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length > 0) {
                handleSelectModule(searchResults[0].id);
              }
              if (e.key === "Escape") {
                setSearchFocused(false);
              }
            }}
            placeholder="Search queues, bookings, fees, settings..."
            className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-slate-200 dark:border-[#242738] bg-slate-50 dark:bg-[#161824] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#656a82] focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Interactive Search Results Dropdown */}
          {searchFocused && normalizedQuery && (
            <div className="absolute top-11 left-0 right-0 rounded-2xl bg-white dark:bg-[#181a24] border border-slate-200 dark:border-[#262838] shadow-2xl overflow-hidden z-50 animate-in fade-in-50 zoom-in-95">
              <div className="p-2 border-b border-slate-100 dark:border-[#222538] flex items-center justify-between text-[11px] text-slate-400 dark:text-[#6b718c] px-3">
                <span>Matching Modules &amp; Queues ({searchResults.length})</span>
                <span>Press Enter ↵ to open</span>
              </div>
              <div className="max-h-80 overflow-y-auto inapp-scroll p-1.5 space-y-0.5">
                {searchResults.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 dark:text-[#6a6f87]">
                    No matching modules found for "{searchTerm}"
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202332] text-left transition-colors group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {item.label}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-sm bg-slate-100 dark:bg-[#232638] text-slate-500 dark:text-[#888ea6]">
                            {item.category}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-indigo-500 shrink-0 ml-2" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Search Button */}
        <button
          onClick={() => setMobileSearchOpen((prev) => !prev)}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-[#8d92a8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1c27] transition-colors sm:hidden"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* + Quick Action Dropdown */}
        <DropdownMenu open={quickOpen} onOpenChange={setQuickOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-xs shadow-indigo-500/20"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Quick Action</span>
              <ChevronDown className="h-3 w-3 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 p-1.5 rounded-2xl bg-white dark:bg-[#181a24] border-slate-200 dark:border-[#262838] shadow-xl"
          >
            <DropdownMenuLabel className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-[#6a6f87] px-2.5 py-1.5">
              Platform Actions
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => onSelectTab("coupons")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
            >
              <div className="h-6 w-6 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Tag className="h-3.5 w-3.5" />
              </div>
              Create Discount Coupon
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("broadcasts")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
            >
              <div className="h-6 w-6 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Radio className="h-3.5 w-3.5" />
              </div>
              Broadcast System Alert
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("credits")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
            >
              <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Coins className="h-3.5 w-3.5" />
              </div>
              Grant Customer Promo Credit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("wash-centers")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
            >
              <div className="h-6 w-6 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              Add Washing Center
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-[#242738]" />
            <DropdownMenuItem
              onSelect={() => onSelectTab("settings")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
            >
              <div className="h-6 w-6 rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-400 flex items-center justify-center">
                <Settings className="h-3.5 w-3.5" />
              </div>
              Platform Fees &amp; Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dark / Light Theme Toggle (Directly Switches Website Palette) */}
        <div className="border-l border-slate-200/80 dark:border-[#222433] pl-2 sm:pl-3 flex items-center">
          <ThemeToggle className="h-9 w-9 rounded-xl border border-slate-200 dark:border-[#262838] bg-slate-50 dark:bg-[#161824] text-slate-600 dark:text-[#9ea3ba] hover:text-slate-900 dark:hover:text-white" />
        </div>

        {/* Notifications Dropdown with Direct Queue Links (modal={false} prevents scroll locking) */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-9 w-9 rounded-xl border border-slate-200 dark:border-[#262838] bg-slate-50 dark:bg-[#161824] flex items-center justify-center text-slate-600 dark:text-[#9ea3ba] hover:text-slate-900 dark:hover:text-white transition-colors"
              aria-label="View notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#11131a]">
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 p-2 rounded-2xl bg-white dark:bg-[#181a24] border-slate-200 dark:border-[#262838] shadow-2xl"
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-[#242738]">
              <span className="text-xs font-bold text-slate-900 dark:text-white">Pending Action Queues</span>
              <Badge variant="outline" className="text-[10px] text-indigo-500 border-indigo-500/30">
                {unreadCount} Queued
              </Badge>
            </div>
            <div className="py-1 max-h-72 overflow-y-auto inapp-scroll space-y-1">
              {recentAlerts.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-[#6a6f87]">
                  All verification queues are clear!
                </div>
              ) : (
                recentAlerts.map((alt) => (
                  <DropdownMenuItem
                    key={alt.id}
                    onSelect={() => onSelectTab(alt.tab)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202332] transition-colors flex items-start gap-2.5 cursor-pointer focus:bg-slate-100 dark:focus:bg-[#202332]"
                  >
                    <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {alt.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                          {alt.time}
                        </span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500 dark:text-[#7f849e]">
                          Click to open
                        </span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
            <div className="pt-1.5 border-t border-slate-100 dark:border-[#242738] text-center">
              <DropdownMenuItem
                onSelect={() => onSelectTab("overview")}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-[#202332]"
              >
                Go to Command Overview
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Pill & Dropdown (modal={false} prevents scroll locking, direct tab switch to profile) */}
        <div className="flex items-center">
          <DropdownMenu modal={false}>
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-[#262838] bg-slate-50 dark:bg-[#161824] hover:bg-slate-100 dark:hover:bg-[#1f2231] transition-colors p-0.5">
              <button
                onClick={() => onSelectTab("profile")}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:opacity-90 transition-opacity"
                title="Open Administrator Profile"
              >
                <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                  {(adminName || adminEmail || "A").charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline-block text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
                  {adminName || adminEmail?.split("@")[0] || "Admin"}
                </span>
              </button>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-[#6a6f87] dark:hover:text-white"
                  aria-label="Profile options"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent
              align="end"
              className="w-56 p-1.5 rounded-2xl bg-white dark:bg-[#181a24] border-slate-200 dark:border-[#262838] shadow-2xl"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-[#242738]">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {adminName || "Super Administrator"}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-[#7f849e] truncate">{adminEmail}</p>
              </div>
              <DropdownMenuItem
                onSelect={() => onSelectTab("profile")}
                className="cursor-pointer gap-2 text-xs font-semibold rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-indigo-600 dark:text-indigo-400 flex items-center"
              >
                <User className="h-3.5 w-3.5" />
                Administrator Profile
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/"
                  className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200 flex items-center"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  Return to Storefront
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSelectTab("settings")}
                className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-[#202332] text-slate-800 dark:text-slate-200"
              >
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                Platform Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-[#242738]" />
              {onLogout && (
                <DropdownMenuItem
                  onSelect={onLogout}
                  className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-medium"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expandable Mobile Search Bar */}
      {mobileSearchOpen && (
        <div className="absolute top-16 left-0 right-0 p-3 bg-white dark:bg-[#11131a] border-b border-slate-200 dark:border-[#222433] z-40 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search queues, bookings, fees..."
              className="w-full h-10 pl-9 pr-8 text-xs rounded-xl border border-slate-200 dark:border-[#242738] bg-slate-50 dark:bg-[#161824] text-slate-900 dark:text-white"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 p-0.5"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {normalizedQuery && searchResults.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-[#262838] bg-white dark:bg-[#181a24] overflow-hidden">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectModule(item.id)}
                  className="w-full flex items-center justify-between p-2.5 border-b last:border-b-0 border-slate-100 dark:border-[#242738] text-left text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-slate-400 uppercase">{item.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
