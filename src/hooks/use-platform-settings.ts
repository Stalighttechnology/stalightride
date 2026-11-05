import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/charges";

/** Fee settings for price previews. Falls back to defaults until loaded (or if unavailable). */
export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("commission_pct, service_fee_pct, gst_pct, min_withdrawal")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSettings({
          commission_pct: Number(data.commission_pct),
          service_fee_pct: Number(data.service_fee_pct),
          gst_pct: Number(data.gst_pct),
          min_withdrawal: Number(data.min_withdrawal),
        });
      });
  }, []);
  return settings;
}
