import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, MapPin, ExternalLink, ShieldCheck } from "lucide-react";

interface Props {
  query?: string;
  lat?: number | null;
  lng?: number | null;
  className?: string;
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  bengaluru: { lat: 13.00106, lng: 77.55279 },
  bangalore: { lat: 13.00106, lng: 77.55279 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.209 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  pune: { lat: 18.5204, lng: 73.8567 },
  goa: { lat: 15.2993, lng: 74.124 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
};

export function VehicleMap({ query, lat, lng, className }: Props) {
  const [loaded, setLoaded] = useState(false);

  // Compute resolved coordinates
  const coords = useMemo(() => {
    const hasLat = typeof lat === "number" && !Number.isNaN(lat) && lat !== 0;
    const hasLng = typeof lng === "number" && !Number.isNaN(lng) && lng !== 0;

    if (hasLat && hasLng) {
      return { lat: Number(lat), lng: Number(lng), isExact: true };
    }

    if (query) {
      const qLower = query.toLowerCase().trim();
      for (const [cityName, c] of Object.entries(CITY_COORDS)) {
        if (qLower.includes(cityName)) {
          return { ...c, isExact: false };
        }
      }
    }

    // Default coordinates (Bengaluru pickup point)
    return { lat: 13.00106, lng: 77.55279, isExact: false };
  }, [lat, lng, query]);

  // Google Maps Embed URL
  // If a valid authorized API key is set, use the Google Maps Embed v1 API.
  // Otherwise, use the standard Google Maps web embed endpoint which renders real Google Maps
  // with zero 403 API restriction errors and without quota issues.
  const apiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined);

  const googleMapsEmbedUrl = useMemo(() => {
    const locQuery = `${coords.lat},${coords.lng}`;
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    // When running on localhost, domain-restricted Google keys fail with 403.
    // The maps.google.com embed renders authentic Google Maps with markers reliably everywhere.
    if (!apiKey || isLocal) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(locQuery)}&hl=en&z=15&output=embed`;
    }

    return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(locQuery)}`;
  }, [coords.lat, coords.lng, apiKey]);

  // Direct URLs for opening in native Google Maps app / browser
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
  const googleMapsViewUrl = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;

  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border/80 bg-zinc-100 shadow-sm">
        {/* Loading state indicator */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-50 text-zinc-400 z-10">
            <MapPin className="h-6 w-6 animate-pulse text-amber-500" />
            <span className="text-xs font-medium">Loading Google Maps…</span>
          </div>
        )}

        {/* Real Google Maps Embed iframe matching Google specifications */}
        <iframe
          title="Google Maps Pickup Location"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={googleMapsEmbedUrl}
          onLoad={() => setLoaded(true)}
          className="h-full w-full transition-opacity duration-300"
        />

        {/* Top-left location badge */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <div className="text-left">
            <p className="text-xs font-bold text-zinc-900">
              {coords.isExact ? "Verified Google Maps Pin" : "Pickup Location"}
            </p>
            {query && <p className="text-[10px] text-zinc-500 capitalize">{query}</p>}
          </div>
        </div>

        {/* Top-right shield badge */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 hidden sm:flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 shadow-md backdrop-blur">
          <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
          <span>QR Handover Point</span>
        </div>

        {/* Bottom action controls */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-xl border-zinc-200 bg-white/95 px-3 text-xs font-semibold text-zinc-800 shadow-md backdrop-blur hover:bg-zinc-100"
          >
            <a href={googleMapsViewUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-zinc-500" />
              Open in Google Maps
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3.5 text-xs font-extrabold text-zinc-950 shadow-md hover:from-amber-600 hover:to-yellow-500"
          >
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-1.5 h-3.5 w-3.5 text-zinc-950" />
              Get Directions
            </a>
          </Button>
        </div>
      </div>

      {/* Coordinate & Landmark Footer */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1 font-mono text-[11px]">
          <MapPin className="h-3.5 w-3.5 text-amber-500" />
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
        <span className="text-[11px] text-zinc-400">
          Powered by Google Maps · Click Directions for live GPS turn-by-turn route
        </span>
      </div>
    </div>
  );
}
