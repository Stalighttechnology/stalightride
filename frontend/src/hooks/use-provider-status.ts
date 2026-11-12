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

export function useProviderStatus(): ProviderStatus {
  const { user } = useSession();
  const isHost = useIsHost();
  const [driverStatus, setDriverStatus] = useState<RoleVerificationStatus>("none");
  const [cleanerStatus, setCleanerStatus] = useState<RoleVerificationStatus>("none");
  const [washCenterStatus, setWashCenterStatus] = useState<RoleVerificationStatus>("none");

  useEffect(() => {
    if (!user) {
      setDriverStatus("none");
      setCleanerStatus("none");
      setWashCenterStatus("none");
      return;
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

        setDriverStatus((driverRes.data?.verification_status as RoleVerificationStatus) || "none");
        setCleanerStatus(
          (cleanerRes.data?.verification_status as RoleVerificationStatus) || "none",
        );
        setWashCenterStatus(
          (centerRes.data?.verification_status as RoleVerificationStatus) || "none",
        );
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
