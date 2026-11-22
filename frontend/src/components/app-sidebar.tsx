import { useState, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Car,
  UserRound,
  CalendarDays,
  Heart,
  Wallet as WalletIcon,
  LayoutDashboard,
  ShieldCheck,
  CarFront as Steering,
  Home,
  User as UserIcon,
  LogOut,
  LogIn,
  Droplets,
  BadgeIndianRupee,
  Users,
  LifeBuoy,
  Sparkles,
  Building2,
  ShieldAlert,
  Crown,
  Briefcase,
  Gift,
  Award,
  Plus,
  History as HistoryIcon,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSession } from "@/hooks/use-session";
import { useActiveRole } from "@/hooks/use-active-role";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import synchooMark from "@/assets/synchoo-mark.png";

type Item = { to: string; label: string; icon: any; search?: Record<string, any> };

// Customer / Normal User Navigation Items
const customerBookItems: Item[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/browse", label: "Browse rides", icon: Car },
  { to: "/drivers", label: "Hire a driver", icon: UserRound },
  { to: "/pooling", label: "Car pooling", icon: Users },
  { to: "/wash", label: "Vehicle wash", icon: Droplets },
  { to: "/corporate", label: "Corporate travel", icon: Briefcase },
];

const customerHistoryItems: Item[] = [
  { to: "/bookings", label: "My trips", icon: CalendarDays },
  { to: "/pooling/mine", label: "My pooling", icon: Users },
  { to: "/hires", label: "My drivers", icon: UserRound },
  { to: "/washes", label: "My washes", icon: Droplets },
];

