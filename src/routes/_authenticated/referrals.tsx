import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  status: "Joined" | "First Trip Completed" | "Pending";
  earnedAmount: number;
  date: string;
}

export function ReferralsPage() {
  const { user } = useSession();
  const [referralCode, setReferralCode] = useState(
    user?.id ? `SYN-${user.id.slice(0, 6).toUpperCase()}` : "SYN-RIDE500"
  );
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink = `https://synchoo.in/join?ref=${referralCode}`;

  useEffect(() => {
    if (!user) return;

    (async () => {
      // 1. Load user's referral code
      const { data: profile } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.referral_code) {
        setReferralCode(profile.referral_code);
      }

      // 2. Load friends referred by this user
      const { data: friends } = await supabase
        .from("profiles")
        .select("id, full_name, created_at, referral_rewarded")
        .eq("referred_by", user.id)
        .order("created_at", { ascending: false });

      if (friends && friends.length > 0) {
        setHistory(
          friends.map((f) => ({
            id: f.id,
            friendName: f.full_name || "Friend",
            status: f.referral_rewarded ? "First Trip Completed" : "Joined",
            earnedAmount: f.referral_rewarded ? 500 : 0,
            date: new Date(f.created_at).toLocaleDateString(),
          }))
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

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-r from-brand/10 via-background to-emerald-500/10 p-6 sm:p-8">
          <div className="max-w-xl space-y-3">
            <Badge variant="outline" className="border-brand/40 text-brand bg-brand/10">
              <Gift className="mr-1 h-3.5 w-3.5" /> Refer & Earn ₹500
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Give ₹500, Get ₹500 Every Time a Friend Rides
            </h1>
            <p className="text-sm text-muted-foreground">
              Share your link with colleagues and friends. They receive ₹500 welcome discount on their first vehicle booking, and you receive ₹500 instantly in your Synchoo wallet.
            </p>
          </div>
        </div>

        {/* Share Box */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Exclusive Referral Link</CardTitle>
            <CardDescription>Friends who register with this link automatically get ₹500 applied at checkout.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input value={referralLink} readOnly className="font-mono text-xs pr-10 bg-muted/40" />
              </div>
              <Button onClick={copyToClipboard} variant="outline" className="text-xs">
                {copied ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button onClick={shareViaWhatsApp} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share on WhatsApp
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">Your Referral Code:</span>
              <Badge variant="secondary" className="font-mono font-bold text-xs">
                {referralCode}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Users className="h-4 w-4 text-brand" /> Total Friends Invited
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{history.length}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Trips Completed
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-emerald-600">
              {history.filter((h) => h.status === "First Trip Completed").length}
            </p>
          </Card>

          <Card className="p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <IndianRupee className="h-4 w-4 text-brand" /> Total Bonus Earned
            </div>
            <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(totalEarned)}</p>
          </Card>
        </div>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" /> Referral Activity & Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No friends have joined using your link yet. Share your code to start earning!
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-semibold text-xs text-foreground">{item.friendName}</p>
                      <p className="text-[11px] text-muted-foreground">Joined: {item.date}</p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={item.status === "First Trip Completed" ? "secondary" : "outline"}
                        className={item.status === "First Trip Completed" ? "bg-emerald-50 text-emerald-700" : ""}
                      >
                        {item.status}
                      </Badge>
                      {item.earnedAmount > 0 && (
                        <p className="text-xs font-bold text-emerald-600 mt-0.5">+{currency(item.earnedAmount)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
