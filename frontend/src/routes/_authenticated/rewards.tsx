import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Tag,
  Plus,
  Wallet,
  History,
  Search,
  ArrowRight,
  TrendingUp,
  ArrowDownLeft,
  Coins,
  ShieldCheck,
  Check,
  Percent,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: RewardsPage,
  head: () => ({
    meta: [
      { title: "Synchoo Rewards & Point Hub | 1 Point = ₹1" },
      {
        name: "description",
        content:
          "Earn points on every self-drive car rental, chauffeur booking, and doorstep car wash. Redeem points for fuel cards, free washes, or instant wallet cash.",
      },
      { property: "og:title", content: "Synchoo Rewards & Point Hub" },
      {
        property: "og:description",
        content: "Redeem points for real savings: fuel vouchers, free car washes, rental discounts, or wallet cash.",
      },
    ],
  }),
});

interface RewardVoucher {
  id: string;
  title: string;
  pointsCost: number;
  category: "Rentals" | "Wash" | "Fuel" | "Lifestyle" | "Carpool";
  icon: any;
  description: string;
  code: string;
  terms: string;
}

interface ClaimedVoucher extends RewardVoucher {
  claimedAt: string;
  expiresAt: string;
}

interface PointTransaction {
  id: string;
  title: string;
  amount: number; // positive for earned, negative for spent/converted
  type: "earned" | "redeemed" | "converted";
  date: string;
  description: string;
}

interface TierInfo {
  name: "Explorer" | "Silver" | "Gold" | "Platinum VIP";
  badgeColor: string;
  minPoints: number;
  nextTierPoints: number;
  multiplier: string;
  tripRange: string;
  perks: string[];
}

const TIERS: TierInfo[] = [
  {
    name: "Explorer",
    badgeColor: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300",
    minPoints: 0,
    nextTierPoints: 400,
    multiplier: "1.0x",
    tripRange: "0 - 2 Trips",
    perks: ["Base 1x point accrual rate", "Standard in-app support", "Full catalog access"],
  },
  {
    name: "Silver",
    badgeColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-300",
    minPoints: 400,
    nextTierPoints: 800,
    multiplier: "1.1x",
    tripRange: "3 - 9 Trips",
    perks: ["1.1x Points Multiplier", "Free cancellation up to 6 hours before trip", "10% off car washes"],
  },
  {
    name: "Gold",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300",
    minPoints: 800,
    nextTierPoints: 1500,
    multiplier: "1.25x",
    tripRange: "10 - 24 Trips",
    perks: ["1.25x Points Multiplier", "Priority vehicle delivery", "1 Free doorstep foam wash per quarter"],
  },
  {
    name: "Platinum VIP",
    badgeColor: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300",
    minPoints: 1500,
    nextTierPoints: 3000,
    multiplier: "1.5x",
    tripRange: "25+ Trips",
    perks: ["1.5x Points Multiplier", "Zero security deposit required", "Dedicated 24/7 personal concierge"],
  },
];

