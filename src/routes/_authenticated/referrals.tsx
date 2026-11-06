import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-session";
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
  ArrowRight,
  Send,
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
  const referralCode = (user?.id ? `SYN-${user.id.slice(0, 6).toUpperCase()}` : "SYN-RIDE500");
  const referralLink = `https://synchoo.in/join?ref=${referralCode}`;

  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReferralEvent[]>([
    { id: "1", friendName: "Karthik Rajan", status: "First Trip Completed", earnedAmount: 500, date: "3 days ago" },
    { id: "2", friendName: "Sneha Nair", status: "First Trip Completed", earnedAmount: 500, date: "1 week ago" },
    { id: "3", friendName: "Manish Joshi", status: "Joined", earnedAmount: 0, date: "Yesterday" },
  ]);

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
              Share your link with colleagues and friends. They receive ₹500 welcome discount on their first vehicle booking or carpool, and you receive ₹500 instantly in your Synchoo wallet.
            </p>
          </div>
        </div>

        {/* Share Box */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Exclusive Referral Link</CardTitle>
            <CardDescription>Share via WhatsApp or copy your unique referral link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[240px] relative">
                <Input value={referralLink} readOnly className="font-mono text-xs pr-20 bg-muted" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyToClipboard}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <Button onClick={shareViaWhatsApp} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Share2 className="mr-1.5 h-4 w-4" /> Share on WhatsApp
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Referral code:</span>
              <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">{referralCode}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Friends Invited</p>
            <p className="font-display text-2xl font-bold mt-1 text-foreground">{history.length}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Completed Trips</p>
            <p className="font-display text-2xl font-bold mt-1 text-emerald-600">
              {history.filter((h) => h.status === "First Trip Completed").length}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Wallet Credits Earned</p>
            <p className="font-display text-2xl font-bold mt-1 text-brand">{currency(totalEarned)}</p>
          </Card>
        </div>

        {/* Referral Activity Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-brand" /> Referral Activity & Status
            </CardTitle>
            <CardDescription>Track when your friends sign up and complete their first trip.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-none text-xs">
                  <div>
                    <p className="font-semibold text-sm">{item.friendName}</p>
                    <p className="text-muted-foreground">{item.date}</p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={item.status === "First Trip Completed" ? "secondary" : "outline"}
                      className={item.status === "First Trip Completed" ? "bg-emerald-50 text-emerald-700" : ""}
                    >
                      {item.status}
                    </Badge>
                    {item.earnedAmount > 0 && (
                      <p className="font-semibold text-emerald-600 mt-0.5">+{currency(item.earnedAmount)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

