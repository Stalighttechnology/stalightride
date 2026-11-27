import { Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { currency } from "@/lib/format";

export interface CancellationPolicyCardProps {
  /** Base trip rental amount (excluding refundable deposit). */
  tripAmount: number;
  /** Platform/convenience fee (non-refundable). */
  serviceFee?: number;
  /** Selected pickup date in `YYYY-MM-DD` format. */
  pickupDate?: string;
  /** Selected pickup time in `HH:mm` format. */
  pickupTime?: string;
  /** User's membership plan (`free` | `plus` | `black`). */
  membershipPlan?: string | null;
  className?: string;
}

function formatCutoff(ms: number): string {
  const d = new Date(ms);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function formatAxisLabel(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
    time: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

/**
 * Dynamic cancellation & refund timeline card driven by the booking's
 * live trip amount, pickup timestamp, and membership tier.
 */
export function CancellationPolicyCard({
  tripAmount,
  serviceFee = 0,
  pickupDate,
  pickupTime = "10:00",
  membershipPlan,
  className,
}: CancellationPolicyCardProps) {
  const plan = (membershipPlan || "free").toLowerCase();
  const fullHours = plan === "black" ? 2 : plan === "plus" ? 6 : 24;
  const halfHours = plan === "black" ? 0 : 2;

  const safeTripAmount = Math.max(0, Number(tripAmount) || 0);
  const halfFee = Math.round(safeTripAmount * 0.5);

  const pickupMs = pickupDate
    ? new Date(`${pickupDate}T${(pickupTime || "10:00").slice(0, 5)}:00`).getTime()
    : NaN;
  const hasValidPickup = Number.isFinite(pickupMs);

  const fullCutoffMs = hasValidPickup ? pickupMs - fullHours * 3_600_000 : NaN;
  const halfCutoffMs = hasValidPickup ? pickupMs - halfHours * 3_600_000 : NaN;

  const fullAxis = hasValidPickup ? formatAxisLabel(fullCutoffMs) : null;
  const halfAxis = hasValidPickup ? formatAxisLabel(halfCutoffMs) : null;

  const now = Date.now();
  const inFullWindow = hasValidPickup && now < fullCutoffMs;
  const inHalfWindow = hasValidPickup && !inFullWindow && now < halfCutoffMs;

  let headline: string;
  if (!hasValidPickup) {
    headline = `Cancellation Fee: 50% of trip amount (${currency(halfFee)}) between ${fullHours}h and ${halfHours}h before pickup`;
  } else if (inFullWindow) {
    headline = `Free Cancellation (100% Refund) until ${formatCutoff(fullCutoffMs)} · 50% Fee (${currency(halfFee)}) until ${formatCutoff(halfCutoffMs)}`;
  } else if (inHalfWindow) {
    headline = `Cancellation Fee: 50% of trip amount (${currency(halfFee)}) until ${formatCutoff(halfCutoffMs)}`;
  } else {
    headline = `0% Refund within ${halfHours}h of pickup (${formatCutoff(pickupMs)})`;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-xs",
        className,
      )}
    >
      {/* Top Info Row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Hourglass className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-foreground leading-snug">
            {headline}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {serviceFee > 0
              ? `Convenience fee (${currency(serviceFee)}) is non-refundable`
              : "Convenience fee is non-refundable"}
          </p>
        </div>
      </div>

      {/* Refund Timeline */}
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          REFUND UPON CANCELLATION
        </p>

        {/* Segmented Progress Bar (Website Brand Palette) */}
        <div className="mt-2.5 flex h-7 w-full overflow-hidden rounded-full border border-border/60 text-[11px] font-semibold tabular-nums">
          <div className="flex w-[35%] items-center justify-start bg-brand px-3 text-brand-foreground">
            <span className="truncate">100% Refund</span>
          </div>
          <div className="flex w-[35%] items-center justify-start border-l border-background/40 bg-brand/70 px-3 text-brand-foreground">
            <span className="truncate">50% Refund</span>
          </div>
          <div className="flex w-[30%] items-center justify-start border-l border-background/40 bg-secondary px-3 text-secondary-foreground">
            <span>0%</span>
          </div>
        </div>

        {/* Boundary Markers */}
        <div className="mt-1 grid grid-cols-[35%_35%_30%] text-[11px] text-muted-foreground tabular-nums">
          <div className="flex justify-end pr-1">
            {fullAxis ? (
              <div className="flex flex-col items-end text-right leading-tight">
                <span className="text-brand">↓</span>
                <span className="font-medium text-foreground">{fullAxis.date}</span>
                <span>{fullAxis.time}</span>
              </div>
            ) : (
              <span className="pt-1 font-medium">{fullHours}h before</span>
            )}
          </div>
          <div className="flex justify-end pr-1">
            {halfAxis ? (
              <div className="flex flex-col items-end text-right leading-tight">
                <span className="text-brand">↓</span>
                <span className="font-medium text-foreground">{halfAxis.date}</span>
                <span>{halfAxis.time}</span>
              </div>
            ) : (
              <span className="pt-1 font-medium">{halfHours}h before</span>
            )}
          </div>
          <div />
        </div>
      </div>
    </div>
  );
}
