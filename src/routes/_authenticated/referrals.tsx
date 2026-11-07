import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { currency } from "@/lib/format";
import { toast } from "sonner";
import {
  Gift,
  Copy,
  Share2,
  CheckCircle2,
  Users,
  IndianRupee,
  Sparkles,
  ArrowRight,
  Send,
  Wallet,
  Clock,
  HelpCircle,
  FileText,
  Search,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  component: ReferralsPage,
  head: () => ({
    meta: [
      { title: "Refer & Earn ₹500 — Synchoo" },
      { name: "description", content: "Invite friends to Synchoo. They get ₹500 off on their first trip, and you earn ₹500 wallet cash when they ride." },
    ],
  }),
});

interface ReferralEvent {
  id: string;
  friendName: string;
  email: string;
  status: "First Trip Completed" | "Joined" | "Pending";
  earnedAmount: number;
  date: string;
}

const INITIAL_HISTORY: ReferralEvent[] = [
  { id: "1", friendName: "Karthik Rajan", email: "karthik.r@gmail.com", status: "First Trip Completed", earnedAmount: 500, date: "3 days ago" },
  { id: "2", friendName: "Sneha Nair", email: "sneha.n@outlook.com", status: "First Trip Completed", earnedAmount: 500, date: "1 week ago" },
  { id: "3", friendName: "Manish Joshi", email: "manish.j@company.com", status: "Joined", earnedAmount: 0, date: "Yesterday" },
  { id: "4", friendName: "Divya Deshmukh", email: "divya.d@gmail.com", status: "Pending", earnedAmount: 0, date: "5 days ago" },
];

