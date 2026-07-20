import { Stop, TransportMode } from '../types';
import { atFetch, hasApiKey } from './atClient';
import { MOCK_STOPS } from './mockData';

interface GtfsStopAttributes {
  stop_name: string;
  stop_code: string;
  stop_lat: number;
  stop_lon: number;
  location_type?: number;
}

interface GtfsStopResource {
  id: string;
  attributes: GtfsStopAttributes;
}

interface GtfsStopsResponse {
  data: GtfsStopResource[];
}

function toStop(resource: GtfsStopResource): Stop {
  return {
    id: resource.id,
    name: resource.attributes.stop_name,
    code: resource.attributes.stop_code,
    lat: resource.attributes.stop_lat,
    lon: resource.attributes.stop_lon,
  };
}

// The API's filter[stop_name] is exact-match only, not substring, so search-as-you-type
// isn't possible server-side. The full stop list (~7000 stops, ~1.5MB) is fetched once
// per app session and cached here for client-side filtering instead.
//
// stopsRequest (not just stopsCache) matters: many callers can ask for this at once
// (e.g. every vehicle on the live map resolving in parallel) before the first fetch
// resolves. Caching only the *result* means every one of those callers would see an
// empty cache and fire its own duplicate request — this tracks the in-flight promise
// itself so concurrent callers all await the same request instead.
let stopsCache: Stop[] | null = null;
let stopsRequest: Promise<Stop[]> | null = null;

async function loadAllStops(): Promise<Stop[]> {
  if (stopsCache) return stopsCache;
  if (!stopsRequest) {
    stopsRequest = atFetch<GtfsStopsResponse>('/gtfs/v3/stops').then((response) => {
      // location_type 1 = a parent station (e.g. "Britomart"). Only its child platforms
      // (location_type 0, the default) ever receive realtime departures, so parent
      // stations are excluded here to avoid search results that dead-end with no data.
      stopsCache = response.data
        .filter((resource) => (resource.attributes.location_type ?? 0) === 0)
        .map(toStop);
      return stopsCache;
    });
  }
  return stopsRequest;
}

export async function searchStops(query: string): Promise<Stop[]> {
  const normalized = query.trim().toLowerCase();

  const allStops = hasApiKey() ? await loadAllStops() : MOCK_STOPS;

  if (!normalized) return allStops.slice(0, 25);
  return allStops
    .filter((stop) => stop.name.toLowerCase().includes(normalized) || stop.code.includes(normalized))
    .slice(0, 25);
}

export async function getStopById(stopId: string): Promise<Stop | undefined> {
  const allStops = hasApiKey() ? await loadAllStops() : MOCK_STOPS;
  return allStops.find((stop) => stop.id === stopId);
}

// Stops within the given map bounds, capped so a wide zoom can't dump thousands of
// markers onto the map at once (callers only show stops when zoomed in anyway).
//
// Sorted by distance to the bounds' own center before truncating — reported live as
// markers being inconsistent/"not placed on actual bus stops" while panning/zooming: in an
// area with more than `limit` stops, the previous version returned whichever ones happened
// to appear first in `allStops`' fixed original order, so a tiny shift in the bounding box
// (any pan or zoom) could swap which stops made the cut in either direction, with no
// relation to where the user was actually looking. Sorting by proximity first means the
// same, nearest-to-center set of stops is chosen consistently for a given view.
export async function getStopsInBounds(
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number },
  limit = 80
): Promise<Stop[]> {
  const allStops = hasApiKey() ? await loadAllStops() : MOCK_STOPS;
  const center = { lat: (bounds.latMin + bounds.latMax) / 2, lon: (bounds.lonMin + bounds.lonMax) / 2 };
  const inBounds = allStops.filter(
    (stop) => stop.lat >= bounds.latMin && stop.lat <= bounds.latMax && stop.lon >= bounds.lonMin && stop.lon <= bounds.lonMax
  );
  return inBounds
    .map((stop) => ({ stop, distance: distanceMeters(center, { lat: stop.lat, lon: stop.lon }) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ stop }) => stop);
}

