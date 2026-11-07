import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, UserCheck, ShieldAlert, ShieldCheck, Mail, Phone, MapPin } from "lucide-react";

export function CustomersTab() {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "pending" | "none">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, city, dl_status, dl_number, created_at, avatar_url")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast.error(error.message);
      return;
    }
    setCustomers(data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (customer: any) => {
    const nextStatus = customer.dl_status === "approved" ? "rejected" : "approved";
    setBusy(customer.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        dl_status: nextStatus as any,
        dl_verified_at: nextStatus === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", customer.id);
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Customer licence status updated to ${nextStatus}`);
    load();
  };

  if (!customers) return <Skeleton className="h-44 w-full mt-4" />;

  const filtered = customers.filter((c) => {
    const matchesSearch =
      (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search) ||
      (c.city || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === "all" || c.dl_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="mt-4 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, phone or city..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Verification:</span>
          {(["all", "approved", "pending", "none"] as const).map((st) => (
            <Button
              key={st}
              size="sm"
              variant={filterStatus === st ? "default" : "outline"}
              className="h-8 text-xs capitalize"
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </Button>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {customers.length} registered customers
      </div>

      {/* Customer List */}
      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No customers matching your filter.</p>
        ) : (
          filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-sm">
                    {(c.full_name || "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{c.full_name || "Unnamed Customer"}</p>
                      <Badge
                        variant={
                          c.dl_status === "approved"
                            ? "secondary"
                            : c.dl_status === "pending"
                            ? "outline"
                            : "destructive"
                        }
                        className={c.dl_status === "approved" ? "bg-emerald-50 text-emerald-700 text-[10px]" : "text-[10px]"}
                      >
                        {c.dl_status === "approved" ? "Verified Rider" : c.dl_status === "pending" ? "DL Pending" : "Unverified"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {c.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                      {c.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.city}
                        </span>
                      )}
                      {c.dl_number && <span>DL: {c.dl_number}</span>}
                      <span>Joined: {new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={c.dl_status === "approved" ? "outline" : "default"}
                    disabled={busy === c.id}
                    onClick={() => toggleStatus(c)}
                    className="text-xs"
                  >
                    {c.dl_status === "approved" ? (
                      <>
                        <ShieldAlert className="mr-1 h-3 w-3" /> Revoke Verification
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-1 h-3 w-3" /> Verify Licence
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

