/**
 * Single shared Google Maps JS API loader.
 *
 * Every map component MUST use this — injecting the script more than once
 * (with different `libraries`) makes Google throw
 * "You have included the Google Maps JavaScript API multiple times" and the
 * second map silently fails to render.
 */

const CALLBACK = "__synchooGmapsReady";

// Handle Google Maps authorization failure gracefully
if (typeof window !== "undefined") {
  (window as any).gm_authFailure = () => {
    console.warn("[Google Maps] API key authorization failed or domain restricted. Falling back to alternative map provider.");
    window.dispatchEvent(new CustomEvent("gmaps:auth_failure"));
  };
}

export function mapsBrowserKey(): string | undefined {
  return (
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_MAP_API_KEY as string | undefined) ||
    (import.meta.env.VITE_GMAPS_API_KEY as string | undefined)
  );
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve();
  if (w.__gmapsLoader__) return w.__gmapsLoader__ as Promise<void>;

  const key = mapsBrowserKey();
  if (!key) return Promise.reject(new Error("Maps key missing"));

  w.__gmapsLoader__ = new Promise<void>((resolve, reject) => {
    w[CALLBACK] = () => resolve();
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: CALLBACK,
      libraries: "marker,places,geometry,geocoding",
      v: "weekly",
    });
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return w.__gmapsLoader__ as Promise<void>;
}