const customerAccountItems: Item[] = [
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/wishlist", label: "Saved", icon: Heart },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

const customerRewardsItems: Item[] = [
  { to: "/rewards", label: "Synchoo Rewards", icon: Award },
  { to: "/referrals", label: "Refer & earn", icon: Gift },
  { to: "/membership", label: "Membership", icon: Crown },
];

const customerEarnItems: Item[] = [{ to: "/earn", label: "Earn with us", icon: BadgeIndianRupee }];

const helpItems: Item[] = [
  { to: "/safety", label: "Safety center", icon: ShieldAlert },
  { to: "/help", label: "User manual", icon: LifeBuoy },
  { to: "/data-deletion", label: "Privacy & data", icon: ShieldCheck },
];

// Host / Vendor Navigation Items
const hostFleetItems: Item[] = [
  { to: "/vendor", label: "Host dashboard", icon: LayoutDashboard },
  { to: "/bookings", label: "Host trips", icon: CalendarDays, search: { tab: "vendor" } },
  { to: "/vendor/vehicles/new", label: "Add vehicle", icon: Plus },
];

const hostFinanceItems: Item[] = [
  { to: "/wallet", label: "Host wallet & payouts", icon: WalletIcon },
];

const hostAccountItems: Item[] = [
  { to: "/profile", label: "Host profile & KYC", icon: UserIcon },
];

// Driver Navigation Items
const driverOpsItems: Item[] = [
  { to: "/driver-dashboard", label: "Driver dashboard", icon: Steering },
  { to: "/pooling/driver", label: "Carpool trips", icon: Users },
  { to: "/pooling/new", label: "Offer a pool ride", icon: Plus },
];

const driverFinanceItems: Item[] = [
  { to: "/wallet", label: "Driver earnings", icon: WalletIcon },
];

const driverAccountItems: Item[] = [
  { to: "/profile", label: "Driver profile & DL", icon: UserIcon },
];

// Cleaner Navigation Items
const cleanerOpsItems: Item[] = [
  { to: "/cleaner-dashboard", label: "Cleaner dashboard", icon: Sparkles },
];

const cleanerFinanceItems: Item[] = [
  { to: "/wallet", label: "Cleaner earnings", icon: WalletIcon },
];

const cleanerAccountItems: Item[] = [
  { to: "/profile", label: "Cleaner profile", icon: UserIcon },
];

// Wash Center Navigation Items
const washCenterOpsItems: Item[] = [
  { to: "/wash-center-dashboard", label: "Center dashboard", icon: Building2 },
];

const washCenterFinanceItems: Item[] = [
  { to: "/wallet", label: "Center revenue", icon: WalletIcon },
];

const washCenterAccountItems: Item[] = [
  { to: "/profile", label: "Center profile", icon: UserIcon },
];

// Admin Navigation Items
const adminItems: Item[] = [
  { to: "/admin", label: "Admin console", icon: ShieldCheck },
];

export function AppSidebar() {
  const { user } = useSession();
  const { activeRole, isDriver, switchRole } = useActiveRole();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (to: string) => {
    const basePath = to.split("?")[0];
    return basePath === "/" || basePath === "/wash" || basePath === "/vendor" || basePath === "/admin"
      ? pathname === basePath
      : pathname.startsWith(basePath);
  };

  const isHistoryActive = customerHistoryItems.some((item) => isActive(item.to));
  const [historyOpen, setHistoryOpen] = useState(isHistoryActive);

  useEffect(() => {
    if (isHistoryActive) {
      setHistoryOpen(true);
    }
  }, [isHistoryActive]);

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  const signOut = async () => {
    close();
    await api.auth.signOut();
    navigate({ to: "/" });
  };

  const initial = (user?.user_metadata?.full_name || user?.email || "U")
    .toString()
    .charAt(0)
    .toUpperCase();

  const renderGroup = (label: string, items: Item[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to + (item.search ? JSON.stringify(item.search) : "")}>
              <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                <Link
                  to={item.to as any}
                  search={item.search as any}
                  onClick={close}
                  className="flex items-center gap-2"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-1.5">
          <Link to="/" onClick={close} className="flex min-w-0 flex-1 items-center gap-2">
            <img
              src={synchooMark}
              alt="Synchoo"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            {!collapsed && (
              <span className="truncate font-display text-base font-bold tracking-tight">
                Synchoo
              </span>
            )}
          </Link>
          {isMobile ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              onClick={() => setOpenMobile(false)}
              aria-label="Close menu drawer"
            >
              <X className="h-5 w-5" />
            </Button>
          ) : (
            !collapsed && <SidebarTrigger className="shrink-0" aria-label="Collapse navigation" />
          )}
        </div>
        {!isMobile && collapsed && (
          <SidebarTrigger className="mx-auto" aria-label="Expand navigation" />
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* ======================================================== */}
        {/* 1. CUSTOMER MODE */}
        {/* ======================================================== */}
        {activeRole === "customer" && (
          <>
            {renderGroup("Book", customerBookItems)}

            {isDriver && (
              <SidebarGroup>
                {!collapsed && (
                  <div className="flex items-center justify-between px-2 pb-1">
                    <SidebarGroupLabel className="p-0 text-emerald-700 dark:text-emerald-400 font-semibold">
                      Driver console
                    </SidebarGroupLabel>
                    <button
                      type="button"
                      onClick={() => {
                        switchRole("driver");
                        navigate({ to: "/driver-dashboard" });
                        close();
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer underline"
                    >
                      Open view
                    </button>
                  </div>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {driverOpsItems.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                          <Link to={item.to as any} onClick={close} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            {!collapsed && <span>{item.label}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {user && (
              <SidebarGroup>
                {!collapsed && <SidebarGroupLabel>Your account</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/account")} tooltip="Account hub">
                        <Link to="/account" onClick={close} className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>Account hub</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <Collapsible
                      open={historyOpen}
                      onOpenChange={setHistoryOpen}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isHistoryActive}
                            tooltip="History"
                            onClick={(e) => {
                              if (!isHistoryActive) {
                                e.preventDefault();
                                setHistoryOpen(true);
                                navigate({ to: "/bookings" });
                                close();
                              }
                            }}
                            className="w-full flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <HistoryIcon className="h-4 w-4 shrink-0" />
                              {!collapsed && <span>History</span>}
                            </div>
                            {!collapsed && (
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                  historyOpen && "rotate-90",
                                )}
                              />
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {customerHistoryItems.map((sub) => (
                              <SidebarMenuSubItem key={sub.to}>
                                <SidebarMenuSubButton asChild isActive={isActive(sub.to)}>
                                  <Link
                                    to={sub.to as any}
                                    onClick={close}
                                    className="flex items-center gap-2"
                                  >
                                    <sub.icon className="h-3.5 w-3.5 shrink-0" />
                                    <span>{sub.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>

                    {customerAccountItems.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                          <Link to={item.to as any} onClick={close} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {renderGroup("Rewards & perks", customerRewardsItems)}
            {renderGroup("Earn with us", customerEarnItems)}
            {renderGroup("Help & safety", helpItems)}
          </>
        )}

        {/* ======================================================== */}
        {/* 2. HOST MODE */}
        {/* ======================================================== */}
        {activeRole === "host" && (
          <>
            {renderGroup("Fleet management", hostFleetItems)}
            {renderGroup("Finances", hostFinanceItems)}
            {renderGroup("Account & help", [...hostAccountItems, helpItems[0], helpItems[1]])}
          </>
        )}

        {/* ======================================================== */}
        {/* 3. DRIVER MODE */}
        {/* ======================================================== */}
        {activeRole === "driver" && (
          <>
            {!collapsed && (
              <div className="mx-2 mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                <div className="flex items-center justify-between gap-1">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Driver Mode
                    </span>
                    <p className="text-[10px] text-muted-foreground">Hire & pool ops active</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => {
                      switchRole("customer");
                      navigate({ to: "/browse" });
                      close();
                    }}
                  >
                    Rider view &rarr;
                  </Button>
                </div>
              </div>
            )}
            {renderGroup("Driver console", driverOpsItems)}
            {renderGroup("Finances", driverFinanceItems)}
            {renderGroup("Account & help", [...driverAccountItems, helpItems[0], helpItems[1]])}
          </>
        )}

        {/* ======================================================== */}
        {/* 4. CLEANER MODE */}
        {/* ======================================================== */}
        {activeRole === "cleaner" && (
          <>
            {renderGroup("Cleaner operations", cleanerOpsItems)}
            {renderGroup("Finances", cleanerFinanceItems)}
            {renderGroup("Account & help", [...cleanerAccountItems, helpItems[0], helpItems[1]])}
          </>
        )}

        {/* ======================================================== */}
        {/* 5. WASH CENTER MODE */}
        {/* ======================================================== */}
        {activeRole === "wash_center" && (
          <>
            {renderGroup("Center operations", washCenterOpsItems)}
            {renderGroup("Finances", washCenterFinanceItems)}
            {renderGroup("Account & help", [...washCenterAccountItems, helpItems[1]])}
          </>
        )}

        {/* ======================================================== */}
        {/* 6. ADMIN MODE */}
        {/* ======================================================== */}
        {activeRole === "admin" && (
          <>
            {renderGroup("Platform management", adminItems)}
            {renderGroup("System & audits", [helpItems[0]])}
            {renderGroup("Account", [{ to: "/admin", search: { tab: "profile" }, label: "Admin profile", icon: UserIcon }])}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={user.email ?? "Profile"}>
                  <Link to="/profile" onClick={close} className="flex items-center gap-2">
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarImage src={user.user_metadata?.avatar_url} />
                      <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                    </Avatar>
                    {!collapsed && <span className="truncate text-xs">{user.email}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={signOut} tooltip="Sign out">
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Sign out</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Sign in">
                <Link to="/auth" onClick={close} className="flex items-center gap-2">
                  <LogIn className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Sign in</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
