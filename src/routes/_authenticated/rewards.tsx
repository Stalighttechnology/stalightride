import { createFileRoute, Link } from "@tanstack/react-router";
import { ComingSoonBanner, comingSoon } from "@/components/coming-soon";
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
  Copy,
  Crown,
  ChevronRight,
  TrendingUp,
  Tag,
  ShieldCheck,
  Check,
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
  category: "Rentals" | "Wash" | "Fuel" | "Lifestyle";
  icon: any;
  description: string;
  code: string;
}

interface ClaimedVoucher extends RewardVoucher {
  claimedAt: string;
  expiresAt: string;
}

const REWARDS_CATALOG: RewardVoucher[] = [
  {
    id: "r1",
    title: "₹500 Off Self-Drive Rental",
    pointsCost: 500,
    category: "Rentals",
    icon: Car,
    description: "Valid on any 24h+ car, EV or SUV reservation nationwide.",
    code: "SYN-RENT500-VIP",
  },
  {
    id: "r2",
    title: "Free Doorstep Foam Wash",
    pointsCost: 400,
    category: "Wash",
    icon: Droplets,
    description: "Complete exterior pressure foam wash & tyre dressing at your door.",
    code: "SYN-WASH-FREE",
  },
  {
    id: "r3",
    title: "₹300 IndianOil Fuel Gift Card",
    pointsCost: 300,
    category: "Fuel",
    icon: Fuel,
    description: "Digital IOCL e-fuel coupon redeemable at any pump nationwide.",
    code: "IOCL-FUEL-300",
  },
  {
    id: "r4",
    title: "Starbucks Beverage Voucher",
    pointsCost: 250,
    category: "Lifestyle",
    icon: Coffee,
    description: "Enjoy any complimentary handcrafted tall drink at Starbucks India.",
    code: "SBUX-COFFEE-SYN",
  },
  {
    id: "r5",
    title: "₹1,000 Luxury SUV Voucher",
    pointsCost: 900,
    category: "Rentals",
    icon: Crown,
    description: "Exclusive discount on premium BMW, Audi and Mercedes-Benz bookings.",
    code: "SYN-LUX-1000",
  },
];

const INITIAL_CLAIMED: ClaimedVoucher[] = [
  {
    id: "r2-claimed",
    title: "Free Doorstep Foam Wash",
    pointsCost: 400,
    category: "Wash",
    icon: Droplets,
    description: "Complete exterior pressure foam wash & tyre dressing at your door.",
    code: "SYN-WASH-OCT89",
    claimedAt: "25 Oct 2026",
    expiresAt: "25 Dec 2026",
  },
];

