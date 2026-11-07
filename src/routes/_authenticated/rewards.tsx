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
  Ticket,
  Clock,
  Crown,
  Copy,
  Check,
  TrendingUp,
  ShoppingBag,
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
  category: "Rental" | "Wash" | "Fuel" | "Lifestyle";
  icon: any;
  description: string;
}

interface RedeemedCoupon {
  id: string;
  title: string;
  code: string;
  expires: string;
  discount: string;
}

interface PointsTransaction {
  id: string;
  description: string;
  date: string;
  points: number;
  type: "earned" | "spent";
}

const REWARDS_CATALOG: RewardVoucher[] = [
  {
    id: "r1",
    title: "₹500 Off Self-Drive Rental",
    pointsCost: 500,
    category: "Rental",
    icon: Car,
    description: "Applicable on any 24h+ car or EV booking across India.",
  },
  {
    id: "r2",
    title: "Free Doorstep Foam Wash",
    pointsCost: 400,
    category: "Wash",
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
  {
    id: "r5",
    title: "₹1,000 Off Weekend Outstation Rental",
    pointsCost: 900,
    category: "Rental",
    icon: Car,
    description: "Valid on SUVs and premium sedans for trips longer than 48 hours.",
  },
  {
    id: "r6",
    title: "Complete Interior Deep Clean Wash",
    pointsCost: 650,
    category: "Wash",
    icon: Droplets,
    description: "Interior vacuuming, steam sanitized upholstery, and dashboard treatment.",
  },
];

const INITIAL_HISTORY: PointsTransaction[] = [
  { id: "t1", description: "Completed Trip: Bangalore -> Mysore (Creta)", date: "04 Nov 2026", points: 240, type: "earned" },
  { id: "t2", description: "Doorstep Premium Foam Wash", date: "01 Nov 2026", points: 30, type: "earned" },
  { id: "t3", description: "5-Star Vehicle Review Reward", date: "28 Oct 2026", points: 20, type: "earned" },
  { id: "t4", description: "Referral Bonus (Sneha Nair First Trip)", date: "24 Oct 2026", points: 500, type: "earned" },
  { id: "t5", description: "Driver Duty Hire (8 Hours)", date: "18 Oct 2026", points: 60, type: "earned" },
];

export function RewardsPage() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<"catalog" | "vouchers" | "history" | "tiers">("catalog");
  const [pointsBalance, setPointsBalance] = useState<number>(850);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [redeemedVouchers, setRedeemedVouchers] = useState<RedeemedCoupon[]>([
    { id: "v0", title: "₹300 IndianOil Fuel Card", code: "IOCL-SYN-98214", expires: "Valid till 30 Dec 2026", discount: "₹300" },
  ]);
  const [transactions, setTransactions] = useState<PointsTransaction[]>(INITIAL_HISTORY);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleRedeem = (voucher: RewardVoucher) => {
    if (pointsBalance < voucher.pointsCost) {
      return toast.error(`Insufficient points. You need ${voucher.pointsCost - pointsBalance} more points.`);
    }
    const newBalance = pointsBalance - voucher.pointsCost;
    setPointsBalance(newBalance);

    const generatedCode = `SYNC-${voucher.category.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCoupon: RedeemedCoupon = {
      id: String(Date.now()),
      title: voucher.title,
      code: generatedCode,
      expires: "Valid for 60 days",
      discount: voucher.title.split(" ")[0],
    };
    setRedeemedVouchers([newCoupon, ...redeemedVouchers]);

    const newTx: PointsTransaction = {
      id: String(Date.now()),
      description: `Redeemed ${voucher.title}`,
      date: "Just now",
      points: voucher.pointsCost,
      type: "spent",
    };
    setTransactions([newTx, ...transactions]);

    toast.success(`Redeemed ${voucher.title}! Coupon code: ${generatedCode}`);
  };

  const copyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Coupon code copied to clipboard!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCatalog = REWARDS_CATALOG.filter((v) =>
    selectedCategory === "All" || v.category === selectedCategory
  );

  const sidebarNavItems = [
    { id: "catalog", label: "Rewards Catalog", icon: ShoppingBag },
    { id: "vouchers", label: "My Vouchers", icon: Ticket, badge: String(redeemedVouchers.length) },
    { id: "history", label: "Points History", icon: TrendingUp },
    { id: "tiers", label: "Loyalty Tiers", icon: Crown, badge: "Gold" },
  ] as const;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-8 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Top Header Banner */}
        <div className="border-b border-border pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                  <Sparkles className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Loyalty Club
                </Badge>
                <Badge variant="secondary" className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Gold Tier Member
                </Badge>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
                Synchoo Rewards & Points
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Earn 5% back in points on all completed self-drive trips, driver hires, and doorstep washes.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right bg-card p-3 rounded-2xl border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Your Balance</span>
                <p className="font-display text-xl font-extrabold text-amber-600">
                  {pointsBalance} <span className="text-xs font-normal text-muted-foreground">pts ({currency(pointsBalance)})</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout with Page Sidebar */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Rewards Page Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Points Summary Card */}
              <Card className="p-4 border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Available Points</span>
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    1 pt = ₹1
                  </Badge>
                </div>
                <div className="font-display text-3xl font-black text-amber-600 mt-1">
                  {pointsBalance}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Redeemable for {currency(pointsBalance)} cash value</p>

                <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tier:</span>
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <Crown className="h-3.5 w-3.5 text-amber-500" /> Gold (5% return)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next Tier:</span>
                    <span className="font-medium text-muted-foreground">Platinum in 650 pts</span>
                  </div>
                </div>
              </Card>

              {/* Sidebar Navigation */}
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0" aria-label="Rewards navigation">
                {sidebarNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap text-left ${
                        isActive
                          ? "bg-brand text-brand-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`} />
                        <span>{item.label}</span>
                      </div>
                      {"badge" in item && (
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-[10px] px-1.5 py-0 ${
                            isActive ? "bg-white/20 text-brand-foreground border-transparent" : "text-muted-foreground"
                          }`}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Quick Earning Rule */}
              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/40">
                <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Rapid Point Multiplier
                </div>
                Booking with a Synchoo VIP pass yields 2x reward points on all self-drive rentals!
              </Card>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Rewards Catalog */}
            {activeTab === "catalog" && (
              <div className="space-y-6">
                {/* How to Earn Strip */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-3 text-center">
                    <Car className="mx-auto h-5 w-5 text-brand mb-1" />
                    <p className="text-xs font-semibold">Rent a Car or EV</p>
                    <p className="text-[10px] text-muted-foreground">50 pts / ₹1,000</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <Droplets className="mx-auto h-5 w-5 text-cyan-500 mb-1" />
                    <p className="text-xs font-semibold">Doorstep Wash</p>
                    <p className="text-[10px] text-muted-foreground">30 pts / booking</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <Award className="mx-auto h-5 w-5 text-amber-500 mb-1" />
                    <p className="text-xs font-semibold">Trip Reviews</p>
                    <p className="text-[10px] text-muted-foreground">20 pts / review</p>
                  </Card>
                </div>

                {/* Category Filters */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-bold">Redeemable Rewards</h2>
                  <div className="flex gap-1 overflow-x-auto text-xs">
                    {["All", "Rental", "Wash", "Fuel", "Lifestyle"].map((cat) => (
                      <Button
                        key={cat}
                        size="sm"
                        variant={selectedCategory === cat ? "default" : "outline"}
                        onClick={() => setSelectedCategory(cat)}
                        className="h-7 text-xs rounded-lg"
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Vouchers Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredCatalog.map((v) => {
                    const Icon = v.icon;
                    const canAfford = pointsBalance >= v.pointsCost;

                    return (
                      <Card key={v.id} className="p-4 flex flex-col justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                            <Icon className="h-5 w-5 text-brand" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{v.title}</p>
                            <Badge variant="outline" className="text-[10px] mt-1">{v.category}</Badge>
                            <p className="text-xs text-muted-foreground mt-1.5">{v.description}</p>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                          <span className="font-bold text-sm text-amber-600">{v.pointsCost} Points</span>
                          <Button
                            size="sm"
                            disabled={!canAfford}
                            onClick={() => handleRedeem(v)}
                            className="text-xs"
                          >
                            Redeem Voucher
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: My Redeemed Vouchers */}
            {activeTab === "vouchers" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-brand" /> Your Active Coupon Vouchers ({redeemedVouchers.length})
                    </CardTitle>
                    <CardDescription>
                      Copy these promo codes and paste them during checkout on your next rental, wash, or at partner outlets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {redeemedVouchers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        You have not redeemed any vouchers yet. Choose a reward from the catalog to get started.
                      </p>
                    ) : (
                      redeemedVouchers.map((coupon) => (
                        <div key={coupon.id} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{coupon.title}</span>
                              <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40">
                                Active
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{coupon.expires}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="font-mono text-sm font-bold bg-muted px-3 py-1.5 rounded-lg border border-border">
                              {coupon.code}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyVoucherCode(coupon.code)}
                              className="text-xs"
                            >
                              {copiedCode === coupon.code ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiedCode === coupon.code ? "Copied" : "Copy"}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 3: Points History */}
            {activeTab === "history" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-brand" /> Points Transaction History
                    </CardTitle>
                    <CardDescription>Detailed log of rewards points earned and redeemed</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-none text-xs">
                        <div>
                          <p className="font-medium text-sm">{tx.description}</p>
                          <p className="text-muted-foreground">{tx.date}</p>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold text-sm ${tx.type === "earned" ? "text-emerald-600" : "text-amber-600"}`}>
                            {tx.type === "earned" ? `+${tx.points}` : `-${tx.points}`} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 4: Loyalty Tiers */}
            {activeTab === "tiers" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Crown className="h-4 w-4 text-brand" /> Synchoo Loyalty Club Tiers & Benefits
                    </CardTitle>
                    <CardDescription>Level up as you ride and enjoy higher cash-back rates and exclusive perks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">Explorer (Entry)</span>
                          <Badge variant="outline">0 - 250 Pts</Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                          <li>2.5% points back on all rides</li>
                          <li>Standard customer support</li>
                          <li>Regular security deposit terms</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">Silver</span>
                          <Badge variant="outline">250 - 600 Pts</Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                          <li>3.5% points back on all rides</li>
                          <li>1 free car sanitization voucher</li>
                          <li>Expedited phone support</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-amber-700 dark:text-amber-300">Gold (Your Tier)</span>
                          <Badge className="bg-amber-600 text-white">Current</Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                          <li>5.0% points back on every booking</li>
                          <li>50% security deposit discount</li>
                          <li>Priority vehicle delivery dispatch</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">Platinum Elite</span>
                          <Badge variant="outline">1,500+ Pts</Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                          <li>7.5% points back on all trips</li>
                          <li>ZERO security deposit required</li>
                          <li>Dedicated fleet relationship manager</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
