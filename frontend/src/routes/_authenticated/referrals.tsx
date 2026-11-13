import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import { Gift, Copy, Share2, Users, Sparkles, Award, HelpCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  component: ReferralsPage,
  head: () => ({
    meta: [
      { title: "Refer & Earn ₹500 — Synchoo" },
      {
        name: "description",
        content:
          "Invite friends to Synchoo. They get ₹500 off on their first trip, and you earn ₹500 wallet cash when they ride.",
      },
    ],
  }),
});

interface ReferralEvent {
  id: string;
  friendName: string;
  email: string;
  status: "First Trip Completed" | "Account Created" | "Invite Sent";
  earnedAmount: number;
  date: string;
}

export function ReferralsPage() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "rules">("overview");
  const [referralCode, setReferralCode] = useState(
    user?.id ? `SYN-${user.id.slice(0, 6).toUpperCase()}` : "SYN-RIDE500",
  );
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReferralEvent[]>([]);
  const [_loading, setLoading] = useState(true);

  // /auth reads ?ref= at sign-up and links the new account to this referrer.
  const referralLink = `${window.location.origin}/auth?mode=signup&ref=${referralCode}`;

  useEffect(() => {
    if (!user) return;

    (async () => {
      // 1. Load user's referral code
      const { data: profile } = await api
        .from("profiles")
        .select("referral_code")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.referral_code) {
        setReferralCode(profile.referral_code);
      }

      // 2. Load friends referred by this user (profiles RLS hides other users' rows, so an RPC)
      const { data: friends } = await api.rpc("my_referrals");

      if (friends && friends.length > 0) {
        setHistory(
          friends.map((f: any) => ({
            id: f.id,
            friendName: f.full_name || "Friend",
            email: "Verified User",
            status: f.referral_rewarded ? "First Trip Completed" : "Account Created",
            earnedAmount: f.referral_rewarded ? 500 : 0,
            date: new Date(f.created_at).toLocaleDateString(),
          })),
        );
      } else {
        setHistory([]);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaWhatsApp = () => {
    const text = `Join Synchoo for self-drive car rentals, driver hire, and doorstep washes! Use my link to get ₹500 OFF your first trip: ${referralLink}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const totalEarned = history.reduce((sum, item) => sum + item.earnedAmount, 0);
  const completedTrips = history.filter((h) => h.status === "First Trip Completed").length;

  const sidebarNavItems = [
    { id: "overview", label: "Refer & Earn", icon: Gift },
    { id: "activity", label: "Invited Friends", icon: Users, badge: String(history.length) },
    { id: "rules", label: "Program Terms & FAQ", icon: HelpCircle },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-brand/40 text-brand bg-brand/10">
                <Gift className="mr-1 h-3.5 w-3.5" /> Synchoo Referrals
              </Badge>
              <Badge
                variant="secondary"
                className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                ₹500 Instant Cash Bonus
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
              Refer Friends, Earn ₹500 Every Time
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Give your friends ₹500 off on their first trip. When they complete their first ride,
              get ₹500 deposited directly into your wallet.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/rewards">
                <Award className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Synchoo Points Hub
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={shareViaWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Share2 className="mr-1.5 h-4 w-4" /> Share WhatsApp
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout with Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Referrals Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Quick Referral Card */}
              <Card className="p-4 border-brand/20 bg-brand/5">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand mb-1">
                  <Sparkles className="h-3.5 w-3.5" /> Your Referral Code
                </div>
                <div className="font-mono text-base font-extrabold tracking-wider text-foreground bg-background/80 px-3 py-1.5 rounded-lg border border-border text-center">
                  {referralCode}
                </div>

                <div className="mt-3 pt-3 border-t border-border/80 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Earned:</span>
                  <span className="font-bold text-emerald-600">{currency(totalEarned)}</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyToClipboard}
                  className="w-full mt-3 text-xs"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />{" "}
                  {copied ? "Link Copied!" : "Copy Invite Link"}
                </Button>
              </Card>

              {/* Sidebar Navigation */}
              <nav
                className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0"
                aria-label="Referrals navigation"
              >
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
                        <Icon
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-foreground" : "text-muted-foreground"}`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {"badge" in item && (
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className={`text-[10px] px-1.5 py-0 ${
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

                {/* Direct Cross-link to Rewards Page */}
                <Link
                  to="/rewards"
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap text-left mt-2 border-t border-border/50 pt-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Award className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Rewards & Points</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-300"
                  >
                    Points Hub
                  </Badge>
                </Link>
              </nav>

              {/* Quick Info Box in Sidebar */}
              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/30">
                <p className="font-semibold text-foreground mb-1">Unlimited Earnings</p>
                There is no cap on how many friends you can invite. Refer 10 friends, get ₹5,000
                wallet credits!
              </Card>
            </div>
          </aside>

          {/* Right Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Overview */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Banner & Share Box */}
                <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-r from-brand/10 via-background to-emerald-500/10 p-6 sm:p-8">
                  <div className="max-w-xl space-y-3">
                    <Badge variant="outline" className="border-brand/40 text-brand bg-brand/10">
                      <Gift className="mr-1 h-3.5 w-3.5" /> Double Bonus Program
                    </Badge>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                      Give ₹500, Get ₹500 On Every Friend
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Share your unique referral link. Your friend receives a ₹500 discount voucher
                      on their first self-drive rental or chauffeur hire, and you receive ₹500
                      instant wallet credits as soon as their trip finishes.
                    </p>
                  </div>
                </div>

                {/* Share Link Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Share Your Referral Link</CardTitle>
                    <CardDescription>
                      Friends who register with this link get their welcome voucher automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[240px] relative">
                        <Input
                          value={referralLink}
                          readOnly
                          className="font-mono text-xs pr-20 bg-muted"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={copyToClipboard}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>

                      <Button
                        onClick={shareViaWhatsApp}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Share2 className="mr-1.5 h-4 w-4" /> Share on WhatsApp
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Referral code:</span>
                      <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
                        {referralCode}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* 3 Metric Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Friends Invited</p>
                    <p className="font-display text-2xl font-bold mt-1 text-foreground">
                      {history.length}
                    </p>
                  </Card>
                  <Card className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Completed Trips</p>
                    <p className="font-display text-2xl font-bold mt-1 text-emerald-600">
                      {completedTrips}
                    </p>
                  </Card>
                  <Card className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Wallet Earned</p>
                    <p className="font-display text-2xl font-bold mt-1 text-brand">
                      {currency(totalEarned)}
                    </p>
                  </Card>
                </div>

                {/* How It Works 3 Steps */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-brand" /> How Refer & Earn Works
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                          1
                        </span>
                        <h4 className="font-semibold text-sm">Send Invitation</h4>
                        <p className="text-xs text-muted-foreground">
                          Share your link via WhatsApp, Telegram, or email with colleagues and
                          friends.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                          2
                        </span>
                        <h4 className="font-semibold text-sm">Friend Gets ₹500</h4>
                        <p className="text-xs text-muted-foreground">
                          They sign up and receive a ₹500 coupon applied automatically at checkout.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                          3
                        </span>
                        <h4 className="font-semibold text-sm">You Get ₹500 Cash</h4>
                        <p className="text-xs text-muted-foreground">
                          As soon as their trip check-out is complete, ₹500 is credited to your
                          Synchoo wallet.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 2: Activity & History */}
            {activeTab === "activity" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-brand" /> Invited Friends & Bonus Status
                      </CardTitle>
                      <CardDescription>
                        Live tracker of who joined with your link and completed their trip
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{history.length} Total Invites</Badge>
                  </CardHeader>
                  <CardContent>
                    {history.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No friends have joined using your link yet. Share your code to start
                        earning!
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm">{item.friendName}</p>
                                <Badge
                                  variant={
                                    item.status === "First Trip Completed" ? "secondary" : "outline"
                                  }
                                  className={
                                    item.status === "First Trip Completed"
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]"
                                      : "text-[10px]"
                                  }
                                >
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.email} · {item.date}
                              </p>
                            </div>

                            <div className="text-right">
                              {item.earnedAmount > 0 ? (
                                <p className="font-bold text-sm text-emerald-600">
                                  +{currency(item.earnedAmount)} Credited
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Pending trip completion
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 3: Program Rules & FAQ */}
            {activeTab === "rules" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-brand" /> Referral Program Guidelines &
                      Terms
                    </CardTitle>
                    <CardDescription>
                      Everything you need to know about referral credits and usage
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3 text-xs sm:text-sm text-muted-foreground">
                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                        <p className="font-semibold text-foreground">
                          Who is eligible to participate?
                        </p>
                        <p>
                          Any verified Synchoo account holder can share their referral link. The
                          invited friend must be a new user who has never registered on Synchoo
                          previously.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                        <p className="font-semibold text-foreground">
                          When do I receive my ₹500 reward?
                        </p>
                        <p>
                          Your ₹500 wallet cash is deposited automatically within 10 minutes after
                          your friend completes check-out and pays for their first vehicle rental or
                          chauffeur trip.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                        <p className="font-semibold text-foreground">
                          Can I use referral wallet cash on any service?
                        </p>
                        <p>
                          Yes! Synchoo wallet credits can be spent on self-drive rentals, driver
                          hires, carpooling seat fares, and doorstep car washes.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                        <p className="font-semibold text-foreground">
                          Is there an expiry date on referral wallet cash?
                        </p>
                        <p>
                          Referral credits in your Synchoo wallet never expire and remain valid for
                          all future bookings.
                        </p>
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
