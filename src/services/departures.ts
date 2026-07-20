import { Departure } from '../types';
import { ScheduledDeparture } from './gtfsStatic';

// Scheduled entries are only useful where the realtime feed doesn't already have that
// exact trip — realtime always wins when both exist, since it has real delay data.
export function mergeDepartures(live: Departure[], scheduled: ScheduledDeparture[]): Departure[] {
  const liveTripIds = new Set(live.map((d) => d.tripId));
  const scheduledOnly: Departure[] = scheduled
    .filter((s) => !liveTripIds.has(s.tripId))
    .map((s) => ({
      tripId: s.tripId,
      routeId: '',
      routeShortName: s.routeShortName,
      mode: s.mode,
      headsign: s.headsign,
      scheduledTime: s.departureTime,
      estimatedTime: s.departureTime,
      delayMinutes: 0,
      cancelled: false,
      isLive: false,
    }));
  return [...live, ...scheduledOnly].sort((a, b) => a.estimatedTime.localeCompare(b.estimatedTime));
}
