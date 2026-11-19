import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import {
  createMembershipOrder,
  subscribeMembership,
  cancelMembership,
  resumeMembership,
} from "@/lib/actions";
import { openRazorpayCheckout, loadRazorpayScript } from "@/lib/razorpay-checkout";
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
  Loader2,
  AlertTriangle,
  Receipt,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  HelpCircle,
  ExternalLink,
  Car,
  PauseCircle,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/membership")({
  component: MembershipPage,
  head: () => ({
    meta: [
      { title: "Synchoo VIP Membership & Billing Portal" },
      {
        name: "description",
        content:
          "Upgrade to Synchoo Plus or Synchoo Black VIP for 0% convenience fees, 15% discount on car rentals, free doorstep washes, and zero security deposit.",
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
  tagline: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Synchoo Standard",
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: "Pay-as-you-go mobility for occasional riders",
    features: [
      "Access to all cars, EVs, bikes, and carpool rides",
      "Standard 5% platform fee",
      "Standard cancellation policy (24h free)",
      "Standard in-app customer support",
      "1x Synchoo Points on all bookings",
    ],
  },
  {
    id: "plus",
    name: "Synchoo Plus",
    priceMonthly: 499,
    priceAnnual: 4990,
    popular: true,
    badge: "Most Popular",
    tagline: "For weekly commuters & frequent rental riders",
    features: [
      "0% platform convenience fees on all bookings",
      "10% discount on self-drive rentals and driver hires",
      "1 free doorstep foam wash every month (worth ₹449)",
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
    tagline: "The ultimate pass for luxury travel & zero friction",
    features: [
      "All Synchoo Plus benefits included",
      "15% flat discount on luxury SUVs, sedans & EVs",
      "3 free doorstep detailing washes per month (worth ₹1,347)",
      "Free cancellation up to 2 hours before trip",
      "Zero security deposit requirement on verified profile",
      "Dedicated 24/7 personal concierge & airport meet",
      "Guaranteed vehicle model availability guarantee",
      "3x Synchoo Points cashback on all transactions",
    ],
  },
];

const PLAN_RANK: Record<string, number> = {
  free: 0,
  plus: 1,
  black: 2,
};

const COMPARISON_ROWS = [
  {
    category: "Platform Fees & Cashback",
    items: [
      { name: "Platform Convenience Fee", free: "5% per booking", plus: "0% (Free)", black: "0% (Free)" },
      { name: "Synchoo Points Multiplier", free: "1x points", plus: "2x points", black: "3x points" },
      { name: "Peak Hour Surcharge Waiver", free: "No", plus: "50% off surge", black: "100% surge-free" },
    ],
  },
  {
    category: "Discounts & Car Care",
    items: [
      { name: "Self-Drive Rental Discount", free: "—", plus: "10% off", black: "15% off" },
      { name: "Chauffeur & Driver Hire Discount", free: "—", plus: "10% off", black: "15% off" },
      { name: "Complimentary Doorstep Washes", free: "—", plus: "1 Free wash / mo", black: "3 Free detailing / mo" },
      { name: "Security Deposit Waiver", free: "Standard deposit", plus: "50% reduced", black: "100% Zero deposit" },
    ],
  },
  {
    category: "Flexibility & Premium Support",
    items: [
      { name: "Free Trip Cancellation Window", free: "Up to 24 hrs", plus: "Up to 6 hrs", black: "Up to 2 hrs" },
      { name: "Customer Support Tier", free: "Standard ticket", plus: "Priority hotline", black: "24/7 VIP Concierge" },
      { name: "Guaranteed Car Availability", free: "Subject to demand", plus: "Priority queue", black: "Guaranteed model lock" },
    ],
  },
];

const CANCELLATION_REASONS = [
  {
    id: "frequency",
    title: "Not renting or traveling frequently right now",
    description: "My schedule has changed or I am taking fewer outstation & city trips.",
    icon: Car,
  },
  {
    id: "cost",
    title: "Looking to lower my monthly mobility expenses",
    description: "I want to cut back on recurring monthly subscriptions.",
    icon: Wallet,
  },
  {
    id: "pause",
    title: "Taking a temporary break — will return later",
    description: "I will reactivate my VIP pass when my next travel period starts.",
    icon: PauseCircle,
  },
  {
    id: "payasyougo",
    title: "Prefer occasional pay-as-you-go bookings",
    description: "I would rather pay the standard 5% fee on individual rides.",
    icon: RefreshCw,
  },
  {
    id: "other",
    title: "Other feedback or missing feature",
    description: "Looking for specific car models, locations, or service options.",
    icon: MessageSquare,
  },
];

export function MembershipPage() {
  const { user } = useSession();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"plans" | "billing">("plans");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [activePlan, setActivePlan] = useState<string>("free");
  const [membershipDetails, setMembershipDetails] = useState<{
    expiresAt: string | null;
    startedAt: string | null;
    cycle: "monthly" | "annual";
    autoRenew: boolean;
  }>({ expiresAt: null, startedAt: null, cycle: "monthly", autoRenew: true });

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Checkout modal states
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "razorpay">("wallet");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [gatewayConnecting, setGatewayConnecting] = useState<boolean>(false);

  // Plan switch modal (for changing between active paid tiers or back to free)
  const [switchPlanTarget, setSwitchPlanTarget] = useState<Plan | null>(null);
  const [switching, setSwitching] = useState<boolean>(false);

  // Cancellation modal states
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>(CANCELLATION_REASONS[0].id);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [resuming, setResuming] = useState<boolean>(false);

  // Preload Razorpay checkout script on mount for zero perceived latency
  useEffect(() => {
    loadRazorpayScript().catch(() => {});
  }, []);

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
        if (plan !== "free" && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
          plan = "free";
        }
        setActivePlan(plan);
        setMembershipDetails({
          expiresAt: p.membership_expires_at,
          startedAt: p.membership_started_at,
          cycle: (p.membership_cycle as "monthly" | "annual") || "monthly",
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

      // Fetch membership billing history from wallet transactions
      const { data: txs } = await api
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("kind", "membership_payment")
        .order("created_at", { ascending: false });

      if (txs) {
        setInvoices(txs);
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

    const currentRank = PLAN_RANK[activePlan] ?? 0;
    const targetRank = PLAN_RANK[plan.id] ?? 0;

    // If active on a higher plan and switching to lower tier, open smart switch modal
    if (targetRank < currentRank) {
      setSwitchPlanTarget(plan);
      return;
    }

    // Upgrade flow
    setSelectedPlan(plan);
  };

  const handleConfirmPlanSwitch = async () => {
    if (!switchPlanTarget || !user) return;
    setSwitching(true);
    try {
      if (switchPlanTarget.id === "free") {
        const res = await subscribeMembership({ data: { plan: "free", immediate: false } });
        toast.success(
          res.message ||
            "Auto-renewal turned off. Your VIP benefits remain fully active until the end of your billing cycle."
        );
      } else {
        // Switching between paid tiers (e.g., Black VIP to Plus)
        setSelectedPlan(switchPlanTarget);
      }
      setSwitchPlanTarget(null);
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to switch plan.");
    } finally {
      setSwitching(false);
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
          toast.error(
            `Insufficient wallet balance (${currency(walletBalance)}). Please add money to wallet or choose Online Payment.`
          );
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
        setActiveTab("billing");
      } else {
        // Razorpay checkout with responsive loading state
        setGatewayConnecting(true);
        const order = await createMembershipOrder({
          data: {
            plan: selectedPlan.id,
            cycle: billingCycle,
          },
        });

        setGatewayConnecting(false);

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
              setActiveTab("billing");
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
      setGatewayConnecting(false);
    }
  };

  const handleCancelAutoRenew = async () => {
    setCancelling(true);
    try {
      const res = await cancelMembership({ data: {} });
      toast.success(res.message || "Auto-renewal turned off.");
      setCancelModalOpen(false);
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription.");
    } finally {
      setCancelling(false);
    }
  };

  const handleResumeAutoRenew = async () => {
    setResuming(true);
    try {
      const res = await resumeMembership({ data: {} });
      toast.success(res.message || "Auto-renewal turned on.");
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to resume auto-renewal.");
    } finally {
      setResuming(false);
    }
  };

  const currentPlanObj = PLANS.find((p) => p.id === activePlan) || PLANS[0];
  const currentRank = PLAN_RANK[activePlan] ?? 0;

  // Calculate days remaining
  const daysRemaining = membershipDetails.expiresAt
    ? Math.max(0, Math.ceil((new Date(membershipDetails.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header Banner */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
              <Crown className="h-3.5 w-3.5 fill-amber-400" />
              <span>Synchoo Club Privileges</span>
              {activePlan !== "free" && (
                <span className="ml-1 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">
                  Active Member
                </span>
              )}
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              VIP Membership & Self-Serve Portal
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Enjoy 0% platform convenience fees, exclusive car rental discounts, complimentary doorstep
              washes, and complete flexibility over your subscription.
            </p>
          </div>

          {/* Dual Tab Controller: Plans & Features vs Billing & Invoices */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "plans" | "billing")}
            className="w-full mt-6"
          >
            <div className="flex justify-center mb-6">
              <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-muted/80 rounded-xl">
                <TabsTrigger value="plans" className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                  <Sparkles className="h-4 w-4" />
                  Plans & Features
                </TabsTrigger>
                <TabsTrigger value="billing" className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                  <Receipt className="h-4 w-4" />
                  Billing & Subscription
                  {activePlan !== "free" && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB 1: PLANS & FEATURES */}
            <TabsContent value="plans" className="space-y-12">
              {/* Billing Cycle Switcher */}
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center rounded-xl border border-border bg-muted p-1 text-xs">
                  <button
                    type="button"
                    className={`rounded-lg px-4 py-1.5 font-medium transition-all ${
                      billingCycle === "monthly"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    Monthly Billing
                  </button>
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-medium transition-all ${
                      billingCycle === "annual"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setBillingCycle("annual")}
                  >
                    Annual Billing
                    <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-bold">
                      Save 20%
                    </span>
                  </button>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid gap-6 md:grid-cols-3">
                {PLANS.map((plan) => {
                  const price =
                    billingCycle === "monthly" ? plan.priceMonthly : Math.round(plan.priceAnnual / 12);
                  const isCurrent = activePlan === plan.id;
                  const targetRank = PLAN_RANK[plan.id] ?? 0;

                  // Intelligent button labels
                  let buttonLabel = "";
                  let buttonVariant: "default" | "outline" | "secondary" = "outline";

                  if (isCurrent) {
                    buttonLabel = "Current Plan";
                    buttonVariant = "outline";
                  } else if (targetRank > currentRank) {
                    buttonLabel = `Upgrade to ${plan.name}`;
                    buttonVariant = plan.popular ? "default" : "default";
                  } else {
                    buttonLabel = `Switch to ${plan.name}`;
                    buttonVariant = "outline";
                  }

                  return (
                    <Card
                      key={plan.id}
                      className={`relative flex flex-col justify-between transition-all rounded-2xl ${
                        isCurrent
                          ? "border-emerald-500 shadow-md ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10"
                          : plan.popular
                          ? "border-brand shadow-md ring-1 ring-brand"
                          : "border-border shadow-xs hover:border-foreground/30"
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

                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl font-bold flex items-center gap-2">
                            {plan.name}
                          </CardTitle>
                          {isCurrent && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40">
                              Active
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs min-h-[32px] pt-1">
                          {plan.tagline}
                        </CardDescription>

                        <div className="mt-4 pt-3 border-t border-border">
                          <div className="flex items-baseline gap-1">
                            <span className="font-display text-3xl font-extrabold">
                              {currency(price)}
                            </span>
                            {price > 0 && (
                              <span className="text-xs text-muted-foreground font-normal"> / month</span>
                            )}
                          </div>
                          {billingCycle === "annual" && plan.priceAnnual > 0 && (
                            <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                              {currency(plan.priceAnnual)} billed annually (Save 20%)
                            </p>
                          )}
                          {plan.id === "free" && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Pay only when you book
                            </p>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-5 flex-1 flex flex-col justify-between pt-0">
                        <div className="space-y-2.5 pt-3 border-t border-border">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            What's Included:
                          </p>
                          {plan.features.map((feat, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                              <span className="text-foreground/90">{feat}</span>
                            </div>
                          ))}
                        </div>

                        <Button
                          onClick={() => handlePlanClick(plan)}
                          variant={buttonVariant}
                          className="w-full mt-4 font-semibold rounded-xl"
                          disabled={isCurrent}
                        >
                          {isCurrent ? (
                            <>
                              <Check className="mr-2 h-4 w-4 text-emerald-600" />
                              Current Plan
                            </>
                          ) : targetRank > currentRank ? (
                            <>
                              <Zap className="mr-2 h-4 w-4" />
                              {buttonLabel}
                            </>
                          ) : (
                            <>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              {buttonLabel}
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Interactive Feature Comparison Matrix */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="font-display text-2xl font-bold">Compare All Membership Benefits</h3>
                  <p className="text-xs text-muted-foreground max-w-xl mx-auto">
                    A comprehensive breakdown of perks, fee waivers, complimentary washes, and support tiers
                    across plans.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="w-1/3 text-xs font-bold uppercase tracking-wider">
                          Privilege / Feature
                        </TableHead>
                        <TableHead className="text-center text-xs font-bold text-foreground">
                          Standard
                        </TableHead>
                        <TableHead className="text-center text-xs font-bold text-brand">
                          Synchoo Plus
                        </TableHead>
                        <TableHead className="text-center text-xs font-bold text-amber-500">
                          Synchoo Black VIP
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COMPARISON_ROWS.map((group, gIdx) => (
                        <>
                          <TableRow key={`g-${gIdx}`} className="bg-muted/40 font-semibold border-border">
                            <TableCell colSpan={4} className="py-2.5 text-xs text-muted-foreground">
                              {group.category}
                            </TableCell>
                          </TableRow>
                          {group.items.map((row, rIdx) => (
                            <TableRow key={`r-${gIdx}-${rIdx}`} className="border-border hover:bg-muted/20">
                              <TableCell className="text-xs font-medium py-3 text-foreground">
                                {row.name}
                              </TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground py-3">
                                {row.free}
                              </TableCell>
                              <TableCell className="text-center text-xs font-semibold text-foreground py-3">
                                {row.plus}
                              </TableCell>
                              <TableCell className="text-center text-xs font-bold text-amber-600 dark:text-amber-400 py-3">
                                {row.black}
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: BILLING & SUBSCRIPTION */}
            <TabsContent value="billing" className="space-y-8">
              {!user ? (
                <Card className="text-center py-12 px-6">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Receipt className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg">Sign In to View Billing</CardTitle>
                  <CardDescription className="text-xs max-w-sm mx-auto mt-2">
                    Please log into your account to inspect your current membership details, billing cycle, and invoice history.
                  </CardDescription>
                  <Button className="mt-4" onClick={() => navigate({ to: "/auth" })}>
                    Sign In
                  </Button>
                </Card>
              ) : activePlan === "free" ? (
                <Card className="text-center py-10 px-6 rounded-2xl border border-dashed border-border">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-3">
                    <Crown className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">You are on Synchoo Standard (Free)</CardTitle>
                  <CardDescription className="text-xs max-w-md mx-auto mt-2 text-muted-foreground">
                    You currently have no recurring billing. Upgrade to Synchoo Plus or Black VIP to enjoy zero platform fees and complimentary monthly washes.
                  </CardDescription>
                  <Button className="mt-5" onClick={() => setActiveTab("plans")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Browse VIP Plans
                  </Button>
                </Card>
              ) : (
                <>
                  {/* Active Subscription Overview Card */}
                  <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/5 shadow-xs overflow-hidden">
                    <div className="p-6 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/80">
                        <div className="flex items-center gap-4">
                          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                            <Crown className="h-6 w-6 fill-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg font-bold text-foreground">
                                {currentPlanObj.name}
                              </h2>
                              <Badge
                                variant={membershipDetails.autoRenew ? "default" : "secondary"}
                                className={membershipDetails.autoRenew ? "bg-emerald-600 text-white text-[11px]" : "text-[11px]"}
                              >
                                {membershipDetails.autoRenew ? "Active · Renews Automatically" : "Cancels at Cycle End"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {membershipDetails.cycle === "annual" ? "Annual Pass" : "Monthly Pass"} ·{" "}
                              {currency(
                                membershipDetails.cycle === "annual"
                                  ? currentPlanObj.priceAnnual
                                  : currentPlanObj.priceMonthly
                              )}
                              /{membershipDetails.cycle === "annual" ? "year" : "month"}
                            </p>
                          </div>
                        </div>

                        {/* Direct Auto-Renewal Toggle Action */}
                        <div className="flex items-center gap-2">
                          {membershipDetails.autoRenew ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                              onClick={() => setCancelModalOpen(true)}
                            >
                              Cancel Subscription
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              className="text-xs bg-emerald-600 hover:bg-emerald-700"
                              onClick={handleResumeAutoRenew}
                              disabled={resuming}
                            >
                              {resuming ? "Enabling…" : "Turn Auto-Renew Back On"}
                            </Button>
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

                      {/* Subscription Dates & Status Matrix */}
                      <div className="grid gap-4 sm:grid-cols-3 text-xs">
                        <div className="p-3.5 rounded-xl border border-border bg-background">
                          <p className="text-muted-foreground flex items-center gap-1.5 mb-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            Next Renewal / Expiry
                          </p>
                          <p className="text-sm font-bold text-foreground">
                            {membershipDetails.expiresAt
                              ? new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Active"}
                          </p>
                          {daysRemaining !== null && (
                            <p className="text-[11px] text-emerald-600 mt-0.5">
                              {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining in cycle
                            </p>
                          )}
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-background">
                          <p className="text-muted-foreground flex items-center gap-1.5 mb-1">
                            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                            Synchoo Wallet Balance
                          </p>
                          <p className="text-sm font-bold text-foreground">
                            {currency(walletBalance)}
                          </p>
                          <Link to="/wallet" className="text-[11px] text-brand hover:underline mt-0.5 inline-block">
                            Top up wallet →
                          </Link>
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-background">
                          <p className="text-muted-foreground flex items-center gap-1.5 mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                            Active Privileges
                          </p>
                          <p className="text-sm font-bold text-emerald-600">
                            0% Fees & {currentPlanObj.id === "black" ? "15%" : "10%"} Discounts
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {currentPlanObj.id === "black" ? "3 Free Washes / mo" : "1 Free Wash / mo"}
                          </p>
                        </div>
                      </div>

                      {/* Auto-renew warning if turned off */}
                      {!membershipDetails.autoRenew && (
                        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-5 w-5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold">Automatic renewal is turned off.</p>
                            <p className="text-muted-foreground text-[11px]">
                              Your VIP benefits will remain completely active until{" "}
                              {membershipDetails.expiresAt
                                ? new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  })
                                : "the end of your billing cycle"}
                              , after which your account will automatically return to Synchoo Standard.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs bg-background shrink-0"
                            onClick={handleResumeAutoRenew}
                            disabled={resuming}
                          >
                            Keep VIP Active
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Billing Invoices & Receipts */}
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-foreground">Billing History & Invoices</h3>
                        <p className="text-xs text-muted-foreground">
                          Itemised receipts and statements for membership activations and renewals.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {invoices.length || 1} Statement{(invoices.length || 1) === 1 ? "" : "s"}
                      </Badge>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="text-xs font-semibold">Date</TableHead>
                            <TableHead className="text-xs font-semibold">Description</TableHead>
                            <TableHead className="text-xs font-semibold">Method</TableHead>
                            <TableHead className="text-xs font-semibold">Amount</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-right text-xs font-semibold">Receipt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.length > 0 ? (
                            invoices.map((inv) => (
                              <TableRow key={inv.id} className="border-border hover:bg-muted/30">
                                <TableCell className="text-xs font-medium py-3">
                                  {new Date(inv.created_at).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </TableCell>
                                <TableCell className="text-xs py-3">
                                  {inv.description || "VIP Membership Plan"}
                                </TableCell>
                                <TableCell className="text-xs py-3 text-muted-foreground capitalize">
                                  {inv.reference?.startsWith("mem_wlt") ? "Synchoo Wallet" : "Razorpay Online"}
                                </TableCell>
                                <TableCell className="text-xs font-bold py-3 text-foreground">
                                  {currency(Math.abs(Number(inv.amount)))}
                                </TableCell>
                                <TableCell className="text-xs py-3">
                                  <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0">
                                    Paid
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs py-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-brand"
                                    onClick={() => window.print()}
                                  >
                                    <FileText className="mr-1 h-3.5 w-3.5" />
                                    Print / PDF
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow className="border-border">
                              <TableCell className="text-xs font-medium py-3">
                                {membershipDetails.startedAt
                                  ? new Date(membershipDetails.startedAt).toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "Today"}
                              </TableCell>
                              <TableCell className="text-xs py-3">
                                {currentPlanObj.name} ({membershipDetails.cycle === "annual" ? "Annual" : "Monthly"})
                              </TableCell>
                              <TableCell className="text-xs py-3 text-muted-foreground">
                                Platform Active
                              </TableCell>
                              <TableCell className="text-xs font-bold py-3 text-foreground">
                                {currency(
                                  membershipDetails.cycle === "annual"
                                    ? currentPlanObj.priceAnnual
                                    : currentPlanObj.priceMonthly
                                )}
                              </TableCell>
                              <TableCell className="text-xs py-3">
                                <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0">
                                  Active Paid
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs py-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-brand"
                                  onClick={() => window.print()}
                                >
                                  <FileText className="mr-1 h-3.5 w-3.5" />
                                  Print / PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {/* Billing FAQ Accordion */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
                <h3 className="font-display text-base font-bold flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-brand" />
                  Frequently Asked Questions About Billing
                </h3>
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border">
                    <p className="font-semibold text-foreground text-sm mb-1">
                      How does cancellation work?
                    </p>
                    <p>
                      When you turn off auto-renewal or cancel, you retain 100% of your VIP benefits
                      until the end of your prepaid period. You will never be billed again, and your
                      account will automatically transition back to Synchoo Standard.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border border-border">
                    <p className="font-semibold text-foreground text-sm mb-1">
                      Can I switch between monthly and annual plans?
                    </p>
                    <p>
                      Yes! Switch to annual billing anytime to immediately save 20% on your membership.
                      Your new annual pass starts right away, extending your VIP access by 365 days.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border border-border">
                    <p className="font-semibold text-foreground text-sm mb-1">
                      What happens to my complimentary monthly washes?
                    </p>
                    <p>
                      Complimentary doorstep washes reset on the 1st of every calendar month for active
                      Plus and Black VIP members. Unused free washes do not roll over to subsequent months.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
                Confirm your subscription details and select your preferred payment channel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Plan summary box */}
              <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span>
                    {selectedPlan.name} ({billingCycle === "annual" ? "Annual Pass" : "Monthly Pass"})
                  </span>
                  <span className="font-bold text-base text-brand">
                    {currency(getPlanPrice(selectedPlan))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {billingCycle === "annual"
                    ? "Full 12-month VIP access billed annually. Renews automatically with 20% discount."
                    : "30-day VIP pass billed monthly. Cancel or change anytime."}
                </p>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Choose Payment Method
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

                {/* Option 2: Razorpay Online (Instant Preloaded) */}
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
                      <p className="text-xs text-muted-foreground">
                        Instant zero-latency checkout via Razorpay
                      </p>
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
                    Your wallet balance is insufficient for this plan. You can pay via UPI/Card or{" "}
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
                disabled={
                  submitting ||
                  (paymentMethod === "wallet" && walletBalance < getPlanPrice(selectedPlan))
                }
              >
                {gatewayConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting Gateway…
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Pay ${currency(getPlanPrice(selectedPlan))} & Activate`
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Plan Switch Confirmation Dialog (For transitioning between tiers without blunt "Downgrade") */}
      {switchPlanTarget && (
        <Dialog open={Boolean(switchPlanTarget)} onOpenChange={(open) => !open && setSwitchPlanTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-brand" />
                Switch to {switchPlanTarget.name}
              </DialogTitle>
              <DialogDescription>
                Confirm your membership adjustment.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 text-xs text-muted-foreground space-y-3">
              <p>
                You are currently enjoying <strong className="text-foreground">{currentPlanObj.name}</strong>.
              </p>
              <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-1.5">
                <p className="font-semibold text-foreground">
                  How this adjustment works:
                </p>
                <p>
                  {switchPlanTarget.id === "free"
                    ? `Your VIP privileges will remain 100% active until ${
                        membershipDetails.expiresAt
                          ? new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "the end of your billing cycle"
                      }. After that date, your subscription will not renew and your account will smoothly return to Synchoo Standard.`
                    : `Your current ${currentPlanObj.name} benefits remain active until your renewal date, after which your account will transition to ${switchPlanTarget.name}.`}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSwitchPlanTarget(null)} disabled={switching}>
                Keep Current Plan
              </Button>
              <Button onClick={handleConfirmPlanSwitch} disabled={switching}>
                {switching ? "Switching…" : `Confirm Switch to ${switchPlanTarget.name}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* High-End Professional Offboarding / Cancellation Modal */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden rounded-2xl border border-border">
          <div className="p-6 pb-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Manage Subscription & Auto-Renewal
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Review your membership privileges and choose how you would like to proceed.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
            {/* Grace Period Reassurance Banner */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  You keep 100% of your VIP perks until{" "}
                  {membershipDetails.expiresAt
                    ? new Date(membershipDetails.expiresAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "the end of your cycle"}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] pl-6">
                Cancelling will turn off future automatic renewal charges. You will not be billed again, and
                your account will smoothly return to Synchoo Standard only after your current prepaid cycle
                concludes.
              </p>
            </div>

            {/* Perks Impact Grid */}
            <div className="space-y-2">
              <p className="font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
                Privileges ending after your prepaid cycle:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl border border-border bg-card flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0 mt-0.5">
                    <Percent className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">0% Platform Fees</p>
                    <p className="text-[11px] text-muted-foreground">Will revert to standard 5% fee per rental or ride</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border bg-card flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0 mt-0.5">
                    <Droplets className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">Free Monthly Washes</p>
                    <p className="text-[11px] text-muted-foreground">Complimentary doorstep auto spa visits will end</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border bg-card flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">10–15% Car Discounts</p>
                    <p className="text-[11px] text-muted-foreground">VIP member discounts on luxury cars & rentals will end</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border bg-card flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive grid place-items-center shrink-0 mt-0.5">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">Free Cancellation Window</p>
                    <p className="text-[11px] text-muted-foreground">Reverts to standard 24-hour cancellation rule</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Reason Cards (Linear / Spotify Style) */}
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="font-semibold text-foreground text-xs">
                Help us improve: What is your primary reason for cancelling?
              </label>
              <div className="grid gap-2">
                {CANCELLATION_REASONS.map((r) => {
                  const Icon = r.icon;
                  const isSelected = cancelReason === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setCancelReason(r.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "border-brand bg-brand/5 ring-1 ring-brand shadow-xs"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <div
                        className={`grid h-7 w-7 place-items-center rounded-lg shrink-0 mt-0.5 ${
                          isSelected ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-xs ${isSelected ? "text-foreground" : "text-foreground/90"}`}>
                          {r.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.description}
                        </p>
                      </div>
                      <div
                        className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                          isSelected ? "border-brand bg-brand text-white" : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Smart Alternative Win-Back Pill (Annual Discount) */}
            {membershipDetails.cycle === "monthly" && (
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs">
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Want to reduce costs without losing VIP perks?</p>
                  <p className="text-[11px] text-muted-foreground">
                    Switch to Annual Billing to immediately save 20% on every month.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs bg-background shrink-0 font-medium border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                  onClick={() => {
                    setCancelModalOpen(false);
                    setBillingCycle("annual");
                    setActiveTab("plans");
                    toast.info("Switched to Annual view with 20% savings.");
                  }}
                >
                  Switch to Annual
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 sm:p-6 bg-muted/10 border-t border-border flex-col-reverse sm:flex-row gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancelling}
              className="font-medium text-xs h-9 w-full sm:w-auto"
            >
              Keep My VIP Membership
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAutoRenew}
              disabled={cancelling}
              className="font-semibold text-xs h-9 w-full sm:w-auto"
            >
              {cancelling ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Turning Off Auto-Renew…
                </>
              ) : (
                "Turn Off Auto-Renew"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
