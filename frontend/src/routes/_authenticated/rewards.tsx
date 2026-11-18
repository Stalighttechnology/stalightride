import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import {
  Search,
  Share2,
  Info,
  Star,
  Copy,
  Check,
  Sparkles,
  Ticket,
  ChevronRight,
  CheckCircle2,
  Clock,
  Car,
  Droplets,
  Crown,
  History,
  TrendingUp,
  X,
  Gift,
  HelpCircle,
  FileText,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getRewardsSummary,
  redeemRewardVoucher,
} from "@/lib/actions";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: StarlightRewardsPage,
  head: () => ({
    meta: [
      { title: "Starlight Rewards | Synchoo Mobility Club" },
      {
        name: "description",
        content:
          "Unlock self-drive rental discounts, complimentary doorstep car washes, and verified chauffeur passes with your Starlight loyalty points.",
      },
    ],
  }),
});

interface RewardDeal {
  id: string;
  brand: string;
  category: "Rentals" | "Wash" | "Chauffeur";
  service: "rental" | "wash" | "driver";
  discountAmount: number;
  badgeTag?: string;
  title: string;
  discountValue: string;
  terms: string;
  pointsCost: number;
  promoCode: string;
  image: string;
  serviceLink: string;
  howToRedeem: string[];
  fullTerms: string[];
}

interface PointHistoryItem {
  id: string;
  title: string;
  reason: string;
  points: number; // positive = earned, negative = spent
  date: string;
  category: "Rental" | "Wash" | "Chauffeur" | "Referral" | "Review" | "Redemption" | "Milestone";
}

