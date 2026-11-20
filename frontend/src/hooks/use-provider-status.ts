import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useIsHost } from "@/hooks/use-is-host";

export type RoleVerificationStatus = "approved" | "pending" | "rejected" | "none";

export interface ProviderStatus {
  isHost: boolean;
  driverStatus: RoleVerificationStatus;
  cleanerStatus: RoleVerificationStatus;
  washCenterStatus: RoleVerificationStatus;
  hasAnyVerifiedRole: boolean;
}

const providerStatusCache = new Map<
  string,
  {
    driverStatus: RoleVerificationStatus;
    cleanerStatus: RoleVerificationStatus;
    washCenterStatus: RoleVerificationStatus;
  }
>();

export function useProviderStatus(): ProviderStatus {
  const { user } = useSession();
  const isHost = useIsHost();
  const cached = user ? providerStatusCache.get(user.id) : undefined;
  const [driverStatus, setDriverStatus] = useState<RoleVerificationStatus>(
    () => cached?.driverStatus ?? "none",
  );
  const [cleanerStatus, setCleanerStatus] = useState<RoleVerificationStatus>(
    () => cached?.cleanerStatus ?? "none",
  );
  const [washCenterStatus, setWashCenterStatus] = useState<RoleVerificationStatus>(
    () => cached?.washCenterStatus ?? "none",
  );

  useEffect(() => {
    if (!user) {
      setDriverStatus("none");
      setCleanerStatus("none");
      setWashCenterStatus("none");
      return;
    }

    if (providerStatusCache.has(user.id)) {
      const c = providerStatusCache.get(user.id)!;
      setDriverStatus(c.driverStatus);
      setCleanerStatus(c.cleanerStatus);
      setWashCenterStatus(c.washCenterStatus);
    }

    let isMounted = true;

    async function fetchStatuses() {
      try {
        const [driverRes, cleanerRes, centerRes] = await Promise.all([
          api.from("drivers").select("verification_status").eq("id", user!.id).maybeSingle(),
          api.from("cleaners").select("verification_status").eq("id", user!.id).maybeSingle(),
          api.from("wash_centers").select("verification_status").eq("id", user!.id).maybeSingle(),
        ]);

        if (!isMounted) return;

        const d = (driverRes.data?.verification_status as RoleVerificationStatus) || "none";
        const c = (cleanerRes.data?.verification_status as RoleVerificationStatus) || "none";
        const w = (centerRes.data?.verification_status as RoleVerificationStatus) || "none";

        providerStatusCache.set(user!.id, {
          driverStatus: d,
          cleanerStatus: c,
          washCenterStatus: w,
        });

        setDriverStatus(d);
        setCleanerStatus(c);
        setWashCenterStatus(w);
      } catch {
        // ignore errors
      }
    }

    fetchStatuses();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const hasAnyVerifiedRole =
    isHost ||
    driverStatus === "approved" ||
    cleanerStatus === "approved" ||
    washCenterStatus === "approved";

  return {
    isHost,
    driverStatus,
    cleanerStatus,
    washCenterStatus,
    hasAnyVerifiedRole,
  };
}