export interface NearbyStop extends Stop {
  distanceMeters: number;
}

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

// Nearest stops to a location, sorted closest-first — used for "stops near me" when the
// user isn't searching by name.
export async function getStopsNearLocation(lat: number, lon: number, limit = 25): Promise<NearbyStop[]> {
  const allStops = hasApiKey() ? await loadAllStops() : MOCK_STOPS;
  return allStops
    .map((stop) => ({ ...stop, distanceMeters: distanceMeters({ lat, lon }, { lat: stop.lat, lon: stop.lon }) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

interface RouteAttributes {
  route_short_name: string;
  route_type: number;
}

interface RoutesResponse {
  data: { attributes: RouteAttributes & { route_id: string } }[];
}

export interface RouteInfo {
  shortName: string;
  mode: TransportMode;
}

export function modeFromRouteType(routeType: number): TransportMode {
  if (routeType === 2) return 'train';
  if (routeType === 4) return 'ferry';
  if (routeType === 3 || routeType >= 700) return 'bus';
  return 'unknown';
}

// Route short names/modes aren't in the realtime feeds, only route_id. The full route
// list (a few hundred routes) is fetched once per app session and cached here.
//
// Same in-flight-request tracking as loadAllStops above: the live map resolves route
// info for every visible vehicle concurrently, so without this, the first batch of
// vehicles would each fire their own duplicate /gtfs/v3/routes request.
let routesCache: Map<string, RouteInfo> | null = null;
let routesRequest: Promise<Map<string, RouteInfo>> | null = null;

async function loadRoutes(): Promise<Map<string, RouteInfo>> {
  if (routesCache) return routesCache;
  if (!routesRequest) {
    routesRequest = atFetch<RoutesResponse>('/gtfs/v3/routes').then((response) => {
      routesCache = new Map(
        response.data.map(({ attributes }) => [
          attributes.route_id,
          { shortName: attributes.route_short_name, mode: modeFromRouteType(attributes.route_type) },
        ])
      );
      return routesCache;
    });
  }
  return routesRequest;
}

export async function getRouteInfo(routeId: string): Promise<RouteInfo | undefined> {
  const routes = await loadRoutes();
  return routes.get(routeId);
}

// Reverse of getRouteInfo: a short name (e.g. "70", what Google's Routes API and the UI
// show) can map to multiple route_ids in GTFS (different directions/pattern variants),
// which is what AT's realtime feeds actually key alerts and vehicles by.
export async function getRouteIdsByShortName(shortName: string): Promise<string[]> {
  const routes = await loadRoutes();
  const ids: string[] = [];
  for (const [routeId, info] of routes) {
    if (info.shortName === shortName) ids.push(routeId);
  }
  return ids;
}

interface TripResponse {
  data: { attributes: { trip_headsign?: string } };
}

// Headsigns aren't in the realtime feed at all, only trip_id. Resolved one trip at a
// time (GET /gtfs/v3/trips/{trip_id}) and cached, since fetching the full static trips
// table (tens of thousands of rows) up front would be wasteful for what's shown at once.
//
// Tracks in-flight requests per trip_id too, so the same trip appearing in multiple
// concurrent departure lookups only ever triggers one request for it.
const headsignCache = new Map<string, string>();
const headsignRequests = new Map<string, Promise<string>>();

export async function getTripHeadsign(tripId: string): Promise<string> {
  const cached = headsignCache.get(tripId);
  if (cached !== undefined) return cached;

  const inFlight = headsignRequests.get(tripId);
  if (inFlight) return inFlight;

  const request = atFetch<TripResponse>(`/gtfs/v3/trips/${tripId}`)
    .then((response) => {
      const headsign = response.data.attributes.trip_headsign ?? '';
      headsignCache.set(tripId, headsign);
      return headsign;
    })
    .catch(() => '')
    .finally(() => {
      headsignRequests.delete(tripId);
    });

  headsignRequests.set(tripId, request);
  return request;
}
