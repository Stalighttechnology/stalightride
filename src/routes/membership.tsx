import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
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
} from "lucide-react";

export const Route = createFileRoute("/membership")({
  component: MembershipPage,
  head: () => ({
    meta: [
      { title: "Synchoo Membership — VIP Mobility Pass" },
      { name: "description", content: "Upgrade to Synchoo Plus or Synchoo Black for 0% fees, 15% discount on car rentals, free washes and priority support." },
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

export function MembershipPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [activePlan, setActivePlan] = useState<string>("free");

  const handleSubscribe = (plan: Plan) => {
    if (plan.id === "free") {
      setActivePlan("free");
      toast.info("You are currently on Synchoo Standard.");
      return;
    }
    setActivePlan(plan.id);
    toast.success(`Welcome to ${plan.name}! Your membership perks are now active.`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl text-center space-y-4">
          <Badge variant="outline" className="border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/40">
            <Crown className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Club Privileges
          </Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Unlock Unlimited Savings With Synchoo Membership
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Frequent travelers, daily carpoolers, and premium drivers save over ₹18,000 every year with zero platform fees, guaranteed discounts, and complimentary doorstep washes.
          </p>

          {/* Billing Switch */}
          <div className="pt-2 flex items-center justify-center gap-3">
            <div className="flex items-center rounded-xl border border-border bg-muted p-1 text-xs">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === "monthly" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
                onClick={() => setBillingCycle("monthly")}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  billingCycle === "annual" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
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
            const price = billingCycle === "monthly" ? plan.priceMonthly : Math.round(plan.priceAnnual / 12);
            const isCurrent = activePlan === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col justify-between transition-all ${
                  plan.popular
                    ? "border-brand shadow-md ring-1 ring-brand"
                    : "border-border shadow-xs"
                }`}
              >
                {plan.badge && (
                  <Badge
                    className={`absolute -top-3 right-4 ${
                      plan.popular ? "bg-brand text-brand-foreground" : "bg-foreground text-background"
                    }`}
                  >
                    {plan.badge}
                  </Badge>
                )}

                <CardHeader>
                  <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {plan.id === "free" ? "Pay as you go" : "Billed " + (billingCycle === "monthly" ? "monthly" : "annually")}
                  </CardDescription>
                  <div className="mt-3">
                    <span className="font-display text-3xl font-extrabold">{currency(price)}</span>
                    {price > 0 && <span className="text-xs text-muted-foreground"> / month</span>}
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
                    onClick={() => handleSubscribe(plan)}
                    variant={plan.popular ? "default" : "outline"}
                    className="w-full mt-6"
                  >
                    {isCurrent ? "Current Plan" : `Upgrade to ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Member Perks Highlights */}
        <div className="mx-auto max-w-5xl mt-16 rounded-2xl border border-border bg-card p-6 shadow-xs">
          <h3 className="font-display text-xl font-semibold mb-4 text-center">Exclusive Member Privileges</h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Percent className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">0% Platform Fees</h4>
              <p className="text-xs text-muted-foreground">Keep 100% of the listed price on car rentals and driver bookings.</p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Droplets className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">Free Doorstep Washes</h4>
              <p className="text-xs text-muted-foreground">Complimentary monthly auto spa service at your home or office address.</p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Clock className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">Zero Cancellation Fees</h4>
              <p className="text-xs text-muted-foreground">Plans changed? Cancel up to 2 hours before trip start for a 100% full refund.</p>
            </div>

            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-sm">VIP Dedicated Support</h4>
              <p className="text-xs text-muted-foreground">Direct access to senior fleet managers and expedited priority claims.</p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

