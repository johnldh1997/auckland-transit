import { Stop, TransitStep } from '../types';
import { getStopById, getStopsNearLocation } from './gtfs';
import { getStopsForTransitStep } from './gtfsStatic';

// Google's own board/alight coordinates for a leg usually land within a few metres of
// AT's stop location, but not always exactly on it — beyond this, treat it as "no match"
// rather than silently picking the wrong stop.
const MAX_STOP_MATCH_DISTANCE_METERS = 100;

// A through-station on the rail network (anywhere two directions of the same line meet,
// e.g. Glen Innes on the Eastern Line) has a separate stop_id per platform/direction, often
// only metres apart — closer together than the match tolerance itself. Picking only the
// single nearest one is a coin flip between the two platforms, and reported live as a train
// leg (the E-W line via Glen Innes) resolving zero stops: the picked platform simply wasn't
// the one this specific trip's own stop sequence used. Returning every stop within range
// instead lets getStopsForTransitStep pick whichever candidate is actually on the matched
// trip, rather than committing to one guess before the trip itself is even known.
async function findMatchingStops(location: { lat: number; lon: number }): Promise<Stop[]> {
  const nearby = await getStopsNearLocation(location.lat, location.lon, 5);
  return nearby.filter((stop) => stop.distanceMeters <= MAX_STOP_MATCH_DISTANCE_METERS);
}

// A leg's stops only depend on the leg itself (line, board/alight points, departure time) and
// the bundled static timetable, so the answer never changes for a given leg. Cached because
// several things ask for the same leg repeatedly — the map's stop markers, the step list, and
// the background alert checks that run every few seconds while a journey is active — and each
// uncached lookup is several SQLite queries. A rejected lookup drops its own cache entry so a
// transient failure can be retried instead of sticking.
const legStopsCache = new Map<string, Promise<Stop[]>>();

function legCacheKey(step: TransitStep): string | null {
  if (!step.lineName || !step.departureStop || !step.arrivalStop || !step.departureTimestamp) return null;
  const { departureStop: d, arrivalStop: a } = step;
  return `${step.lineName}|${step.departureTimestamp}|${d.lat},${d.lon}|${a.lat},${a.lon}`;
}

// Every stop a transit leg passes through, board to alight inclusive — see
// getStopsForTransitStep for how the AT static trip itself is matched. Best-effort: any
// unresolved link in the chain (no line name, no board/alight coordinates from Google, no
// nearby AT stop, no matching trip) just means no stops for that leg, not an error.
export function getStopsAlongLeg(step: TransitStep): Promise<Stop[]> {
  const key = step.kind === 'transit' ? legCacheKey(step) : null;
  if (!key) return Promise.resolve([]);

  let cached = legStopsCache.get(key);
  if (!cached) {
    cached = resolveStopsAlongLeg(step).catch((err) => {
      legStopsCache.delete(key);
      throw err;
    });
    legStopsCache.set(key, cached);
  }
  return cached;
}

async function resolveStopsAlongLeg(step: TransitStep): Promise<Stop[]> {
  if (step.kind !== 'transit' || !step.lineName || !step.departureStop || !step.arrivalStop || !step.departureTimestamp) {
    return [];
  }

  const [departureStops, arrivalStops] = await Promise.all([
    findMatchingStops(step.departureStop),
    findMatchingStops(step.arrivalStop),
  ]);
  if (departureStops.length === 0 || arrivalStops.length === 0) return [];

  const stopIds = await getStopsForTransitStep(
    step.lineName,
    departureStops.map((stop) => stop.id),
    arrivalStops.map((stop) => stop.id),
    step.departureTimestamp
  );
  if (stopIds.length === 0) return [];

  const stops = await Promise.all(stopIds.map((id) => getStopById(id)));
  return stops.filter((stop): stop is Stop => !!stop);
}
