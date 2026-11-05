import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { currency } from "@/lib/format";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Gift,
  Clock,
} from "lucide-react";
import { createWalletTopupOrder, verifyWalletTopup } from "@/lib/wallet.functions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
  head: () => ({
    meta: [
      { title: "Wallet — Synchoo" },
      { name: "description", content: "Add money to your Synchoo wallet and pay for rides instantly." },
      { property: "og:title", content: "Wallet — Synchoo" },
      { property: "og:description", content: "Add money to your Synchoo wallet and pay for rides instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KIND_LABEL: Record<string, string> = {
  topup: "Money added",
  booking_payment: "Ride payment",
  booking_earning: "Ride earning",
  refund: "Refund",
  payout: "Payout",
  adjustment: "Adjustment",
  promo: "Promo credit",
};

const PLATFORM_COMMISSION = 0.10; // 10%

function WalletPage() {
  const { user } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<any[] | null>(null);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);

  // Withdraw state
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [upiOrBank, setUpiOrBank] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const createOrder = useServerFn(createWalletTopupOrder);
  const verify = useServerFn(verifyWalletTopup);

  const load = useCallback(async () => {
    if (!user) return;
    const [w, t] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setBalance(Number(w.data?.balance ?? 0));
    setTxns(t.data ?? []);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const addMoney = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const order = await createOrder({ data: { amount: amt } });
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        orderId: order.orderId,
        name: "Synchoo Wallet",
        description: "Add money to wallet",
        prefill: { email: user?.email ?? undefined, name: user?.user_metadata?.full_name ?? undefined },
        onSuccess: async (resp) => {
          try {
            await verify({ data: resp });
            toast.success("Money added to your wallet");
            load();
          } catch (e: any) {
            toast.error(e.message ?? "Could not verify the payment");
          }
        },
        onDismiss: () => setBusy(false),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not start top-up");
    } finally {
      setBusy(false);
    }
  };

  // Derived values
  const earnings = (txns ?? [])
    .filter((t) => t.kind === "booking_earning")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalPayouts = (txns ?? [])
    .filter((t) => t.kind === "payout")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const withdrawableBalance = Math.max(0, earnings - totalPayouts);
  const promoCredits = (txns ?? []).filter((t) => t.kind === "promo");
  const pendingTxns = (txns ?? []).filter((t) => (t as any).status === "pending");
  const regularTxns = (txns ?? []).filter((t) => t.kind !== "promo");

  const submitWithdraw = async () => {
    const amt = Number(withdrawAmt);
    if (!Number.isFinite(amt) || amt < 100) return toast.error("Minimum withdrawal is ₹100");
    if (amt > withdrawableBalance) return toast.error("Insufficient withdrawable balance");
    if (!upiOrBank.trim()) return toast.error("Enter your UPI ID or bank account number");
    setWithdrawing(true);
    const { error } = await supabase.from("payouts" as any).insert({
      vendor_id: user!.id,
      amount: amt,
      payout_account: upiOrBank.trim(),
      status: "pending",
    });
    setWithdrawing(false);
    if (error) return toast.error(error.message);
    toast.success("Withdrawal request submitted — typically processed within 2 business days");
    setWithdrawAmt("");
    setUpiOrBank("");
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Wallet</h1>

        {/* ── Balance row ── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {/* Available balance */}
          <Card className="sm:col-span-1">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WalletIcon className="h-4 w-4" /> Available
              </div>
              {balance === null ? (
                <Skeleton className="mt-2 h-9 w-24" />
              ) : (
                <div className="mt-1 font-display text-3xl font-semibold">{currency(balance)}</div>
              )}
            </CardContent>
          </Card>

          {/* Withdrawable earnings */}
          <Card className="sm:col-span-1">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Banknote className="h-4 w-4" /> Withdrawable
              </div>
              {txns === null ? (
                <Skeleton className="mt-2 h-9 w-24" />
              ) : (
                <>
                  <div className="mt-1 font-display text-3xl font-semibold">{currency(withdrawableBalance)}</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Ride earnings minus {(PLATFORM_COMMISSION * 100).toFixed(0)}% platform fee &amp; payouts
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Promo credits */}
          <Card className="sm:col-span-1">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gift className="h-4 w-4" /> Promo credits
              </div>
              {txns === null ? (
                <Skeleton className="mt-2 h-9 w-24" />
              ) : (
                <div className="mt-1 font-display text-3xl font-semibold">
                  {currency(promoCredits.reduce((s, t) => s + Number(t.amount), 0))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Top-up ── */}
        <Card className="mt-4 overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-sm font-medium">Add money to wallet</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-32"
                  aria-label="Amount to add"
                />
                <Button onClick={addMoney} disabled={busy}>
                  {busy ? "Opening…" : "Add money"}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[500, 1000, 2000, 5000].map((v) => (
                  <Button key={v} size="sm" variant="outline" onClick={() => setAmount(String(v))}>
                    +{currency(v)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Withdraw ── */}
        {withdrawableBalance > 0 && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-medium">Withdraw earnings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Withdraw your ride earnings to your UPI or bank account. Minimum ₹100.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label className="text-xs">Amount (max {currency(withdrawableBalance)})</Label>
                  <Input
                    type="number"
                    min={100}
                    max={withdrawableBalance}
                    value={withdrawAmt}
                    onChange={(e) => setWithdrawAmt(e.target.value)}
                    placeholder="₹ amount"
                  />
                </div>
                <div>
                  <Label className="text-xs">UPI ID or bank account</Label>
                  <Input
                    value={upiOrBank}
                    onChange={(e) => setUpiOrBank(e.target.value)}
                    placeholder="yourname@upi or ACNO"
                  />
                </div>
                <Button
                  className="mt-5"
                  disabled={withdrawing}
                  onClick={submitWithdraw}
                >
                  {withdrawing ? "Submitting…" : "Request payout"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs: History / Promo / Pending ── */}
        <div className="mt-6">
          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">Transaction history</TabsTrigger>
              {promoCredits.length > 0 && <TabsTrigger value="promo">Promo credits</TabsTrigger>}
              {pendingTxns.length > 0 && <TabsTrigger value="pending">Pending</TabsTrigger>}
            </TabsList>

            <TabsContent value="history">
              <Card className="mt-3">
                <CardContent className="p-4">
                  {!txns ? (
                    <div className="grid gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-lg" />
                      ))}
                    </div>
                  ) : regularTxns.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {regularTxns.map((t) => {
                        const credit = Number(t.amount) >= 0;
                        const isEarning = t.kind === "booking_earning";
                        const commission = isEarning ? Number(t.amount) * PLATFORM_COMMISSION : 0;
                        return (
                          <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full ${credit ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950" : "bg-muted text-muted-foreground"}`}
                              >
                                {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                              </span>
                              <div>
                                <div className="text-sm font-medium">{KIND_LABEL[t.kind] ?? t.kind}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(t.created_at).toLocaleString()}
                                </div>
                                {isEarning && commission > 0 && (
                                  <div className="text-[11px] text-muted-foreground">
                                    Platform fee: {currency(commission)} ({(PLATFORM_COMMISSION * 100).toFixed(0)}%)
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-semibold ${credit ? "text-emerald-600" : ""}`}>
                                {credit ? "+" : "−"}
                                {currency(Math.abs(Number(t.amount)))}
                              </div>
                              <Badge variant="outline" className="mt-0.5 text-[10px]">
                                Bal {currency(Number(t.balance_after))}
                              </Badge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="promo">
              <Card className="mt-3">
                <CardContent className="p-4">
                  {promoCredits.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No promo credits yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {promoCredits.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950">
                              <Gift className="h-4 w-4" />
                            </span>
                            <div>
                              <div className="text-sm font-medium">Promo credit</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(t.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-violet-600">
                            +{currency(Math.abs(Number(t.amount)))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pending">
              <Card className="mt-3">
                <CardContent className="p-4">
                  {pendingTxns.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No pending transactions.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {pendingTxns.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                              <Clock className="h-4 w-4" />
                            </span>
                            <div>
                              <div className="text-sm font-medium">{KIND_LABEL[t.kind] ?? t.kind}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(t.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-amber-600">Pending</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Commission info ── */}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Synchoo charges a <strong>{(PLATFORM_COMMISSION * 100).toFixed(0)}% platform commission</strong> on each
            ride earning. Your withdrawable balance reflects earnings after this fee.
          </span>
        </div>
      </div>
    </div>
  );
}
