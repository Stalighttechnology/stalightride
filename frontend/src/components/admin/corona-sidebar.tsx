import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import synchooMark from "@/assets/synchoo-mark.png";

export interface NavItem {
  id: string;
  label: string;
  badgeCount?: number;
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
}: CoronaSidebarProps) {
  const totalPending =
    (pendingCounts.vehicles || 0) +
    (pendingCounts.hosts || 0) +
    (pendingCounts.drivers || 0) +
    (pendingCounts.licences || 0) +
    (pendingCounts.cleaners || 0) +
    (pendingCounts.washCenters || 0) +
    (pendingCounts.disputes || 0) +
    (pendingCounts.support || 0);

  const categories: NavCategory[] = [
    {
      title: "Navigation",
      items: [
        {
          id: "overview",
          label: "Dashboard Overview",
        },
        {
          id: "notifications",
          label: "Notifications",
          badgeCount: totalPending,
        },
      ],
    },
    {
      title: "Verification Queues",
      items: [
        {
          id: "vehicles",
          label: "Vehicles Queue",
          badgeCount: pendingCounts.vehicles,
        },
        {
          id: "hosts",
          label: "Hosts (KYC)",
          badgeCount: pendingCounts.hosts,
        },
        {
          id: "drivers",
          label: "Chauffeur Drivers",
          badgeCount: pendingCounts.drivers,
        },
        {
          id: "licences",
          label: "Driving Licences",
          badgeCount: pendingCounts.licences,
        },
        {
          id: "cleaners",
          label: "Washer Partners",
          badgeCount: pendingCounts.cleaners,
        },
        {
          id: "wash-centers",
          label: "Wash Centers",
          badgeCount: pendingCounts.washCenters,
        },
        {
          id: "disputes",
          label: "Trip Disputes",
          badgeCount: pendingCounts.disputes,
        },
      ],
    },
    {
      title: "Operations & Fleet",
      items: [
        {
          id: "bookings",
          label: "Bookings Monitor",
        },
        {
          id: "washes",
          label: "Doorstep Washes",
        },
        {
          id: "customers",
          label: "Customers & Roles",
        },
      ],
    },
    {
      title: "Financials & Accounting",
      items: [
        {
          id: "revenue",
          label: "Revenue & Fees",
        },
        {
          id: "payments",
          label: "Payments & Refunds",
        },
        {
          id: "payouts",
          label: "Vendor Payouts",
        },
      ],
    },
    {
      title: "System & Marketing",
      items: [
        {
          id: "coupons",
          label: "Coupons & Discounts",
        },
        {
          id: "credits",
          label: "Promotional Credits",
        },
        {
          id: "cities",
          label: "Cities & Admin Areas",
        },
        {
          id: "moderation",
          label: "Review Moderation",
        },
        {
          id: "broadcasts",
          label: "Broadcast Feed",
        },
        {
          id: "support",
          label: "Support Desk",
          badgeCount: pendingCounts.support,
        },
        {
          id: "settings",
          label: "Platform Fees & Settings",
        },
        {
          id: "profile",
          label: "Admin Profile",
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand Logo Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-sidebar-border bg-sidebar shrink-0">
          <Link to="/admin" className="flex items-center gap-2.5">
            <img
              src={synchooMark}
              alt="Synchoo"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <div>
              <span className="font-display text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                SYNCHOO
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-brand/10 text-brand border border-brand/20">
                  ADMIN
                </span>
              </span>
              <p className="text-[10px] text-muted-foreground font-medium leading-none mt-0.5">
                Master Command Console
              </p>
            </div>
          </Link>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground lg:hidden cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Menu List (Clean without symbols, with bubble badge) */}
        <div className="flex-1 overflow-y-auto inapp-scroll py-3 px-3 space-y-4">
          {categories.map((cat) => (
            <div key={cat.title} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {cat.title}
              </div>
              <div className="space-y-0.5">
                {cat.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      className={`group relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                        isActive
                          ? "bg-brand/10 text-brand font-semibold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-brand before:rounded-r-full"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-medium"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>

                      {/* Bubble Counter */}
                      {item.badgeCount !== undefined && item.badgeCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold rounded-full bg-brand/15 text-brand border border-brand/25 flex items-center justify-center shrink-0"
                        >
                          {item.badgeCount}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar text-[11px] text-muted-foreground flex items-center justify-between shrink-0">
          <span className="font-medium text-foreground/80">Synchoo v2.4</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Telemetry
          </span>
        </div>
      </aside>
    </>
  );
}
