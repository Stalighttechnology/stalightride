import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "./use-session";
import { api } from "@/lib/api";

const SAVED_DRIVERS_STORAGE_KEY = "synchoo_saved_drivers";
const SAVED_VEHICLES_STORAGE_KEY = "synchoo_saved_vehicles";
export const SAVED_VEHICLES_EVENT = "synchoo_saved_vehicles_updated";

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

export function useSavedVehicles() {
  const { user } = useSession();
  const storageKey = user?.id
    ? `${SAVED_VEHICLES_STORAGE_KEY}_${user.id}`
    : `${SAVED_VEHICLES_STORAGE_KEY}_guest`;

  const [savedVehicleIds, setSavedVehicleIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Sync from DB when user is authenticated
  useEffect(() => {
    if (!user) {
      try {
        const raw = localStorage.getItem(storageKey);
        setSavedVehicleIds(raw ? JSON.parse(raw) : []);
      } catch {
        setSavedVehicleIds([]);
      }
      return;
    }

    let isMounted = true;
    api
      .from("wishlists")
      .select("vehicle_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (data && !error) {
          const ids = data.map((row: any) => row.vehicle_id);
          setSavedVehicleIds(ids);
          try {
            localStorage.setItem(storageKey, JSON.stringify(ids));
          } catch {}
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.id, storageKey]);

  // Listen for cross-component and tab updates
  useEffect(() => {
    const handleStorage = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        setSavedVehicleIds(raw ? JSON.parse(raw) : []);
      } catch {}
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SAVED_VEHICLES_EVENT, handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SAVED_VEHICLES_EVENT, handleStorage);
    };
  }, [storageKey]);

  const isVehicleSaved = useCallback(
    (vehicleId: string) => savedVehicleIds.includes(vehicleId),
    [savedVehicleIds]
  );

  const toggleSaveVehicle = useCallback(
    async (vehicleId: string, vehicleTitle?: string) => {
      const exists = savedVehicleIds.includes(vehicleId);
      const next = exists
        ? savedVehicleIds.filter((id) => id !== vehicleId)
        : [...savedVehicleIds, vehicleId];

      setSavedVehicleIds(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        window.dispatchEvent(new Event(SAVED_VEHICLES_EVENT));
      } catch {}

      if (user) {
        try {
          if (exists) {
            await api.from("wishlists").delete().eq("user_id", user.id).eq("vehicle_id", vehicleId);
          } else {
            await api.from("wishlists").insert({ user_id: user.id, vehicle_id: vehicleId });
          }
        } catch (err) {
          console.error("Failed to sync wishlist with database", err);
        }
      }

      if (exists) {
        toast.success(
          vehicleTitle ? `Removed ${vehicleTitle} from saved` : "Removed vehicle from saved"
        );
      } else {
        toast.success(
          vehicleTitle ? `Saved ${vehicleTitle} to favorites!` : "Saved ride to favorites!"
        );
      }
    },
    [savedVehicleIds, storageKey, user]
  );

  return { savedVehicleIds, isVehicleSaved, toggleSaveVehicle };
}
