import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListPager, usePage } from "@/components/list-pager";
import { toast } from "sonner";
import {
  ExternalLink,
  CheckCircle2,
  X,
  Clock,
  Sparkles,
  Inbox,
} from "lucide-react";

export type NotificationCategory = "all" | "riding" | "wash" | "approval" | "dl approval";

export interface AdminNotificationItem {
  id: string;
  category: "riding" | "wash" | "approval" | "dl approval";
  tab: string;
  title: string;
  detail: string;
  time: string;
  timestamp: number;
  badgeLabel: string;
  badgeVariant?: "brand" | "amber" | "emerald" | "sky" | "rose";
}

const STORAGE_KEY = "synchoo_admin_dismissed_notifications";

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // fallback in private mode
  }
}

export function AdminNotificationsTab({
  onSelectTab,
}: {
  onSelectTab: (tabId: string) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<NotificationCategory>("all");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissedIds());
  const pager = usePage(15);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [
        { data: vehicles },
        { data: hosts },
        { data: drivers },
        { data: cleaners },
        { data: licences },
        { data: washes },
        { data: bookings },
      ] = await Promise.all([
        // Approval: Vehicles
        api
          .from("vehicles")
          .select("id,title,brand,model,year,city,created_at")
          .eq("verification_status", "pending")
          .order("created_at", { ascending: false }),
        // Approval: Hosts KYC
        api
          .from("vendors")
          .select("id,business_name,created_at")
          .eq("kyc_status", "pending")
          .order("created_at", { ascending: false }),
        // Approval: Drivers
        api
          .from("drivers")
          .select("id,full_name,city,created_at")
          .eq("verification_status", "pending")
          .order("created_at", { ascending: false }),
        // Approval: Cleaners
        api
          .from("cleaners")
          .select("id,full_name,city,created_at")
          .eq("verification_status", "pending")
          .order("created_at", { ascending: false }),
        // DL Approval: Customer driving licences
        api
          .from("profiles")
          .select("id,full_name,dl_number,dl_expiry,updated_at,created_at")
          .eq("dl_status", "pending")
          .order("updated_at", { ascending: false }),
        // Wash: Unassigned or pending wash orders
        api
          .from("wash_bookings")
          .select("id,city,slot_date,slot_time,price,created_at,wash_services:service_id(name)")
          .in("status", ["pending", "confirmed"])
          .is("assigned_cleaner_id", null)
          .order("created_at", { ascending: false }),
        // Riding: Rental / driver / trip bookings awaiting confirmation
        api
          .from("bookings")
          .select("id,city,start_date,end_date,total_price,status,created_at,vehicles:vehicle_id(title)")
          .in("status", ["pending", "confirmed"])
          .order("created_at", { ascending: false }),
      ]);

      const notifs: AdminNotificationItem[] = [];

      // 1. Vehicle approvals
      (vehicles ?? []).forEach((v: any) => {
        notifs.push({
          id: `veh_${v.id}`,
          category: "approval",
          tab: "vehicles",
          title: v.title || `${v.brand} ${v.model} (${v.year})`,
          detail: `Vehicle Registration & Documentation Inspection · ${v.city}`,
          time: new Date(v.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(v.created_at).getTime(),
          badgeLabel: "Vehicle Approval",
          badgeVariant: "brand",
        });
      });

      // 2. Host KYC approvals
      (hosts ?? []).forEach((h: any) => {
        notifs.push({
          id: `host_${h.id}`,
          category: "approval",
          tab: "hosts",
          title: h.business_name || "Host Partner Account",
          detail: "Government ID & Business KYC Documents Awaiting Verification",
          time: new Date(h.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(h.created_at).getTime(),
          badgeLabel: "Host KYC",
          badgeVariant: "emerald",
        });
      });

      // 3. Driver accreditations
      (drivers ?? []).forEach((d: any) => {
        notifs.push({
          id: `drv_${d.id}`,
          category: "approval",
          tab: "drivers",
          title: d.full_name || "Chauffeur Applicant",
          detail: `Commercial Driver Licence & Background Accreditation · ${d.city}`,
          time: new Date(d.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(d.created_at).getTime(),
          badgeLabel: "Driver Approval",
          badgeVariant: "brand",
        });
      });

      // 4. Cleaner approvals
      (cleaners ?? []).forEach((c: any) => {
        notifs.push({
          id: `cln_${c.id}`,
          category: "approval",
          tab: "cleaners",
          title: c.full_name || "Mobile Detailing Partner",
          detail: `Doorstep Washer Partner Registration · ${c.city}`,
          time: new Date(c.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(c.created_at).getTime(),
          badgeLabel: "Washer Approval",
          badgeVariant: "emerald",
        });
      });

      // 5. DL approvals
      (licences ?? []).forEach((l: any) => {
        notifs.push({
          id: `dl_${l.id}`,
          category: "dl approval",
          tab: "licences",
          title: l.full_name || "Customer Driver Licence",
          detail: `Driving Licence No. ${l.dl_number ?? "Pending"} · Expiry: ${l.dl_expiry ?? "Not set"}`,
          time: new Date(l.updated_at || l.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(l.updated_at || l.created_at).getTime(),
          badgeLabel: "DL Approval",
          badgeVariant: "sky",
        });
      });

      // 6. Wash orders
      (washes ?? []).forEach((w: any) => {
        notifs.push({
          id: `wash_${w.id}`,
          category: "wash",
          tab: "washes",
          title: `${w.wash_services?.name || "Doorstep Detailing"} (${w.city})`,
          detail: `Scheduled for ${w.slot_date} at ${String(w.slot_time).slice(0, 5)} · ₹${w.price} · Unassigned Washer`,
          time: new Date(w.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(w.created_at).getTime(),
          badgeLabel: "Doorstep Wash",
          badgeVariant: "sky",
        });
      });

      // 7. Riding / rental bookings
      (bookings ?? []).forEach((b: any) => {
        notifs.push({
          id: `book_${b.id}`,
          category: "riding",
          tab: "bookings",
          title: `${b.vehicles?.title || "Car Rental Booking"} #${b.id.slice(0, 8)}`,
          detail: `Trip: ${b.start_date} to ${b.end_date} · ${b.city} · ₹${b.total_price} · ${b.status}`,
          time: new Date(b.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          timestamp: new Date(b.created_at).getTime(),
          badgeLabel: "Riding Order",
          badgeVariant: "amber",
        });
      });

      // Sort newest requests first
      notifs.sort((a, b) => b.timestamp - a.timestamp);
      setItems(notifs);
    } catch (err: any) {
      toast.error(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Filter out dismissed notifications
  const activeItems = useMemo(() => {
    return items.filter((item) => !dismissed.has(item.id));
  }, [items, dismissed]);

  // Group filtering
  const filteredItems = useMemo(() => {
    if (selectedGroup === "all") return activeItems;
    return activeItems.filter((item) => item.category === selectedGroup);
  }, [activeItems, selectedGroup]);

  // Sync pager total
  useEffect(() => {
    pager.setTotal(filteredItems.length);
  }, [filteredItems.length]);

  // Visible page items
  const paginatedItems = useMemo(() => {
    return filteredItems.slice(pager.from, pager.to + 1);
  }, [filteredItems, pager.from, pager.to]);

  // When admin clicks a notification, redirect & vanish it from the list!
  const handleItemClick = (item: AdminNotificationItem) => {
    const updated = new Set(dismissed);
    updated.add(item.id);
    setDismissed(updated);
    saveDismissedIds(updated);

    // Redirect to the appropriate tab
    onSelectTab(item.tab);
  };

  // Dismiss without navigating
  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = new Set(dismissed);
    updated.add(id);
    setDismissed(updated);
    saveDismissedIds(updated);
    toast.success("Notification cleared");
  };

  // Clear all in current group
  const handleClearAll = () => {
    const updated = new Set(dismissed);
    filteredItems.forEach((item) => updated.add(item.id));
    setDismissed(updated);
    saveDismissedIds(updated);
    toast.success("All notifications cleared");
  };

  const countsByCategory = useMemo(() => {
    return {
      all: activeItems.length,
      riding: activeItems.filter((i) => i.category === "riding").length,
      wash: activeItems.filter((i) => i.category === "wash").length,
      approval: activeItems.filter((i) => i.category === "approval").length,
      "dl approval": activeItems.filter((i) => i.category === "dl approval").length,
    };
  }, [activeItems]);

  const groups: { key: NotificationCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "riding", label: "Riding" },
    { key: "wash", label: "Wash" },
    { key: "approval", label: "Approval" },
    { key: "dl approval", label: "DL Approval" },
  ];

  return (
    <div className="mt-4 space-y-4">
      {/* Top Filter Groups (All, riding, wash, approval, dl approval) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {groups.map((g) => {
            const count = countsByCategory[g.key];
            const isActive = selectedGroup === g.key;
            return (
              <button
                key={g.key}
                onClick={() => {
                  setSelectedGroup(g.key);
                  pager.setPage(0);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  isActive
                    ? "bg-brand text-brand-foreground shadow-xs"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{g.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-brand-foreground/20 text-brand-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {filteredItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : paginatedItems.length === 0 ? (
        /* Empty State */
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground mt-3">
            No Pending Notifications
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            All requests in this category have been acted upon or cleared.
          </p>
        </Card>
      ) : (
        /* Notifications List */
        <div className="space-y-2.5">
          {paginatedItems.map((item) => (
            <Card
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="group relative cursor-pointer rounded-2xl border-border bg-card transition-all duration-150 hover:border-brand/40 hover:shadow-md hover:bg-muted/30"
            >
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        item.badgeVariant === "brand"
                          ? "bg-brand/10 text-brand border border-brand/20"
                          : item.badgeVariant === "emerald"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : item.badgeVariant === "sky"
                              ? "bg-sky-500/10 text-sky-500 border border-sky-500/20"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      }`}
                    >
                      {item.badgeLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.time}
                    </span>
                  </div>

                  {/* Request specific title (NOT generic admin queue text) */}
                  <h4 className="font-display text-sm font-bold text-foreground mt-1.5 truncate group-hover:text-brand transition-colors">
                    {item.title}
                  </h4>

                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {item.detail}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDismiss(e, item.id)}
                    title="Dismiss"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <div className="h-7 w-7 rounded-lg bg-brand/10 text-brand flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination at bottom (Always visible, format: Previous 1 Next) */}
      <ListPager {...pager} />
    </div>
  );
}
