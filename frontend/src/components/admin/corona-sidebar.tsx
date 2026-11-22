import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Car,
  UserCheck,
  Award,
  FileText,
  Sparkles,
  Building2,
  AlertTriangle,
  Users,
  CalendarClock,
  Wallet,
  TrendingUp,
  CreditCard,
  MapPin,
  Tag,
  Coins,
  MessageSquare,
  Radio,
  LifeBuoy,
  Sliders,
  Droplets,
  ChevronRight,
  Shield,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  colorClass: string;
  badgeCount?: number;
  badgeVariant?: "brand" | "amber" | "emerald" | "rose" | "sky";
}

export interface NavCategory {
  title: string;
  items: NavItem[];
}

interface CoronaSidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  pendingCounts: {
    vehicles?: number;
    hosts?: number;
    drivers?: number;
    licences?: number;
    cleaners?: number;
    washCenters?: number;
    disputes?: number;
    support?: number;
  };
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  adminEmail?: string;
  adminName?: string;
}

export function CoronaSidebar({
  activeTab,
  onSelectTab,
  pendingCounts,
  isOpenMobile,
  onCloseMobile,
  adminEmail,
  adminName,
}: CoronaSidebarProps) {
  const categories: NavCategory[] = [
    {
      title: "Navigation",
      items: [
        {
          id: "overview",
          label: "Dashboard Overview",
          icon: LayoutDashboard,
          colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
        },
      ],
    },
    {
      title: "Verification Queues",
      items: [
        {
          id: "vehicles",
          label: "Vehicles Queue",
          icon: Car,
          colorClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
          badgeCount: pendingCounts.vehicles,
          badgeVariant: "brand",
        },
        {
          id: "hosts",
          label: "Hosts (KYC)",
          icon: UserCheck,
          colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
          badgeCount: pendingCounts.hosts,
          badgeVariant: "emerald",
        },
        {
          id: "drivers",
          label: "Chauffeur Drivers",
          icon: Award,
          colorClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20",
          badgeCount: pendingCounts.drivers,
          badgeVariant: "brand",
        },
        {
          id: "licences",
          label: "Driving Licences",
          icon: FileText,
          colorClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20",
          badgeCount: pendingCounts.licences,
          badgeVariant: "sky",
        },
        {
          id: "cleaners",
          label: "Washer Partners",
          icon: Sparkles,
          colorClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20",
          badgeCount: pendingCounts.cleaners,
          badgeVariant: "emerald",
        },
        {
          id: "wash-centers",
          label: "Wash Centers",
          icon: Building2,
          colorClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20",
          badgeCount: pendingCounts.washCenters,
          badgeVariant: "sky",
        },
        {
          id: "disputes",
          label: "Trip Disputes",
          icon: AlertTriangle,
          colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
          badgeCount: pendingCounts.disputes,
          badgeVariant: "amber",
        },
      ],
    },
    {
      title: "Operations & Fleet",
      items: [
        {
          id: "bookings",
          label: "Bookings Monitor",
          icon: CalendarClock,
          colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
        },
        {
          id: "washes",
          label: "Doorstep Washes",
          icon: Droplets,
          colorClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20",
        },
        {
          id: "customers",
          label: "Customers & Roles",
          icon: Users,
          colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
        },
      ],
    },
    {
      title: "Financials & Accounting",
      items: [
        {
          id: "revenue",
          label: "Revenue & Fees",
          icon: TrendingUp,
          colorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
        },
        {
          id: "payments",
          label: "Payments & Refunds",
          icon: CreditCard,
          colorClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
        },
        {
          id: "payouts",
          label: "Vendor Payouts",
          icon: Wallet,
          colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        },
      ],
    },
    {
      title: "System & Marketing",
      items: [
        {
          id: "coupons",
          label: "Coupons & Discounts",
          icon: Tag,
          colorClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20",
        },
        {
          id: "credits",
          label: "Promotional Credits",
          icon: Coins,
          colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        },
        {
          id: "cities",
          label: "Cities & Hubs",
          icon: MapPin,
          colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
        },
        {
          id: "moderation",
          label: "Review Moderation",
          icon: MessageSquare,
          colorClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20",
        },
        {
          id: "broadcasts",
          label: "Platform Broadcasts",
          icon: Radio,
          colorClass: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20",
        },
        {
          id: "support",
          label: "Support Desk",
          icon: LifeBuoy,
          colorClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20",
          badgeCount: pendingCounts.support,
          badgeVariant: "amber",
        },
        {
          id: "settings",
          label: "Platform Fees & Settings",
          icon: Sliders,
          colorClass: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/20",
        },
        {
          id: "profile",
          label: "Admin Profile",
          icon: UserCheck,
          colorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 flex flex-col bg-white dark:bg-[#11131a] border-r border-slate-200 dark:border-[#222433] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand Logo Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200/80 dark:border-[#1f212e] bg-white dark:bg-[#11131a] shrink-0">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                SYNCHOO
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  ADMIN
                </span>
              </span>
              <p className="text-[10px] text-slate-500 dark:text-[#7f849e] font-medium leading-none mt-0.5">
                Master Command Console
              </p>
            </div>
          </Link>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto inapp-scroll py-3 px-3 space-y-5">
          {categories.map((cat) => (
            <div key={cat.title} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#656a82]">
                {cat.title}
              </div>
              <div className="space-y-0.5">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      className={`group relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-semibold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-indigo-600 dark:before:bg-indigo-400 before:rounded-r-full"
                          : "text-slate-600 dark:text-[#9da2b8] hover:bg-slate-100/80 dark:hover:bg-[#181a24] hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${item.colorClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="truncate">{item.label}</span>
                      </div>

                      {/* Badge Counter */}
                      {item.badgeCount !== undefined && item.badgeCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-[10px] font-bold rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0"
                        >
                          {item.badgeCount}
                        </Badge>
                      ) : (
                        <ChevronRight
                          className={`h-3 w-3 shrink-0 text-slate-300 dark:text-[#383d54] opacity-0 group-hover:opacity-100 transition-opacity ${
                            isActive ? "opacity-100 text-indigo-500" : ""
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-3 border-t border-slate-200/80 dark:border-[#1f212e] bg-slate-50/50 dark:bg-[#0e0f15] text-[11px] text-slate-500 dark:text-[#7f849e] flex items-center justify-between shrink-0">
          <span className="font-medium text-slate-600 dark:text-slate-400">Synchoo v2.4</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Telemetry
          </span>
        </div>
      </aside>
    </>
  );
}
