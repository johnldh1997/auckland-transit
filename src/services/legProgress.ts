import type { Stop } from '../types';

// --- Leg Progress (position along a transit leg) ---
// Works out how far along a transit leg a rider is, in terms of the leg's own stop list — which
// stops they've passed, which is next — by projecting both the stops and the rider's GPS
// position onto the leg's polyline and comparing distances along it. Deliberately pure (no
// network, no storage) so the on-screen stop list and the background get-off alert read the
// exact same answer.

export interface LatLon {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Flat local meters relative to `origin` — accurate enough across a few km of route, and the
// same approach journeyTracking.ts already uses for its own point-to-segment matching.
function projectToMeters(origin: LatLon, point: LatLon): { x: number; y: number } {
  return {
    x: toRad(point.longitude - origin.longitude) * Math.cos(toRad(origin.latitude)) * EARTH_RADIUS_M,
    y: toRad(point.latitude - origin.latitude) * EARTH_RADIUS_M,
  };
}

function segmentLengthMeters(a: LatLon, b: LatLon): number {
  const midLat = toRad((a.latitude + b.latitude) / 2);
  const dx = toRad(b.longitude - a.longitude) * Math.cos(midLat) * EARTH_RADIUS_M;
  const dy = toRad(b.latitude - a.latitude) * EARTH_RADIUS_M;
  return Math.hypot(dx, dy);
}

// Distance travelled along the polyline to reach the point on it closest to `position`, plus
// how far `position` is from the polyline at all (so callers can tell "on this leg" from
// "somewhere else entirely").
export function arcPositionMeters(points: LatLon[], position: LatLon): { arc: number; offRouteMeters: number } {
  if (points.length < 2) return { arc: 0, offRouteMeters: Infinity };

  let cumulative = 0;
  let bestArc = 0;
  let bestOffRoute = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const length = segmentLengthMeters(points[i], points[i + 1]);
    const pa = projectToMeters(position, points[i]);
    const pb = projectToMeters(position, points[i + 1]);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (-pa.x * dx - pa.y * dy) / lengthSq));
    const distance = Math.hypot(pa.x + t * dx, pa.y + t * dy);
    if (distance < bestOffRoute) {
      bestOffRoute = distance;
      bestArc = cumulative + t * length;
    }
    cumulative += length;
  }

  return { arc: bestArc, offRouteMeters: bestOffRoute };
}

function polylineLengthMeters(points: LatLon[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += segmentLengthMeters(points[i], points[i + 1]);
  return total;
}

export interface LegProgress {
  // How many of the leg's stops the rider has reached or passed.
  passedCount: number;
  // Index of the last stop reached (-1 if none yet) — "the stop you're at / just left".
  currentIndex: number;
  // Index of the next stop still ahead; equals the stop count once the last stop is reached.
  nextIndex: number;
  // Distance along the leg still to go, to its final stop (0 once reached).
  metersToEnd: number;
  // How far the rider is from the leg's path — large means they're not actually on this leg.
  offRouteMeters: number;
}

// A stop counts as reached slightly before the rider is exactly abreast of it — a stop sits
// beside the road, and GPS is only good to a few tens of metres anyway.
const STOP_REACHED_TOLERANCE_METERS = 25;

// The leg's first stop should sit near the start of its path and its last near the end. If the
// stop list doesn't span the path like that, it doesn't actually describe this leg (e.g. the
// timetable matched a different stopping pattern than Google's route) — better to report
// nothing than to say "you've arrived" at the boarding stop.
const SPAN_TOLERANCE = 0.2;

export function computeLegProgress(
  points: LatLon[],
  stops: Pick<Stop, 'lat' | 'lon'>[],
  position: LatLon
): LegProgress | null {
  if (points.length < 2 || stops.length < 2) return null;

  // Enforce non-decreasing order: a leg's stops are visited in sequence, so a stop whose
  // projection lands "earlier" (a loop in the route, or a stop set well back from the road)
  // is clamped rather than allowed to scramble the order.
  const stopArcs: number[] = [];
  for (const stop of stops) {
    const { arc } = arcPositionMeters(points, { latitude: stop.lat, longitude: stop.lon });
    stopArcs.push(Math.max(arc, stopArcs[stopArcs.length - 1] ?? 0));
  }

  const totalLength = polylineLengthMeters(points);
  if (totalLength <= 0) return null;
  if (stopArcs[0] > totalLength * SPAN_TOLERANCE) return null;
  if (stopArcs[stopArcs.length - 1] < totalLength * (1 - SPAN_TOLERANCE)) return null;

  const user = arcPositionMeters(points, position);
  const passedCount = stopArcs.filter((arc) => arc <= user.arc + STOP_REACHED_TOLERANCE_METERS).length;

  return {
    passedCount,
    currentIndex: passedCount - 1,
    nextIndex: passedCount,
    metersToEnd: Math.max(0, stopArcs[stopArcs.length - 1] - user.arc),
    offRouteMeters: user.offRouteMeters,
  };
}
