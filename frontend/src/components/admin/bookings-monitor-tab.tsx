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
  }, [pager.page, kindFilter, search]);

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
