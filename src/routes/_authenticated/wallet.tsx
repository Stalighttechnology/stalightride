import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createWalletTopupOrder, verifyWalletTopup } from "@/lib/wallet.functions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { PayoutsCard } from "@/components/payouts-card";

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
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<any[] | null>(null);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);
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
        .limit(50),
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

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Wallet</h1>

        <Card className="mt-6 overflow-hidden">
          <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WalletIcon className="h-4 w-4" /> Available balance
              </div>
              {balance === null ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : (
                <div className="mt-1 font-display text-4xl font-semibold">{currency(balance)}</div>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full sm:w-32"
                aria-label="Amount to add"
              />
              <Button onClick={addMoney} disabled={busy}>
                {busy ? "Opening…" : "Add money"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-3 flex flex-wrap gap-2">
          {[500, 1000, 2000, 5000].map((v) => (
            <Button key={v} size="sm" variant="outline" onClick={() => setAmount(String(v))}>
              +{currency(v)}
            </Button>
          ))}
        </div>

        {user && <PayoutsCard userId={user.id} onChanged={load} />}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Transaction history</CardTitle>
          </CardHeader>
          <CardContent>
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
      </div>
    </div>
  );
}
