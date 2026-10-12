import { Link, useNavigate } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Heart, CalendarDays, LayoutDashboard, LogOut, User as UserIcon, ShieldCheck, Wallet as WalletIcon, UserRound, CarFront as Steering } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import synchooMark from "@/assets/synchoo-mark.png";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CitySelector } from "@/components/city-selector";
import { NotificationBell } from "@/components/notification-bell";


export function SiteHeader() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const initial = (user?.user_metadata?.full_name || user?.email || "U")
    .toString().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SidebarTrigger className="-ml-1 shrink-0 md:hidden" aria-label="Open navigation" />
          <Link to="/" className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:hidden">
            <img src={synchooMark} alt="Synchoo" width={32} height={32} className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 object-contain" />
            <span className="truncate font-display text-sm sm:text-base font-bold tracking-tight text-foreground">Synchoo</span>
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <CitySelector />
          <NotificationBell />
          <ThemeToggle className="hidden sm:inline-flex" />
          <InstallPwaButton className="hidden lg:inline-flex" />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-background p-1 transition-colors hover:bg-muted">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-muted text-foreground text-xs">{initial}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 h-4 w-4" />Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/bookings"><CalendarDays className="mr-2 h-4 w-4" />My trips</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wallet"><WalletIcon className="mr-2 h-4 w-4" />Wallet</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wishlist"><Heart className="mr-2 h-4 w-4" />Saved</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/hires"><UserRound className="mr-2 h-4 w-4" />My drivers</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/vendor"><LayoutDashboard className="mr-2 h-4 w-4" />Host dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/driver-dashboard"><Steering className="mr-2 h-4 w-4" />Driver dashboard</Link></DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" />Admin panel</Link></DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/auth">Sign in</Link></Button>
              <Button asChild size="sm" className="h-8 sm:h-9 px-2.5 sm:px-4 text-xs sm:text-sm rounded-full bg-brand text-brand-foreground hover:bg-brand/90"><Link to="/auth" search={{ mode: "signup" } as any}>Get started</Link></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
