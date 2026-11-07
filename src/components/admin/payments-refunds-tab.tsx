import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { IndianRupee, RefreshCw, ArrowDownLeft, ArrowUpRight, Search, ShieldCheck } from "lucide-react";

export function PaymentsRefundsTab() {
  const [transactions, setTransactions] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [refundUser, setRefundUser] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadTransactions = async () => {
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error(error.message);
      return;
    }
    setTransactions(data || []);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleManualRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundUser.trim() || !refundAmount || Number(refundAmount) <= 0) {
      return toast.error("Enter a valid user UUID and positive refund amount");
    }

    setProcessing(true);
    try {
      const targetUserId = refundUser.trim();
      const amt = Number(refundAmount);

      // 1. Get or create wallet for target user
      const { data: walletData, error: wError } = await supabase
        .from("wallets")
        .select("user_id, balance")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (wError) throw wError;

      const currentBalance = walletData?.balance ?? 0;
      const newBalance = currentBalance + amt;

      if (!walletData) {
        // Insert wallet
        const { error: nwErr } = await supabase
          .from("wallets")
          .insert({ user_id: targetUserId, balance: newBalance });
        if (nwErr) throw nwErr;
      } else {
        // Update balance
        const { error: upErr } = await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("user_id", targetUserId);
        if (upErr) throw upErr;
      }

      // 2. Insert transaction
      await supabase.from("wallet_transactions").insert({
        user_id: targetUserId,
        amount: amt,
        balance_after: newBalance,
        kind: "refund",
        description: `Admin manual refund: ${refundReason.trim() || "Customer compensation"}`,
      });

      toast.success(`Refund of ${currency(amt)} credited to customer wallet!`);
      setRefundUser("");
      setRefundAmount("");
      setRefundReason("");
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || "Failed to process refund");
    } finally {
      setProcessing(false);
    }
  };

  if (!transactions) return <Skeleton className="h-44 w-full mt-4" />;

  const filtered = transactions.filter((t) => {
    const desc = (t.description || "").toLowerCase();
    const kind = (t.kind || "").toLowerCase();
    const id = (t.id || "").toLowerCase();
    const q = search.toLowerCase();
    return desc.includes(q) || kind.includes(q) || id.includes(q);
  });

  return (
    <div className="mt-4 space-y-6">
      {/* Issue Refund Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-brand" /> Issue Customer Refund / Compensation
          </CardTitle>
          <CardDescription>
            Instantly credit customer wallet with full or partial compensation for cancelled or disputed rides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualRefund} className="grid gap-3 sm:grid-cols-4 items-end">
            <div>
              <Label className="text-xs">User ID (UUID)</Label>
              <Input
                value={refundUser}
                onChange={(e) => setRefundUser(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Refund Amount (₹)</Label>
              <Input
                type="number"
                min="1"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="500"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Reason / Dispute Note</Label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Vehicle delayed by host"
              />
            </div>
            <Button type="submit" disabled={processing}>
              {processing ? "Crediting..." : "Process Refund"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Transactions Feed */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-sm">Payment & Wallet Transaction Ledger</h3>
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter transactions..."
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <div className="grid gap-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No transactions recorded.</p>
          ) : (
            filtered.map((t) => {
              const isCredit = t.kind === "refund" || t.kind === "topup" || t.kind === "booking_earning" || t.kind === "promo";
              return (
                <Card key={t.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          isCredit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-xs text-foreground">{t.description || "Wallet Transaction"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleString()} · Kind: {t.kind}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`font-semibold text-sm ${
                        isCredit ? "text-emerald-600" : "text-foreground"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {currency(t.amount)}
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
