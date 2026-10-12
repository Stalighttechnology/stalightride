import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import {
  ShieldCheck, ShieldAlert, Clock, Wallet as WalletIcon, CalendarDays, Heart,
  UserRound, Droplets, LayoutDashboard, CarFront as Steering, ScanLine, Settings,
  ChevronRight, Gift, Crown, LogOut,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/account")({
  component: Account,
  head: () => ({
    meta: [
      { title: "Your account — Synchoo" },
      { name: "description", content: "Your Synchoo hub: wallet balance, verification status, trips, saved vehicles, rewards and quick actions." },
      { property: "og:title", content: "Your account — Synchoo" },
      { property: "og:description", content: "Wallet balance, verification, trips, saved vehicles and rewards in one premium hub." },
    ],
  }),
});

type Stats = {
  balance: number;
  trips: number;
  active: number;
  saved: number;
};

function tierFor(trips: number) {
  if (trips >= 25) return { name: "Platinum", tint: "text-violet" };
  if (trips >= 10) return { name: "Gold", tint: "text-ember" };
  if (trips >= 3) return { name: "Silver", tint: "text-silver" };
  return { name: "Explorer", tint: "text-cyan" };
}

function Account() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [p, w, b, wl] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("bookings").select("id,status").eq("customer_id", user.id),
        supabase.from("wishlists").select("id").eq("user_id", user.id),
      ]);
      if (!alive) return;
      setProfile(p.data ?? { id: user.id });
      const rows = (b.data ?? []) as { status: string }[];
      setStats({
        balance: Number((w.data as any)?.balance ?? 0),
        trips: rows.filter((r) => r.status === "completed").length,
        active: rows.filter((r) => ["confirmed", "ongoing", "active"].includes(r.status)).length,
        saved: (wl.data ?? []).length,
      });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const name = profile?.full_name || user?.user_metadata?.full_name || "Rider";
  const initial = name.toString().charAt(0).toUpperCase();
  const dl = profile?.dl_status as string | undefined;
  const tier = tierFor(stats?.trips ?? 0);

  const verification =
    dl === "approved"
      ? { icon: ShieldCheck, label: "Verified rider", tint: "text-emerald" }
      : dl === "pending"
        ? { icon: Clock, label: "Verification pending", tint: "text-ember" }
        : { icon: ShieldAlert, label: "Licence not verified", tint: "text-destructive" };

  const quick = [
    { to: "/bookings", icon: CalendarDays, label: "My trips", tint: "text-brand" },
    { to: "/wallet", icon: WalletIcon, label: "Wallet", tint: "text-emerald" },
    { to: "/wishlist", icon: Heart, label: "Saved", tint: "text-violet" },
    { to: "/hires", icon: UserRound, label: "My drivers", tint: "text-cyan" },
    { to: "/washes", icon: Droplets, label: "My washes", tint: "text-cyan" },
    { to: "/scan", icon: ScanLine, label: "Scan QR", tint: "text-ember" },
  ];

  const shortcuts = [
    { to: "/profile", icon: Settings, label: "Profile & documents", body: "Update details, upload licence" },
    { to: "/vendor", icon: LayoutDashboard, label: "Host dashboard", body: "Listings, earnings, calendar" },
    { to: "/driver-dashboard", icon: Steering, label: "Driver dashboard", body: "Hires, payouts, availability" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="aurora relative overflow-hidden">
        <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          {/* Identity */}
          <section className="glow-border glass-strong rise p-5 sm:p-8">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 ring-2 ring-brand/40">
                <AvatarImage src={profile?.avatar_url ?? user?.user_metadata?.avatar_url} alt={name} />
                <AvatarFallback className="bg-muted text-xl font-semibold">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-xl sm:text-2xl font-bold">{name}</h1>
                <p className="truncate text-xs sm:text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1 rounded-full border-border/70 bg-card/50 text-xs">
                    <verification.icon className={`h-3.5 w-3.5 ${verification.tint}`} aria-hidden />
                    {verification.label}
                  </Badge>
                  <Badge variant="outline" className="gap-1 rounded-full border-border/70 bg-card/50 text-xs">
                    <Crown className={`h-3.5 w-3.5 ${tier.tint}`} aria-hidden />
                    {tier.name}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Wallet */}
            <div className="glass mt-6 flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Wallet balance</div>
                {stats ? (
                  <div className="font-display text-2xl sm:text-3xl font-bold">{currency(stats.balance)}</div>
                ) : (
                  <Skeleton className="mt-1 h-8 w-28" />
                )}
              </div>
              <Button asChild className="btn-gradient shrink-0 rounded-xl">
                <Link to="/wallet">Top up</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "Trips", value: stats?.trips },
                { label: "Active", value: stats?.active },
                { label: "Saved", value: stats?.saved },
              ].map((s) => (
                <div key={s.label} className="glass min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center">
                  {stats ? (
                    <div className="font-display text-xl sm:text-2xl font-bold">{s.value}</div>
                  ) : (
                    <Skeleton className="mx-auto h-7 w-8" />
                  )}
                  <div className="mt-0.5 truncate text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {quick.map((q, i) => (
                <Link
                  key={q.to}
                  to={q.to as any}
                  className="glass lift flex flex-col items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 text-center text-xs font-medium min-w-0"
                  style={{ animation: `sy-rise 520ms ${i * 60}ms both` }}
                >
                  <span className="glass grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-xl shrink-0">
                    <q.icon className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${q.tint}`} aria-hidden />
                  </span>
                  <span className="truncate w-full">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Rewards */}
          <section className="glass mt-6 flex items-center gap-4 p-5">
            <span className="glass grid h-11 w-11 shrink-0 place-items-center rounded-xl">
              <Gift className="h-5 w-5 text-ember" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Rewards · {tier.name} tier</div>
              <p className="text-xs text-muted-foreground">
                {stats ? `${stats.trips} completed trips — keep riding to unlock better perks.` : "Loading your rewards…"}
              </p>
            </div>
          </section>

          {/* Shortcuts */}
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Settings & dashboards</h2>
            <div className="glass divide-y divide-border overflow-hidden">
              {shortcuts.map((s) => (
                <Link key={s.to} to={s.to as any} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-accent/40">
                  <s.icon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.body}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
              <button onClick={signOut} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-destructive/10">
                <LogOut className="h-4.5 w-4.5 shrink-0 text-destructive" aria-hidden />
                <span className="flex-1 text-sm font-medium text-destructive">Sign out</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
