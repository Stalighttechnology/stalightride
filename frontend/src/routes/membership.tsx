import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import {
  createMembershipOrder,
  subscribeMembership,
  cancelMembership,
  getMembershipStatus,
} from "@/lib/actions";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import {
  Crown,
  CheckCircle2,
  Sparkles,
  Zap,
  Percent,
  Droplets,
  Clock,
  ShieldCheck,
  Star,
  ArrowRight,
  Wallet,
  CreditCard,
  AlertCircle,
  Check,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/membership")({
  component: MembershipPage,
  head: () => ({
    meta: [
      { title: "Synchoo Membership — VIP Mobility Pass" },
      {
        name: "description",
        content:
          "Upgrade to Synchoo Plus or Synchoo Black for 0% fees, 15% discount on car rentals, free washes and priority support.",
      },
    ],
  }),
});

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  badge?: string;
  popular?: boolean;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Synchoo Standard",
    priceMonthly: 0,
    priceAnnual: 0,
    features: [
      "Access to all cars, EVs, bikes, and carpool rides",
      "Standard 5% platform fee",
      "Standard cancellation policy",
      "Standard in-app customer support",
    ],
  },
  {
    id: "plus",
    name: "Synchoo Plus",
    priceMonthly: 499,
    priceAnnual: 4990,
    popular: true,
    badge: "Most Popular",
    features: [
      "0% platform convenience fees on all bookings",
      "10% discount on self-drive rentals and driver hires",
      "1 free doorstep foam wash every month",
      "Free booking cancellation up to 6 hours before start",
      "2x Synchoo Points cashback on all rides",
      "Priority customer support hotline",
    ],
  },
  {
    id: "black",
    name: "Synchoo Black VIP",
    priceMonthly: 1499,
    priceAnnual: 14990,
    badge: "Executive VIP",
    features: [
      "All Synchoo Plus benefits included",
      "15% flat discount on luxury SUVs, sedans & EVs",
      "3 free doorstep detailing washes per month",
      "Free cancellation up to 2 hours before trip",
      "Zero security deposit requirement on verified profile",
      "Dedicated 24/7 personal concierge & airport meet",
      "Guaranteed vehicle model availability guarantee",
    ],
  },
];

const PLAN_RANK: Record<string, number> = {
  free: 0,
  plus: 1,
  black: 2,
};

