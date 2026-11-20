import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

const hostCache = new Map<string, boolean>();

export function useIsHost() {
  const { user } = useSession();
  const [isHost, setIsHost] = useState<boolean>(() => {
    if (!user) return false;
    return hostCache.get(user.id) ?? false;
  });

  useEffect(() => {
    if (!user) {
      setIsHost(false);
      return;
    }

    if (hostCache.has(user.id)) {
      setIsHost(hostCache.get(user.id)!);
    }

    let isMounted = true;

    async function checkHostStatus() {
      if (!user) return;
      // Check both user_roles and vendors table
      const [{ data: roleData }, { data: vendorData }] = await Promise.all([
        api
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "vendor")
          .maybeSingle(),
        api.from("vendors").select("id").eq("id", user.id).maybeSingle(),
      ]);

      const result = Boolean(roleData || vendorData);
      hostCache.set(user.id, result);
      if (isMounted) {
        setIsHost(result);
      }
    }

    checkHostStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return isHost;
}