// Starlight Brand Emblem component (zero broken image risk)
function StarlightBrandLogo({
  brand,
  size = "md",
}: {
  brand: string;
  size?: "sm" | "md" | "lg";
}) {
  const isWash = brand.toLowerCase().includes("wash");
  const isDriver =
    brand.toLowerCase().includes("driver") || brand.toLowerCase().includes("chauffeur");
  const sizeClasses = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  if (isWash) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-xs border border-cyan-400/40 shrink-0`}
      >
        <Droplets className={iconSize} />
      </div>
    );
  }
  if (isDriver) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-white shadow-xs border border-amber-400/40 shrink-0`}
      >
        <Crown className={iconSize} />
      </div>
    );
  }
  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 flex items-center justify-center text-white shadow-xs border border-indigo-400/40 shrink-0`}
    >
      <Car className={iconSize} />
    </div>
  );
}

// 1:1 Square Media component with discount tag and error fallback
function StarlightCardMedia({
  image,
  title,
  discountValue,
  service,
}: {
  image: string;
  title: string;
  discountValue: string;
  service: "rental" | "wash" | "driver";
}) {
  const [error, setError] = useState(false);

  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-muted/60 border border-border group-hover:border-brand/40 transition-all flex items-center justify-center">
      {error ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-muted via-background to-brand/10 text-center">
          {service === "rental" ? (
            <Car className="h-10 w-10 text-indigo-500 mb-1" />
          ) : service === "wash" ? (
            <Droplets className="h-10 w-10 text-cyan-500 mb-1" />
          ) : (
            <Crown className="h-10 w-10 text-amber-500 mb-1" />
          )}
          <span className="text-xs font-bold text-foreground">Starlight Pass</span>
        </div>
      ) : (
        <img
          src={image}
          alt={title}
          loading="lazy"
          onError={() => setError(true)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      {/* Discount Pill Badge */}
      <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md text-amber-400 border border-amber-500/30 text-[11px] font-black tracking-wide shadow-md">
        {discountValue}
      </div>
    </div>
  );
}

// Strictly Starlight-Exclusive Mobility Coupons Catalog
const REWARDS_CATALOG: RewardDeal[] = [
  // 1. Self-Drive Car Rentals
  {
    id: "rw-1",
    brand: "Starlight Ride",
    category: "Rentals",
    service: "rental",
    discountAmount: 500,
    badgeTag: "🔥 Most Popular",
    title: "Flat ₹500 OFF on Luxury & SUV Self-Drive Rentals",
    discountValue: "₹500 OFF",
    terms: "Min. booking value ₹2,000 • Valid on all SUVs, sedans & EVs",
    pointsCost: 500,
    promoCode: "STAR-RENT500",
    image:
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/browse",
    howToRedeem: [
      "Click 'Unlock Voucher' below to redeem your points.",
      "Copy your unique promo code STAR-RENT500-XXXXX.",
      "Go to Rentals, select any self-drive car or EV, and paste the coupon at checkout for an instant ₹500 discount.",
    ],
    fullTerms: [
      "Valid exclusively on self-drive car reservations of 24 hours or longer.",
      "Applicable to verified drivers with valid Driving License.",
      "Promo code is valid for 60 calendar days from redemption.",
      "Account-locked: Only your account can apply this coupon.",
    ],
  },
  {
    id: "rw-2",
    brand: "Starlight Ride",
    category: "Rentals",
    service: "rental",
    discountAmount: 300,
    badgeTag: "⭐ Weekend Pick",
    title: "Flat ₹300 OFF on Weekend Self-Drive Getaways",
    discountValue: "₹300 OFF",
    terms: "Min. booking value ₹1,200 • Valid on 2+ day weekend trips",
    pointsCost: 300,
    promoCode: "STAR-WKND300",
    image:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/browse",
    howToRedeem: [
      "Unlock this voucher using 300 Starlight points.",
      "Apply the unique coupon code on any Friday-to-Sunday self-drive trip.",
      "Enjoy an instant ₹300 reduction on your booking fare.",
    ],
    fullTerms: [
      "Valid on reservations starting Friday through Sunday.",
      "Can be applied on hatchbacks, sedans, and compact SUVs.",
      "Valid for 60 days from issuance.",
    ],
  },
  {
    id: "rw-3",
    brand: "Starlight Ride",
    category: "Rentals",
    service: "rental",
    discountAmount: 1000,
    badgeTag: "👑 High Value",
    title: "Flat ₹1,000 OFF on 5+ Days Road-Trip Rentals",
    discountValue: "₹1,000 OFF",
    terms: "Min. booking value ₹5,000 • Valid on extended road trips",
    pointsCost: 900,
    promoCode: "STAR-EXP1000",
    image:
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/browse",
    howToRedeem: [
      "Redeem 900 points to unlock this premier expedition voucher.",
      "Select a rental duration of 5 days or longer on any vehicle.",
      "Apply the code at checkout for an instant ₹1,000 deduction.",
    ],
    fullTerms: [
      "Requires minimum booking duration of 5 full days (120 hours).",
      "Valid on premium SUVs, 7-seaters, and long-range electric vehicles.",
      "Account-locked and single-use.",
    ],
  },
  {
    id: "rw-4",
    brand: "Starlight Ride",
    category: "Rentals",
    service: "rental",
    discountAmount: 150,
    badgeTag: "⚡ Zero Minimum",
    title: "Flat ₹150 OFF on Hourly & Airport City Car Rentals",
    discountValue: "₹150 OFF",
    terms: "No minimum fare required • Instant deduction on any car",
    pointsCost: 150,
    promoCode: "STAR-CITY150",
    image:
      "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/browse",
    howToRedeem: [
      "Unlock with 150 points for quick city errands or airport pickups.",
      "Choose any available vehicle in your city.",
      "Apply code at checkout with zero minimum billing threshold.",
    ],
    fullTerms: [
      "No minimum booking amount required.",
      "Valid for all vehicle categories.",
      "Valid for 60 calendar days.",
    ],
  },

  // 2. Doorstep Car Wash Services
  {
    id: "rw-5",
    brand: "Starlight Wash",
    category: "Wash",
    service: "wash",
    discountAmount: 400,
    badgeTag: "✨ Complimentary",
    title: "Free Doorstep Pressure Foam Wash (100% OFF)",
    discountValue: "FREE WASH",
    terms: "Exterior snow foam wash, tyre dressing & rim gloss at doorstep",
    pointsCost: 400,
    promoCode: "STAR-WASH-FREE",
    image:
      "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/wash",
    howToRedeem: [
      "Unlock this voucher using 400 loyalty points.",
      "Head to Doorstep Wash, choose your car class and schedule a slot.",
      "Enter your unique code to reduce the service price to ₹0.",
    ],
    fullTerms: [
      "Valid exclusively on Doorstep Car Wash bookings.",
      "Our mobile van brings its own power generator and filtered water.",
      "Valid across Bangalore, Mumbai, Delhi NCR, and Hyderabad.",
    ],
  },
  {
    id: "rw-6",
    brand: "Starlight Wash",
    category: "Wash",
    service: "wash",
    discountAmount: 300,
    badgeTag: "🧼 Deep Clean",
    title: "Flat ₹300 OFF on Complete Interior Detailing & Steam",
    discountValue: "₹300 OFF",
    terms: "Deep cabin vacuum, leather conditioning & AC steam sanitization",
    pointsCost: 300,
    promoCode: "STAR-INT300",
    image:
      "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/wash",
    howToRedeem: [
      "Unlock with 300 points.",
      "Select Interior Detailing or Full Spa Wash in the wash booking form.",
      "Apply the code at checkout for an instant ₹300 discount.",
    ],
    fullTerms: [
      "Valid on Interior Spa and Comprehensive Detailing packages.",
      "Includes 99.9% antibacterial steam clean.",
      "Valid for 60 days.",
    ],
  },
  {
    id: "rw-7",
    brand: "Starlight Wash",
    category: "Wash",
    service: "wash",
    discountAmount: 150,
    badgeTag: "🌿 Eco Clean",
    title: "Flat ₹150 OFF on Eco-Waterless Express Car Wash",
    discountValue: "₹150 OFF",
    terms: "Ceramic polymer waterless wash & microfiber shine at parking",
    pointsCost: 150,
    promoCode: "STAR-ECO150",
    image:
      "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/wash",
    howToRedeem: [
      "Redeem 150 points to receive your discount voucher.",
      "Book an Express Waterless wash at your apartment or office parking.",
      "Apply code at checkout for instant ₹150 savings.",
    ],
    fullTerms: [
      "Valid on express waterless wash services.",
      "Uses eco-friendly biodegradable polymer solution.",
      "Valid for 60 days.",
    ],
  },

  // 3. Chauffeur & Verified Driver Duty
  {
    id: "rw-8",
    brand: "Starlight Chauffeur",
    category: "Chauffeur",
    service: "driver",
    discountAmount: 350,
    badgeTag: "⭐ VIP Duty",
    title: "2 Hours Free Verified Chauffeur Duty (₹350 Value)",
    discountValue: "2 HRS FREE",
    terms: "Valid on daily or hourly professional chauffeur duty bookings",
    pointsCost: 350,
    promoCode: "STAR-DRIVER-2HR",
    image:
      "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/drivers",
    howToRedeem: [
      "Redeem 350 points to unlock 2 free hours of professional driver duty.",
      "Head to 'Hire Driver', choose an hourly or full-day duty, and enter the code.",
      "The value of 2 duty hours (₹350) is discounted automatically.",
    ],
    fullTerms: [
      "Valid exclusively on Hire Driver / Chauffeur bookings.",
      "Applicable on 4h, 8h or full-day duty reservations.",
      "Drivers are police-verified, background checked, and uniformed.",
    ],
  },
  {
    id: "rw-9",
    brand: "Starlight Chauffeur",
    category: "Chauffeur",
    service: "driver",
    discountAmount: 250,
    badgeTag: "🛣️ Highway Duty",
    title: "Flat ₹250 OFF on Outstation Highway Driver Bookings",
    discountValue: "₹250 OFF",
    terms: "Experienced highway driver for your personal vehicle round-trip",
    pointsCost: 250,
    promoCode: "STAR-HWY250",
    image:
      "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/drivers",
    howToRedeem: [
      "Redeem 250 points for your outstation road trip.",
      "Book an outstation driver for your intercity trip.",
      "Apply code at checkout for instant ₹250 off.",
    ],
    fullTerms: [
      "Valid on outstation duty bookings of 1 day or longer.",
      "Driver has minimum 5+ years verified highway driving experience.",
      "Valid for 60 days.",
    ],
  },
  {
    id: "rw-10",
    brand: "Starlight Chauffeur",
    category: "Chauffeur",
    service: "driver",
    discountAmount: 150,
    badgeTag: "🏙️ City Driver",
    title: "Flat ₹150 OFF on City Meeting & Dinner Chauffeur Duty",
    discountValue: "₹150 OFF",
    terms: "Sit back and let our professional driver navigate traffic",
    pointsCost: 150,
    promoCode: "STAR-CITY150D",
    image:
      "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=600&h=600&q=80",
    serviceLink: "/drivers",
    howToRedeem: [
      "Unlock with 150 points for your city meetings or night outs.",
      "Book a 4-hour city driver duty slot.",
      "Apply code at checkout for instant savings.",
    ],
    fullTerms: [
      "Valid on 4-hour or longer city duty bookings.",
      "Includes waiting time and multiple stops.",
      "Valid for 60 calendar days.",
    ],
  },
];

const INITIAL_HISTORY: PointHistoryItem[] = [
  {
    id: "h-1",
    title: "Welcome Milestone Bonus",
    reason: "Joined Starlight Mobility Club milestone welcome award",
    points: 1500,
    date: "10 Oct 2026",
    category: "Milestone",
  },
  {
    id: "h-2",
    title: "Self-Drive Rental Completed",
    reason: "Completed 3-day booking for Mahindra XUV700 (SYN-TRIP-9842)",
    points: 350,
    date: "14 Nov 2026",
    category: "Rental",
  },
  {
    id: "h-3",
    title: "Doorstep Pressure Foam Wash",
    reason: "Exterior pressure foam wash completed at residence",
    points: 120,
    date: "08 Nov 2026",
    category: "Wash",
  },
  {
    id: "h-4",
    title: "Verified Chauffeur Duty Completed",
    reason: "Completed 8-hour city executive driver booking",
    points: 180,
    date: "02 Nov 2026",
    category: "Chauffeur",
  },
  {
    id: "h-5",
    title: "Referral Bonus Credited",
    reason: "Your friend completed their first Starlight self-drive rental",
    points: 500,
    date: "28 Oct 2026",
    category: "Referral",
  },
  {
    id: "h-6",
    title: "Vehicle Review & Feedback",
    reason: "Submitted verified rating & review for vehicle cleanliness",
    points: 50,
    date: "25 Oct 2026",
    category: "Review",
  },
];

interface RedeemedRewardItem {
  id: string;
  voucherId: string;
  brand: string;
  title: string;
  code: string;
  category: string;
  service: "rental" | "driver" | "wash";
  pointsCost: number;
  claimedAt: string;
  expiresAt: string;
  terms: string;
  serviceLink: string;
}

const INITIAL_REDEEMED: RedeemedRewardItem[] = [
  {
    id: "cl-1",
    voucherId: "rw-1",
    brand: "Starlight Ride",
    title: "Flat ₹500 OFF on Luxury & SUV Self-Drive Rentals",
    code: "STAR-RENT500-VIP",
    category: "Rentals",
    service: "rental",
    pointsCost: 500,
    claimedAt: "12 Nov 2026",
    expiresAt: "12 Jan 2027",
    terms: "Min. booking value ₹2,000. Valid exclusively on self-drive cars.",
    serviceLink: "/browse",
  },
];

// Clean category filter pills
const CATEGORIES = [
  { id: "All", label: "✨ All Perks", service: "all" },
  { id: "Rentals", label: "🚗 Self-Drive Rentals", service: "rental" },
  { id: "Wash", label: "🧼 Doorstep Car Wash", service: "wash" },
  { id: "Chauffeur", label: "👨‍✈️ Verified Chauffeurs", service: "driver" },
  { id: "FleetPass", label: "⚡ Multi-Day Fleet Passes", service: "fleet" },
] as const;

export function StarlightRewardsPage() {
  const { user } = useSession();

  // Primary Tabs: "explore" vs "redeemed"
  const [activeTab, setActiveTab] = useState<"explore" | "redeemed">("explore");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedRedeemedCategory, setSelectedRedeemedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "earned" | "spent">("all");
  const [selectedDealForModal, setSelectedDealForModal] = useState<RewardDeal | null>(null);

  // Points & Vouchers State
  const [pointsBalance, setPointsBalance] = useState<number>(1500);
  const [currentTier, setCurrentTier] = useState<string>("Platinum VIP");
  const [historyList, setHistoryList] = useState<PointHistoryItem[]>(INITIAL_HISTORY);
  const [redeemedList, setRedeemedList] = useState<RedeemedRewardItem[]>(INITIAL_REDEEMED);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load real user summary from backend
  const loadData = useCallback(async () => {
    try {
      const res = await getRewardsSummary({ data: {} });
      if (res) {
        if (typeof res.pointsBalance === "number") setPointsBalance(res.pointsBalance);
        if (res.currentTier) setCurrentTier(res.currentTier);
        if (res.activity && res.activity.length > 0) {
          const mapped: PointHistoryItem[] = res.activity.map((act) => ({
            id: act.id,
            title: act.title,
            reason: act.description,
            points: act.amount,
            date: new Date(act.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            category:
              act.amount > 0
                ? act.title.includes("Wash")
                  ? "Wash"
                  : act.title.includes("Chauffeur")
                    ? "Chauffeur"
                    : "Rental"
                : "Redemption",
          }));
          setHistoryList(mapped);
        }
        if (res.claimedVouchers && res.claimedVouchers.length > 0) {
          const mappedVouchers = res.claimedVouchers.map((v) => {
            const matched = REWARDS_CATALOG.find(
              (c) => c.title === v.title || c.id === v.voucherId,
            );
            const targetService =
              matched?.service ||
              (v.category === "Wash" || v.title.includes("Wash")
                ? "wash"
                : v.title.includes("Chauffeur") || v.title.includes("Driver")
                  ? "driver"
                  : "rental");
            return {
              id: v.id,
              voucherId: v.voucherId || v.id,
              brand:
                matched?.brand ||
                (targetService === "wash"
                  ? "Starlight Wash"
                  : targetService === "driver"
                    ? "Starlight Chauffeur"
                    : "Starlight Ride"),
              title: v.title,
              code: v.code,
              category: v.category,
              service: targetService,
              pointsCost: v.pointsCost,
              claimedAt: new Date(v.claimedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              expiresAt: new Date(v.expiresAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              terms: v.terms || "Valid exclusively on Starlight bookings",
              serviceLink:
                matched?.serviceLink ||
                (targetService === "wash"
                  ? "/wash"
                  : targetService === "driver"
                    ? "/drivers"
                    : "/browse"),
            };
          });
          setRedeemedList(mappedVouchers);
        }
      }
    } catch {
      // Graceful local fallback
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Promo code ${code} copied!`, {
      description: "Paste at checkout for instant discount.",
    });
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Claim voucher action
  const handleClaimReward = async (deal: RewardDeal) => {
    if (pointsBalance < deal.pointsCost) {
      toast.error(
        `Insufficient points. You need ${deal.pointsCost - pointsBalance} more points.`,
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await redeemRewardVoucher({
        voucherId: deal.id,
        pointsCost: deal.pointsCost,
        title: deal.title,
        category: deal.category,
        service: deal.service,
        discountAmount: deal.discountAmount,
        codePrefix: deal.promoCode.split("-").slice(0, 2).join("-"),
        terms: deal.terms,
      });

      const newBalance =
        typeof res?.pointsBalance === "number"
          ? res.pointsBalance
          : Math.max(0, pointsBalance - deal.pointsCost);
      setPointsBalance(newBalance);

      const finalCode = res?.voucher?.code || deal.promoCode;
      const newRedeemed = {
        id: res?.voucher?.id || `cl-${Date.now()}`,
        voucherId: deal.id,
        brand: deal.brand,
        title: deal.title,
        code: finalCode,
        category: deal.category,
        service: deal.service,
        pointsCost: deal.pointsCost,
        claimedAt: "Just now",
        expiresAt: "In 60 days",
        terms: deal.terms,
        serviceLink: deal.serviceLink,
      };

      setRedeemedList([newRedeemed, ...redeemedList]);

      // Add to history
      const newHistoryItem: PointHistoryItem = {
        id: `h-${Date.now()}`,
        title: `Redeemed: ${deal.title}`,
        reason: `Unlocked ${deal.brand} voucher (${finalCode})`,
        points: -deal.pointsCost,
        date: "Just now",
        category: "Redemption",
      };
      setHistoryList([newHistoryItem, ...historyList]);

      setSelectedDealForModal(null);
      setActiveTab("redeemed");
      toast.success(`Redeemed ${deal.title}!`, {
        description: `Promo code ${finalCode} is ready in My Redeemed Rewards.`,
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to redeem reward. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Catalog
  const filteredCatalog = useMemo(() => {
    return REWARDS_CATALOG.filter((deal) => {
      const matchesCategory =
        selectedCategory === "All" || deal.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        deal.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Filter Redeemed List
  const filteredRedeemed = useMemo(() => {
    return redeemedList.filter((item) => {
      if (selectedRedeemedCategory === "All") return true;
      if (selectedRedeemedCategory === "Rentals") return item.service === "rental";
      if (selectedRedeemedCategory === "Wash") return item.service === "wash";
      if (selectedRedeemedCategory === "Chauffeur") return item.service === "driver";
      return true;
    });
  }, [redeemedList, selectedRedeemedCategory]);

  // Filter History
  const filteredHistory = useMemo(() => {
    return historyList.filter((item) => {
      if (historyFilter === "earned") return item.points > 0;
      if (historyFilter === "spent") return item.points < 0;
      return true;
    });
  }, [historyList, historyFilter]);

  // Calculate total points earned
  const totalEarned = useMemo(() => {
    return historyList
      .filter((h) => h.points > 0)
      .reduce((sum, h) => sum + h.points, 0);
  }, [historyList]);

  // Selected Category Label
  const selectedCategoryName =
    CATEGORIES.find((c) => c.id === selectedCategory)?.label.replace(/^.*? /, "") ||
    selectedCategory;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* ================================================================== */}
        {/* TOP HERO BANNER: POINTS BALANCE & BIG PROMINENT HISTORY BUTTON */}
        {/* ================================================================== */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-amber-500/5 p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: Program Branding & Tier */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold px-3 py-1 text-xs tracking-wider"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  STARLIGHT MOBILITY CLUB
                </Badge>
                <Badge variant="secondary" className="px-2.5 py-0.5 text-xs font-semibold">
                  ⭐ {currentTier}
                </Badge>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
                Starlight Rewards & Perks
              </h1>

              <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
                Earn loyalty points on every self-drive car rental, doorstep car wash, and
                verified chauffeur duty. Points are exclusively used to unlock official Starlight
                discount coupons and free service passes.
              </p>
            </div>

            {/* Right: Balance Display & BIG, PROMINENT POINTS HISTORY BUTTON */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-background/90 dark:bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs">
              {/* Balance Box */}
              <div className="pr-4 sm:border-r border-border/80 flex flex-col justify-center">
                <span className="text-[11px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 tracking-wide">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  Available Points Balance
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-display font-black text-3xl sm:text-4xl text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
                    {pointsBalance.toLocaleString("en-IN")}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">Points</span>
                </div>
              </div>

              {/* BIG EASY-TO-SEE POINTS HISTORY BUTTON */}
              <Button
                onClick={() => setIsHistoryModalOpen(true)}
                size="lg"
                className="h-13 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer shrink-0"
              >
                <History className="h-5 w-5 stroke-[2.5]" />
                <span className="text-sm tracking-wide">View Points History</span>
                <ChevronRight className="h-4 w-4 opacity-80" />
              </Button>
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* VIEW NAVIGATION: EXPLORE PERKS VS MY REDEEMED REWARDS */}
        {/* ================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
          {/* Segmented Switcher */}
          <div className="flex items-center gap-2 p-1 bg-muted/60 rounded-xl border border-border w-fit">
            <button
              onClick={() => setActiveTab("explore")}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === "explore"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Explore Perks ({REWARDS_CATALOG.length})
            </button>
            <button
              onClick={() => setActiveTab("redeemed")}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "redeemed"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>My Redeemed Rewards</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-extrabold">
                {redeemedList.length}
              </span>
            </button>
          </div>

          {/* Quick Action: Refer a Friend */}
          <Button asChild variant="outline" size="sm" className="h-9 w-fit font-semibold">
            <Link to="/referrals">
              <Gift className="mr-2 h-4 w-4 text-brand" /> Refer & Earn 500 Points
            </Link>
          </Button>
        </div>

        {/* ================================================================== */}
        {/* TAB 1: EXPLORE PERKS CATALOG */}
        {/* ================================================================== */}
        {activeTab === "explore" && (
          <div className="space-y-6">
            {/* Search and Category Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? "bg-foreground text-background shadow-xs font-extrabold scale-100"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search Starlight perks or cars..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9.5 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* If section has no coupons: appropriate informative empty message */}
            {filteredCatalog.length === 0 ? (
              <div className="py-16 px-4 text-center border border-dashed border-border rounded-2xl bg-card/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground border border-border">
                  <Ticket className="h-7 w-7 opacity-60" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="font-bold text-base text-foreground">
                    {searchQuery.trim()
                      ? `No perks matching "${searchQuery}"`
                      : `No active coupons in ${selectedCategoryName} right now`}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {searchQuery.trim()
                      ? "Check your spelling or try searching for 'rental', 'wash', 'suv', or 'driver'."
                      : `We regularly release new Starlight ${selectedCategoryName.toLowerCase()} vouchers. Check back shortly or explore other active perks.`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 font-semibold"
                  onClick={() => {
                    setSelectedCategory("All");
                    setSearchQuery("");
                  }}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5 text-amber-500" /> View All Starlight Perks
                </Button>
              </div>
            ) : (
              /* Rewards Cards Grid: Compact Cards Layout */
              <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr">
                {filteredCatalog.map((deal) => {
                  const canAfford = pointsBalance >= deal.pointsCost;

                  return (
                    <div
                      key={deal.id}
                      onClick={() => setSelectedDealForModal(deal)}
                      className="group cursor-pointer rounded-2xl border border-border bg-card p-4 hover:border-brand/50 hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Top Brand Logo + Badge Row */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <StarlightBrandLogo brand={deal.brand} size="md" />
                            <div>
                              <span className="font-bold text-xs uppercase tracking-wider text-foreground block">
                                {deal.brand}
                              </span>
                              <span className="text-[10px] text-muted-foreground block">
                                {deal.category === "Rentals"
                                  ? "Self-Drive"
                                  : deal.category === "Wash"
                                    ? "Doorstep Care"
                                    : "Executive Chauffeur"}
                              </span>
                            </div>
                          </div>

                          {deal.badgeTag && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold py-0.5 px-2 border-brand/30 bg-brand/5 text-foreground"
                            >
                              {deal.badgeTag}
                            </Badge>
                          )}
                        </div>

                        {/* Square Image 1:1 Media Section */}
                        <StarlightCardMedia
                          image={deal.image}
                          title={deal.title}
                          discountValue={deal.discountValue}
                          service={deal.service}
                        />

                        {/* Offer Headline & Terms */}
                        <div className="mt-3.5 space-y-1">
                          <h3 className="font-bold text-sm text-foreground leading-snug line-clamp-2 group-hover:text-brand transition-colors">
                            {deal.title}
                          </h3>
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {deal.terms}
                          </p>
                        </div>
                      </div>

                      {/* Primary CTA Button */}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1">
                          <span className="font-extrabold text-sm text-amber-600 dark:text-amber-400">
                            {deal.pointsCost}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-semibold">
                            Pts
                          </span>
                        </div>

                        <Button
                          size="sm"
                          className={`h-8 px-3 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                            canAfford
                              ? "bg-brand text-brand-foreground hover:bg-brand/90"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {canAfford ? "Unlock Voucher" : "Need Points"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: MY REDEEMED REWARDS PASSBOOK */}
        {/* ================================================================== */}
        {activeTab === "redeemed" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">My Redeemed Starlight Passes</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exclusive promo codes locked to your account. Copy and apply them directly at
                  checkout.
                </p>
              </div>

              {/* Category Filter for Redeemed Rewards */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {(["All", "Rentals", "Wash", "Chauffeur"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedRedeemedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      selectedRedeemedCategory === cat
                        ? "bg-foreground text-background font-extrabold"
                        : "bg-muted text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty state when no redeemed rewards exist in this category */}
            {filteredRedeemed.length === 0 ? (
              <div className="py-16 px-4 text-center border border-dashed border-border rounded-2xl bg-card/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground border border-border">
                  <Ticket className="h-7 w-7 opacity-60" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="font-bold text-base text-foreground">
                    {selectedRedeemedCategory === "All"
                      ? "No redeemed rewards yet"
                      : `No redeemed ${selectedRedeemedCategory} vouchers`}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedRedeemedCategory === "All"
                      ? "You haven't unlocked any vouchers yet. Exchange your loyalty points to claim instant discounts on your next ride, wash, or driver duty."
                      : `You haven't unlocked any ${selectedRedeemedCategory.toLowerCase()} passes yet. Browse available perks to claim one with your points.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="mt-2 bg-brand text-brand-foreground hover:bg-brand/90 font-bold"
                  onClick={() => setActiveTab("explore")}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" /> Explore Available Perks
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRedeemed.map((voucher) => (
                  <div
                    key={voucher.id}
                    className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Brand Row */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <StarlightBrandLogo brand={voucher.brand} size="sm" />
                          <span className="font-bold text-xs uppercase tracking-wider text-foreground">
                            {voucher.brand}
                          </span>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                          <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" /> Active Pass
                        </Badge>
                      </div>

                      <h3 className="font-bold text-sm text-foreground leading-snug">
                        {voucher.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">{voucher.terms}</p>

                      {/* Service Alignment Badge */}
                      <div className="mt-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                          {voucher.service === "rental"
                            ? "🚗 Valid on Self-Drive Rentals Only"
                            : voucher.service === "wash"
                              ? "🧼 Valid on Doorstep Car Wash Only"
                              : "👨‍✈️ Valid on Chauffeur Duty Only"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-dashed border-border space-y-3">
                      {/* Copy Code Box */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/60 border border-border">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
                            Account Promo Code
                          </span>
                          <span className="font-mono font-black text-sm text-foreground tracking-wider select-all">
                            {voucher.code}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-brand hover:bg-brand/10 font-bold"
                          onClick={() => handleCopyCode(voucher.code)}
                        >
                          {copiedCode === voucher.code ? (
                            <>
                              <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-3.5 w-3.5" /> Copy Code
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Valid for 60 days
                        </span>
                        <Button
                          asChild
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-brand font-bold"
                        >
                          <Link to={voucher.serviceLink}>
                            {voucher.service === "rental"
                              ? "Book Self-Drive →"
                              : voucher.service === "wash"
                                ? "Book Car Wash →"
                                : "Hire Driver →"}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* POPUP 1: POINTS HISTORY POPUP (TRIGGERED BY BIG HISTORY BUTTON) */}
      {/* ================================================================== */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="max-w-md sm:max-w-xl max-h-[85vh] flex flex-col p-5 sm:p-6 bg-card text-card-foreground border-border">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <History className="h-5 w-5 text-amber-500" /> Starlight Points History
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Detailed ledger showing all points earned and vouchers unlocked.
                </DialogDescription>
              </div>
            </div>

            {/* Quick Balance Summary Strip */}
            <div className="mt-3 p-3.5 rounded-xl bg-muted/50 border border-border flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px] font-medium">
                  Current Points Balance:
                </span>
                <span className="font-extrabold text-amber-600 dark:text-amber-400 text-lg tabular-nums">
                  {pointsBalance.toLocaleString("en-IN")} Points
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block text-[11px] font-medium">
                  Lifetime Earned:
                </span>
                <span className="font-bold text-foreground text-lg tabular-nums">
                  +{totalEarned.toLocaleString("en-IN")} Points
                </span>
              </div>
            </div>

            {/* Filter Chips: All, Earned (+), Spent (-) */}
            <div className="flex items-center gap-2 mt-3">
              {(["all", "earned", "spent"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setHistoryFilter(mode)}
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-all cursor-pointer ${
                    historyFilter === mode
                      ? "bg-foreground text-background shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  {mode === "all"
                    ? "All Activity"
                    : mode === "earned"
                      ? "Points Earned (+)"
                      : "Vouchers Unlocked (-)"}
                </button>
              ))}
            </div>
          </DialogHeader>

          {/* History Timeline List */}
          <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border/60 py-2">
            {filteredHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No points activity found for this filter.
              </div>
            ) : (
              filteredHistory.map((item) => {
                const isEarned = item.points > 0;
                return (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isEarned
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isEarned ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <Ticket className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                            {item.title}
                          </span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                            {item.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {item.reason}
                        </p>
                        <span className="text-[10px] text-muted-foreground/80 mt-1 block">
                          {item.date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-display font-extrabold text-sm sm:text-base tabular-nums ${
                          isEarned
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-foreground"
                        }`}
                      >
                        {isEarned ? `+${item.points}` : item.points} Pts
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-3 border-t border-border flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setIsHistoryModalOpen(false)}>
              Close History
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* POPUP 2: REWARD INFO & HOW TO REDEEM MODAL */}
      {/* ================================================================== */}
      <Dialog
        open={Boolean(selectedDealForModal)}
        onOpenChange={(open) => !open && setSelectedDealForModal(null)}
      >
        <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar p-5 sm:p-6 bg-card text-card-foreground border-border">
          {selectedDealForModal && (
            <div className="space-y-4">
              <DialogHeader>
                {/* Brand & Category */}
                <div className="flex items-center gap-2.5 mb-2">
                  <StarlightBrandLogo brand={selectedDealForModal.brand} size="md" />
                  <div>
                    <DialogTitle className="text-base sm:text-lg font-bold leading-tight">
                      {selectedDealForModal.brand}
                    </DialogTitle>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Starlight Mobility Privilege
                    </span>
                  </div>
                </div>

                <DialogDescription className="text-sm font-semibold text-foreground pt-1">
                  {selectedDealForModal.title}
                </DialogDescription>
              </DialogHeader>

              {/* Product Visual */}
              <div className="relative w-full aspect-video max-h-[180px] rounded-xl overflow-hidden bg-muted border border-border">
                <img
                  src={selectedDealForModal.image}
                  alt={selectedDealForModal.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-md text-amber-400 text-xs font-black border border-amber-500/30">
                  {selectedDealForModal.discountValue}
                </div>
              </div>

              {/* Price & Balance Calculation */}
              <div className="p-3.5 rounded-xl bg-muted/50 border border-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Points Cost:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {selectedDealForModal.pointsCost} Points
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your Balance:</span>
                  <span className="font-semibold text-foreground">{pointsBalance} Points</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="text-muted-foreground">Balance After Redemption:</span>
                  <span className="font-bold text-foreground">
                    {pointsBalance - selectedDealForModal.pointsCost} Points
                  </span>
                </div>
              </div>

              {/* Step-by-Step "How to Redeem" Guide */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-brand" /> How to Redeem This Offer
                </h4>
                <div className="space-y-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/60">
                  {selectedDealForModal.howToRedeem.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="h-4 w-4 rounded-full bg-brand/10 text-brand font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Terms and Validity */}
              <div className="space-y-1.5 text-xs">
                <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Terms & Conditions
                </h4>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px]">
                  {selectedDealForModal.fullTerms.map((term, idx) => (
                    <li key={idx}>{term}</li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => setSelectedDealForModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isSubmitting || pointsBalance < selectedDealForModal.pointsCost}
                  onClick={() => handleClaimReward(selectedDealForModal)}
                  className="bg-brand text-brand-foreground hover:bg-brand/90 font-bold"
                >
                  {isSubmitting
                    ? "Redeeming..."
                    : pointsBalance >= selectedDealForModal.pointsCost
                      ? `Unlock for ${selectedDealForModal.pointsCost} Points`
                      : `Need ${selectedDealForModal.pointsCost - pointsBalance} More Points`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
