import { useMemo } from "react";
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
    badge: "Professional Driver",
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

  const activeRole = useMemo<AppRole>(() => {
    if (!user) return "customer";

    // Honor explicit management/provider route if the user holds that role
    if (isAdmin && pathname.startsWith("/admin")) return "admin";
    if (isHost && (pathname.startsWith("/vendor") || pathname === "/scan")) return "host";
    if (
      driverStatus === "approved" &&
      (pathname.startsWith("/driver-dashboard") || pathname === "/pooling/driver")
    ) {
      return "driver";
    }
    if (cleanerStatus === "approved" && pathname.startsWith("/cleaner-dashboard")) {
      return "cleaner";
    }
    if (washCenterStatus === "approved" && pathname.startsWith("/wash-center-dashboard")) {
      return "wash_center";
    }

    // Default according to the account's approved role capability
    if (isAdmin) return "admin";
    if (cleanerStatus === "approved") return "cleaner";
    if (driverStatus === "approved") return "driver";
    if (washCenterStatus === "approved") return "wash_center";
    if (isHost) return "host";

    return "customer";
  }, [user, isAdmin, isHost, driverStatus, cleanerStatus, washCenterStatus, pathname]);

  const isDriver = driverStatus === "approved";
  const isCleaner = cleanerStatus === "approved";
  const isWashCenter = washCenterStatus === "approved";

  const currentRoleInfo = ROLE_DEFINITIONS[activeRole] || ROLE_DEFINITIONS.customer;

  return {
    activeRole,
    currentRoleInfo,
    isHost,
    isDriver,
    isCleaner,
    isWashCenter,
    isAdmin,
  };
}
