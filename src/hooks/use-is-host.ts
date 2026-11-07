import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export function useIsHost() {
  const { user } = useSession();
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsHost(false);
      return;
    }

    let isMounted = true;

    async function checkHostStatus() {
      if (!user) return;
      // Check both user_roles and vendors table
      const [{ data: roleData }, { data: vendorData }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "vendor")
          .maybeSingle(),
        supabase
          .from("vendors")
          .select("id")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (isMounted) {
        setIsHost(Boolean(roleData || vendorData));
      }
    }

    checkHostStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return isHost;
}

