import { useState } from "react";
import { BadgePercent, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeCharges } from "@/lib/charges";
import { currency } from "@/lib/format";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export type AppliedCoupon = { code: string; percent_off: number | null; amount_off: number | null };

/** Coupon entry that checks the code with the validate_coupon RPC. */
export function CouponField({
  value,
  onChange,
}: {
  value: AppliedCoupon | null;
  onChange: (c: AppliedCoupon | null) => void;
}) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const apply = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("validate_coupon", { _code: trimmed });
    setChecking(false);
    const res = data as {
      valid?: boolean;
      code?: string;
      percent_off?: number | null;
      amount_off?: number | null;
    } | null;
    if (error || !res?.valid) return toast.error("That coupon is invalid or has expired");
    onChange({
      code: res.code ?? trimmed.toUpperCase(),
      percent_off: res.percent_off ?? null,
      amount_off: res.amount_off ?? null,
    });
    toast.success("Coupon applied");
  };

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <BadgePercent className="h-4 w-4 text-brand" />
          {value.code}
        </span>
        <button
          type="button"
          aria-label="Remove coupon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onChange(null);
            setCode("");
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Coupon code"
        aria-label="Coupon code"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
      />
      <Button type="button" variant="outline" onClick={apply} disabled={checking || !code.trim()}>
        {checking ? "Checking…" : "Apply"}
      </Button>
    </div>
  );
}

/**
 * Discount, service fee, GST, optional deposit and total for a base amount.
 * Preview only — the database recalculates every booking on insert.
 */
export function ChargeLines({
  base,
  deposit = 0,
  coupon,
  totalLabel = "Total payable",
}: {
  base: number;
  deposit?: number;
  coupon: AppliedCoupon | null;
  totalLabel?: string;
}) {
  const settings = usePlatformSettings();
  const c = computeCharges(base, settings, coupon);
  const row = (label: string, value: string, muted = false) => (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <>
      <div className="space-y-1.5">
        {c.discount > 0 &&
          row(`Discount${coupon ? ` (${coupon.code})` : ""}`, `− ${currency(c.discount)}`)}
        {c.service_fee > 0 &&
          row(`Service fee (${settings.service_fee_pct}%)`, currency(c.service_fee), true)}
        {c.gst > 0 && row(`GST on fee (${settings.gst_pct}%)`, currency(c.gst), true)}
        {deposit > 0 && row("Refundable deposit", currency(deposit))}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-border/70 pt-3">
        <span className="text-sm font-medium">{totalLabel}</span>
        <span className="font-display text-xl font-bold">
          {currency(c.customer_total + deposit)}
        </span>
      </div>
    </>
  );
}
