import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, mapsBrowserKey } from "@/lib/gmaps";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation, MapPin, Play, Square, Radio } from "lucide-react";
import { toast } from "sonner";

interface Props {
  bookingId: string;
  userId: string;
  role: "customer" | "vendor" | "admin";
  hostLat?: number | null;
  hostLng?: number | null;
  className?: string;
}

/**
 * Real-time GPS tracking for an active booking.
 * - Customer role: can start/stop broadcasting phone GPS every ~15s.
 * - Vendor/admin: sees the customer's live position on a map, updated live over the WebSocket feed.
 */
export function LiveTracker({ bookingId, userId, role, hostLat, hostLng, className }: Props) {
  const key = mapsBrowserKey();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const carMarker = useRef<any>(null);
  const hostMarker = useRef<any>(null);
  const polyline = useRef<any>(null);
  const path = useRef<{ lat: number; lng: number }[]>([]);
  const watchId = useRef<number | null>(null);
  const pushTimer = useRef<any>(null);
  const lastPos = useRef<GeolocationPosition | null>(null);

  const [broadcasting, setBroadcasting] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [pingCount, setPingCount] = useState(0);

  // Init map + subscribe realtime
  useEffect(() => {
    if (!key || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      await loadGoogleMaps();
      if (cancelled || !mapRef.current) return;
      const google = (window as any).google;
      const center =
        hostLat && hostLng ? { lat: hostLat, lng: hostLng } : { lat: 20.5937, lng: 78.9629 };
      mapObj.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: hostLat ? 14 : 5,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      if (hostLat && hostLng) {
        hostMarker.current = new google.maps.Marker({
          position: { lat: hostLat, lng: hostLng },
          map: mapObj.current,
          title: "Host pickup point",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#111",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
      }
      polyline.current = new google.maps.Polyline({
        map: mapObj.current,
        path: [],
        strokeColor: "#2563eb",
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });

      // Load history
      const { data: history } = await api
        .from("booking_locations")
        .select("lat,lng,created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (history && history.length) {
        path.current = history.map((h: any) => ({ lat: Number(h.lat), lng: Number(h.lng) }));
        polyline.current.setPath(path.current);
        const last = path.current[path.current.length - 1];
        placeCar(last);
        mapObj.current.panTo(last);
      }
    })();

    const channel = api
      .channel(`booking_locations:${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_locations",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload: any) => {
          const p = { lat: Number(payload.new.lat), lng: Number(payload.new.lng) };
          path.current.push(p);
          polyline.current?.setPath(path.current);
          placeCar(p);
          setLastPing(new Date(payload.new.created_at));
          setPingCount((n) => n + 1);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      api.removeChannel(channel);
      stopBroadcast();
    };
  }, [key, bookingId, hostLat, hostLng]);

  function placeCar(p: { lat: number; lng: number }) {
    const google = (window as any).google;
    if (!google || !mapObj.current) return;
    if (!carMarker.current) {
      carMarker.current = new google.maps.Marker({
        position: p,
        map: mapObj.current,
        title: "Live vehicle location",
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#dc2626",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    } else {
      carMarker.current.setPosition(p);
    }
  }

  async function pushPing() {
    const pos = lastPos.current;
    if (!pos) return;
    const { latitude, longitude, accuracy, speed, heading } = pos.coords;
    const { error } = await api.from("booking_locations").insert({
      booking_id: bookingId,
      user_id: userId,
      lat: latitude,
      lng: longitude,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
    });
    if (error) {
      toast.error(`Location upload failed: ${error.message}`);
      stopBroadcast();
    }
  }

  function startBroadcast() {
    if (!navigator.geolocation) return toast.error("GPS unavailable on this device");
    setBroadcasting(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPos.current = pos;
      },
      (err) => {
        toast.error(err.message);
        stopBroadcast();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    // Send an immediate ping when the first position arrives (max 3s wait)
    const boot = setTimeout(() => lastPos.current && pushPing(), 3000);
    pushTimer.current = setInterval(pushPing, 15000);
    (pushTimer.current as any)._boot = boot;
    toast.success("Broadcasting live location");
  }

  function stopBroadcast() {
    setBroadcasting(false);
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (pushTimer.current) {
      clearInterval(pushTimer.current);
      if ((pushTimer.current as any)._boot) clearTimeout((pushTimer.current as any)._boot);
      pushTimer.current = null;
    }
  }

  const directionsUrl =
    hostLat && hostLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${hostLat},${hostLng}&travelmode=driving`
      : null;

  return (
    <div className={className}>
      <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-border bg-muted">
        <div ref={mapRef} className="h-full w-full" />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-2">
          <Badge variant="secondary" className="pointer-events-auto shadow">
            <Radio className={`mr-1 h-3 w-3 ${broadcasting ? "animate-pulse text-red-600" : ""}`} />
            {pingCount} pings{lastPing ? ` · ${lastPing.toLocaleTimeString()}` : ""}
          </Badge>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap justify-end gap-2">
          {directionsUrl && (
            <Button
              size="sm"
              variant="secondary"
              className="pointer-events-auto shadow"
              onClick={() => window.open(directionsUrl, "_blank", "noreferrer")}
            >
              <Navigation className="mr-1.5 h-4 w-4" />
              Directions
            </Button>
          )}
          {role === "customer" &&
            (broadcasting ? (
              <Button
                size="sm"
                variant="destructive"
                className="pointer-events-auto shadow"
                onClick={stopBroadcast}
              >
                <Square className="mr-1.5 h-4 w-4" />
                Stop sharing
              </Button>
            ) : (
              <Button size="sm" className="pointer-events-auto shadow" onClick={startBroadcast}>
                <Play className="mr-1.5 h-4 w-4" />
                Share live location
              </Button>
            ))}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {role === "customer"
          ? "Your phone pings location every ~15s while sharing is on."
          : "Live position updates as the customer's phone reports GPS."}
      </p>
    </div>
  );
}
