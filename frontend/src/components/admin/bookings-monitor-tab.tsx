import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ListPager, usePage } from "@/components/list-pager";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Search,
  Car,
  UserRound,
  Droplets,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";

type BookingKind = "rental" | "driver" | "wash" | "pooling";

interface UnifiedBooking {
  id: string;
  kind: BookingKind;
  title: string;
  customer_id: string;
  provider_info?: string;
  amount: number;
  status: string;
  created_at: string;
  scheduled_time?: string;
}

export function BookingsMonitorTab() {
  const [items, setItems] = useState<UnifiedBooking[] | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | BookingKind>("all");
  const [search, setSearch] = useState("");
  const pager = usePage();

  // At risk washes
  const [atRiskWashes, setAtRiskWashes] = useState<any[]>([]);
  const [approvedCleaners, setApprovedCleaners] = useState<any[]>([]);
  const [assignCleanerMap, setAssignCleanerMap] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);

  const loadAtRiskWashes = async () => {
    const [wRes, cRes] = await Promise.all([
      api
        .from("wash_bookings")
        .select("id, city, address, slot_date, slot_time, price, admin_alerted_at, wash_services:service_id(name)")
        .eq("status", "confirmed")
        .eq("payment_status", "paid")
        .is("assigned_cleaner_id", null)
        .not("admin_alerted_at", "is", null),
      api
        .from("cleaners")
        .select("id, full_name, city")
        .eq("verification_status", "approved"),
    ]);
    if (wRes.data) setAtRiskWashes(wRes.data);
    if (cRes.data) setApprovedCleaners(cRes.data);
  };

  const assignCleaner = async (washId: string) => {
    const cleanerId = assignCleanerMap[washId];
    if (!cleanerId) return toast.error("Select a cleaner partner first");
    setAssigning(washId);
    const { error } = await api.rpc("admin_assign_wash_cleaner", {
      _wash_booking_id: washId,
      _cleaner_id: cleanerId,
    });
    setAssigning(null);
    if (error) return toast.error(error.message);
    toast.success("Washer partner assigned successfully!");
    loadAtRiskWashes();
    loadAllBookings();
  };

  // One server-side view of all four kinds, so paging, filters and counts are exact.
  const loadAllBookings = async () => {
    let q = api
      .from("admin_bookings_feed" as any)
      .select("id, kind, title, customer_id, amount, status, created_at, scheduled_time", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .order("id")
      .range(pager.from, pager.to);
    if (kindFilter !== "all") q = q.eq("kind", kindFilter);
    const term = search.trim().replace(/[,()%]/g, "");
    if (term) q = q.ilike("title", `%${term}%`);
    const { data, error, count } = await q;
    if (error) return toast.error(error.message);
    setItems(((data as any[]) ?? []).map((b) => ({ ...b, amount: Number(b.amount) || 0 })));
    pager.setTotal(count ?? 0);
  };

  useEffect(() => {
    loadAllBookings();
    loadAtRiskWashes();
  }, [pager.page, kindFilter, search]);

  useEffect(() => {
    const channel = api
      .channel("admin_bookings_monitor_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wash_bookings" },
        () => {
          loadAllBookings();
          loadAtRiskWashes();
        },
      )
      .subscribe();

    const interval = setInterval(() => {
      loadAllBookings();
      loadAtRiskWashes();
    }, 4000);

    return () => {
      api.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  if (!items) return <Skeleton className="h-44 w-full mt-4" />;

  const filtered = items;

  const getKindBadge = (kind: BookingKind) => {
    switch (kind) {
      case "rental":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-200">
            <Car className="mr-1 h-3 w-3" /> Rental
          </Badge>
        );
      case "driver":
        return (
          <Badge variant="outline" className="text-purple-600 border-purple-200">
            <UserRound className="mr-1 h-3 w-3" /> Driver
          </Badge>
        );
      case "wash":
        return (
          <Badge variant="outline" className="text-cyan-600 border-cyan-200">
            <Droplets className="mr-1 h-3 w-3" /> Wash
          </Badge>
        );
      case "pooling":
        return (
          <Badge variant="outline" className="text-emerald-600 border-emerald-200">
            <Users className="mr-1 h-3 w-3" /> Carpool
          </Badge>
        );
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st.toLowerCase()) {
      case "confirmed":
      case "completed":
        return (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
            {st}
          </Badge>
        );
      case "pending":
      case "requested":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700">
            {st}
          </Badge>
        );
      case "cancelled":
      case "rejected":
        return <Badge variant="destructive">{st}</Badge>;
      default:
        return <Badge variant="outline">{st}</Badge>;
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {/* At risk: no washer list */}
      {atRiskWashes.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>At risk: no washer assigned ({atRiskWashes.length})</span>
            </div>
            <p className="text-xs text-muted-foreground">
              These doorstep washes have received an admin alert because no cleaner has claimed them before the deadline. Assign a cleaner manually or take action before auto-cancellation.
            </p>
            <div className="grid gap-2">
              {atRiskWashes.map((w) => {
                const cityCleaners = approvedCleaners.filter(
                  (c) => c.city?.toLowerCase() === w.city?.toLowerCase()
                );
                return (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {w.wash_services?.name || "Doorstep Vehicle Wash"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.slot_date} · {String(w.slot_time).slice(0, 5)} · 📍 {w.address}, {w.city} · {currency(w.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Assign cleaner"
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={assignCleanerMap[w.id] ?? ""}
                        onChange={(e) =>
                          setAssignCleanerMap({ ...assignCleanerMap, [w.id]: e.target.value })
                        }
                      >
                        <option value="">Select cleaner partner…</option>
                        {cityCleaners.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name} ({c.city})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={assigning === w.id || !assignCleanerMap[w.id]}
                        onClick={() => assignCleaner(w.id)}
                      >
                        {assigning === w.id ? "Assigning…" : "Assign"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pager.setPage(0);
            }}
            placeholder="Search by vehicle, driver, package or route..."
            className="pl-9 text-xs"
          />
        </div>

        {/* Kind Filters */}
        <div className="flex items-center gap-1.5 text-xs">
          {(["all", "rental", "driver", "wash", "pooling"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kindFilter === k ? "default" : "outline"}
              className="h-8 text-xs capitalize"
              onClick={() => {
                setKindFilter(k);
                pager.setPage(0);
              }}
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Monitoring {pager.total} active & past bookings</span>
        <Button size="sm" variant="ghost" onClick={loadAllBookings} className="h-7 text-xs">
          Refresh live feed
        </Button>
      </div>

      {/* Bookings Table / Feed */}
      <div className="grid gap-2.5">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No bookings found matching filters.
          </p>
        ) : (
          filtered.map((b) => (
            <Card key={`${b.kind}-${b.id}`}>
              <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getKindBadge(b.kind)}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{b.title}</p>
                      {getStatusBadge(b.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono text-[11px]">ID: {b.id.slice(0, 8)}</span>
                      {b.scheduled_time && <span>Schedule: {b.scheduled_time}</span>}
                      <span>Created: {new Date(b.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-sm text-foreground">{currency(b.amount)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{b.kind}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <ListPager {...pager} />
    </div>
  );
}
