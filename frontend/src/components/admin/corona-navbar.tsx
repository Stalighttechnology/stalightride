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
  { id: "notifications", label: "Notifications & Action Center", category: "Navigation", keywords: ["alerts", "requests", "notifications", "approvals", "pending", "inbox"] },
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
    <header className="sticky top-0 z-30 h-16 w-full bg-background/95 backdrop-blur-md border-b border-border px-4 sm:px-6 flex items-center justify-between gap-3 transition-colors duration-200">
      {/* Left: Sidebar Toggle & Search Bar */}
      <div className="flex items-center gap-3 flex-1 min-w-0" ref={searchContainerRef}>
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors lg:hidden cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Global Live Search Bar (Desktop & Tablet) */}
        <div className="relative w-full max-w-xs sm:max-w-md hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
            className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Interactive Search Results Dropdown */}
          {searchFocused && normalizedQuery && (
            <div className="absolute top-11 left-0 right-0 rounded-2xl bg-popover border border-border shadow-2xl overflow-hidden z-50 animate-in fade-in-50 zoom-in-95">
              <div className="p-2 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground px-3">
                <span>Matching Modules &amp; Queues ({searchResults.length})</span>
                <span>Press Enter ↵ to open</span>
              </div>
              <div className="max-h-80 overflow-y-auto inapp-scroll p-1.5 space-y-0.5">
                {searchResults.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No matching modules found for "{searchTerm}"
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-muted text-left transition-colors group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground group-hover:text-brand transition-colors">
                            {item.label}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-sm bg-muted text-muted-foreground">
                            {item.category}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-brand shrink-0 ml-2" />
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
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:hidden cursor-pointer"
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
              className="h-9 gap-1.5 text-xs font-semibold rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Quick Action</span>
              <ChevronDown className="h-3 w-3 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 p-1.5 rounded-2xl bg-popover border-border shadow-xl"
          >
            <DropdownMenuLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2.5 py-1.5">
              Platform Actions
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => onSelectTab("coupons")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
            >
              <div className="h-6 w-6 rounded-md bg-rose-500/15 text-rose-500 flex items-center justify-center">
                <Tag className="h-3.5 w-3.5" />
              </div>
              Create Discount Coupon
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("broadcasts")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
            >
              <div className="h-6 w-6 rounded-md bg-brand/15 text-brand flex items-center justify-center">
                <Radio className="h-3.5 w-3.5" />
              </div>
              Broadcast System Alert
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("credits")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
            >
              <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-500 flex items-center justify-center">
                <Coins className="h-3.5 w-3.5" />
              </div>
              Grant Customer Promo Credit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSelectTab("wash-centers")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
            >
              <div className="h-6 w-6 rounded-md bg-sky-500/15 text-sky-500 flex items-center justify-center">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              Add Washing Center
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onSelect={() => onSelectTab("settings")}
              className="cursor-pointer gap-2.5 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
            >
              <div className="h-6 w-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
                <Settings className="h-3.5 w-3.5" />
              </div>
              Platform Fees &amp; Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dark / Light Theme Toggle (Directly Switches Website Palette) */}
        <div className="border-l border-border pl-2 sm:pl-3 flex items-center">
          <ThemeToggle className="cursor-pointer" />
        </div>

        {/* Notifications Dropdown with Direct Queue Links (modal={false} prevents scroll locking) */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="View notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-brand text-brand-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-background">
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 p-2 rounded-2xl bg-popover border-border shadow-2xl"
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
              <span className="text-xs font-bold text-foreground">Action Queues &amp; Alerts</span>
              <Badge variant="outline" className="text-[10px] text-brand border-brand/30">
                {unreadCount} Pending
              </Badge>
            </div>
            <div className="py-1 max-h-72 overflow-y-auto inapp-scroll space-y-1">
              {recentAlerts.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  All verification queues are clear!
                </div>
              ) : (
                recentAlerts.map((alt) => (
                  <DropdownMenuItem
                    key={alt.id}
                    onSelect={() => onSelectTab(alt.tab)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-muted transition-colors flex items-start gap-2.5 cursor-pointer focus:bg-muted"
                  >
                    <div className="h-7 w-7 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {alt.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-brand font-medium">
                          {alt.time}
                        </span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">
                          Click to open
                        </span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
            <div className="pt-1.5 border-t border-border flex items-center justify-between px-1">
              <DropdownMenuItem
                onSelect={() => onSelectTab("notifications")}
                className="text-[11px] font-semibold text-brand justify-center cursor-pointer hover:bg-muted rounded-lg"
              >
                Open Notification Center
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSelectTab("overview")}
                className="text-[11px] font-medium text-muted-foreground justify-center cursor-pointer hover:bg-muted rounded-lg"
              >
                Overview
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Pill & Dropdown (modal={false} prevents scroll locking) */}
        <div className="flex items-center">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 px-2 py-1 rounded-xl border border-border bg-card hover:bg-muted transition-colors cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                aria-label="Profile options"
                title="Administrator Profile & Menu"
              >
                <div className="h-7 w-7 rounded-lg bg-brand text-brand-foreground font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                  {(adminName || adminEmail || "A").charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline-block text-xs font-semibold text-foreground max-w-[100px] truncate">
                  {adminName || adminEmail?.split("@")[0] || "Admin"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 p-1.5 rounded-2xl bg-popover border-border shadow-2xl"
            >
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-bold text-foreground truncate">
                  {adminName || "Super Administrator"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{adminEmail}</p>
              </div>
              <DropdownMenuItem
                onSelect={() => onSelectTab("profile")}
                className="cursor-pointer gap-2 text-xs font-semibold rounded-lg px-2.5 py-2 hover:bg-muted text-brand flex items-center"
              >
                <User className="h-3.5 w-3.5" />
                Administrator Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSelectTab("notifications")}
                className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground flex items-center"
              >
                <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                Notification Center
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/"
                  className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground flex items-center"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  Return to Storefront
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSelectTab("settings")}
                className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                Platform Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              {onLogout && (
                <DropdownMenuItem
                  onSelect={onLogout}
                  className="cursor-pointer gap-2 text-xs rounded-lg px-2.5 py-2 text-destructive hover:bg-destructive/10 font-medium"
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
        <div className="absolute top-16 left-0 right-0 p-3 bg-background border-b border-border z-40 sm:hidden">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              autoFocus
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search queues, modules, settings..."
              className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-input bg-card text-foreground"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {normalizedQuery && searchResults.length > 0 && (
            <div className="mt-2 rounded-xl bg-popover border border-border max-h-56 overflow-y-auto divide-y divide-border">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectModule(item.id)}
                  className="w-full p-2.5 text-left text-xs text-foreground flex items-center justify-between"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{item.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
