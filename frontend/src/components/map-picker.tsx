import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crosshair, MapPin, Loader2 } from "lucide-react";
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
}

export function MapPicker({
  value,
  address,
  onChange,
  onAddressChange,
  className,
  mapHeight = "h-64",
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

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        onChange({ lat, lng });
        mapRef.current?.setZoom(16);
        mapRef.current?.panTo({ lat, lng });
        markerRef.current?.setPosition({ lat, lng });
        reverseGeocode(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className={className}>
      <div className="relative">
        <Input
          value={address}
          onChange={(e) => {
            onAddressChange(e.target.value);
            setShowSuggest(true);
          }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          placeholder="Start typing an address, area, or landmark…"
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-fade-in">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(s)}
                className="flex w-full items-start gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{s.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative mt-3 overflow-hidden rounded-xl border border-border">
        <div ref={ref} className={`${mapHeight} w-full ${ready ? "" : "map-shimmer"}`} />
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-muted text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={useMyLocation}
          className="absolute right-2 top-2 shadow-md"
        >
          <Crosshair className="mr-1 h-3.5 w-3.5" /> Use my location
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {value.lat && value.lng
          ? `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — search, drag the marker, or tap the map to adjust.`
          : "Search an address, tap the map, or use your current location to drop a pickup pin."}
      </p>
    </div>
  );
}
