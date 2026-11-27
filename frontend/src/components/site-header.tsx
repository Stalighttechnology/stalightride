import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { useActiveRole } from "@/hooks/use-active-role";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Heart,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Wallet as WalletIcon,
  UserRound,
  CarFront as Steering,
  Sparkles,
  Building2,
  ShieldAlert,
  Crown,
  Gift,
  Award,
  Plus,
  Users,
  Droplets,
  Menu,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import synchooMark from "@/assets/synchoo-mark.png";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CitySelector } from "@/components/city-selector";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

type NavPill = { to: string; label: string };

const ROLE_NAV_PILLS: Record<string, NavPill[]> = {
  customer: [
    { to: "/browse", label: "Rentals" },
    { to: "/pooling", label: "Carpooling" },
    { to: "/drivers", label: "Hire Driver" },
    { to: "/wash", label: "Doorstep Wash" },
  ],
  host: [
    { to: "/vendor", label: "Fleet Overview" },
    { to: "/vendor/vehicles/new", label: "Add Vehicle" },
    { to: "/wallet", label: "Payouts" },
  ],
  driver: [
    { to: "/driver-dashboard", label: "Driver Console" },
    { to: "/pooling/driver", label: "Carpool Trips" },
    { to: "/wallet", label: "Earnings" },
  ],
  cleaner: [
    { to: "/cleaner-dashboard", label: "Clean Orders" },
    { to: "/wallet", label: "Earnings" },
  ],
  wash_center: [
    { to: "/wash-center-dashboard", label: "Bays & Schedule" },
    { to: "/wallet", label: "Revenue" },
  ],
  admin: [
    { to: "/admin", label: "Super Admin" },
    { to: "/safety", label: "Safety Center" },
  ],
};

