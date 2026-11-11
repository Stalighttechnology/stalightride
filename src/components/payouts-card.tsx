import { useCallback, useEffect, useState } from "react";
import { Banknote, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currency } from "@/lib/format";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

type Withdrawal = {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  admin_note: string | null;
  created_at: string;
  upi_id: string | null;
  account_number: string | null;
};

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  paid: "secondary",
  requested: "outline",
  rejected: "destructive",
};

/**
 * Earnings and withdrawals for hosts, drivers, cleaners and washing centers. Renders nothing for
 * customers. Withdrawals are paid manually by an admin (see admin → Payouts).
 */
export function PayoutsCard({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const settings = usePlatformSettings();
  const [isProvider, setIsProvider] = useState<boolean | null>(null);
  const [withdrawable, setWithdrawable] = useState(0);
  const [pending, setPending] = useState(0);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    method: "upi" as "upi" | "bank",
    upi_id: "",
    account_name: "",
    account_number: "",
    ifsc: "",
  });

  const load = useCallback(async () => {
    const [v, d, c, wc] = await Promise.all([
      supabase.from("vendors").select("id").eq("id", userId).maybeSingle(),
      supabase.from("drivers").select("id").eq("id", userId).maybeSingle(),
      supabase.from("cleaners").select("id").eq("id", userId).maybeSingle(),
      supabase.from("wash_centers").select("id").eq("id", userId).maybeSingle(),
    ]);
    const provider = !!v.data || !!d.data || !!c.data || !!wc.data;
    setIsProvider(provider);
    if (!provider) return;
    // Wash jobs this user is paid for: as the cleaner, or as the center (a center's vendor id is its user id).
    const washFilter = `assigned_cleaner_id.eq.${userId},assigned_vendor_id.eq.${userId}`;
    const [w, hist, rentals, hires, washes] = await Promise.all([
      supabase.rpc("withdrawable_balance", {}),
      supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("bookings")
        .select("provider_earning")
        .eq("vendor_id", userId)
        .eq("payment_status", "paid")
        .is("earning_credited_at", null),
      supabase
        .from("driver_bookings")
        .select("provider_earning")
        .eq("driver_id", userId)
        .eq("payment_status", "paid")
        .is("earning_credited_at", null),
      supabase
        .from("wash_bookings")
        .select("provider_earning")
        .or(washFilter)
        .eq("status", "confirmed")
        .eq("payment_status", "paid")
        .is("earning_credited_at", null),
    ]);
    setWithdrawable(Number(w.data ?? 0));
    setHistory((hist.data as Withdrawal[]) ?? []);
    const sum = (rows: { provider_earning: number }[] | null) =>
      (rows ?? []).reduce((s, r) => s + Number(r.provider_earning ?? 0), 0);
    setPending(sum(rentals.data as any) + sum(hires.data as any) + sum(washes.data as any));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < settings.min_withdrawal)
      return toast.error(`Minimum withdrawal is ${currency(settings.min_withdrawal)}`);
    if (amount > withdrawable)
      return toast.error(`You can withdraw at most ${currency(withdrawable)}`);
    setBusy(true);
    const { error } = await supabase.rpc("request_withdrawal", {
      _amount: amount,
      _method: form.method,
      _upi_id: form.method === "upi" ? form.upi_id.trim() : undefined,
      _account_name: form.method === "bank" ? form.account_name.trim() : undefined,
      _account_number: form.method === "bank" ? form.account_number.trim() : undefined,
      _ifsc: form.method === "bank" ? form.ifsc.trim().toUpperCase() : undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Withdrawal requested — we'll notify you when it's paid");
    setOpen(false);
    setForm({ ...form, amount: "" });
    load();
    onChanged();
  };

  if (!isProvider) return null;

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Earnings & payouts</CardTitle>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={withdrawable < settings.min_withdrawal}
        >
          <Banknote className="mr-1.5 h-4 w-4" />
          Withdraw
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 p-4">
            <p className="text-xs text-muted-foreground">Withdrawable</p>
            <p className="mt-1 font-display text-2xl font-semibold">{currency(withdrawable)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Earnings only — top-ups, refunds and promo credit stay in your wallet. Minimum{" "}
              {currency(settings.min_withdrawal)}.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Pending
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">{currency(pending)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paid bookings not yet completed. Released after {settings.commission_pct}% commission
              + GST.
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <ul className="mt-5 divide-y divide-border">
            {history.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {currency(Number(w.amount))} ·{" "}
                    {w.method === "upi" ? w.upi_id : `A/c •••${(w.account_number ?? "").slice(-4)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(w.created_at).toLocaleString()}
                    {w.reference ? ` · Ref ${w.reference}` : ""}
                    {w.status === "rejected" && w.admin_note ? ` · ${w.admin_note}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[w.status] ?? "outline"}>{w.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw earnings</DialogTitle>
            <DialogDescription>
              Up to {currency(withdrawable)}. Our team pays out within 2 working days and shares the
              reference.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wd-amount">Amount</Label>
              <Input
                id="wd-amount"
                type="number"
                inputMode="decimal"
                min={settings.min_withdrawal}
                max={withdrawable}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={String(Math.floor(withdrawable))}
              />
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Payout method">
              {(["upi", "bank"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={form.method === m}
                  variant={form.method === m ? "default" : "outline"}
                  onClick={() => setForm({ ...form, method: m })}
                >
                  {m === "upi" ? "UPI" : "Bank transfer"}
                </Button>
              ))}
            </div>
            {form.method === "upi" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="wd-upi">UPI ID</Label>
                <Input
                  id="wd-upi"
                  value={form.upi_id}
                  onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
                  placeholder="name@okaxis"
                  autoComplete="off"
                />
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="wd-name">Account holder name</Label>
                  <Input
                    id="wd-name"
                    value={form.account_name}
                    onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wd-acc">Account number</Label>
                  <Input
                    id="wd-acc"
                    inputMode="numeric"
                    value={form.account_number}
                    onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wd-ifsc">IFSC</Label>
                  <Input
                    id="wd-ifsc"
                    value={form.ifsc}
                    onChange={(e) => setForm({ ...form, ifsc: e.target.value })}
                    placeholder="SBIN0001234"
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Requesting…" : "Request withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
