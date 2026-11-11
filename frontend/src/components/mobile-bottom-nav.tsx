import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Car, Wallet as WalletIcon, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/browse", label: "Browse", icon: Car },
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/account", label: "Account", icon: UserRound },
];

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const active = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="pointer-events-auto mx-3 mb-3 glass-blur flex items-stretch justify-between gap-1 p-1.5 shadow-float">
        {items.map((it) => {
          const isActive = active(it.to, it.exact);
          return (
            <Link
              key={it.to}
              to={it.to as any}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all duration-300",
                isActive
                  ? "text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-xl bg-brand/12 shadow-glow"
                />
              )}
              <it.icon className={cn("relative h-5 w-5 transition-transform", isActive && "scale-110")} />
              <span className="relative">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