export function SiteHeader() {
  const { user } = useSession();
  const { activeRole, currentRoleInfo, isDriver, switchRole } = useActiveRole();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { toggleSidebar, openMobile, isMobile } = useSidebar();

  const signOut = async () => {
    await api.auth.signOut();
    navigate({ to: "/" });
  };

  const initial = (user?.user_metadata?.full_name || user?.email || "U")
    .toString()
    .charAt(0)
    .toUpperCase();

  const navPills = ROLE_NAV_PILLS[activeRole] || ROLE_NAV_PILLS.customer;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 sm:h-16 items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-6">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Menu Drawer Toggle Button for mobile and tab view */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobile ? openMobile : undefined}
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg lg:hidden hover:bg-muted text-foreground cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0 lg:hidden">
            <img
              src={synchooMark}
              alt="Synchoo"
              width={28}
              height={28}
              className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 object-contain"
            />
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-foreground">
              Synchoo
            </span>
          </Link>

          {/* Role-tailored top navigation pills */}
          <nav className="hidden lg:flex items-center gap-1 ml-2">
            {navPills.map((item) => {
              const active =
                item.to === "/browse"
                  ? pathname.startsWith("/browse") || pathname.startsWith("/vehicle")
                  : item.to === "/" || item.to === "/vendor" || item.to === "/admin"
                    ? pathname === item.to
                    : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <CitySelector />
          <NotificationBell />
          <ThemeToggle className="hidden sm:inline-flex" />
          <InstallPwaButton className="hidden lg:inline-flex" />

          {/* Quick Driver Console Toggle for verified drivers */}
          {user && isDriver && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className={cn(
                "hidden sm:inline-flex h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-full border shadow-2xs transition-colors cursor-pointer",
                activeRole === "driver"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                  : "text-muted-foreground hover:text-foreground border-border hover:border-emerald-500/30",
              )}
              onClick={() => switchRole(activeRole === "driver" ? "customer" : "driver")}
            >
              <Link to={activeRole === "driver" ? "/browse" : "/driver-dashboard"}>
                <Steering className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{activeRole === "driver" ? "Rider View" : "Driver Console"}</span>
              </Link>
            </Button>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-background p-1 transition-colors hover:bg-muted cursor-pointer">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                    <AvatarImage src={user.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-muted text-foreground text-xs">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <div className="font-medium text-xs truncate">{user.email}</div>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {isDriver && (
                      <Badge variant="outline" className="text-[10px] uppercase font-semibold bg-emerald-500/10 text-emerald-600 border-emerald-300 px-1.5 py-0">
                        Hireable Driver
                      </Badge>
                    )}
                    {currentRoleInfo.role !== "customer" && currentRoleInfo.role !== "driver" && (
                      <Badge variant="outline" className="text-[10px] uppercase font-semibold text-primary px-1.5 py-0">
                        {currentRoleInfo.badge}
                      </Badge>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />

                {/* 1. Customer Mode Menu */}
                {activeRole === "customer" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Profile & DL
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/bookings">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        My trips
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wallet">
                        <WalletIcon className="mr-2 h-4 w-4" />
                        Wallet
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wishlist">
                        <Heart className="mr-2 h-4 w-4" />
                        Saved rides
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/rewards">
                        <Award className="mr-2 h-4 w-4 text-amber-500" />
                        Synchoo Points
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/membership">
                        <Crown className="mr-2 h-4 w-4 text-amber-600" />
                        Membership
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/safety">
                        <ShieldAlert className="mr-2 h-4 w-4 text-red-500" />
                        Safety Center
                      </Link>
                    </DropdownMenuItem>

                    {isDriver && (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                          Driver Tools
                        </div>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/driver-dashboard"
                            onClick={() => switchRole("driver")}
                          >
                            <Steering className="mr-2 h-4 w-4 text-emerald-600" />
                            Driver Console
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/pooling/driver"
                            onClick={() => switchRole("driver")}
                          >
                            <Users className="mr-2 h-4 w-4 text-emerald-600" />
                            Carpool Trips
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}

                {/* 2. Host Mode Menu */}
                {activeRole === "host" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/vendor">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Host dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/vendor/vehicles/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Add vehicle
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wallet">
                        <WalletIcon className="mr-2 h-4 w-4" />
                        Payouts & Wallet
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Host Profile & KYC
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* 3. Driver Mode Menu */}
                {activeRole === "driver" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/driver-dashboard">
                        <Steering className="mr-2 h-4 w-4" />
                        Driver dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/pooling/driver">
                        <Users className="mr-2 h-4 w-4" />
                        Carpool trips
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wallet">
                        <WalletIcon className="mr-2 h-4 w-4" />
                        Driver earnings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Driver Profile & DL
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        switchRole("customer");
                        navigate({ to: "/browse" });
                      }}
                    >
                      <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      Switch to Rider View
                    </DropdownMenuItem>
                  </>
                )}

                {/* 4. Cleaner Mode Menu */}
                {activeRole === "cleaner" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/cleaner-dashboard">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Cleaner dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wallet">
                        <WalletIcon className="mr-2 h-4 w-4" />
                        Cleaner earnings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Cleaner Profile
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* 5. Wash Center Mode Menu */}
                {activeRole === "wash_center" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/wash-center-dashboard">
                        <Building2 className="mr-2 h-4 w-4" />
                        Center dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/wallet">
                        <WalletIcon className="mr-2 h-4 w-4" />
                        Center revenue
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Center Profile
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* 6. Admin Mode Menu */}
                {activeRole === "admin" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/admin">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Super Admin Console
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/safety">
                        <ShieldAlert className="mr-2 h-4 w-4" />
                        Safety Center
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/admin" search={{ tab: "profile" }}>
                        <UserIcon className="mr-2 h-4 w-4" />
                        Admin Profile
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="h-8 sm:h-9 px-2.5 sm:px-4 text-xs sm:text-sm rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Link to="/auth" search={{ mode: "signup" } as any}>
                  Get started
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
