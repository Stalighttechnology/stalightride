import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Crosshair, MapPin, Loader2, Navigation, CheckCircle2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/gmaps";

declare global {
  interface Window {
    google: any;
    __gmapInit?: () => void;
  }
}

interface Suggestion {
  placeId: string;
  text: string;
}

interface Props {
  value: { lat: number | null; lng: number | null };
  address: string;
  onChange: (v: { lat: number; lng: number; address?: string }) => void;
  onAddressChange: (address: string) => void;
  className?: string;
  /** Tailwind height class for the map canvas. */
  mapHeight?: string;
  /** Whether the search bar appears above or below the map. Default: "above". */
  searchPlacement?: "above" | "below";
  /** Automatically detect device location on mount if no value provided. */
  autoLocate?: boolean;
  placeholder?: string;
}

export function MapPicker({
  value,
  address,
  onChange,
  onAddressChange,
  className,
  mapHeight = "h-64",
  searchPlacement = "above",
  autoLocate = false,
  placeholder = "Start typing an address, area, or landmark…",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [deviceLocationDetected, setDeviceLocationDetected] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      if (!isMountedRef.current) return;
      setSearching(true);
      setShowSuggest(false);
      setSuggestions([]);

      if (!window.google?.maps?.Geocoder) {
        await window.google?.maps?.importLibrary?.("geocoding");
      }

      const geocoder = new window.google.maps.Geocoder();
      const response = await geocoder.geocode({ location: { lat, lng } });

      if (!isMountedRef.current) return;

      if (response?.results?.[0]?.formatted_address) {
        const fullAddr = response.results[0].formatted_address;
        onAddressChange(fullAddr);
        onChange({ lat, lng, address: fullAddr });
      }
    } catch (err) {
      console.warn("[MapPicker] Reverse geocode error:", err);
    } finally {
      if (isMountedRef.current) setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setLocatingDevice(false);
        setDeviceLocationDetected(true);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        onChange({ lat, lng });
        if (mapRef.current) {
          mapRef.current.setZoom(16);
          mapRef.current.panTo({ lat, lng });
        }
        markerRef.current?.setPosition({ lat, lng });
        reverseGeocode(lat, lng);
      },
      (err) => {
        if (!isMountedRef.current) return;
        setLocatingDevice(false);
        console.warn("[MapPicker] Geolocation error:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const center =
          value.lat && value.lng
            ? { lat: value.lat, lng: value.lng }
            : { lat: 20.5937, lng: 78.9629 };
        const map = new window.google.maps.Map(ref.current, {
          center,
          zoom: value.lat ? 15 : 5,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        const marker = new window.google.maps.Marker({
          position: center,
          map,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        });
        markerRef.current = marker;

        const commit = (latLng: any) => {
          const lat = typeof latLng.lat === "function" ? latLng.lat() : Number(latLng.lat);
          const lng = typeof latLng.lng === "function" ? latLng.lng() : Number(latLng.lng);
          onChange({ lat, lng });
          reverseGeocode(lat, lng);
        };

        map.addListener("click", (e: any) => {
          marker.setPosition(e.latLng);
          commit(e.latLng);
        });
        marker.addListener("dragend", () => {
          commit(marker.getPosition());
        });
        setReady(true);

        // Auto-detect device location if requested and no coordinates yet
        if (autoLocate && value.lat == null && value.lng == null && navigator.geolocation) {
          useMyLocation();
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || value.lat == null || value.lng == null) return;
    const p = { lat: value.lat, lng: value.lng };
    markerRef.current?.setPosition(p);
    mapRef.current?.panTo(p);
  }, [ready, value.lat, value.lng]);

  // Fetch autocomplete suggestions as user types
  useEffect(() => {
    if (!ready || !address || address.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const places = await window.google.maps.importLibrary("places");
        if (!sessionTokenRef.current)
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        const { suggestions: raw } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: address,
            sessionToken: sessionTokenRef.current,
          });
        setSuggestions(
          raw
            .slice(0, 5)
            .map((s: any) => ({
              placeId: s.placePrediction?.placeId,
              text: s.placePrediction?.text?.toString() ?? "",
            }))
            .filter((x: Suggestion) => x.placeId),
        );
      } catch {
        /* ignore */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [address, ready]);

  const pickSuggestion = async (s: Suggestion) => {
    setShowSuggest(false);
    onAddressChange(s.text);
    try {
      const places = await window.google.maps.importLibrary("places");
      const place = new places.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        onChange({ lat, lng, address: place.formattedAddress ?? s.text });
        onAddressChange(place.formattedAddress ?? s.text);
        mapRef.current?.setZoom(16);
        mapRef.current?.panTo({ lat, lng });
        markerRef.current?.setPosition({ lat, lng });
      }
      sessionTokenRef.current = null; // token consumed after Place fetch
    } catch {
      /* ignore */
    }
  };

  const renderSearchInput = () => (
    <div className="relative">
      <Input
        value={address}
        onChange={(e) => {
          onAddressChange(e.target.value);
          setShowSuggest(true);
        }}
        onFocus={() => setShowSuggest(true)}
        onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 rounded-xl pr-8 text-xs sm:text-sm"
      />
      {searching && (
        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {showSuggest && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-fade-in">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickSuggestion(s)}
              className="flex w-full items-start gap-2 border-b border-border/40 px-3 py-2.5 text-left text-xs sm:text-sm last:border-b-0 hover:bg-muted cursor-pointer transition-colors"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span className="line-clamp-2 text-foreground">{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderMapCanvas = () => (
    <div className="relative overflow-hidden rounded-xl border border-border shadow-xs">
      <div ref={ref} className={`${mapHeight} w-full ${ready ? "" : "map-shimmer"}`} />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-destructive" />
            {error}
          </div>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={useMyLocation}
        disabled={locatingDevice}
        className="absolute right-2 top-2 shadow-md gap-1.5 h-8 text-xs rounded-lg cursor-pointer bg-background/95 hover:bg-background text-foreground"
      >
        {locatingDevice ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Crosshair className="h-3.5 w-3.5 text-brand" />
        )}
        {locatingDevice ? "Locating…" : "Current location"}
      </Button>

      {/* Floating coordinates badge if pinned */}
      {value.lat && value.lng && (
        <div className="absolute bottom-2 left-2 pointer-events-none">
          <Badge
            variant="secondary"
            className="glass bg-background/90 text-foreground text-[10px] font-mono shadow-xs border-border/80 gap-1 px-2 py-0.5"
          >
            <Navigation className="h-2.5 w-2.5 text-brand" />
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </Badge>
        </div>
      )}
    </div>
  );

  return (
    <div className={`space-y-2.5 ${className ?? ""}`}>
      {searchPlacement === "above" && (
        <>
          {renderSearchInput()}
          {renderMapCanvas()}
        </>
      )}

      {searchPlacement === "below" && (
        <>
          {renderMapCanvas()}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
              <span>Search pickup spot or landmark</span>
              {deviceLocationDetected && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Device location pinned
                </span>
              )}
            </label>
            {renderSearchInput()}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground pt-0.5">
        <span>
          {value.lat && value.lng
            ? "Tap map or drag the pin to fine-tune your exact pickup point."
            : "Select a pickup location on the map or type in the search bar."}
        </span>
        {value.lat && value.lng && (
          <span className="font-mono text-[10px] text-foreground/80 font-medium">
            Lat: {value.lat.toFixed(4)} &bull; Lng: {value.lng.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

