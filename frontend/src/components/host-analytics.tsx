import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { currency } from "@/lib/format";
import { TrendingUp, Percent, Star, Wallet } from "lucide-react";

export type HostDashboardStats = {
  total_bookings: number;
  pending_count: number;
  completed_count: number;
  cancelled_count: number;
  earnings: number;
  paid_count: number;
  monthly: Array<{ month: string; total: number }>;
};

const MONTHS = 6;

/** Earnings + performance analytics for a host, derived from host_dashboard_stats. */
export function HostAnalytics({
  stats,
  avgRating,
}: {
  stats?: HostDashboardStats | null;
  avgRating?: number;
}) {
  const analytics = useMemo(() => {
    const s = stats ?? {
      total_bookings: 0,
      pending_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      earnings: 0,
      paid_count: 0,
      monthly: [],
    };
    const gross = Number(s.earnings || 0);
    const completed = Number(s.completed_count || 0);
    const cancelled = Number(s.cancelled_count || 0);
    const total = Number(s.total_bookings || 0);
    const paidCount = Number(s.paid_count || 0);
    const acceptance = total
      ? Math.round(((total - cancelled) / total) * 100)
      : 0;
    const avgTrip = paidCount ? gross / paidCount : 0;

    const series = (s.monthly ?? []).map((m) => {
      const [year, month] = m.month.split("-").map(Number);
      const d = new Date(year, (month || 1) - 1, 1);
      return {
        label: d.toLocaleDateString(undefined, { month: "short" }),
        total: Number(m.total || 0),
      };
    });
    const peak = Math.max(1, ...series.map((item) => item.total));
    return { gross, completed, acceptance, avgTrip, series, peak, trips: paidCount };
  }, [stats]);

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand" />
          <h3 className="font-display text-lg font-semibold">Earnings &amp; analytics</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Wallet} label="Your earnings" value={currency(analytics.gross)} />
          <Metric icon={TrendingUp} label="Avg per trip" value={currency(analytics.avgTrip)} />
          <Metric icon={Percent} label="Acceptance rate" value={`${analytics.acceptance}%`} />
          <Metric icon={Star} label="Rating" value={avgRating ? avgRating.toFixed(2) : "New"} />
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
            Last {MONTHS} months
          </p>
          <div className="flex h-36 items-end gap-2">
            {analytics.series.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-brand/80 transition-all"
                    style={{ height: `${Math.max(4, (s.total / analytics.peak) * 100)}%` }}
                    title={currency(s.total)}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {analytics.trips} paid trip{analytics.trips === 1 ? "" : "s"} · {analytics.completed} completed.
          Payouts settle to your Synchoo wallet as trips are paid.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
