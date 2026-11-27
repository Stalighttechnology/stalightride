/**
 * Route-similarity matching for car pooling with mandatory 4-point corridor routing.
 *
 * A driver's pool trip is defined by 4 mandatory milestone locations:
 *   1. Origin (Pickup location)
 *   2. Waypoint 1 (1st via stop)
 *   3. Waypoint 2 (2nd via stop)
 *   4. Destination (Dropoff location)
 *
 * A passenger matches a driver's trip when both their pickup and drop-off
 * points sit close to the driver's route polyline, in the forward direction.
 * The score is expressed as a percentage; 80% is the default threshold.
 */

export type LatLng = { lat: number; lng: number };

export type RouteWaypoint = {
  lat: number;
  lng: number;
  label?: string;
  order?: number;
};

export type FourPointRoute = [RouteWaypoint, RouteWaypoint, RouteWaypoint, RouteWaypoint];

export const MATCH_THRESHOLD = 80;

/** Within this distance (km) a point counts as fully on-route (100% proximity). */
export const ON_ROUTE_KM = 5;

/** Distance in km beyond which a point is considered "off route" (0% proximity). */
export const CORRIDOR_KM = 25;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Projects point p onto segment a-b, returning distance in km and parametric progress t in [0, 1].
 */
export function projectPointOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { distanceKm: number; t: number; proj: LatLng } {
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const P = { x: p.lng * cosLat, y: p.lat };
  const A = { x: a.lng * cosLat, y: a.lat };
  const B = { x: b.lng * cosLat, y: b.lat };
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
  return { distanceKm: haversineKm(p, proj), t, proj };
}

/** Parses raw route JSONB or array into clean RouteWaypoint list */
export function parseRouteWaypoints(raw: unknown): RouteWaypoint[] {
  let parsed = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((p, idx) => ({
      lat: Number(p?.lat),
      lng: Number(p?.lng),
      label: typeof p?.label === "string" ? p.label : undefined,
      order: typeof p?.order === "number" ? p.order : idx + 1,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function normalizeRoute(trip: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  route?: unknown;
}): LatLng[] {
  const mid = parseRouteWaypoints(trip.route);
  return [
    { lat: Number(trip.origin_lat), lng: Number(trip.origin_lng) },
    ...mid.map((p) => ({ lat: p.lat, lng: p.lng })),
    { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) },
  ];
}

/** Returns all stops with labels and order */
export function getRouteStops(trip: {
  origin_lat: number;
  origin_lng: number;
  origin_label?: string;
  dest_lat: number;
  dest_lng: number;
  dest_label?: string;
  route?: unknown;
}): RouteWaypoint[] {
  const mid = parseRouteWaypoints(trip.route);
  return [
    {
      lat: Number(trip.origin_lat),
      lng: Number(trip.origin_lng),
      label: trip.origin_label,
      order: 0,
    },
    ...mid,
    {
      lat: Number(trip.dest_lat),
      lng: Number(trip.dest_lng),
      label: trip.dest_label,
      order: mid.length + 1,
    },
  ];
}

/**
 * Checks if a trip satisfies the mandatory 4-point route rule:
 * Start (Origin) + Via 1 + Via 2 + Destination.
 */
export function isFourPointRoute(trip: {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  route?: unknown;
}): boolean {
  if (
    !Number.isFinite(Number(trip.origin_lat)) ||
    !Number.isFinite(Number(trip.origin_lng)) ||
    !Number.isFinite(Number(trip.dest_lat)) ||
    !Number.isFinite(Number(trip.dest_lng))
  ) {
    return false;
  }
  const mid = parseRouteWaypoints(trip.route);
  return mid.length === 2;
}

/**
 * Returns the 4 points [Origin, Via 1, Via 2, Destination] if available.
 */
export function getFourPointRoute(trip: {
  origin_lat: number;
  origin_lng: number;
  origin_label?: string;
  dest_lat: number;
  dest_lng: number;
  dest_label?: string;
  route?: unknown;
}): FourPointRoute | null {
  const stops = getRouteStops(trip);
  if (stops.length !== 4) return null;
  return [stops[0]!, stops[1]!, stops[2]!, stops[3]!];
}

/** Nearest distance (km) from a point to the polyline, plus how far along it lies (0..1) and leg index. */
export function projectOnRoute(point: LatLng, route: LatLng[]) {
  if (route.length < 2) {
    return {
      distanceKm: route[0] ? haversineKm(point, route[0]) : Infinity,
      progress: 0,
      legIndex: 0,
    };
  }
  let best = { distanceKm: Infinity, progress: 0, legIndex: 0 };
  const legLengths = route.slice(1).map((p, i) => haversineKm(route[i]!, p));
  const total = legLengths.reduce((s, v) => s + v, 0) || 1;
  let travelled = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const { distanceKm, t } = projectPointOnSegment(point, a, b);
    if (distanceKm < best.distanceKm) {
      const along = t * legLengths[i]!;
      best = {
        distanceKm,
        progress: (travelled + along) / total,
        legIndex: i,
      };
    }
    travelled += legLengths[i]!;
  }
  return best;
}

export type MatchResult = {
  score: number;
  pickupDistanceKm: number;
  dropDistanceKm: number;
  sameDirection: boolean;
  pickupProgress?: number;
  dropProgress?: number;
  pickupLegIndex?: number;
  dropLegIndex?: number;
  isFourPoint?: boolean;
};

export function matchScore(
  trip: {
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    route?: unknown;
  },
  pickup: LatLng,
  drop: LatLng,
): MatchResult {
  const route = normalizeRoute(trip);
  const p = projectOnRoute(pickup, route);
  const d = projectOnRoute(drop, route);
  // Direction check: passenger dropoff must be further along the route than pickup
  const sameDirection = d.progress >= p.progress;

  const proximity = (km: number) =>
    km <= ON_ROUTE_KM ? 1 : Math.max(0, 1 - (km - ON_ROUTE_KM) / (CORRIDOR_KM - ON_ROUTE_KM));

  const base = (proximity(p.distanceKm) + proximity(d.distanceKm)) / 2;
  const score = sameDirection ? Math.round(base * 100) : 0;
  return {
    score,
    pickupDistanceKm: p.distanceKm,
    dropDistanceKm: d.distanceKm,
    sameDirection,
    pickupProgress: p.progress,
    dropProgress: d.progress,
    pickupLegIndex: p.legIndex,
    dropLegIndex: d.legIndex,
    isFourPoint: Array.isArray(trip.route) && trip.route.length === 2,
  };
}

export function isMatch(result: MatchResult, threshold = MATCH_THRESHOLD) {
  return result.score >= threshold;
}
