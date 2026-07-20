import { Departure } from '../types';
import { atFetch, hasApiKey } from './atClient';
import { getRouteInfo, getTripHeadsign } from './gtfs';
import { mockDeparturesFor } from './mockData';

interface StopTimeEvent {
  delay?: number;
  time?: number;
}

interface StopTimeUpdate {
  stop_id: string;
  arrival?: StopTimeEvent;
  departure?: StopTimeEvent;
  schedule_relationship?: number;
}

interface TripDescriptor {
  trip_id: string;
  route_id: string;
}

interface TripUpdate {
  trip: TripDescriptor;
  // AT's "legacy/compat" realtime feed gives a single next-stop update per trip,
  // not the full repeated array from the GTFS-realtime spec.
  stop_time_update: StopTimeUpdate;
}

interface FeedEntity {
  trip_update?: TripUpdate;
}

interface TripUpdatesResponse {
  status: string;
  response: {
    entity: FeedEntity[];
  };
}

function toIso(unixSeconds: number | undefined): string {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : '';
}

// Short-TTL cache (same pattern as alerts.ts's loadActiveAlerts) — added after
// getNextStopForTrip started being called in a loop, once per candidate live vehicle, from
// journeyNotification.ts's boarding-arrival check: without this, each call in that loop
// independently re-fetched the entire trip-updates feed, multiplying AT API traffic by the
// number of vehicles on the route on every ~15-20s poll. 10s (shorter than every poll
// interval that reads this — 15s+ everywhere) means each individual poll loop still gets
// its own fresh fetch on its own cadence; this only dedupes near-simultaneous callers.
const TRIP_UPDATES_CACHE_TTL_MS = 10_000;
let tripUpdatesCache: TripUpdate[] | null = null;
let tripUpdatesCacheAt = 0;
let tripUpdatesInFlight: Promise<TripUpdate[]> | null = null;

async function fetchTripUpdates(): Promise<TripUpdate[]> {
  if (tripUpdatesCache && Date.now() - tripUpdatesCacheAt < TRIP_UPDATES_CACHE_TTL_MS) return tripUpdatesCache;
  if (!tripUpdatesInFlight) {
    tripUpdatesInFlight = atFetch<TripUpdatesResponse>('/realtime/legacy/tripupdates')
      .then((response) => {
        tripUpdatesCache = response.response.entity
          .map((entity) => entity.trip_update)
          .filter((update): update is TripUpdate => !!update);
        tripUpdatesCacheAt = Date.now();
        return tripUpdatesCache;
      })
      .finally(() => {
        tripUpdatesInFlight = null;
      });
  }
  return tripUpdatesInFlight;
}

async function toDeparture(update: TripUpdate): Promise<Departure> {
  const stopUpdate = update.stop_time_update;
  const event = stopUpdate.departure ?? stopUpdate.arrival;
  const [route, headsign] = await Promise.all([
    getRouteInfo(update.trip.route_id),
    getTripHeadsign(update.trip.trip_id),
  ]);

  return {
    tripId: update.trip.trip_id,
    routeId: update.trip.route_id,
    routeShortName: route?.shortName ?? update.trip.route_id,
    mode: route?.mode ?? 'unknown',
    headsign,
    scheduledTime: toIso(event?.time),
    estimatedTime: toIso(event?.time),
    delayMinutes: event?.delay ? Math.round(event.delay / 60) : 0,
    cancelled: stopUpdate.schedule_relationship === 3,
  };
}

function sortByTime(departures: Departure[]): Departure[] {
  return departures.sort((a, b) => a.estimatedTime.localeCompare(b.estimatedTime));
}

export interface NextStopInfo {
  stopId: string;
  etaIso: string;
  delayMinutes: number;
  cancelled: boolean;
}

// The next stop a specific trip is heading to, straight from the same trip-updates feed
// used for departures — lets tapping a live vehicle show something concrete (where it's
// headed, and whether it's running to schedule) instead of just its route and headsign.
export async function getNextStopForTrip(tripId: string): Promise<NextStopInfo | null> {
  if (!hasApiKey()) return null;

  const updates = await fetchTripUpdates();
  const match = updates.find((update) => update.trip.trip_id === tripId);
  if (!match) return null;

  const stopUpdate = match.stop_time_update;
  const event = stopUpdate.departure ?? stopUpdate.arrival;
  return {
    stopId: stopUpdate.stop_id,
    etaIso: toIso(event?.time),
    delayMinutes: event?.delay ? Math.round(event.delay / 60) : 0,
    cancelled: stopUpdate.schedule_relationship === 3,
  };
}

export async function getDeparturesForStop(stopId: string): Promise<Departure[]> {
  if (!hasApiKey()) {
    return mockDeparturesFor(stopId);
  }

  const updates = await fetchTripUpdates();
  const matches = updates.filter((update) => update.stop_time_update?.stop_id === stopId);
  const departures = await Promise.all(matches.map(toDeparture));
  return sortByTime(departures);
}

// Fetches the trip-updates feed once and splits it across every requested stop, rather
// than each stop firing its own full-feed fetch — matters once several favourite stops
// are all being polled together (e.g. the Home screen's favourites panel).
export async function getDeparturesForStops(stopIds: string[]): Promise<Map<string, Departure[]>> {
  if (!hasApiKey()) {
    return new Map(stopIds.map((id) => [id, mockDeparturesFor(id)]));
  }

  const wanted = new Set(stopIds);
  const updates = await fetchTripUpdates();
  const byStop = new Map<string, TripUpdate[]>();
  for (const update of updates) {
    const stopId = update.stop_time_update?.stop_id;
    if (!stopId || !wanted.has(stopId)) continue;
    const existing = byStop.get(stopId);
    if (existing) existing.push(update);
    else byStop.set(stopId, [update]);
  }

  const result = new Map<string, Departure[]>();
  await Promise.all(
    stopIds.map(async (stopId) => {
      const departures = await Promise.all((byStop.get(stopId) ?? []).map(toDeparture));
      result.set(stopId, sortByTime(departures));
    })
  );
  return result;
}
