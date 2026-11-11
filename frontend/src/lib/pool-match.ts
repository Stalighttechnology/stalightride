/**
 * Route-similarity matching for car pooling.
 *
 * A passenger matches a driver's trip when both their pickup and drop-off
 * points sit close to the driver's route, in the same travelling order.
 * The score is expressed as a percentage; 80% is the default threshold.
 */

export type LatLng = { lat: number; lng: number };

export const MATCH_THRESHOLD = 80;

/** Within this distance a point counts as fully on-route. */
const ON_ROUTE_KM = 5;
/** Distance in km beyond which a point is considered "off route". */
const CORRIDOR_KM = 30;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Perpendicular-ish distance from p to segment a-b, in km. */
function distanceToSegmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const toXY = (q: LatLng) => ({ x: q.lng * Math.cos((p.lat * Math.PI) / 180), y: q.lat });
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
  return haversineKm(p, proj);
}

export function normalizeRoute(trip: {
  origin_lat: number; origin_lng: number; dest_lat: number; dest_lng: number; route?: unknown;
}): LatLng[] {
  const raw = Array.isArray(trip.route) ? (trip.route as any[]) : [];
  const mid = raw
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return [
    { lat: Number(trip.origin_lat), lng: Number(trip.origin_lng) },
    ...mid,
    { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) },
  ];
}

/** Nearest distance (km) from a point to the polyline, plus how far along it lies (0..1). */
function projectOnRoute(point: LatLng, route: LatLng[]) {
  let best = { distanceKm: Infinity, progress: 0 };
  const legLengths = route.slice(1).map((p, i) => haversineKm(route[i]!, p));
  const total = legLengths.reduce((s, v) => s + v, 0) || 1;
  let travelled = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const d = distanceToSegmentKm(point, a, b);
    if (d < best.distanceKm) {
      const along = Math.min(haversineKm(a, point), legLengths[i]!);
      best = { distanceKm: d, progress: (travelled + along) / total };
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
};

export function matchScore(
  trip: { origin_lat: number; origin_lng: number; dest_lat: number; dest_lng: number; route?: unknown },
  pickup: LatLng,
  drop: LatLng,
): MatchResult {
  const route = normalizeRoute(trip);
  const p = projectOnRoute(pickup, route);
  const d = projectOnRoute(drop, route);
  const sameDirection = d.progress >= p.progress;
  const proximity = (km: number) =>
    km <= ON_ROUTE_KM ? 1 : Math.max(0, 1 - (km - ON_ROUTE_KM) / (CORRIDOR_KM - ON_ROUTE_KM));
  const base = (proximity(p.distanceKm) + proximity(d.distanceKm)) / 2;
  const score = sameDirection ? Math.round(base * 100) : 0;
  return { score, pickupDistanceKm: p.distanceKm, dropDistanceKm: d.distanceKm, sameDirection };
}

export function isMatch(result: MatchResult, threshold = MATCH_THRESHOLD) {
  return result.score >= threshold;
}
