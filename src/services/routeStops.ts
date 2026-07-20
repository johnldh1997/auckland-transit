import { Stop, TransitStep } from '../types';
import { getStopById, getStopsNearLocation } from './gtfs';
import { getStopsForTransitStep } from './gtfsStatic';

// Google's own board/alight coordinates for a leg usually land within a few metres of
// AT's stop location, but not always exactly on it — beyond this, treat it as "no match"
// rather than silently picking the wrong stop.
const MAX_STOP_MATCH_DISTANCE_METERS = 100;

async function findMatchingStop(location: { lat: number; lon: number }): Promise<Stop | undefined> {
  const [nearest] = await getStopsNearLocation(location.lat, location.lon, 1);
  if (!nearest || nearest.distanceMeters > MAX_STOP_MATCH_DISTANCE_METERS) return undefined;
  return nearest;
}

// Every stop a transit leg passes through, board to alight inclusive — see
// getStopsForTransitStep for how the AT static trip itself is matched. Best-effort: any
// unresolved link in the chain (no line name, no board/alight coordinates from Google, no
// nearby AT stop, no matching trip) just means no stops for that leg, not an error.
export async function getStopsAlongLeg(step: TransitStep): Promise<Stop[]> {
  if (step.kind !== 'transit' || !step.lineName || !step.departureStop || !step.arrivalStop || !step.departureTimestamp) {
    return [];
  }

  const [departureStop, arrivalStop] = await Promise.all([
    findMatchingStop(step.departureStop),
    findMatchingStop(step.arrivalStop),
  ]);
  if (!departureStop || !arrivalStop) return [];

  const stopIds = await getStopsForTransitStep(step.lineName, departureStop.id, arrivalStop.id, step.departureTimestamp);
  if (stopIds.length === 0) return [];

  const stops = await Promise.all(stopIds.map((id) => getStopById(id)));
  return stops.filter((stop): stop is Stop => !!stop);
}
