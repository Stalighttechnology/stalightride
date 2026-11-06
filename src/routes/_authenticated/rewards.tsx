import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Sparkles,
  Award,
  Zap,
  Gift,
  CheckCircle2,
  Car,
  Droplets,
  Fuel,
  Coffee,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: RewardsPage,
  head: () => ({
    meta: [
      { title: "Synchoo Rewards & Points" },
      { name: "description", content: "Earn 1 Synchoo Point for every ₹20 spent. Redeem points for fuel cards, free doorstep washes, and rental discounts." },
    ],
  }),
});

interface RewardVoucher {
  id: string;
  title: string;
  pointsCost: number;
  category: string;
  icon: any;
  description: string;
}

const REWARDS_CATALOG: RewardVoucher[] = [
  {
    id: "r1",
    title: "₹500 Off Self-Drive Rental",
    pointsCost: 500,
    category: "Rental Discount",
    icon: Car,
    description: "Applicable on any 24h+ car or EV booking across India.",
  },
  {
    id: "r2",
    title: "Free Doorstep Foam Wash",
    pointsCost: 400,
    category: "Wash Voucher",
    icon: Droplets,
    description: "Complete exterior foam wash & tyre polish at your doorstep.",
  },
  {
    id: "r3",
    title: "₹300 IndianOil Fuel Gift Card",
    pointsCost: 300,
    category: "Fuel",
    icon: Fuel,
    description: "Digital IOCL fuel coupon redeemable at any petrol pump nationwide.",
  },
  {
    id: "r4",
    title: "Starbucks Coffee & Snack Voucher",
    pointsCost: 250,
    category: "Lifestyle",
    icon: Coffee,
    description: "Enjoy a complimentary handcrafted beverage at any Starbucks outlet.",
  },
];

export function RewardsPage() {
  const { user } = useSession();
  const [pointsBalance, setPointsBalance] = useState<number>(850);
  const [redeemed, setRedeemed] = useState<string[]>([]);

  const handleRedeem = (voucher: RewardVoucher) => {
    if (pointsBalance < voucher.pointsCost) {
      return toast.error(`Insufficient points. You need ${voucher.pointsCost - pointsBalance} more points.`);
    }
    setPointsBalance(pointsBalance - voucher.pointsCost);
    setRedeemed([...redeemed, voucher.id]);
    toast.success(`Redeemed ${voucher.title}! Check your email for your coupon code.`);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* Points Meter Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-300/40 bg-gradient-to-r from-amber-500/10 via-background to-brand/10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                <Sparkles className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Loyalty Club
              </Badge>
              <h1 className="font-display text-3xl font-bold tracking-tight">Your Rewards Points</h1>
              <p className="text-xs text-muted-foreground">
                Earn 5% in points on all completed self-drive trips, driver hires, and doorstep washes. 1 Point = ₹1.
              </p>
            </div>

            <div className="text-right bg-card/80 backdrop-blur-xs p-4 rounded-2xl border border-border">
              <span className="text-xs text-muted-foreground uppercase font-semibold">Current Balance</span>
              <div className="font-display text-3xl font-extrabold text-amber-600 mt-0.5">
                {pointsBalance} <span className="text-sm font-medium text-foreground">Points</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Worth {currency(pointsBalance)}</p>
            </div>
          </div>
        </div>

        {/* How to Earn */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3.5 text-center">
            <Car className="mx-auto h-5 w-5 text-brand mb-1" />
            <p className="text-xs font-semibold">Rent a Car or EV</p>
            <p className="text-[11px] text-muted-foreground">Earn 50 pts per ₹1,000</p>
          </Card>
          <Card className="p-3.5 text-center">
            <Droplets className="mx-auto h-5 w-5 text-cyan-500 mb-1" />
            <p className="text-xs font-semibold">Book Doorstep Wash</p>
            <p className="text-[11px] text-muted-foreground">Earn 30 pts per wash</p>
          </Card>
          <Card className="p-3.5 text-center">
            <Award className="mx-auto h-5 w-5 text-amber-500 mb-1" />
            <p className="text-xs font-semibold">Rate & Review</p>
            <p className="text-[11px] text-muted-foreground">Earn 20 pts per review</p>
          </Card>
        </div>

        {/* Rewards Catalog */}
        <div>
          <h2 className="font-display text-xl font-bold mb-3">Redeem Your Points</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {REWARDS_CATALOG.map((v) => {
              const Icon = v.icon;
              const hasRedeemed = redeemed.includes(v.id);

              return (
                <Card key={v.id} className="p-4 flex flex-col justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                      <Icon className="h-5 w-5 text-brand" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{v.title}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] mt-1">{v.category}</Badge>
                      <p className="text-xs text-muted-foreground mt-1.5">{v.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-600">{v.pointsCost} Points</span>
                    <Button
                      size="sm"
                      variant={hasRedeemed ? "outline" : "default"}
                      disabled={hasRedeemed || pointsBalance < v.pointsCost}
                      onClick={() => handleRedeem(v)}
                      className="text-xs"
                    >
                      {hasRedeemed ? (
                        <>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Redeemed
                        </>
                      ) : (
                        "Redeem Voucher"
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