const REWARDS_CATALOG: RewardVoucher[] = [
  {
    id: "r1",
    title: "₹500 Off Self-Drive Rental",
    pointsCost: 500,
    category: "Rentals",
    icon: Car,
    description: "Valid on any 24h+ car, EV or SUV reservation nationwide.",
    code: "SYN-RENT500-VIP",
    terms: "Min booking value ₹2,000. Valid on all self-drive cars & EVs.",
  },
  {
    id: "r2",
    title: "Free Doorstep Foam Wash",
    pointsCost: 400,
    category: "Wash",
    icon: Droplets,
    description: "Complete exterior pressure foam wash & tyre dressing at your door.",
    code: "SYN-WASH-FREE",
    terms: "Includes doorstep water and power setup. Valid on all car classes.",
  },
  {
    id: "r3",
    title: "₹300 IndianOil Fuel Gift Card",
    pointsCost: 300,
    category: "Fuel",
    icon: Fuel,
    description: "Digital IOCL e-fuel coupon redeemable at any pump nationwide.",
    code: "IOCL-FUEL-300",
    terms: "Digital SMS fuel voucher redeemable at any IndianOil petrol pump.",
  },
  {
    id: "r4",
    title: "2 Hours Free Chauffeur Duty",
    pointsCost: 350,
    category: "Rentals",
    icon: Crown,
    description: "Get 2 complimentary hours with verified professional drivers.",
    code: "SYN-DRIVER-FREE",
    terms: "Applicable on 4h+ or 8h daily duty bookings across Bangalore.",
  },
  {
    id: "r5",
    title: "Starbucks Beverage Voucher",
    pointsCost: 250,
    category: "Lifestyle",
    icon: Coffee,
    description: "Enjoy any complimentary handcrafted tall drink at Starbucks India.",
    code: "SBUX-COFFEE-SYN",
    terms: "Present barcode or promo code at any participating Starbucks cafe.",
  },
  {
    id: "r6",
    title: "₹500 BPCL Speed Petrol Card",
    pointsCost: 500,
    category: "Fuel",
    icon: Fuel,
    description: "Instant fuel voucher for Bharat Petroleum Speed & EV charging.",
    code: "BPCL-FUEL-500",
    terms: "Redeemable at any Bharat Petroleum petrol pump or EV charging station.",
  },
  {
    id: "r7",
    title: "₹100 Carpool Ride Pass",
    pointsCost: 150,
    category: "Carpool",
    icon: Percent,
    description: "Save ₹100 instantly on your next daily commute carpooling seat.",
    code: "SYN-POOL-100",
    terms: "Applies on any confirmed daily or weekend carpooling seat booking.",
  },
  {
    id: "r8",
    title: "₹1,000 Luxury SUV Voucher",
    pointsCost: 900,
    category: "Rentals",
    icon: Crown,
    description: "Exclusive discount on premium BMW, Audi and Mercedes-Benz bookings.",
    code: "SYN-LUX-1000",
    terms: "Min booking value ₹5,000. Valid on luxury sedans & premium SUVs.",
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
    terms: "Includes doorstep water and power setup. Valid on all car classes.",
    claimedAt: "25 Oct 2026",
    expiresAt: "25 Dec 2026",
  },
];

const INITIAL_ACTIVITY: PointTransaction[] = [
  {
    id: "act-1",
    title: "Welcome Bonus",
    amount: 500,
    type: "earned",
    date: "10 Oct 2026",
    description: "Welcome to Synchoo Loyalty Club milestone bonus",
  },
  {
    id: "act-2",
    title: "Trip Cashback",
    amount: 250,
    type: "earned",
    date: "18 Oct 2026",
    description: "Self-drive booking SYN-TRIP-9842 completed",
  },
  {
    id: "act-3",
    title: "Doorstep Wash Reward",
    amount: 100,
    type: "earned",
    date: "24 Oct 2026",
    description: "Exterior foam wash completed at your address",
  },
  {
    id: "act-4",
    title: "Voucher Redemption",
    amount: -400,
    type: "redeemed",
    date: "25 Oct 2026",
    description: "Claimed Free Doorstep Foam Wash (SYN-WASH-OCT89)",
  },
];

