import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useActiveRole } from "@/hooks/use-active-role";
import { resolveNotificationDestination } from "@/lib/notification-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck, Calendar, AlertTriangle, Banknote, BellRing, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
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
  const { activeRole } = useActiveRole();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestBrowserPush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return toast.info("Browser push notifications are not supported by this browser.");
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setPushEnabled(true);
      toast.success("Push notifications enabled! You will receive live booking and trip alerts.");
      try {
        new Notification("Synchoo Alerts Active", {
          body: "You will receive timely reminders for upcoming trips and vehicle handovers.",
          icon: "/favicon.ico",
        });
      } catch (err) {
        // Ignored
      }
    } else {
      toast.error("Push notification permission was denied.");
    }
  };

  /* ── Load DB notifications ── */
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data } = await api
        .from("notifications")
        .select("id,title,body,link,read,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (!cancelled) setItems((data as Notification[]) ?? []);
    })();

    const channel = api
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 25)),
      )
      .subscribe();

    return () => {
      cancelled = true;
      api.removeChannel(channel);
    };
  }, [user?.id]);

  /* ── Merge & sort ── */
  const allItems = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const unread = allItems.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await api.from("notifications").update({ read: true }).eq("id", n.id);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    await openItem(n);
    const dest = resolveNotificationDestination(n, activeRole);
    if (!dest) return;

    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

    // If already on destination page, seamlessly switch tab and dispatch tab event
    if (dest.path === currentPath) {
      if (dest.tab) {
        window.dispatchEvent(new CustomEvent("synchoo:tab-change", { detail: dest.tab }));
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("tab", dest.tab);
          window.history.replaceState({}, "", url.toString());
        }
      }
      return;
    }

    // Navigate to target path
    if (dest.tab) {
      navigate({
        to: dest.path as any,
        search: (dest.search || { tab: dest.tab }) as any,
      });
    } else {
      navigate({
        to: dest.path as any,
      });
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative rounded-full ${className ?? ""}`}
          aria-label="Notifications"
        >
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
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {allItems.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          )}
          {allItems.map((n) => {
            const dest = resolveNotificationDestination(n, activeRole);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={`flex items-start justify-between gap-3 w-full p-4 text-left transition-colors hover:bg-muted/70 cursor-pointer border-b border-border/60 last:border-0 ${
                  n.read ? "" : "bg-brand/5"
                }`}
              >
                <div className="flex gap-3 min-w-0">
                  <span className="mt-1.5 shrink-0">
                    <span
                      className={`block h-2 w-2 rounded-full ${n.read ? "bg-border" : "bg-brand"}`}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                    {n.body && (
                      <p className="line-clamp-2 text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(n.created_at)}
                      </span>
                      {dest.tab && (
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                          {dest.tab}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 mt-1" />
              </button>
            );
          })}
        </div>
        <div className="border-t border-border px-4 py-2.5 bg-muted/30 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <BellRing className="h-3 w-3 text-brand" /> Desktop Alerts
          </span>
          <button
            type="button"
            onClick={requestBrowserPush}
            className="text-brand font-medium hover:underline flex items-center gap-1 cursor-pointer"
          >
            {pushEnabled ? "Active ✓" : "Enable Push"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