export function ReferralsPage() {
  const { user } = useSession();
  const referralCode = (user?.id ? `SYN-${user.id.slice(0, 6).toUpperCase()}` : "SYN-RIDE500");
  const referralLink = `https://synchoo.in/join?ref=${referralCode}`;

  const [activeTab, setActiveTab] = useState<"share" | "friends" | "earnings" | "rules">("share");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReferralEvent[]>(INITIAL_HISTORY);
  const [inviteEmail, setInviteEmail] = useState("");
  const [searchFriend, setSearchFriend] = useState("");

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

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      return toast.error("Please enter a valid email address");
    }
    const newEvent: ReferralEvent = {
      id: String(Date.now()),
      friendName: inviteEmail.split("@")[0],
      email: inviteEmail.trim(),
      status: "Pending",
      earnedAmount: 0,
      date: "Just now",
    };
    setHistory([newEvent, ...history]);
    setInviteEmail("");
    toast.success(`Invitation email sent to ${inviteEmail}!`);
  };

  const totalEarned = history.reduce((sum, item) => sum + item.earnedAmount, 0);
  const completedCount = history.filter((h) => h.status === "First Trip Completed").length;
  const pendingCount = history.filter((h) => h.status !== "First Trip Completed").length;

  const filteredHistory = history.filter((h) =>
    h.friendName.toLowerCase().includes(searchFriend.toLowerCase()) ||
    h.email.toLowerCase().includes(searchFriend.toLowerCase())
  );

  const sidebarNavItems = [
    { id: "share", label: "Share & Invite", icon: Gift },
    { id: "friends", label: "Invited Friends", icon: Users, badge: String(history.length) },
    { id: "earnings", label: "Earnings & Wallet", icon: Wallet, badge: currency(totalEarned) },
    { id: "rules", label: "Program Terms & FAQ", icon: FileText },
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
                <Badge variant="outline" className="border-brand/40 text-brand bg-brand/10">
                  <Gift className="mr-1 h-3.5 w-3.5" /> Refer & Earn ₹500
                </Badge>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Instant Wallet Cash
                </Badge>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">
                Invite Friends, Earn ₹500 Each
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Friends get ₹500 off on their first trip. You earn ₹500 directly in your Synchoo wallet.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={shareViaWhatsApp} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm">
                <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share on WhatsApp
              </Button>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout with Page Sidebar */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Referrals Page Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Unique Code Card */}
              <Card className="p-4 border-brand/20 bg-brand/5">
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Your Referral Code</span>
                  <div className="font-mono text-lg font-bold text-foreground bg-background/80 p-2 rounded-lg border border-border flex items-center justify-between">
                    <span>{referralCode}</span>
                    <button onClick={copyToClipboard} className="text-muted-foreground hover:text-foreground text-xs" title="Copy code">
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total Earned:</span>
                    <p className="font-bold text-emerald-600 mt-0.5">{currency(totalEarned)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Friends:</span>
                    <p className="font-bold text-foreground mt-0.5">{history.length} invited</p>
                  </div>
                </div>
              </Card>

              {/* Sidebar Navigation */}
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0" aria-label="Referrals navigation">
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

              {/* Direct Wallet Shortcut */}
              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-muted/40">
                <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                  <Wallet className="h-3.5 w-3.5 text-brand" /> Synchoo Wallet
                </div>
                Your referral earnings are deposited automatically. Spend on self-drive rides, driver hires, or washes.
                <Button asChild variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs text-brand justify-start px-0">
                  <Link to="/wallet">Go to Wallet <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </Card>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <div className="lg:col-span-3 space-y-6">
            {/* Tab 1: Share & Invite */}
            {activeTab === "share" && (
              <div className="space-y-6">
                {/* Hero Feature Box */}
                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-r from-brand/10 via-background to-emerald-500/10 p-6 space-y-3">
                    <h2 className="font-display text-xl font-bold">Give ₹500, Get ₹500</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                      When someone registers with your link, they receive a ₹500 welcome discount credited to their first booking. Once their first trip finishes, you receive ₹500 instant wallet credits.
                    </p>
                  </div>
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <Label className="text-xs">Your Personalized Referral Link</Label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input value={referralLink} readOnly className="font-mono text-xs bg-muted" />
                        <Button onClick={copyToClipboard} size="sm" className="shrink-0 text-xs">
                          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                          {copied ? "Copied" : "Copy Link"}
                        </Button>
                      </div>
                    </div>

                    {/* Email Invite Form */}
                    <div className="pt-2">
                      <Label className="text-xs">Send Email Invitation Directly</Label>
                      <form onSubmit={handleSendInvite} className="flex gap-2 mt-1.5">
                        <Input
                          type="email"
                          placeholder="friend@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="text-xs"
                        />
                        <Button type="submit" size="sm" variant="outline" className="shrink-0 text-xs">
                          <Send className="mr-1 h-3.5 w-3.5" /> Send Invite
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                </Card>

                {/* How It Works Steps */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand" /> How the Referral Program Works
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5 text-center sm:text-left">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand font-bold text-xs mb-2 mx-auto sm:mx-0">
                          1
                        </div>
                        <p className="font-semibold text-sm">1. Share Your Link</p>
                        <p className="text-xs text-muted-foreground">
                          Send your unique link via WhatsApp, email, or social media to colleagues and friends.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5 text-center sm:text-left">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 font-bold text-xs mb-2 mx-auto sm:mx-0">
                          2
                        </div>
                        <p className="font-semibold text-sm">2. Friend Takes a Trip</p>
                        <p className="text-xs text-muted-foreground">
                          Your friend gets ₹500 off their first self-drive rental, chauffeur hire, or carpooling seat.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5 text-center sm:text-left">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 font-bold text-xs mb-2 mx-auto sm:mx-0">
                          3
                        </div>
                        <p className="font-semibold text-sm">3. Earn ₹500 Cash</p>
                        <p className="text-xs text-muted-foreground">
                          You instantly receive ₹500 in your Synchoo wallet with no expiration or usage restriction.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 2: Invited Friends */}
            {activeTab === "friends" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-brand" /> Invited Friends ({history.length})
                      </CardTitle>
                      <CardDescription>Track registration and trip completion status</CardDescription>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search friend..."
                        value={searchFriend}
                        onChange={(e) => setSearchFriend(e.target.value)}
                        className="pl-8 h-8 text-xs w-48"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {filteredHistory.map((item) => (
                      <div key={item.id} className="p-3.5 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{item.friendName}</span>
                            <Badge
                              variant={item.status === "First Trip Completed" ? "secondary" : "outline"}
                              className={item.status === "First Trip Completed" ? "text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "text-[10px]"}
                            >
                              {item.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.email} · Invited {item.date}</p>
                        </div>

                        <div className="text-right">
                          {item.earnedAmount > 0 ? (
                            <span className="font-bold text-sm text-emerald-600">+{currency(item.earnedAmount)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">₹500 on trip completion</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tab 3: Earnings & Wallet */}
            {activeTab === "earnings" && (
              <div className="space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <span className="text-xs text-muted-foreground">Total Referral Earnings</span>
                    <p className="font-display text-2xl font-bold mt-1 text-emerald-600">{currency(totalEarned)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">From {completedCount} completed rides</p>
                  </Card>
                  <Card className="p-4">
                    <span className="text-xs text-muted-foreground">Potential Pending Earnings</span>
                    <p className="font-display text-2xl font-bold mt-1 text-amber-600">{currency(pendingCount * 500)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{pendingCount} friends yet to ride</p>
                  </Card>
                  <Card className="p-4">
                    <span className="text-xs text-muted-foreground">Reward Rate</span>
                    <p className="font-display text-2xl font-bold mt-1 text-foreground">₹500 / friend</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Unlimited invitations</p>
                  </Card>
                </div>

                {/* Direct Action Card */}
                <Card className="p-6 border-brand/20 bg-brand/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-base">Check Your Current Wallet Balance</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your referral credits can be spent on any self-drive car, driver hire, or vehicle wash.
                    </p>
                  </div>
                  <Button asChild>
                    <Link to="/wallet">Open Wallet</Link>
                  </Button>
                </Card>
              </div>
            )}

            {/* Tab 4: Rules & FAQ */}
            {activeTab === "rules" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-brand" /> Referral Program Guidelines & FAQ
                    </CardTitle>
                    <CardDescription>Everything you need to know about rewards eligibility</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs sm:text-sm">
                    <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                      <p className="font-semibold text-foreground">Who is eligible for the ₹500 welcome discount?</p>
                      <p className="text-muted-foreground">
                        Any new user signing up on Synchoo who has not previously booked a trip. The discount coupon is applied automatically at the checkout screen.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                      <p className="font-semibold text-foreground">When will I receive my ₹500 reward?</p>
                      <p className="text-muted-foreground">
                        Your referral reward is credited directly to your Synchoo wallet within 30 minutes of your invited friend completing their first ride or driver duty.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                      <p className="font-semibold text-foreground">Is there a limit on how many friends I can refer?</p>
                      <p className="text-muted-foreground">
                        No! There is no cap. You can invite as many friends, colleagues, and family members as you wish.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                      <p className="font-semibold text-foreground">Can I withdraw referral earnings to my bank account?</p>
                      <p className="text-muted-foreground">
                        Referral credits are promo wallet cash valid for 100% payment across all Synchoo bookings and do not expire.
                      </p>
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
