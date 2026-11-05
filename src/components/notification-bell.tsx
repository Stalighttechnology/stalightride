import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck, Calendar, AlertTriangle, Banknote } from "lucide-react";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  _synthetic?: boolean;
  _icon?: "calendar" | "warning" | "payout";
};

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function NotifIcon({ icon }: { icon?: string }) {
  if (icon === "calendar") return <Calendar className="h-3.5 w-3.5 text-brand" />;
  if (icon === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (icon === "payout") return <Banknote className="h-3.5 w-3.5 text-emerald-600" />;
  return <span className="h-2 w-2 rounded-full bg-brand" />;
}

/** Live in-app notification centre — combines DB rows with client-side derived alerts. */
export function NotificationBell({ className }: { className?: string }) {
  const { user } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [smartItems, setSmartItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  /* ── Load DB notifications ── */
  useEffect(() => {
    if (!user) { setItems([]); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,title,body,link,read,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (!cancelled) setItems((data as Notification[]) ?? []);
    })();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 25)),
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.id]);

  /* ── Build smart / derived notifications when bell opens ── */
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;

    (async () => {
      const derived: Notification[] = [];
      const now = new Date();

      /* 1. Upcoming booking reminder — starts within 24 h */
      const { data: upcoming } = await supabase
        .from("bookings")
        .select("id,start_date,pickup_time,vehicles(title)")
        .eq("customer_id", user.id)
        .eq("status", "confirmed")
        .eq("payment_status", "paid")
        .gte("start_date", now.toISOString().slice(0, 10))
        .order("start_date", { ascending: true })
        .limit(5);

      (upcoming ?? []).forEach((b: any) => {
        const start = new Date(`${b.start_date}T${b.pickup_time ?? "10:00"}`);
        const hoursLeft = (start.getTime() - now.getTime()) / 3_600_000;
        if (hoursLeft >= 0 && hoursLeft <= 24) {
          derived.push({
            id: `upcoming-${b.id}`,
            title: "Trip reminder",
            body: `Your booking of ${b.vehicles?.title ?? "vehicle"} starts ${hoursLeft < 1 ? "in under an hour" : `in ~${Math.round(hoursLeft)} hours`}.`,
            link: "/bookings",
            read: false,
            created_at: now.toISOString(),
            _synthetic: true,
            _icon: "calendar",
          });
        }
      });

      /* 2. Document expiry — DL / vehicle docs expiring within 30 days */
      const { data: profile } = await supabase
        .from("profiles")
        .select("dl_expiry")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.dl_expiry) {
        const expiry = new Date(profile.dl_expiry);
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
        if (daysLeft >= 0 && daysLeft <= 30) {
          derived.push({
            id: "dl-expiry",
            title: "Driving licence expiring soon",
            body: `Your DL expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew it to keep booking.`,
            link: "/profile",
            read: false,
            created_at: now.toISOString(),
            _synthetic: true,
            _icon: "warning",
          });
        }
      }

      /* 3. Payout received — payouts status changed to 'paid' in last 7 days */
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const { data: payouts } = await (supabase as any)
        .from("payouts")
        .select("id,amount,created_at")
        .eq("vendor_id", user.id)
        .eq("status", "paid")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(3);

      (payouts ?? []).forEach((p: any) => {
        derived.push({
          id: `payout-${p.id}`,
          title: "Payout received",
          body: `₹${Number(p.amount).toLocaleString("en-IN")} has been transferred to your account.`,
          link: "/wallet",
          read: false,
          created_at: p.created_at,
          _synthetic: true,
          _icon: "payout",
        });
      });

      if (!cancelled) setSmartItems(derived);
    })();

    return () => { cancelled = true; };
  }, [open, user?.id]);

  /* ── Merge & sort ── */
  const allItems = [...smartItems, ...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const unread = allItems.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setSmartItems([]);
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read && !n._synthetic) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={`relative rounded-full ${className ?? ""}`} aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <CheckCheck className="h-3.5 w-3.5" />Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {allItems.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
          )}
          {allItems.map((n) => {
            const inner = (
              <div className={`flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60 ${n.read ? "" : "bg-brand/5"}`}>
                <span className="mt-1.5 shrink-0">
                  {n._synthetic ? <NotifIcon icon={n._icon} /> : (
                    <span className={`block h-2 w-2 rounded-full ${n.read ? "bg-border" : "bg-brand"}`} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            );
            return (
              <div key={n.id} className="border-b border-border/60 last:border-0">
                {n.link ? (
                  <Link to={n.link as any} onClick={() => openItem(n)} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button className="block w-full text-left" onClick={() => openItem(n)}>
                    {inner}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
