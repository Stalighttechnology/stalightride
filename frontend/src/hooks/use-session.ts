import { useEffect, useState } from "react";
import type { Session, User } from "@/lib/api";
import { api } from "@/lib/api";

export function useSession() {
  const [session, setSession] = useState<Session | null>(() => api.auth.getStoredSession());
  const [user, setUser] = useState<User | null>(() => api.auth.getStoredUser());
  const [loading, setLoading] = useState(() => !api.auth.getStoredUser());

  useEffect(() => {
    const { data: sub } = api.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    api.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
