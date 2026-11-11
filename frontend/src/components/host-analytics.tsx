import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { currency } from "@/lib/format";
import { TrendingUp, Percent, Star, Wallet } from "lucide-react";

type Booking = {
  total_price: number | string;
  payment_status: string;
  status: string;
  paid_at?: string | null;
  created_at: string;
};

const MONTHS = 6;

/** Earnings + performance analytics for a host, derived from their bookings. */
export function HostAnalytics({ bookings, avgRating }: { bookings: Booking[]; avgRating?: number }) {
  const stats = useMemo(() => {
    const paid = bookings.filter((b) => b.payment_status === "paid");
    const gross = paid.reduce((s, b) => s + Number(b.total_price), 0);
    const completed = bookings.filter((b) => b.status === "completed").length;
    const cancelled = bookings.filter((b) => b.status === "cancelled" || b.status === "rejected").length;
    const acceptance = bookings.length ? Math.round(((bookings.length - cancelled) / bookings.length) * 100) : 0;
    const avgTrip = paid.length ? gross / paid.length : 0;

    const now = new Date();
    const series = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const total = paid
        .filter((b) => {
          const t = new Date(b.paid_at ?? b.created_at);
          return `${t.getFullYear()}-${t.getMonth()}` === key;
        })
        .reduce((s, b) => s + Number(b.total_price), 0);
      return { label: d.toLocaleDateString(undefined, { month: "short" }), total };
    });
    const peak = Math.max(1, ...series.map((s) => s.total));
    return { gross, completed, acceptance, avgTrip, series, peak, trips: paid.length };
  }, [bookings]);

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand" />
          <h3 className="font-display text-lg font-semibold">Earnings &amp; analytics</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Wallet} label="Gross earnings" value={currency(stats.gross)} />
          <Metric icon={TrendingUp} label="Avg per trip" value={currency(stats.avgTrip)} />
          <Metric icon={Percent} label="Acceptance rate" value={`${stats.acceptance}%`} />
          <Metric icon={Star} label="Rating" value={avgRating ? avgRating.toFixed(2) : "New"} />
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Last {MONTHS} months</p>
          <div className="flex h-36 items-end gap-2">
            {stats.series.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-brand/80 transition-all"
                    style={{ height: `${Math.max(4, (s.total / stats.peak) * 100)}%` }}
                    title={currency(s.total)}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {stats.trips} paid trip{stats.trips === 1 ? "" : "s"} · {stats.completed} completed. Payouts settle to your Synchoo wallet as trips are paid.
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
