import { useEffect, useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useProviderStatus } from "@/hooks/use-provider-status";
import {
  User as UserIcon,
  LayoutDashboard,
  CarFront,
  Sparkles,
  Building2,
  ShieldCheck,
  LucideIcon,
} from "lucide-react";

export type AppRole =
  | "customer"
  | "host"
  | "cleaner"
  | "wash_center"
  | "driver"
  | "admin";

export interface RoleInfo {
  role: AppRole;
  label: string;
  badge: string;
  homePath: string;
  icon: LucideIcon;
  description: string;
}

export const ROLE_DEFINITIONS: Record<AppRole, RoleInfo> = {
  customer: {
    role: "customer",
    label: "Customer",
    badge: "Rider",
    homePath: "/",
    icon: UserIcon,
    description: "Book rentals, drivers, carpools & washes",
  },
  host: {
    role: "host",
    label: "Host",
    badge: "Vehicle Host",
    homePath: "/vendor",
    icon: LayoutDashboard,
    description: "Manage fleet, bookings & vehicle handovers",
  },
  driver: {
    role: "driver",
    label: "Driver",
    badge: "Hireable Driver",
    homePath: "/driver-dashboard",
    icon: CarFront,
    description: "Job requests, carpooling & ride tracking",
  },
  cleaner: {
    role: "cleaner",
    label: "Cleaner",
    badge: "Doorstep Cleaner",
    homePath: "/cleaner-dashboard",
    icon: Sparkles,
    description: "Claim & execute vehicle wash orders",
  },
  wash_center: {
    role: "wash_center",
    label: "Wash Center",
    badge: "Auto Spa / Center",
    homePath: "/wash-center-dashboard",
    icon: Building2,
    description: "Manage bays, appointments & wash packages",
  },
  admin: {
    role: "admin",
    label: "Admin",
    badge: "Super Admin",
    homePath: "/admin",
    icon: ShieldCheck,
    description: "Verifications, bookings monitor & platform settings",
  },
};

export function useActiveRole() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const { isHost, driverStatus, cleanerStatus, washCenterStatus } = useProviderStatus();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isDriver = driverStatus === "approved";
  const isCleaner = cleanerStatus === "approved";
  const isWashCenter = washCenterStatus === "approved";

  const activeRole = useMemo<AppRole>(() => {
    if (!user) return "customer";

    // 1. Explicit management/provider route matching (instant check, no async delay)
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/vendor")) return "host";
    if (
      pathname.startsWith("/driver-dashboard") ||
      pathname === "/pooling/driver" ||
      pathname === "/pooling/new"
    ) {
      return "driver";
    }
    if (pathname.startsWith("/cleaner-dashboard")) return "cleaner";
    if (pathname.startsWith("/wash-center-dashboard")) return "wash_center";

    // 2. Remembered active role selection (when user manually toggled role)
    const storedRole =
      typeof sessionStorage !== "undefined"
        ? (sessionStorage.getItem("synchoo_active_role") as AppRole | null)
        : null;
    if (storedRole) {
      if (storedRole === "driver" && isDriver) return "driver";
      if (storedRole === "host" && isHost) return "host";
      if (storedRole === "cleaner" && isCleaner) return "cleaner";
      if (storedRole === "wash_center" && isWashCenter) return "wash_center";
      if (storedRole === "admin" && isAdmin) return "admin";
      if (storedRole === "customer") return "customer";
    }

    // 3. Explicit customer-focused catalog routes
    if (
      pathname.startsWith("/browse") ||
      pathname.startsWith("/vehicle") ||
      pathname.startsWith("/drivers") ||
      pathname.startsWith("/wash") ||
      pathname.startsWith("/corporate") ||
      pathname.startsWith("/membership") ||
      pathname.startsWith("/rewards") ||
      pathname.startsWith("/wishlist")
    ) {
      return "customer";
    }

    // 4. Default according to the account's approved role capability
    if (isAdmin) return "admin";
    if (isDriver) return "driver";
    if (isHost) return "host";
    if (isCleaner) return "cleaner";
    if (isWashCenter) return "wash_center";

    return "customer";
  }, [user, isAdmin, isHost, isDriver, isCleaner, isWashCenter, pathname]);

  const switchRole = (newRole: AppRole) => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("synchoo_active_role", newRole);
    }
  };

  const currentRoleInfo = ROLE_DEFINITIONS[activeRole] || ROLE_DEFINITIONS.customer;

  return {
    activeRole,
    currentRoleInfo,
    switchRole,
    isHost,
    isDriver,
    isCleaner,
    isWashCenter,
    isAdmin,
  };
}
