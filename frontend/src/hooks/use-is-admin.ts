import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

const adminCache = new Map<string, boolean>();

export function useIsAdmin() {
  const { user } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (!user) return false;
    return adminCache.get(user.id) ?? false;
  });

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    if (adminCache.has(user.id)) {
      setIsAdmin(adminCache.get(user.id)!);
    }

    api
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        const result = !!data;
        adminCache.set(user.id, result);
        setIsAdmin(result);
      });
  }, [user?.id]);
  return isAdmin;
}
