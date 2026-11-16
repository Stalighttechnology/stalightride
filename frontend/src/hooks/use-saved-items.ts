import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "./use-session";

const SAVED_DRIVERS_STORAGE_KEY = "synchoo_saved_drivers";

export function useSavedDrivers() {
  const { user } = useSession();
  const storageKey = user?.id
    ? `${SAVED_DRIVERS_STORAGE_KEY}_${user.id}`
    : `${SAVED_DRIVERS_STORAGE_KEY}_guest`;

  const [savedDriverIds, setSavedDriverIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setSavedDriverIds(raw ? JSON.parse(raw) : []);
    } catch {
      setSavedDriverIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    const handleStorage = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        setSavedDriverIds(raw ? JSON.parse(raw) : []);
      } catch {}
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("synchoo_saved_drivers_updated", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("synchoo_saved_drivers_updated", handleStorage);
    };
  }, [storageKey]);

  const isDriverSaved = useCallback(
    (driverId: string) => savedDriverIds.includes(driverId),
    [savedDriverIds]
  );

  const toggleSaveDriver = useCallback(
    (driverId: string, driverName?: string) => {
      setSavedDriverIds((prev) => {
        const exists = prev.includes(driverId);
        const next = exists ? prev.filter((id) => id !== driverId) : [...prev, driverId];
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
          window.dispatchEvent(new Event("synchoo_saved_drivers_updated"));
        } catch {}

        if (exists) {
          toast.success(
            driverName ? `Removed ${driverName} from saved` : "Removed driver from saved",
          );
        } else {
          toast.success(
            driverName ? `Saved ${driverName} to favorites!` : "Saved driver to favorites!",
          );
        }
        return next;
      });
    },
    [storageKey]
  );

  return { savedDriverIds, isDriverSaved, toggleSaveDriver };
}
