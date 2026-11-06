import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Car, UserRound, CalendarDays, Heart, Wallet as WalletIcon, LayoutDashboard,
  ShieldCheck, CarFront as Steering, Home, User as UserIcon, LogOut, LogIn, Droplets, ScanLine, BadgeIndianRupee, Users, LifeBuoy,
  Sparkles, Building2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { useSession } from "@/hooks/use-session";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import synchooMark from "@/assets/synchoo-mark.png";

type Item = { to: string; label: string; icon: any };

const exploreItems: Item[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/browse", label: "Browse rides", icon: Car },
  { to: "/pooling", label: "Car pooling", icon: Users },
  { to: "/drivers", label: "Hire a driver", icon: UserRound },
  { to: "/wash", label: "Vehicle wash", icon: Droplets },
];

const accountItems: Item[] = [
  { to: "/account", label: "Account hub", icon: UserIcon },
  { to: "/bookings", label: "My trips", icon: CalendarDays },
  { to: "/pooling/mine", label: "My pooling", icon: Users },
  { to: "/hires", label: "My drivers", icon: UserRound },
  { to: "/washes", label: "My washes", icon: Droplets },
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/wishlist", label: "Saved", icon: Heart },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

const earnItems: Item[] = [
  { to: "/earn", label: "Earning options", icon: BadgeIndianRupee },
  { to: "/vendor", label: "Host dashboard", icon: LayoutDashboard },
  { to: "/driver-dashboard", label: "Driver dashboard", icon: Steering },
  { to: "/cleaner-dashboard", label: "Cleaner dashboard", icon: Sparkles },
  { to: "/wash-center-dashboard", label: "Washing center", icon: Building2 },
  { to: "/pooling/driver", label: "Pooling trips", icon: Users },
  { to: "/scan", label: "Scan QR handover", icon: ScanLine },
];




export function AppSidebar() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (to: string) =>
    to === "/" || to === "/wash" ? pathname === to : pathname.startsWith(to);
  const close = () => { if (isMobile) setOpenMobile(false); };

  const signOut = async () => {
    close();
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const initial = (user?.user_metadata?.full_name || user?.email || "U").toString().charAt(0).toUpperCase();

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
            <img src={synchooMark} alt="Synchoo" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
            {!collapsed && <span className="truncate font-display text-base font-bold tracking-tight">Synchoo</span>}
          </Link>
          {!collapsed && <SidebarTrigger className="shrink-0" aria-label="Collapse navigation" />}
        </div>
        {collapsed && (
          <SidebarTrigger className="mx-auto" aria-label="Expand navigation" />
        )}
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Explore", exploreItems)}
        {user && renderGroup("Your account", accountItems)}
        {renderGroup("Earn with us", user ? earnItems : earnItems.slice(0, 1))}
        {user && isAdmin && renderGroup("Admin", [{ to: "/admin", label: "Admin panel", icon: ShieldCheck }])}
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
