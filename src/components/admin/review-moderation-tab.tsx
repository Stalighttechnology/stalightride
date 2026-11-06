import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Star, ShieldAlert, Trash2, CheckCircle2, MessageSquare, AlertTriangle } from "lucide-react";

export function ReviewModerationTab() {
  const [reviews, setReviews] = useState<any[] | null>(null);
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

  useEffect(() => {
    loadReviews();
  }, []);

  const deleteReview = async (id: string) => {
    if (!window.confirm("Permanently delete this review from the public listing?")) return;
    setBusy(id);
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Review deleted successfully");
    setReviews((prev) => (prev ? prev.filter((r) => r.id !== id) : []));
  };

  const dismissReport = async (id: string) => {
    setBusy(id);
    const { error } = await supabase
      .from("reviews")
      .update({ reported: false, report_reason: null } as any)
      .eq("id", id);
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Report dismissed. Review kept live.");
    setReviews((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, reported: false, report_reason: null } : r)) : []
    );
  };

  if (!reviews) return <Skeleton className="h-44 w-full mt-4" />;

  const filtered = filterReported ? reviews.filter((r) => r.reported || (r.rating && r.rating <= 2)) : reviews;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={!filterReported ? "default" : "outline"}
            className="text-xs h-8"
            onClick={() => setFilterReported(false)}
          >
            All Reviews ({reviews.length})
          </Button>
          <Button
            size="sm"
            variant={filterReported ? "default" : "outline"}
            className="text-xs h-8 text-amber-600 border-amber-200"
            onClick={() => setFilterReported(true)}
          >
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Flagged / Low Ratings
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No reviews in this queue.</p>
        ) : (
          filtered.map((rev) => (
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
                        Flagged by Host
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs font-medium text-foreground">{rev.comment || "No written review text."}</p>

                  <p className="text-[11px] text-muted-foreground">
                    Vehicle: {rev.vehicles?.title || "Vehicle"} · Submitted: {new Date(rev.created_at).toLocaleDateString()}
                  </p>

                  {rev.report_reason && (
                    <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200 mt-2">
                      <span className="font-semibold">Report Reason:</span> {rev.report_reason}
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
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Keep Review
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
    </div>
  );
}