export function MembershipPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [activePlan, setActivePlan] = useState<string>("free");
  const [membershipDetails, setMembershipDetails] = useState<{
    expiresAt: string | null;
    startedAt: string | null;
    cycle: string;
    autoRenew: boolean;
  }>({ expiresAt: null, startedAt: null, cycle: "monthly", autoRenew: true });

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);

  // Modal states
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "razorpay">("wallet");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);

  const loadStatus = async () => {
    if (!user) {
      setLoadingStatus(false);
      return;
    }
    try {
      setLoadingStatus(true);
      // Fetch profile
      const { data: profile } = await api
        .from("profiles")
        .select("membership_plan, membership_cycle, membership_started_at, membership_expires_at, membership_auto_renew")
        .eq("id", user.id)
        .single();

      if (profile) {
        const p = profile as any;
        let plan = p.membership_plan || "free";
        const expiresAt = p.membership_expires_at;
        // Check if expired
        if (plan !== "free" && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
          plan = "free";
        }
        setActivePlan(plan);
        setMembershipDetails({
          expiresAt: p.membership_expires_at,
          startedAt: p.membership_started_at,
          cycle: p.membership_cycle || "monthly",
          autoRenew: Boolean(p.membership_auto_renew ?? true),
        });
      }

      // Fetch wallet balance
      const { data: wallet } = await api
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (wallet) {
        setWalletBalance(Number((wallet as any).balance) || 0);
      }
    } catch (err) {
      console.error("Error loading membership details:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [user]);

  const handlePlanClick = (plan: Plan) => {
    if (!user) {
      toast.info("Please sign in to choose a Synchoo membership plan.");
      navigate({ to: "/auth" });
      return;
    }

    if (plan.id === activePlan) {
      toast.info(`You are currently on ${plan.name}.`);
      return;
    }

    if (plan.id === "free") {
      handleDowngradeToFree();
      return;
    }

    setSelectedPlan(plan);
  };

  const handleDowngradeToFree = async () => {
    if (confirm("Are you sure you want to switch back to Synchoo Standard? Your VIP perks will end immediately.")) {
      try {
        setSubmitting(true);
        await subscribeMembership({ data: { plan: "free" } });
        toast.success("Switched to Synchoo Standard.");
        await loadStatus();
      } catch (err: any) {
        toast.error(err.message || "Failed to switch plan.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const getPlanPrice = (plan: Plan) => {
    return billingCycle === "monthly" ? plan.priceMonthly : plan.priceAnnual;
  };

  const handleSubscribeConfirm = async () => {
    if (!selectedPlan || !user) return;
    const price = getPlanPrice(selectedPlan);

    setSubmitting(true);
    try {
      if (paymentMethod === "wallet") {
        if (walletBalance < price) {
          toast.error(`Insufficient wallet balance (${currency(walletBalance)}). Please add money to wallet or choose Online Payment.`);
          setSubmitting(false);
          return;
        }

        const res = await subscribeMembership({
          data: {
            plan: selectedPlan.id,
            cycle: billingCycle,
            payment_method: "wallet",
          },
        });

        toast.success(res.message || `Subscribed to ${selectedPlan.name}!`);
        setSelectedPlan(null);
        await loadStatus();
      } else {
        // Razorpay checkout
        const order = await createMembershipOrder({
          data: {
            plan: selectedPlan.id,
            cycle: billingCycle,
          },
        });

        await openRazorpayCheckout({
          keyId: order.keyId,
          amount: order.amount,
          currency: order.currency,
          orderId: order.orderId,
          name: "Synchoo VIP Membership",
          description: `${selectedPlan.name} (${billingCycle === "annual" ? "Annual Pass" : "Monthly Pass"})`,
          prefill: { email: user.email },
          onSuccess: async (proof) => {
            try {
              const res = await subscribeMembership({
                data: {
                  plan: selectedPlan.id,
                  cycle: billingCycle,
                  payment_method: "razorpay",
                  razorpay_order_id: proof.razorpay_order_id,
                  razorpay_payment_id: proof.razorpay_payment_id,
                  razorpay_signature: proof.razorpay_signature,
                },
              });
              toast.success(res.message || `Subscribed to ${selectedPlan.name}!`);
              setSelectedPlan(null);
              await loadStatus();
            } catch (e: any) {
              toast.error(e.message || "Failed to finalize subscription verification.");
            }
          },
          onDismiss: () => {
            toast.info("Payment cancelled.");
          },
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Subscription failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAutoRenew = async () => {
    setCancelling(true);
    try {
      const res = await cancelMembership({ data: {} });
      toast.success(res.message || "Auto-renew disabled.");
      setCancelModalOpen(false);
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/40"
            >
              <Crown className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Club Privileges
            </Badge>
            {activePlan !== "free" ? (
              <Badge className="bg-emerald-600 text-white text-xs">
                Active Member
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Official VIP Pass
              </Badge>
            )}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Unlock Unlimited Savings With Synchoo Membership
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Frequent travelers, daily carpoolers, and premium drivers save over ₹18,000 every year
            with zero platform fees, guaranteed discounts, and complimentary doorstep washes.
          </p>

          {/* Active Membership Banner (if active) */}
          {activePlan !== "free" && (
            <div className="mx-auto max-w-2xl mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white">
                    <Crown className="h-5 w-5 fill-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      {activePlan === "black" ? "Synchoo Black VIP Member" : "Synchoo Plus Member"}
                      <Badge variant="outline" className="text-[10px] bg-background">Active</Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {membershipDetails.expiresAt
                        ? `Valid until ${new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })} · ${membershipDetails.cycle === "annual" ? "Annual plan" : "Monthly plan"}`
                        : "Active subscription"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {membershipDetails.autoRenew ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setCancelModalOpen(true)}
                    >
                      Turn Off Auto-Renew
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40">
                      Auto-renew is off — plan will expire and not renew
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={loadStatus}
                    title="Refresh status"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Billing Switch */}
          <div className="pt-2 flex items-center justify-center gap-3">
            <div className="flex items-center rounded-xl border border-border bg-muted p-1 text-xs">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === "monthly"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
                onClick={() => setBillingCycle("monthly")}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === "annual"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
                onClick={() => setBillingCycle("annual")}
              >
                Annual (Save 20%)
              </button>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="mx-auto max-w-5xl mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const price =
              billingCycle === "monthly" ? plan.priceMonthly : Math.round(plan.priceAnnual / 12);
            const isCurrent = activePlan === plan.id;
            const currentRank = PLAN_RANK[activePlan] ?? 0;
            const targetRank = PLAN_RANK[plan.id] ?? 0;

            const buttonLabel = isCurrent
              ? "Current Plan"
              : plan.id === "free"
              ? "Downgrade to Standard"
              : targetRank > currentRank
              ? `Upgrade to ${plan.name}`
              : `Downgrade to ${plan.name}`;

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col justify-between transition-all ${
                  isCurrent
                    ? "border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : plan.popular
                    ? "border-brand shadow-md ring-1 ring-brand"
                    : "border-border shadow-xs"
                }`}
              >
                {plan.badge && (
                  <Badge
                    className={`absolute -top-3 right-4 ${
                      plan.popular
                        ? "bg-brand text-brand-foreground"
                        : "bg-foreground text-background"
                    }`}
                  >
                    {plan.badge}
                  </Badge>
                )}

                <CardHeader>
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    {plan.name}
                    {isCurrent && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600">
                        Current
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {plan.id === "free"
                      ? "Pay as you go"
                      : "Billed " + (billingCycle === "monthly" ? "monthly" : "annually")}
                  </CardDescription>
                  <div className="mt-3">
                    <span className="font-display text-3xl font-extrabold">{currency(price)}</span>
                    {price > 0 && <span className="text-xs text-muted-foreground"> / month</span>}
                    {billingCycle === "annual" && plan.priceAnnual > 0 && (
                      <p className="text-[11px] text-emerald-600 font-medium mt-1">
                        {currency(plan.priceAnnual)} billed annually (Save 20%)
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5 pt-2 border-t border-border">
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handlePlanClick(plan)}
                    variant={isCurrent ? "outline" : plan.popular && targetRank > currentRank ? "default" : "outline"}
                    className={`w-full mt-6 ${targetRank < currentRank ? "text-muted-foreground hover:text-foreground" : ""}`}
                    disabled={isCurrent}
                  >
                    {buttonLabel}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Member Perks Highlights */}
        <div className="mx-auto max-w-5xl mt-16 rounded-2xl border border-border bg-card p-6 shadow-xs">
          <h3 className="font-display text-xl font-semibold mb-4 text-center">
            Exclusive Member Privileges
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Percent className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">0% Platform Fees</h4>
              <p className="text-xs text-muted-foreground">
                Keep 100% of the listed price on car rentals and driver bookings.
              </p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Droplets className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">Free Doorstep Washes</h4>
              <p className="text-xs text-muted-foreground">
                Complimentary monthly auto spa service at your home or office address.
              </p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Clock className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">Zero Cancellation Fees</h4>
              <p className="text-xs text-muted-foreground">
                Plans changed? Cancel up to 2 hours before trip start for a 100% full refund.
              </p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">VIP Dedicated Support</h4>
              <p className="text-xs text-muted-foreground">
                Direct access to senior fleet managers and expedited priority claims.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Subscription Checkout Dialog */}
      {selectedPlan && (
        <Dialog open={Boolean(selectedPlan)} onOpenChange={(open) => !open && setSelectedPlan(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Crown className="h-5 w-5 text-amber-500 fill-amber-400" />
                Activate {selectedPlan.name}
              </DialogTitle>
              <DialogDescription>
                Confirm your subscription details and select your payment method.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Plan summary box */}
              <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span>{selectedPlan.name} ({billingCycle === "annual" ? "Annual" : "Monthly"})</span>
                  <span className="font-bold text-base text-brand">{currency(getPlanPrice(selectedPlan))}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {billingCycle === "annual"
                    ? "Full 12-month VIP access billed annually. Renews at standard annual rate."
                    : "30-day VIP pass billed monthly."}
                </p>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Payment Method
                </p>

                {/* Option 1: Synchoo Wallet */}
                <div
                  onClick={() => setPaymentMethod("wallet")}
                  className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === "wallet"
                      ? "border-brand bg-brand/5 shadow-xs"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Synchoo Wallet</p>
                      <p className="text-xs text-muted-foreground">
                        Available Balance: {currency(walletBalance)}
                      </p>
                    </div>
                  </div>
                  {paymentMethod === "wallet" && (
                    <div className="h-5 w-5 rounded-full bg-brand grid place-items-center text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>

                {/* Option 2: Razorpay Online */}
                <div
                  onClick={() => setPaymentMethod("razorpay")}
                  className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === "razorpay"
                      ? "border-brand bg-brand/5 shadow-xs"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Card, UPI, Netbanking</p>
                      <p className="text-xs text-muted-foreground">Instant payment via Razorpay</p>
                    </div>
                  </div>
                  {paymentMethod === "razorpay" && (
                    <div className="h-5 w-5 rounded-full bg-brand grid place-items-center text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </div>

              {/* Balance warning if wallet chosen and balance too low */}
              {paymentMethod === "wallet" && walletBalance < getPlanPrice(selectedPlan) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    Your wallet balance is insufficient for this plan. You can pay via Razorpay or{" "}
                    <Link to="/wallet" className="font-semibold underline">
                      top up your wallet
                    </Link>.
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setSelectedPlan(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubscribeConfirm}
                disabled={submitting || (paymentMethod === "wallet" && walletBalance < getPlanPrice(selectedPlan))}
              >
                {submitting
                  ? "Processing…"
                  : `Pay ${currency(getPlanPrice(selectedPlan))} & Activate`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Auto-Renew Confirmation */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn Off Auto-Renewal</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable automatic renewal?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              Your VIP benefits will remain active until the end of your current billing period:
            </p>
            <p className="font-semibold text-foreground">
              {membershipDetails.expiresAt
                ? new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "the end of this billing period"}
            </p>
            <p className="text-xs">
              After this date, your account will return to Synchoo Standard. You can resubscribe anytime.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
              Keep Auto-Renew
            </Button>
            <Button variant="destructive" onClick={handleCancelAutoRenew} disabled={cancelling}>
              {cancelling ? "Updating…" : "Confirm & Turn Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
