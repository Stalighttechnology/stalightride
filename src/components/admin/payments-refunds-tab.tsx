import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    const { data, error } = await api
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
    const amt = Number(refundAmount);
    if (!refundUser.trim() || !(amt > 0) || !refundReason.trim()) {
      return toast.error("Enter the customer's email, a positive amount and a reason");
    }
    setProcessing(true);
    // Goes through wallet_apply on the server: ledger row, running balance, admin check.
    const { error } = await api.rpc("admin_refund", {
      _email: refundUser.trim(),
      _amount: amt,
      _reason: refundReason.trim(),
    });
    setProcessing(false);
    if (error) return toast.error(error.message);
    toast.success(`Refund of ${currency(amt)} credited to the customer's wallet`);
    setRefundUser("");
    setRefundAmount("");
    setRefundReason("");
    loadTransactions();
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
              <Label className="text-xs">Customer email</Label>
              <Input
                type="email"
                value={refundUser}
                onChange={(e) => setRefundUser(e.target.value)}
                placeholder="customer@example.com"
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
                maxLength={280}
                required
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