export function RewardsPage() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<"catalog" | "redeemed" | "earn-guide" | "tiers">("catalog");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const [pointsBalance, setPointsBalance] = useState<number>(850);
  const [claimedList, setClaimedList] = useState<ClaimedVoucher[]>(INITIAL_CLAIMED);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleRedeem = (voucher: RewardVoucher) => {
    comingSoon();
    return;
    if (pointsBalance < voucher.pointsCost) {
      return toast.error(`Insufficient points. You need ${voucher.pointsCost - pointsBalance} more points.`);
    }

    setPointsBalance((prev) => prev - voucher.pointsCost);

    const newClaimed: ClaimedVoucher = {
      ...voucher,
      id: `${voucher.id}-${Date.now()}`,
      claimedAt: "Just now",
      expiresAt: "In 60 days",
    };

    setClaimedList([newClaimed, ...claimedList]);
    toast.success(`Redeemed ${voucher.title}! Voucher saved to My Redeemed Vouchers.`);
  };

  const copyCode = (code: string) => {
    comingSoon();
    return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Promo code ${code} copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCatalog = REWARDS_CATALOG.filter(
    (v) => selectedCategory === "All" || v.category === selectedCategory
  );

  const sidebarNavItems = [
    { id: "catalog", label: "Points Catalog", icon: Award, badge: String(REWARDS_CATALOG.length) },
    { id: "redeemed", label: "My Vouchers", icon: Tag, badge: String(claimedList.length) },
    { id: "earn-guide", label: "How to Earn", icon: Zap },
    { id: "tiers", label: "Loyalty Tiers", icon: Crown },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        <ComingSoonBanner feature="Synchoo Rewards" />
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                <Sparkles className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Loyalty Club
              </Badge>
              <Badge variant="secondary" className="text-amber-800 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">
                Gold Tier Member
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              Synchoo Rewards & Point Hub
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Earn 5% back in points on every self-drive rental, driver booking, and car wash. 1 Point = ₹1.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/referrals">
                <Gift className="mr-1.5 h-3.5 w-3.5 text-brand" /> Refer & Earn ₹500
              </Link>
            </Button>
            <Button size="sm" onClick={() => setActiveTab("catalog")} className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Award className="mr-1.5 h-3.5 w-3.5" /> Redeem Points
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout with Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Rewards Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Points Card */}
              <Card className="p-4 border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase">
                  <span>Available Balance</span>
                  <Sparkles className="h-4 w-4 text-amber-500 fill-amber-400" />
                </div>
                <div className="font-display text-3xl font-extrabold text-amber-600 mt-1">
                  {pointsBalance} <span className="text-xs font-normal text-muted-foreground">Points</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Worth <span className="font-semibold text-foreground">{currency(pointsBalance)}</span> in savings
                </p>

                <div className="mt-3 pt-3 border-t border-border/80 space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Gold Tier</span>
                    <span className="font-medium text-amber-600">85% to Platinum</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: "85%" }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Earn 150 more points to unlock 1.5x Multiplier</p>
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

                {/* Direct Cross-link to Referrals Page */}
                <Link
                  to="/referrals"
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap text-left mt-2 border-t border-border/50 pt-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Gift className="h-4 w-4 shrink-0 text-brand" />
                    <span>Refer & Earn</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-brand bg-brand/10 border-brand/30">
                    ₹500 Bonus
                  </Badge>
                </Link>
              </nav>

              {/* Quick Info Box in Sidebar */}
              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/30">
                <p className="font-semibold text-foreground mb-1">Instant Redemption</p>
                Claimed vouchers appear immediately in your account and can be applied during booking checkout.
              </Card>
            </div>
          </aside>

          {/* Right Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Catalog */}
            {activeTab === "catalog" && (
              <div className="space-y-6">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {["All", "Rentals", "Wash", "Fuel", "Lifestyle"].map((cat) => (
                    <Button
                      key={cat}
                      size="sm"
                      variant={selectedCategory === cat ? "default" : "outline"}
                      onClick={() => setSelectedCategory(cat)}
                      className="rounded-full text-xs h-8"
                    >
                      {cat}
                    </Button>
                  ))}
                </div>

                {/* Rewards Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredCatalog.map((v) => {
                    const Icon = v.icon;
                    const canAfford = pointsBalance >= v.pointsCost;

                    return (
                      <Card key={v.id} className="p-4 flex flex-col justify-between hover:border-brand/40 transition-colors">
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
                            {canAfford ? "Redeem Voucher" : `Need ${v.pointsCost - pointsBalance} Pts`}
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: My Redeemed Vouchers */}
            {activeTab === "redeemed" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="h-4 w-4 text-brand" /> Claimed Reward Coupons & Vouchers
                      </CardTitle>
                      <CardDescription>Copy your promo code to apply on your next trip or booking</CardDescription>
                    </div>
                    <Badge variant="outline">{claimedList.length} Active Vouchers</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {claimedList.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No vouchers redeemed yet. Browse the Points Catalog to redeem your rewards!
                      </div>
                    ) : (
                      claimedList.map((v) => {
                        const Icon = v.icon;
                        const isCopied = copiedCode === v.code;
                        return (
                          <div key={v.id} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{v.title}</p>
                                <p className="text-xs text-muted-foreground">Claimed: {v.claimedAt} · Valid {v.expiresAt}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="font-mono text-xs font-bold bg-muted px-2.5 py-1.5 rounded-lg border border-border">
                                {v.code}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => copyCode(v.code)} className="h-8 text-xs">
                                <Copy className="mr-1 h-3.5 w-3.5" /> {isCopied ? "Copied" : "Copy"}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 3: How to Earn Points */}
            {activeTab === "earn-guide" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-brand" /> Points Earning Schedule
                    </CardTitle>
                    <CardDescription>Earn points on every rupee spent across all mobility services</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-brand" />
                          <p className="font-semibold text-sm">Self-Drive Rentals & EVs</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 50 Points for every ₹1,000 spent. Multiplier applied automatically for Gold & Platinum tiers.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-amber-500" />
                          <p className="font-semibold text-sm">Chauffeur & Driver Hires</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 60 Points for every ₹1,000 on daily or hourly driver duty bookings.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-cyan-500" />
                          <p className="font-semibold text-sm">Doorstep Vehicle Wash</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 30 Points flat on every completed exterior or interior doorstep wash booking.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-emerald-500" />
                          <p className="font-semibold text-sm">Trip Reviews & Ratings</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 20 Points on every helpful vehicle or driver review submitted after trip completion.
                        </p>
                      </div>
                    </div>
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
                      <Crown className="h-4 w-4 text-brand" /> Synchoo Membership Tiers & Privileges
                    </CardTitle>
                    <CardDescription>Higher tiers earn bonus multipliers and enjoy priority vehicle dispatch</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">Explorer Tier</span>
                          <Badge variant="outline">0 - 2 Trips</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Base 1x point accrual rate · Standard customer support.</p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-cyan-600">Silver Tier</span>
                          <Badge variant="outline">3 - 9 Trips</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">1.1x Points Multiplier · Free cancellation up to 6 hours before trip.</p>
                      </div>

                      <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-500/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-amber-700">Gold Tier (Your Current Tier)</span>
                          <Badge className="bg-amber-500 text-white">10 - 24 Trips</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">1.25x Points Multiplier · Priority vehicle delivery · 1 Free wash voucher/quarter.</p>
                      </div>

                      <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-violet-600">Platinum VIP</span>
                          <Badge variant="secondary" className="bg-violet-100 text-violet-800">25+ Trips</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">1.5x Points Multiplier · Zero security deposit · Dedicated fleet relationship manager.</p>
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
