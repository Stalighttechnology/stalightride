import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Download,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  User,
  ArrowUpDown,
  Filter,
  Copy,
  Eye,
  Activity,
  Layers,
  CreditCard,
  CalendarDays,
  LogIn,
} from "lucide-react";
import { ListPager, usePage } from "@/components/list-pager";

export interface AuditLog {
  id: string;
  created_at: string;
  event_type: string;
  category: string;
  level: "info" | "success" | "warning" | "error";
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  details: Record<string, any>;
}

const PAGE_SIZE = 40;

export function SystemLogsTab() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");

  const pager = usePage(PAGE_SIZE);

  const loadLogs = useCallback(async (showToast = false) => {
    try {
      let query = api
        .from("system_audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pager.from, pager.to);

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }
      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }
      if (search.trim()) {
        const s = search.trim();
        query = query.or(
          `action.ilike.%${s}%,actor_email.ilike.%${s}%,target_id.ilike.%${s}%,event_type.ilike.%${s}%,ip_address.ilike.%${s}%`,
        );
      }

      const { data, count, error } = await query;
      if (error) {
        toast.error(error.message || "Failed to load audit logs");
        return;
      }

      setLogs((data as AuditLog[]) ?? []);
      pager.setTotal(count ?? 0);
      if (showToast) {
        toast.success("Audit logs refreshed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [pager.from, pager.to, pager.setTotal, categoryFilter, levelFilter, search]);

  useEffect(() => {
    pager.setPage(0);
  }, [categoryFilter, levelFilter, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Real-time listener for newly inserted audit logs
  useEffect(() => {
    const channel = api
      .channel("admin:system_audit_logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_audit_logs" },
        (payload) => {
          if (payload.new) {
            setLogs((prev) => {
              if (!prev) return [payload.new as AuditLog];
              return [payload.new as AuditLog, ...prev.slice(0, PAGE_SIZE - 1)];
            });
            pager.setTotal((c: number) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      api.removeChannel(channel);
    };
  }, []);

  // Periodic polling if autoRefresh is enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadLogs();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  // Aggregate stats from the current page/sample
  const stats = useMemo(() => {
    const list = logs || [];
    return {
      total: pager.total,
      auth: list.filter((l) => l.category === "auth" || l.event_type.startsWith("auth.")).length,
      bookings: list.filter((l) => l.category === "booking" || l.event_type.includes("booking")).length,
      payments: list.filter((l) => l.category === "payment" || l.event_type.includes("payment") || l.event_type.includes("payout")).length,
      errors: list.filter((l) => l.level === "error" || l.level === "warning").length,
    };
  }, [logs, pager.total]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const exportLogsAsJson = () => {
    if (!logs || !logs.length) return toast.error("No logs to export");
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `synchoo-server-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit logs exported to JSON");
  };

  const exportLogsAsCsv = () => {
    if (!logs || !logs.length) return toast.error("No logs to export");
    const headers = ["Timestamp", "Level", "Category", "Event Type", "Actor", "Action", "Target ID", "IP Address"];
    const rows = logs.map((l) => [
      `"${l.created_at}"`,
      `"${l.level}"`,
      `"${l.category}"`,
      `"${l.event_type}"`,
      `"${l.actor_email || l.actor_id || "System"}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.target_id || ""}"`,
      `"${l.ip_address || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `synchoo-server-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit logs exported to CSV");
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "success":
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold gap-1">
            <CheckCircle2 className="h-3 w-3" />
            SUCCESS
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold gap-1">
            <AlertTriangle className="h-3 w-3" />
            WARNING
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold gap-1">
            <AlertCircle className="h-3 w-3" />
            ERROR
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold gap-1">
            <Info className="h-3 w-3" />
            INFO
          </Badge>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "auth":
        return <LogIn className="h-3.5 w-3.5 text-emerald-500" />;
      case "booking":
        return <CalendarDays className="h-3.5 w-3.5 text-sky-500" />;
      case "payment":
        return <CreditCard className="h-3.5 w-3.5 text-purple-500" />;
      default:
        return <Terminal className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="glass border-border/70 shadow-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Records</span>
              <Activity className="h-4 w-4 text-brand" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {pager.total.toLocaleString()}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">All logged server events</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/70 shadow-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Auth &amp; Logins</span>
              <LogIn className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {stats.auth}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Active session events</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/70 shadow-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Bookings &amp; Hires</span>
              <CalendarDays className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
              {stats.bookings}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Trips &amp; cancellations</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/70 shadow-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Payments &amp; Escrow</span>
              <CreditCard className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
              {stats.payments}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Wallet, payouts &amp; refunds</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/70 shadow-xs col-span-2 sm:col-span-1">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Errors / Alerts</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {stats.errors}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Rejections &amp; warnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar: Filters & Actions */}
      <Card className="glass border-border/70 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action, email, target ID, event type or IP address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-[150px] text-xs rounded-xl">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="auth">Auth &amp; Login</SelectItem>
                  <SelectItem value="booking">Bookings &amp; Hires</SelectItem>
                  <SelectItem value="payment">Payments &amp; Wallet</SelectItem>
                  <SelectItem value="system">System &amp; Query</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                </SelectContent>
              </Select>

              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="h-9 w-[130px] text-xs rounded-xl">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={autoRefresh ? "secondary" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="h-9 text-xs gap-1.5 rounded-xl cursor-pointer"
                title={autoRefresh ? "Auto-refresh active (every 8s)" : "Auto-refresh paused"}
              >
                <span className={`h-2 w-2 rounded-full ${autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                {autoRefresh ? "Live" : "Paused"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => loadLogs(true)}
                className="h-9 text-xs gap-1.5 rounded-xl cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={exportLogsAsCsv}
                className="h-9 text-xs gap-1.5 rounded-xl cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={exportLogsAsJson}
                className="h-9 text-xs gap-1.5 rounded-xl cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Stream Table */}
      <Card className="glass border-border/70 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground">
              <tr>
                <th className="py-3 px-3.5 sm:px-4">Timestamp (IST)</th>
                <th className="py-3 px-3">Level</th>
                <th className="py-3 px-3">Event Type</th>
                <th className="py-3 px-3">Actor / User</th>
                <th className="py-3 px-4">Action Summary</th>
                <th className="py-3 px-3">Reference ID</th>
                <th className="py-3 px-3.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading && !logs && (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-4"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-60" /></td>
                    <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-4 text-right"><Skeleton className="h-8 w-16 ml-auto" /></td>
                  </tr>
                ))
              )}

              {!loading && (!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Terminal className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="font-medium text-sm">No audit log records found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || categoryFilter !== "all" || levelFilter !== "all"
                        ? "Try loosening your filters or search terms."
                        : "Server logs and user instructions will appear here automatically."}
                    </p>
                  </td>
                </tr>
              )}

              {logs && logs.map((log) => {
                const date = new Date(log.created_at);
                const timeStr = date.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                });
                const dateStr = date.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <tr
                    key={log.id}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    <td className="py-3 px-3.5 sm:px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      <div>{dateStr}</div>
                      <div className="font-semibold text-foreground/80">{timeStr}</div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {getLevelBadge(log.level)}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-foreground font-medium">
                        {getCategoryIcon(log.category)}
                        <span>{log.event_type}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 max-w-[180px]">
                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium text-foreground text-[11px]" title={log.actor_email || log.actor_id || "System"}>
                          {log.actor_email || (log.actor_id ? `${log.actor_id.slice(0, 8)}...` : "System / Server")}
                        </span>
                      </div>
                      {log.ip_address && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          IP: {log.ip_address}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 max-w-[320px]">
                      <p className="line-clamp-2 text-[12px] font-medium text-foreground">
                        {log.action}
                      </p>
                      {log.user_agent && (
                        <p className="line-clamp-1 text-[10px] text-muted-foreground font-mono mt-0.5" title={log.user_agent}>
                          {log.user_agent}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {log.target_id ? (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(log.target_id!, "Target ID")}
                          className="flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 hover:bg-muted hover:text-foreground text-foreground cursor-pointer transition-colors"
                          title="Click to copy full ID"
                        >
                          <span>{log.target_id.slice(0, 8)}</span>
                          <Copy className="h-2.5 w-2.5 opacity-60" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        <div className="border-t border-border/70 p-3 bg-muted/20">
          <ListPager {...pager} />
        </div>
      </Card>

      {/* Detailed JSON / Payload Inspection Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 rounded-2xl glass border-border/80">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {selectedLog && getLevelBadge(selectedLog.level)}
              <DialogTitle className="font-display text-base font-bold">
                {selectedLog?.event_type}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Event ID: <span className="font-mono text-foreground">{selectedLog?.id}</span> &bull;{" "}
              {selectedLog?.created_at && new Date(selectedLog.created_at).toLocaleString("en-IN")}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
                <div className="font-semibold text-foreground text-sm">
                  {selectedLog.action}
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                  <div>
                    <span className="font-medium text-foreground/80">Category:</span> {selectedLog.category}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">Target Type:</span> {selectedLog.target_type || "None"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">Actor ID:</span> {selectedLog.actor_id || "System"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">Actor Email:</span> {selectedLog.actor_email || "System"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">IP Address:</span> {selectedLog.ip_address || "None"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">Target ID:</span> {selectedLog.target_id || "None"}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between pb-1.5">
                  <span className="font-semibold text-foreground">Payload &amp; Context Details (JSON)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog.details, null, 2), "Payload")}
                    className="h-6 text-[11px] gap-1 px-2 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" /> Copy JSON
                  </Button>
                </div>
                <pre className="rounded-xl border border-border bg-muted/60 p-3 font-mono text-[11px] text-foreground overflow-x-auto max-h-60 leading-relaxed">
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>

              {selectedLog.user_agent && (
                <div>
                  <span className="font-semibold text-foreground block pb-1">Client User Agent</span>
                  <p className="rounded-lg border border-border/50 bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground break-all">
                    {selectedLog.user_agent}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
