import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Star, Trash2, CheckCircle2, AlertTriangle, UserX } from "lucide-react";

export function ReviewModerationTab() {
  const [activeView, setActiveView] = useState<"reviews" | "reports">("reviews");
  const [reviews, setReviews] = useState<any[] | null>(null);
  const [userReports, setUserReports] = useState<any[] | null>(null);
  const [filterReported, setFilterReported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadReviews = async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select("*, vehicles:vehicle_id(title)")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      toast.error(error.message);
      return;
    }
    setReviews(data || []);
  };

  const loadUserReports = async () => {
    const { data, error } = await supabase
      .from("user_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      setUserReports([]);
      return;
    }
    setUserReports(data || []);
  };

  useEffect(() => {
    loadReviews();
    loadUserReports();
  }, []);

  const deleteReview = async (id: string) => {
    if (!window.confirm("Permanently delete this review from the public listing?")) return;
    setBusy(id);

    // Try admin RPC first, then fallback to direct delete
    const { error: rpcErr } = await supabase.rpc("admin_remove_review", { _review_id: id });
    if (rpcErr) {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) {
        setBusy(null);
        toast.error(error.message);
        return;
      }
    }

    setBusy(null);
    toast.success("Review deleted and vehicle rating recalculated");
    setReviews((prev) => (prev ? prev.filter((r) => r.id !== id) : []));
  };

  const dismissReport = async (id: string) => {
    setBusy(id);

    // Try admin RPC first, then fallback to direct update
    const { error: rpcErr } = await supabase.rpc("admin_dismiss_review_report", { _review_id: id });
    if (rpcErr) {
      const { error } = await supabase
        .from("reviews")
        .update({ reported: false, report_reason: null } as any)
        .eq("id", id);

      if (error) {
        setBusy(null);
        toast.error(error.message);
        return;
      }
    }

    setBusy(null);
    toast.success("Report dismissed. Review kept live.");
    setReviews((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, reported: false, report_reason: null } : r)) : []
    );
  };

  const resolveUserReport = async (id: string, decision: "action_taken" | "dismissed") => {
    setBusy(id);
    const { error } = await supabase
      .from("user_reports")
      .update({
        status: decision,
        resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`User report marked as ${decision === "action_taken" ? "Action Taken" : "Dismissed"}`);
    setUserReports((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, status: decision } : r)) : []
    );
  };

  if (!reviews || userReports === null) return <Skeleton className="h-44 w-full mt-4" />;

  const filteredReviews = filterReported
    ? reviews.filter((r) => r.reported || (r.rating && r.rating <= 2))
    : reviews;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeView === "reviews" ? "default" : "outline"}
            className="text-xs h-8"
            onClick={() => setActiveView("reviews")}
          >
            Vehicle Reviews ({reviews.length})
          </Button>
          <Button
            size="sm"
            variant={activeView === "reports" ? "default" : "outline"}
            className="text-xs h-8"
            onClick={() => setActiveView("reports")}
          >
            <UserX className="mr-1.5 h-3.5 w-3.5" /> User & Ride Reports ({userReports.length})
          </Button>
        </div>

        {activeView === "reviews" && (
          <Button
            size="sm"
            variant={filterReported ? "default" : "outline"}
            className="text-xs h-8 text-amber-600 border-amber-200"
            onClick={() => setFilterReported(!filterReported)}
          >
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Flagged / Low Ratings
          </Button>
        )}
      </div>

      {activeView === "reviews" ? (
        <div className="grid gap-3">
          {filteredReviews.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No reviews in this queue.</p>
          ) : (
            filteredReviews.map((rev) => (
              <Card key={rev.id}>
                <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < (rev.rating || 5) ? "fill-amber-400" : "fill-muted text-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-semibold text-xs">{rev.rating || 5} Stars</span>
                      {rev.reported && (
                        <Badge variant="destructive" className="text-[10px]">
                          Flagged for Moderation
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs font-medium text-foreground">{rev.comment || "No written review text."}</p>

                    <p className="text-[11px] text-muted-foreground">
                      Vehicle: {rev.vehicles?.title || "Vehicle"} · Submitted: {new Date(rev.created_at).toLocaleDateString()}
                    </p>

                    {rev.report_reason && (
                      <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200 mt-2">
                        <span className="font-semibold">Flag Reason:</span> {rev.report_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {rev.reported && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={busy === rev.id}
                        onClick={() => dismissReport(rev.id)}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Dismiss Report
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs"
                      disabled={busy === rev.id}
                      onClick={() => deleteReview(rev.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Remove Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {userReports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No user or ride reports submitted.</p>
          ) : (
            userReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2">
                      <Badge variant={report.status === "pending" ? "destructive" : "outline"} className="text-[11px]">
                        {report.status.toUpperCase()}
                      </Badge>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Target: {report.target_type}
                      </span>
                      {report.target_id && (
                        <span className="text-xs text-muted-foreground">ID: {report.target_id.slice(0, 8)}</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground font-medium">Reason: {report.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Submitted: {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>

                  {report.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs h-8"
                        disabled={busy === report.id}
                        onClick={() => resolveUserReport(report.id, "action_taken")}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Action Taken
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        disabled={busy === report.id}
                        onClick={() => resolveUserReport(report.id, "dismissed")}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
