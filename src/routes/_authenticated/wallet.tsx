import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currency } from "@/lib/format";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, Banknote, Gift, RotateCw } from "lucide-react";
import { createWalletTopupOrder, verifyWalletTopup } from "@/lib/wallet.functions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { PayoutsCard } from "@/components/payouts-card";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

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
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  adjustment: "Adjustment",
  promo_credit: "Promo credit",
  driver_payment: "Driver hire payment",
  driver_earning: "Driver earning",
  driver_refund: "Driver hire refund",
  driver_refund_reversal: "Driver refund reversal",
  wash_payment: "Wash payment",
  wash_refund: "Wash refund",
};

function WalletPage() {
  const { user } = useSession();
  const settings = usePlatformSettings();
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<any[] | null>(null);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const createOrder = useServerFn(createWalletTopupOrder);
  const verify = useServerFn(verifyWalletTopup);

  const load = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
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
    } catch (e) {
      console.error("Wallet refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    load();

    const channel = supabase
      .channel(`wallet_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` },
        () => {
          load();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${user.id}` },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

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
            const res = await verify({ data: resp });
            if (typeof (res as any)?.newBalance === "number") {
              setBalance((res as any).newBalance);
            }
            toast.success("Money added to your wallet");
            await load();
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

  // Withdrawable / pending earnings come from the database (see PayoutsCard).
  const promoCredits = (txns ?? []).filter((t) => t.kind === "promo_credit");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Wallet</h1>

        {/* ── Balance row ── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <WalletIcon className="h-4 w-4" /> Available
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => load()}
                  disabled={refreshing}
                  title="Refresh wallet balance"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {balance === null ? (
                <Skeleton className="mt-2 h-9 w-24" />
              ) : (
                <div className="mt-1 font-display text-3xl font-semibold">{currency(balance)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gift className="h-4 w-4" /> Promo credits received
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

        {/* ── Earnings & withdrawals (hosts and drivers only) ── */}
        {user && <PayoutsCard userId={user.id} onChanged={load} />}

        {/* ── Tabs: History / Promo ── */}
        <div className="mt-6">
          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">Transaction history</TabsTrigger>
              {promoCredits.length > 0 && <TabsTrigger value="promo">Promo credits</TabsTrigger>}
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
                  ) : txns.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {txns.map((t) => {
                        const credit = Number(t.amount) >= 0;
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
                                  {t.description ? `${t.description} · ` : ""}
                                  {new Date(t.created_at).toLocaleString()}
                                </div>
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
                  <ul className="divide-y divide-border">
                    {promoCredits.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950">
                            <Gift className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="text-sm font-medium">{t.description || "Promo credit"}</div>
                            <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-violet-600">+{currency(Math.abs(Number(t.amount)))}</div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Commission info ── */}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Hosts and drivers: Synchoo keeps a <strong>{settings.commission_pct}% commission</strong> (plus {settings.gst_pct}% GST
            on it) on each completed booking. Earnings land in your wallet already net of this fee, and only earnings can be
            withdrawn — top-ups, refunds and promo credit can be spent on bookings.
          </span>
        </div>
      </div>
    </div>
  );
}
