import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadAllBookings = async () => {
    try {
      const [{ data: rentals }, { data: driverHires }, { data: washes }, { data: pools }] =
        await Promise.all([
          api
            .from("bookings")
            .select(
              "id, customer_id, vendor_id, total_price, status, created_at, start_date, end_date, vehicles:vehicle_id(title)",
            )
            .order("created_at", { ascending: false })
            .limit(50),
          api
            .from("driver_bookings")
            .select(
              "id, customer_id, driver_id, total_price, status, created_at, start_date, drivers:driver_id(full_name)",
            )
            .order("created_at", { ascending: false })
            .limit(50),
          api
            .from("wash_bookings")
            .select(
              "id, customer_id, assigned_vendor_id, price, status, created_at, slot_date, slot_time, wash_services:service_id(name)",
            )
            .order("created_at", { ascending: false })
            .limit(50),
          api
            .from("pool_trips")
            .select(
              "id, driver_id, origin, destination, price_per_seat, status, created_at, depart_at",
            )
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

      const unified: UnifiedBooking[] = [];

      (rentals || []).forEach((r: any) => {
        unified.push({
          id: r.id,
          kind: "rental",
          title: r.vehicles?.title || "Self-drive Vehicle",
          customer_id: r.customer_id,
          amount: Number(r.total_price) || 0,
          status: r.status,
          created_at: r.created_at,
          scheduled_time: `${r.start_date || ""} → ${r.end_date || ""}`,
        });
      });

      (driverHires || []).forEach((d: any) => {
        unified.push({
          id: d.id,
          kind: "driver",
          title: `Driver: ${d.drivers?.full_name || "Chauffeur"}`,
          customer_id: d.customer_id,
          amount: Number(d.total_price) || 0,
          status: d.status,
          created_at: d.created_at,
          scheduled_time: d.start_date || "",
        });
      });

      (washes || []).forEach((w: any) => {
        unified.push({
          id: w.id,
          kind: "wash",
          title: `Wash: ${w.wash_services?.name || "Doorstep Wash"}`,
          customer_id: w.customer_id,
          amount: Number(w.price) || 0,
          status: w.status,
          created_at: w.created_at,
          scheduled_time: `${w.slot_date} ${w.slot_time}`,
        });
      });

      (pools || []).forEach((p: any) => {
        unified.push({
          id: p.id,
          kind: "pooling",
          title: `Carpool: ${p.origin} → ${p.destination}`,
          customer_id: p.driver_id,
          amount: Number(p.price_per_seat) || 0,
          status: p.status,
          created_at: p.created_at,
          scheduled_time: p.depart_at,
        });
      });

      // Sort by latest created_at
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(unified);
    } catch (err: any) {
      toast.error(err.message || "Failed to load bookings");
    }
  };

  useEffect(() => {
    loadAllBookings();
  }, []);

  if (!items) return <Skeleton className="h-44 w-full mt-4" />;

  const filtered = items.filter((b) => {
    const matchesKind = kindFilter === "all" || b.kind === kindFilter;
    const matchesStatus =
      statusFilter === "all" || b.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch =
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.customer_id.toLowerCase().includes(search.toLowerCase());
    return matchesKind && matchesStatus && matchesSearch;
  });

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
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, vehicle, or route..."
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
              onClick={() => setKindFilter(k)}
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Monitoring {filtered.length} total active & past bookings</span>
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
    </div>
  );
}
