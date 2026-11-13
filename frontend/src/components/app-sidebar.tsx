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
  ScanLine,
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
} from "lucide-react";
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
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useProviderStatus } from "@/hooks/use-provider-status";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import synchooMark from "@/assets/synchoo-mark.png";

type Item = { to: string; label: string; icon: any };

const exploreItems: Item[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/browse", label: "Browse rides", icon: Car },
  { to: "/pooling", label: "Car pooling", icon: Users },
  { to: "/drivers", label: "Hire a driver", icon: UserRound },
  { to: "/wash", label: "Vehicle wash", icon: Droplets },
  { to: "/corporate", label: "Corporate travel", icon: Briefcase },
  { to: "/rewards", label: "Synchoo Rewards", icon: Award },
  { to: "/referrals", label: "Refer & earn", icon: Gift },
  { to: "/safety", label: "Safety center", icon: ShieldAlert },
  { to: "/membership", label: "Membership", icon: Crown },
];

const historySubItems: Item[] = [
  { to: "/bookings", label: "My trips", icon: CalendarDays },
  { to: "/pooling/mine", label: "My pooling", icon: Users },
  { to: "/hires", label: "My drivers", icon: UserRound },
  { to: "/washes", label: "My washes", icon: Droplets },
];

const subsequentAccountItems: Item[] = [
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/rewards", label: "Synchoo Points", icon: Award },
  { to: "/referrals", label: "Refer & earn", icon: Gift },
  { to: "/wishlist", label: "Saved", icon: Heart },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

const earnItems: Item[] = [{ to: "/earn", label: "Earn with us", icon: BadgeIndianRupee }];

export function AppSidebar() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const { isHost, driverStatus, cleanerStatus, washCenterStatus, hasAnyVerifiedRole } =
    useProviderStatus();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (to: string) =>
    to === "/" || to === "/wash" ? pathname === to : pathname.startsWith(to);
  const isHistoryActive = historySubItems.some((item) => isActive(item.to));
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
          {!collapsed && <SidebarTrigger className="shrink-0" aria-label="Collapse navigation" />}
        </div>
        {collapsed && <SidebarTrigger className="mx-auto" aria-label="Expand navigation" />}
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Explore", exploreItems)}

        {/* Your account with History collapsible */}
        {user && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Your account</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Account hub */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/account")} tooltip="Account hub">
                    <Link to="/account" onClick={close} className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Account hub</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* History button — clicking presents all 4 vertically, defaulting to My trips */}
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
                        {historySubItems.map((sub) => (
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

                {/* Next all buttons kept intact */}
                {subsequentAccountItems.map((item) => (
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

        {/* Earn with us — single clean button for all users */}
        {renderGroup("Earn with us", earnItems)}

        {/* Provider console — visible only after respective verification */}
        {user && hasAnyVerifiedRole && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Provider console</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {isHost && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive("/vendor")}
                        tooltip="Host dashboard"
                      >
                        <Link to="/vendor" onClick={close} className="flex items-center gap-2">
                          <LayoutDashboard className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>Host dashboard</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive("/vendor/vehicles/new")}
                        tooltip="Add vehicle"
                      >
                        <Link
                          to="/vendor/vehicles/new"
                          onClick={close}
                          className="flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>Add vehicle</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive("/scan")}
                        tooltip="Scan QR handover"
                      >
                        <Link to="/scan" onClick={close} className="flex items-center gap-2">
                          <ScanLine className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>Scan QR handover</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
                {driverStatus === "approved" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/driver-dashboard")}
                      tooltip="Driver dashboard"
                    >
                      <Link
                        to="/driver-dashboard"
                        onClick={close}
                        className="flex items-center gap-2"
                      >
                        <Steering className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Driver dashboard</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {cleanerStatus === "approved" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/cleaner-dashboard")}
                      tooltip="Cleaner dashboard"
                    >
                      <Link
                        to="/cleaner-dashboard"
                        onClick={close}
                        className="flex items-center gap-2"
                      >
                        <Sparkles className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Cleaner dashboard</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {washCenterStatus === "approved" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/wash-center-dashboard")}
                      tooltip="Washing center"
                    >
                      <Link
                        to="/wash-center-dashboard"
                        onClick={close}
                        className="flex items-center gap-2"
                      >
                        <Building2 className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Washing center</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user &&
          isAdmin &&
          renderGroup("Admin", [{ to: "/admin", label: "Admin panel", icon: ShieldCheck }])}
        {renderGroup("Help & privacy", [
          { to: "/help", label: "User manual", icon: LifeBuoy },
          { to: "/data-deletion", label: "Privacy & data", icon: ShieldCheck },
        ])}
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
