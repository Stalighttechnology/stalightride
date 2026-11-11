import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { LatLng } from "@/lib/pool-match";
import { loadGoogleMaps, mapsBrowserKey } from "@/lib/gmaps";

interface Props {
  route: LatLng[];
  pickup?: LatLng | null;
  drop?: LatLng | null;
  className?: string;
}

/** Draws a pooling trip's route with the passenger's pickup / drop-off pins. */
export function PoolRouteMap({ route, pickup, drop, className }: Props) {
  const key = mapsBrowserKey();
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!key || !ref.current || route.length < 2) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !ref.current) return;
        const google = (window as any).google;
        const map = new google.maps.Map(ref.current, {
          center: route[0],
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
        });
        const bounds = new google.maps.LatLngBounds();
        route.forEach((p) => bounds.extend(p));
        new google.maps.Polyline({
          path: route,
          map,
          strokeColor: "#38bdf8",
          strokeOpacity: 0.95,
          strokeWeight: 5,
        });
        const pin = (pos: LatLng, title: string, color: string) => {
          bounds.extend(pos);
          new google.maps.Marker({
            position: pos,
            map,
            title,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#0b1120",
              strokeWeight: 2,
            },
          });
        };
        pin(route[0]!, "Trip start", "#22c55e");
        pin(route[route.length - 1]!, "Trip destination", "#ef4444");
        if (pickup) pin(pickup, "Your pickup", "#f59e0b");
        if (drop) pin(drop, "Your drop-off", "#a855f7");
        map.fitBounds(bounds, 48);
        setReady(true);
      } catch {
        setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, JSON.stringify(route), JSON.stringify(pickup), JSON.stringify(drop)]);

  if (!key || route.length < 2) {
    return (
      <div className={className}>
        <div className="grid h-full w-full place-items-center rounded-xl border border-border bg-muted text-xs text-muted-foreground">
          Route map unavailable
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={ref} className="h-full w-full overflow-hidden rounded-xl border border-border bg-muted" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          <MapPin className="h-4 w-4 animate-pulse" />
        </div>
      )}
    </div>
  );
}
