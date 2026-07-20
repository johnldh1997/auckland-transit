import { ServiceAlert } from '../types';
import { atFetch, hasApiKey } from './atClient';
import { getRouteIdsByShortName, getStopsNearLocation } from './gtfs';
import { getRouteShortNamesForStops } from './gtfsStatic';
import { getCurrentCoordinates } from './location';

// How many nearby stops count as "near the user" for filtering alerts — same default
// getStopsNearLocation itself already uses for "stops near me" search.
const NEARBY_STOP_LIMIT = 25;

interface Translation {
  text: string;
  language: string;
}

interface InformedEntity {
  stop_id?: string;
  route_id?: string;
}

interface AlertData {
  active_period?: { start?: number; end?: number }[];
  header_text?: { translation: Translation[] };
  description_text?: { translation: Translation[] };
  informed_entity: InformedEntity[];
}

interface AlertEntity {
  id: string;
  alert: AlertData;
}

interface ServiceAlertsResponse {
  status: string;
  response: { entity: AlertEntity[] };
}

function englishText(field: { translation: Translation[] } | undefined): string {
  if (!field) return '';
  return field.translation.find((t) => t.language === 'en')?.text ?? field.translation[0]?.text ?? '';
}

function isCurrentlyActive(alert: AlertData, nowSeconds: number): boolean {
  const periods = alert.active_period;
  if (!periods || periods.length === 0) return true;
  return periods.some((p) => (!p.start || nowSeconds >= p.start) && (!p.end || nowSeconds <= p.end));
}

function toServiceAlert(entity: AlertEntity): ServiceAlert {
  const start = entity.alert.active_period?.[0]?.start;
  return {
    id: entity.id,
    headerText: englishText(entity.alert.header_text),
    descriptionText: englishText(entity.alert.description_text),
    routeIds: entity.alert.informed_entity.map((e) => e.route_id).filter((id): id is string => !!id),
    stopIds: entity.alert.informed_entity.map((e) => e.stop_id).filter((id): id is string => !!id),
    postedAt: start ? new Date(start * 1000).toISOString() : undefined,
  };
}

// Alerts change less often than vehicle positions/departures, so this is refetched on a
// longer TTL rather than every call — but still per-session-cached like the other
// static/semi-static lookups in gtfs.ts.
const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: ServiceAlert[] | null = null;
let cacheAt = 0;
let inFlight: Promise<ServiceAlert[]> | null = null;

async function loadActiveAlerts(): Promise<ServiceAlert[]> {
  if (!hasApiKey()) return [];
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (!inFlight) {
    inFlight = atFetch<ServiceAlertsResponse>('/realtime/legacy/servicealerts')
      .then((response) => {
        const nowSeconds = Date.now() / 1000;
        cache = response.response.entity
          .filter((entity) => isCurrentlyActive(entity.alert, nowSeconds))
          .map(toServiceAlert);
        cacheAt = Date.now();
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Lets a manual pull-to-refresh on the Alerts screen bypass the TTL above and actually
// hit the network, instead of silently re-serving up to 2 minutes of stale cache and
// making the refresh gesture look like it did nothing.
export function invalidateAlertsCache(): void {
  cache = null;
}

// Every currently-active alert network-wide, not narrowed to a stop or route — used by
// the standalone Service Alerts screen (reachable from the hamburger menu) rather than
// only surfacing alerts contextually on whatever stop/journey the user already has open.
export async function getAllActiveAlerts(): Promise<ServiceAlert[]> {
  return loadActiveAlerts();
}

// Active alerts affecting either a stop near the user or a route that serves one —
// route-wide alerts (keyed by route_id, e.g. "Route 70 delayed due to roadworks") don't
// necessarily list every stop that route touches, so matching on stop proximity alone
// would miss them; resolving nearby stops to the routes that actually serve them (via
// the bundled static GTFS data) catches those too. Falls back to every active alert if
// location isn't available, rather than showing nothing.
//
// Deliberately uses a fresh GPS fix (getCurrentCoordinates), not the faster-but-possibly-
// stale getFastCoordinates used for map-centering — a stale last-known position here
// silently skews which alerts count as "nearby" without ever correcting itself, since
// nothing about this result changing later re-triggers whichever caller cached it (e.g.
// HomeScreen's unread badge, computed once on mount). Reported live: the badge stayed
// stuck on an alert that Near Me correctly showed as not actually nearby.
export async function getNearbyActiveAlerts(): Promise<ServiceAlert[]> {
  const coords = await getCurrentCoordinates();
  if (!coords) return loadActiveAlerts();

  const nearbyStops = await getStopsNearLocation(coords.latitude, coords.longitude, NEARBY_STOP_LIMIT);
  const nearbyStopIds = new Set(nearbyStops.map((stop) => stop.id));

  const routeShortNames = await getRouteShortNamesForStops(Array.from(nearbyStopIds));
  const routeIdLists = await Promise.all(routeShortNames.map(getRouteIdsByShortName));
  const nearbyRouteIds = new Set(routeIdLists.flat());

  const alerts = await loadActiveAlerts();
  return alerts.filter(
    (alert) => alert.stopIds.some((id) => nearbyStopIds.has(id)) || alert.routeIds.some((id) => nearbyRouteIds.has(id))
  );
}

export async function getAlertsForStop(stopId: string): Promise<ServiceAlert[]> {
  const alerts = await loadActiveAlerts();
  return alerts.filter((a) => a.stopIds.includes(stopId));
}

// Takes real GTFS route_ids (not short names) — AT's alerts feed identifies routes the
// same way the rest of the AT API does, via route_id (e.g. "95B-203"), not the display
// short name shown in the app.
export async function getAlertsForRoutes(routeIds: string[]): Promise<ServiceAlert[]> {
  if (routeIds.length === 0) return [];
  const alerts = await loadActiveAlerts();
  const wanted = new Set(routeIds);
  return alerts.filter((a) => a.routeIds.some((id) => wanted.has(id)));
}