export function RewardsPage() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<
    "catalog" | "redeemed" | "convert" | "activity" | "earn-guide" | "tiers"
  >("catalog");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activityFilter, setActivityFilter] = useState<"all" | "earned" | "redeemed">("all");

  const storageKey = user?.id ? `synchoo_rewards_${user.id}` : "synchoo_rewards_guest";

  const [pointsBalance, setPointsBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}_points`);
      return saved !== null ? Number(saved) : 850;
    } catch {
      return 850;
    }
  });

  const [claimedList, setClaimedList] = useState<ClaimedVoucher[]>(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}_vouchers`);
      return saved ? JSON.parse(saved) : INITIAL_CLAIMED;
    } catch {
      return INITIAL_CLAIMED;
    }
  });

  const [activity, setActivity] = useState<PointTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}_activity`);
      return saved ? JSON.parse(saved) : INITIAL_ACTIVITY;
    } catch {
      return INITIAL_ACTIVITY;
    }
  });

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [voucherToRedeem, setVoucherToRedeem] = useState<RewardVoucher | null>(null);
  const [customConvertAmount, setCustomConvertAmount] = useState<string>("100");
  const [isConverting, setIsConverting] = useState(false);

  // Dynamic Tier Calculation based on points balance
  const currentTier = useMemo(() => {
    if (pointsBalance >= 1500) return TIERS[3];
    if (pointsBalance >= 800) return TIERS[2];
    if (pointsBalance >= 400) return TIERS[1];
    return TIERS[0];
  }, [pointsBalance]);

  const nextTier = useMemo(() => {
    if (currentTier.name === "Platinum VIP") return null;
    if (currentTier.name === "Gold") return TIERS[3];
    if (currentTier.name === "Silver") return TIERS[2];
    return TIERS[1];
  }, [currentTier]);

  const pointsToNext = nextTier ? Math.max(0, nextTier.minPoints - pointsBalance) : 0;
  const tierProgressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          5,
          Math.round(
            ((pointsBalance - currentTier.minPoints) /
              (nextTier.minPoints - currentTier.minPoints)) *
              100,
          ),
        ),
      )
    : 100;

  const handleRedeem = (voucher: RewardVoucher) => {
    if (pointsBalance < voucher.pointsCost) {
      return toast.error(
        `Insufficient points. You need ${voucher.pointsCost - pointsBalance} more points.`,
      );
    }

    const nextPoints = pointsBalance - voucher.pointsCost;
    setPointsBalance(nextPoints);

    const newClaimed: ClaimedVoucher = {
      ...voucher,
      id: `${voucher.id}-${Date.now()}`,
      claimedAt: "Just now",
      expiresAt: "In 60 days",
    };

    const nextList = [newClaimed, ...claimedList];
    setClaimedList(nextList);

    const actItem: PointTransaction = {
      id: `act-${Date.now()}`,
      title: `Redeemed: ${voucher.title}`,
      amount: -voucher.pointsCost,
      type: "redeemed",
      date: "Just now",
      description: `Saved promo code ${voucher.code} to My Vouchers`,
    };
    const nextActivity = [actItem, ...activity];
    setActivity(nextActivity);

    try {
      localStorage.setItem(`${storageKey}_points`, String(nextPoints));
      localStorage.setItem(`${storageKey}_vouchers`, JSON.stringify(nextList));
      localStorage.setItem(`${storageKey}_activity`, JSON.stringify(nextActivity));
    } catch {}

    toast.success(`Redeemed ${voucher.title}! Voucher code ${voucher.code} saved to My Vouchers.`);
    setActiveTab("redeemed");
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Promo code ${code} copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleAddBonus = (amount: number = 250) => {
    const next = pointsBalance + amount;
    setPointsBalance(next);

    const actItem: PointTransaction = {
      id: `act-${Date.now()}`,
      title: "Loyalty Reward Bonus",
      amount,
      type: "earned",
      date: "Just now",
      description: `Promotional credit of ${amount} Synchoo loyalty points`,
    };
    const nextActivity = [actItem, ...activity];
    setActivity(nextActivity);

    try {
      localStorage.setItem(`${storageKey}_points`, String(next));
      localStorage.setItem(`${storageKey}_activity`, JSON.stringify(nextActivity));
    } catch {}
    toast.success(`Added ${amount} loyalty reward points to your balance!`);
  };

  const handleConvertToWallet = async (amountToConvert: number) => {
    if (pointsBalance < amountToConvert) {
      return toast.error(`Insufficient points. You only have ${pointsBalance} points available.`);
    }
    if (amountToConvert <= 0) {
      return toast.error("Please enter a valid points amount to convert.");
    }

    setIsConverting(true);
    const nextPoints = pointsBalance - amountToConvert;
    setPointsBalance(nextPoints);

    const actItem: PointTransaction = {
      id: `act-${Date.now()}`,
      title: "Converted to Wallet Cash",
      amount: -amountToConvert,
      type: "converted",
      date: "Just now",
      description: `Transferred ${currency(amountToConvert)} to Synchoo Wallet (1 Pt = ₹1)`,
    };
    const nextActivity = [actItem, ...activity];
    setActivity(nextActivity);

    try {
      localStorage.setItem(`${storageKey}_points`, String(nextPoints));
      localStorage.setItem(`${storageKey}_activity`, JSON.stringify(nextActivity));

      // Attempt to credit Supabase wallets table if signed in
      if (user?.id) {
        const { data: w } = await api
          .from("wallets")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();

        const currentBal = Number(w?.balance ?? 0);
        const newBal = currentBal + amountToConvert;

        await api.from("wallets").upsert({
          user_id: user.id,
          balance: newBal,
          updated_at: new Date().toISOString(),
        });

        await api.from("wallet_transactions").insert({
          user_id: user.id,
          amount: amountToConvert,
          kind: "promo_credit",
          description: `Converted ${amountToConvert} Synchoo Points to Wallet Cash`,
        });
      }
    } catch (e) {
      console.warn("Wallet credit updated locally:", e);
    } finally {
      setIsConverting(false);
    }

    toast.success(
      `Converted ${amountToConvert} Points to ${currency(amountToConvert)} Wallet Cash!`,
      {
        description: "Your Synchoo wallet has been credited and is ready for booking checkouts.",
      },
    );
  };

  const filteredCatalog = useMemo(() => {
    return REWARDS_CATALOG.filter((v) => {
      const matchesCategory = selectedCategory === "All" || v.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const filteredActivity = useMemo(() => {
    return activity.filter((item) => {
      if (activityFilter === "earned") return item.amount > 0;
      if (activityFilter === "redeemed") return item.amount < 0;
      return true;
    });
  }, [activity, activityFilter]);

  const sidebarNavItems = [
    { id: "catalog", label: "Points Catalog", icon: Award, badge: String(REWARDS_CATALOG.length) },
    { id: "redeemed", label: "My Vouchers", icon: Tag, badge: String(claimedList.length) },
    { id: "convert", label: "Convert to Wallet", icon: Wallet, badge: "Instant" },
    { id: "activity", label: "Points Activity", icon: History, badge: String(activity.length) },
    { id: "earn-guide", label: "How to Earn", icon: Zap },
    { id: "tiers", label: "Loyalty Tiers", icon: Crown },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40"
              >
                <Sparkles className="mr-1 h-3.5 w-3.5 fill-amber-400" /> Synchoo Loyalty Club
              </Badge>
              <Badge variant="secondary" className={currentTier.badgeColor}>
                <Crown className="mr-1 h-3 w-3" /> {currentTier.name} Member
              </Badge>
              <Badge
                variant="outline"
                className="text-xs border-emerald-500/50 text-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Live & Active
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              Synchoo Rewards & Point Hub
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Earn 5% back in points on every self-drive rental, driver booking, and car wash. 1
              Point = ₹1.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/referrals">
                <Gift className="mr-1.5 h-3.5 w-3.5 text-brand" /> Refer & Earn ₹500
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setActiveTab("catalog");
                toast.info("Choose any voucher below and click 'Redeem Voucher'!");
              }}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Award className="mr-1.5 h-3.5 w-3.5" /> Redeem Points
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout with Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Rewards Sidebar */}
          <aside className="lg:col-span-1 min-w-0">
            <div className="sticky top-20 space-y-4">
              {/* Points Card */}
              <Card className="p-4 border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background shadow-xs">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase">
                  <span>Available Balance</span>
                  <Sparkles className="h-4 w-4 text-amber-500 fill-amber-400" />
                </div>
                <div className="font-display text-3xl font-extrabold text-amber-600 mt-1">
                  {pointsBalance}{" "}
                  <span className="text-xs font-normal text-muted-foreground">Points</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Worth{" "}
                  <span className="font-semibold text-foreground">{currency(pointsBalance)}</span>{" "}
                  in savings
                </p>

                {/* Dynamic Tier Progress */}
                <div className="mt-3 pt-3 border-t border-border/80 space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">
                      {currentTier.name} Tier
                    </span>
                    <span className="font-semibold text-amber-600">
                      {nextTier ? `${tierProgressPercent}% to ${nextTier.name}` : "Max Tier Reached"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${tierProgressPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {nextTier
                      ? `Earn ${pointsToNext} more points to unlock ${nextTier.multiplier} Multiplier`
                      : "Enjoy highest 1.5x Multiplier & Platinum VIP perks"}
                  </p>
                </div>

                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs h-8 border-amber-400/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    onClick={() => handleAddBonus(250)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> +250 Bonus Points
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setActiveTab("convert")}
                  >
                    <Wallet className="mr-1.5 h-3.5 w-3.5 text-brand" /> Convert to Wallet Cash
                  </Button>
                </div>
              </Card>

              {/* Sidebar Navigation */}
              <nav
                className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible no-scrollbar pb-2 lg:pb-0 w-full"
                aria-label="Rewards navigation"
              >
                {sidebarNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors w-full text-left ${
                        isActive
                          ? "bg-brand text-brand-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {"badge" in item && (
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${
                            isActive
                              ? "bg-white/20 text-brand-foreground border-transparent"
                              : "text-muted-foreground"
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
                  className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full text-left mt-2 border-t border-border/50 pt-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Gift className="h-4 w-4 shrink-0 text-brand" />
                    <span className="truncate">Refer & Earn</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-brand bg-brand/10 border-brand/30 shrink-0"
                  >
                    ₹500 Bonus
                  </Badge>
                </Link>
              </nav>

              {/* Quick Info Box in Sidebar */}
              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/30">
                <p className="font-semibold text-foreground mb-1">Instant Redemption</p>
                Claimed vouchers appear immediately in your account and can be applied during
                booking checkout.
              </Card>
            </div>
          </aside>

          {/* Right Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Catalog */}
            {activeTab === "catalog" && (
              <div className="space-y-6">
                {/* Search & Category Filter Controls */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search vouchers by service, fuel brand, or perk..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-xs sm:text-sm bg-card"
                    />
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {["All", "Rentals", "Wash", "Fuel", "Lifestyle", "Carpool"].map((cat) => (
                      <Button
                        key={cat}
                        size="sm"
                        variant={selectedCategory === cat ? "default" : "outline"}
                        onClick={() => setSelectedCategory(cat)}
                        className="rounded-full text-xs h-8 shrink-0"
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Rewards Grid */}
                {filteredCatalog.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    No reward vouchers found matching &quot;{searchQuery}&quot;. Try resetting your filters.
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filteredCatalog.map((v) => {
                      const Icon = v.icon;
                      const canAfford = pointsBalance >= v.pointsCost;

                      return (
                        <Card
                          key={v.id}
                          className="p-4 flex flex-col justify-between hover:border-brand/40 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                              <Icon className="h-5 w-5 text-brand" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{v.title}</p>
                              <Badge variant="outline" className="text-[10px] mt-1">
                                {v.category}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1.5">{v.description}</p>
                              <p className="text-[11px] text-muted-foreground/80 mt-1">
                                {v.terms}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                            <span className="font-bold text-sm text-amber-600">
                              {v.pointsCost} Points
                            </span>
                            <Button
                              size="sm"
                              disabled={!canAfford}
                              onClick={() => setVoucherToRedeem(v)}
                              className="text-xs"
                            >
                              {canAfford
                                ? "Redeem Voucher"
                                : `Need ${v.pointsCost - pointsBalance} Pts`}
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
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
                      <CardDescription>
                        Copy your promo code to apply on your next trip or booking
                      </CardDescription>
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
                          <div
                            key={v.id}
                            className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{v.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Claimed: {v.claimedAt} · Valid {v.expiresAt}
                                </p>
                                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                  {v.terms}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-mono text-xs font-bold bg-muted px-2.5 py-1.5 rounded-lg border border-border">
                                {v.code}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyCode(v.code)}
                                className="h-8 text-xs"
                              >
                                <Copy className="mr-1 h-3.5 w-3.5" /> {isCopied ? "Copied" : "Copy"}
                              </Button>
                              <Button
                                size="sm"
                                asChild
                                className="h-8 text-xs bg-brand text-brand-foreground hover:bg-brand/90"
                                onClick={() => {
                                  navigator.clipboard.writeText(v.code);
                                  toast.info(`Code ${v.code} copied! Redirecting to booking...`);
                                }}
                              >
                                <Link
                                  to={
                                    v.category === "Wash"
                                      ? "/wash"
                                      : v.category === "Carpool"
                                        ? "/pooling"
                                        : v.code.includes("DRIVER")
                                          ? "/drivers"
                                          : "/browse"
                                  }
                                >
                                  Book & Apply
                                </Link>
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

            {/* Tab 3: Convert Points to Wallet Cash */}
            {activeTab === "convert" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-brand" /> Convert Points to Synchoo Wallet Cash
                    </CardTitle>
                    <CardDescription>
                      Exchange your loyalty points directly into wallet credits (1 Point = ₹1 Cash).
                      Credits can be spent immediately on any rental, driver, carpool, or wash booking.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Preset Conversion Packs */}
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                      {[100, 250, 500, 1000].map((amt) => {
                        const canConvert = pointsBalance >= amt;
                        return (
                          <div
                            key={amt}
                            className={`p-4 rounded-xl border transition-all text-center space-y-2 ${
                              canConvert
                                ? "border-brand/30 bg-brand/5 hover:border-brand"
                                : "border-border bg-muted/30 opacity-70"
                            }`}
                          >
                            <p className="font-display text-2xl font-bold text-foreground">
                              {currency(amt)}
                            </p>
                            <p className="text-xs text-muted-foreground">{amt} Synchoo Points</p>
                            <Button
                              size="sm"
                              disabled={!canConvert || isConverting}
                              onClick={() => handleConvertToWallet(amt)}
                              className="w-full text-xs h-8"
                              variant={canConvert ? "default" : "outline"}
                            >
                              {canConvert ? "Convert Now" : `Need ${amt - pointsBalance} Pts`}
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom Amount Conversion */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <p className="font-semibold text-sm">Custom Point Conversion</p>
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="relative flex-1 w-full">
                          <Input
                            type="number"
                            min="1"
                            max={pointsBalance}
                            value={customConvertAmount}
                            onChange={(e) => setCustomConvertAmount(e.target.value)}
                            className="pr-16 text-sm"
                            placeholder="Points to convert"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                            Points
                          </span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Button
                            onClick={() => handleConvertToWallet(Number(customConvertAmount))}
                            disabled={
                              isConverting ||
                              Number(customConvertAmount) <= 0 ||
                              Number(customConvertAmount) > pointsBalance
                            }
                            className="w-full sm:w-auto bg-brand text-brand-foreground"
                          >
                            <Coins className="mr-1.5 h-4 w-4" /> Convert to{" "}
                            {currency(Number(customConvertAmount) || 0)} Cash
                          </Button>
                          <Button asChild variant="outline">
                            <Link to="/wallet">View Wallet</Link>
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your converted cash never expires and applies automatically during checkout.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 4: Points Activity & Transaction History */}
            {activeTab === "activity" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4 text-brand" /> Points Ledger & Activity History
                      </CardTitle>
                      <CardDescription>
                        Complete chronological record of points earned, spent, and converted
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs">
                      {(["all", "earned", "redeemed"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setActivityFilter(mode)}
                          className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                            activityFilter === mode
                              ? "bg-background text-foreground font-semibold shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {mode === "all" ? "All" : mode === "earned" ? "Earned" : "Redeemed"}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredActivity.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No activity found for this filter.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {filteredActivity.map((item) => (
                          <div
                            key={item.id}
                            className="py-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                  item.amount > 0
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : item.type === "converted"
                                      ? "bg-blue-500/10 text-blue-600"
                                      : "bg-amber-500/10 text-amber-600"
                                }`}
                              >
                                {item.amount > 0 ? (
                                  <TrendingUp className="h-4 w-4" />
                                ) : item.type === "converted" ? (
                                  <Wallet className="h-4 w-4" />
                                ) : (
                                  <Tag className="h-4 w-4" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{item.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.description} · {item.date}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className={`font-bold text-sm ${
                                  item.amount > 0 ? "text-emerald-600" : "text-amber-600"
                                }`}
                              >
                                {item.amount > 0 ? `+${item.amount}` : item.amount} Points
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 5: How to Earn Points */}
            {activeTab === "earn-guide" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-brand" /> Points Earning Schedule
                    </CardTitle>
                    <CardDescription>
                      Earn points on every rupee spent across all mobility services
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-brand" />
                          <p className="font-semibold text-sm">Self-Drive Rentals & EVs</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 50 Points for every ₹1,000 spent. Multiplier applied automatically
                          for Silver, Gold & Platinum tiers.
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
                          Earn 30 Points flat on every completed exterior or interior doorstep wash
                          booking.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-emerald-500" />
                          <p className="font-semibold text-sm">Trip Reviews & Ratings</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Earn 20 Points on every helpful vehicle or driver review submitted after
                          trip completion.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-brand/20 bg-brand/5 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          Earn 500 Bonus Points via Referrals
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Invite colleagues to Synchoo. You get ₹500 in points and they get ₹500 welcome discount!
                        </p>
                      </div>
                      <Button asChild size="sm">
                        <Link to="/referrals">Invite Friends</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 6: Loyalty Tiers */}
            {activeTab === "tiers" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Crown className="h-4 w-4 text-brand" /> Synchoo Membership Tiers & Privileges
                    </CardTitle>
                    <CardDescription>
                      Higher tiers earn bonus multipliers and enjoy priority vehicle dispatch
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {TIERS.map((tier) => {
                        const isCurrent = currentTier.name === tier.name;
                        return (
                          <div
                            key={tier.name}
                            className={`p-4 rounded-xl border transition-all space-y-2 ${
                              isCurrent
                                ? "border-2 border-amber-400 bg-amber-500/5 shadow-xs"
                                : "border-border bg-card"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold text-sm ${
                                  isCurrent ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                                }`}
                              >
                                {tier.name} {isCurrent && "(Current Tier)"}
                              </span>
                              <Badge variant={isCurrent ? "default" : "outline"}>
                                {tier.tripRange}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {tier.perks.map((p, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                  <span>{p}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Voucher Redemption Confirmation Dialog */}
      <AlertDialog
        open={Boolean(voucherToRedeem)}
        onOpenChange={(open) => {
          if (!open) setVoucherToRedeem(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" /> Confirm Voucher Redemption
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-left text-xs sm:text-sm text-muted-foreground">
                {voucherToRedeem && (
                  <>
                    <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-sm">
                          {voucherToRedeem.title}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {voucherToRedeem.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {voucherToRedeem.description}
                      </p>
                      <div className="pt-2 border-t border-border/60 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Voucher Points Cost:</span>
                          <span className="text-amber-600 font-bold">
                            {voucherToRedeem.pointsCost} Points
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Current Balance:</span>
                          <span className="font-semibold text-foreground">
                            {pointsBalance} Points
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Balance After Redemption:</span>
                          <span className="font-bold text-foreground">
                            {pointsBalance - voucherToRedeem.pointsCost} Points
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Are you sure you want to redeem this reward?{" "}
                      <strong className="text-foreground">
                        {voucherToRedeem.pointsCost} Points
                      </strong>{" "}
                      will be deducted from your account, and your promo code will be saved to{" "}
                      <strong className="text-foreground">My Vouchers</strong>.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => setVoucherToRedeem(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voucherToRedeem) {
                  handleRedeem(voucherToRedeem);
                  setVoucherToRedeem(null);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm & Redeem
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
