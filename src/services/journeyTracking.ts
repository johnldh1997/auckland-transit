import { decodePolyline } from './directions';
import { TransitStep } from '../types';

type LatLon = { latitude: number; longitude: number };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Projects a point to flat local meters relative to `origin` — accurate enough at
// city scale (a few km) and much simpler than great-circle segment math.
const EARTH_RADIUS_M = 6371000;
function projectToMeters(origin: LatLon, point: LatLon): { x: number; y: number } {
  const latRad = toRad(origin.latitude);
  return {
    x: toRad(point.longitude - origin.longitude) * Math.cos(latRad) * EARTH_RADIUS_M,
    y: toRad(point.latitude - origin.latitude) * EARTH_RADIUS_M,
  };
}

function distanceToSegmentMeters(position: LatLon, a: LatLon, b: LatLon): number {
  const pa = projectToMeters(position, a);
  const pb = projectToMeters(position, b);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(pa.x, pa.y);
  const t = Math.max(0, Math.min(1, (-pa.x * dx - pa.y * dy) / lengthSq));
  const closestX = pa.x + t * dx;
  const closestY = pa.y + t * dy;
  return Math.hypot(closestX, closestY);
}

// Shortest distance from a position to any segment of a decoded polyline — used both to
// match a live GPS point to the step it's currently on, and (in liveVehicleMatch.ts) to
// pick the closest of several candidate vehicles serving the same route+direction.
export function minDistanceToPolylineMeters(position: LatLon, points: LatLon[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distanceToSegmentMeters(position, points[0], points[0]);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegmentMeters(position, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

// Only trust a GPS match to a step if it's actually close to that step's path — otherwise
// (e.g. still walking to the first stop, indoors, or a low-accuracy fix) fall back to the
// schedule-based guess rather than confidently picking the wrong step.
const GPS_MATCH_THRESHOLD_METERS = 75;

// Consecutive steps share a boundary point (one ends exactly where the next begins), so
// right at that seam both steps' polylines are near-equidistant — a later step only
// "wins" the match if it's meaningfully closer than the best one found so far, rather
// than any tiny/arbitrary margin. Otherwise floating-point noise at that shared point
// could jump the highlight ahead a step (e.g. reported live: a journey opening already
// highlighting the 2nd step while still standing at the very start).
const TIE_BREAK_MARGIN_METERS = 15;

function getCurrentStepIndexBySchedule(steps: TransitStep[], now: Date): number {
  const nowMs = now.getTime();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.departureTimestamp && step.arrivalTimestamp) {
      const departureMs = new Date(step.departureTimestamp).getTime();
      const arrivalMs = new Date(step.arrivalTimestamp).getTime();
      if (nowMs >= departureMs && nowMs <= arrivalMs) return i;
    }
  }

  // Between two transit legs (e.g. a transfer walk) or before/after the whole journey:
  // find the nearest transit step and infer position relative to it.
  const transitIndices = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.departureTimestamp && step.arrivalTimestamp);

  if (transitIndices.length === 0) return 0;

  const first = transitIndices[0];
  if (nowMs < new Date(first.step.departureTimestamp!).getTime()) {
    return first.index > 0 ? first.index - 1 : 0;
  }

  for (let i = 0; i < transitIndices.length - 1; i++) {
    const arrivalMs = new Date(transitIndices[i].step.arrivalTimestamp!).getTime();
    const nextDepartureMs = new Date(transitIndices[i + 1].step.departureTimestamp!).getTime();
    if (nowMs > arrivalMs && nowMs < nextDepartureMs) {
      return transitIndices[i].index + 1 <= transitIndices[i + 1].index ? transitIndices[i].index + 1 : transitIndices[i].index;
    }
  }

  const last = transitIndices[transitIndices.length - 1];
  return last.index < steps.length - 1 ? last.index + 1 : last.index;
}

// Works out which step of the journey the user is likely on right now. Prefers matching
// a live GPS position to the closest step's own polyline segment — falling back to the
// schedule-time guess (comparing now against each transit leg's departure/arrival) when
// no position is given, or the position isn't close enough to any step to trust.
export function getCurrentStepIndex(steps: TransitStep[], now: Date = new Date(), position?: LatLon): number {
  if (position) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    steps.forEach((step, index) => {
      if (!step.encodedPolyline) return;
      const distance = minDistanceToPolylineMeters(position, decodePolyline(step.encodedPolyline));
      if (distance < bestDistance - TIE_BREAK_MARGIN_METERS) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex !== -1 && bestDistance <= GPS_MATCH_THRESHOLD_METERS) {
      return bestIndex;
    }
  }

  return getCurrentStepIndexBySchedule(steps, now);
}
