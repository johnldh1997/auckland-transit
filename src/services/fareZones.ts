import * as Location from 'expo-location';
import { JourneyRoute, TransitStopLocation } from '../types';

// AT's GTFS static feed has no fare_attributes.txt/fare_rules.txt and no zone_id on
// stops.txt (checked live, both directly and via Mobility Database's feature listing for
// this feed) — there's no machine-readable fare/zone data at all, just AT's own web page
// (https://at.govt.nz/bus-train-ferry/fares-and-discounts/fare-zones-and-calculating-how-much-you-pay,
// fetched 2026-07-19), which publishes zone boundaries as suburb lists rather than a
// downloadable map. This makes this whole feature a best-effort SUBURB NAME match, not an
// exact geographic lookup — a stop right at a zone edge, or a suburb the device's geocoder
// doesn't return in a form matching AT's naming, can resolve to the wrong zone or none at
// all. A few suburbs genuinely straddle zones per AT's own description ("overlap zones");
// where the same name appears in two lists below, whichever is listed second wins.
const ZONE_SUBURBS: Record<string, string[]> = {
  City: [
    'Central City', 'Britomart', 'Parnell', 'Grafton', 'Eden Terrace', 'Newton', 'Ponsonby',
    'Grey Lynn', "Freeman's Bay", 'Herne Bay', "St Mary's Bay",
  ],
  Isthmus: [
    'Remuera', 'Newmarket', 'Epsom', 'Ōrākei', 'Mission Bay', 'Kohimarama', 'Saint Heliers',
    'St Heliers', 'Glendowie', 'Glen Innes', 'Point England', 'Panmure', 'Meadowbank',
    'Saint Johns', 'St Johns', 'Stonefields', 'Ellerslie', 'Mount Wellington', 'Sylvia Park',
    'Westfield', 'Te Papapa', 'Onehunga', 'Penrose', 'One Tree Hill', 'Royal Oak',
    'Greenlane', 'Balmoral', 'Three Kings', 'Mount Roskill', 'Hillsborough', 'Waikōwhai',
    'Lynfield', 'Blockhouse Bay', 'New Lynn', 'New Windsor', 'Avondale', 'Ōwairaka',
    'Sandringham', 'Mount Albert', 'St Lukes', 'Mount Eden', 'Waterview', 'Western Springs',
    'Kingsland', 'Point Chevalier', 'Westmere',
  ],
  'Northern Manukau': [
    'Māngere Bridge', 'Māngere', 'Favona', 'Airport', 'Papatoetoe', 'Ōtāhuhu', 'Ōtara',
    'Puhinui', 'Manukau', 'Chapel Downs', 'Flat Bush', 'East Tāmaki', 'Mission Heights',
    'Highbrook', 'Botany', 'Dannemora', 'Whitford', 'Burswood', 'Pakuranga', 'Sunnyhills',
    'Highland Park', 'Half Moon Bay', 'Bucklands Beach', 'Mellons Bay', 'Howick',
    'Cockle Bay', 'Shelly Park', 'Beachlands', 'Ōmana', 'Maraetai',
  ],
  'Southern Manukau': [
    'Manukau', 'Wiri', 'Totara Heights', 'The Gardens', 'Hill Park', 'Homai', 'Manurewa',
    'Manurewa East', 'Clendon', 'Weymouth', 'Wattle Downs', 'Conifer Grove', 'Takanini',
    'Papakura', 'Red Hill', 'Pāhurehure', 'Hingaia', 'Rosehill', 'Ōpaheke', 'Drury',
    'Paerātā', 'Pukekohe',
  ],
  Waitākere: [
    'Kelston', 'New Lynn', 'Green Bay', 'Titirangi', 'Wood Bay', 'Woodlands Park',
    'Laingholm', 'Glen Eden', 'Ōrātia', 'Sunnyvale', 'Glendene', 'Henderson',
    'Henderson Valley', 'Te Atatū South', 'Te Atatū Peninsula', 'Rānui', 'Swanson',
    'Waitākere', 'Massey', 'Royal Heights', 'Westgate', 'West Harbour', 'Hobsonville',
    'Whenuapai', 'Herald Island',
  ],
  'Lower North Shore': [
    'Devonport', 'Stanley Bay', 'Narrow Neck', 'Belmont', 'Bayswater', 'Hauraki',
    'Takapuna', 'Smales Farm', 'Milford', 'Castor Bay', 'Forrest Hill', 'Sunnynook',
    'Campbells Bay', 'Constellation', 'Wairau Valley', 'Glenfield', 'Bayview',
    'Beach Haven', 'Birkdale', 'Highbury', 'Northcote', 'Birkenhead', 'Chatswood',
  ],
  'East Coast/South Rodney': [
    'Greenhithe', 'Rosedale', 'Albany', 'Pinehill', 'Oteha', 'Mairangi Bay', 'Browns Bay',
    'Torbay', 'Long Bay', 'Dairy Flat', 'Hibiscus Coast', 'Ōrewa', 'Silverdale',
    'Stillwater', 'Stanmore Bay', 'Whangaparāoa', 'Arkles Bay', 'Manly', 'Gulf Harbour',
    'Waitoki', 'Riverhead', 'Kumeū', 'Huapai', 'Waimauku', 'Helensville', 'Kaukapakapa',
  ],
  Warkworth: ['Wellsford', 'Warkworth', 'Snells Beach', 'Algies Bay', 'Matakana', 'Ōmaha', 'Whangateau', 'Leigh'],
  Waiheke: ['Waiheke Island', 'Oneroa', 'Ostend', 'Onetangi', 'Surfdale', 'Palm Beach'],
};

// Maps macron'd vowels to their plain equivalents (e.g. "Ōrākei" → "orakei") — so matching
// doesn't depend on the geocoder returning macrons in exactly the same form AT's own page
// does. An explicit character map rather than a Unicode-range regex, so it's plainly
// readable/verifiable rather than relying on an escape sequence rendering correctly.
const MACRON_MAP: Record<string, string> = {
  ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u',
  Ā: 'A', Ē: 'E', Ī: 'I', Ō: 'O', Ū: 'U',
};

function normalize(name: string): string {
  let result = '';
  for (const ch of name) {
    result += MACRON_MAP[ch] ?? ch;
  }
  return result.toLowerCase().trim();
}

const SUBURB_TO_ZONE = new Map<string, string>();
for (const [zone, suburbs] of Object.entries(ZONE_SUBURBS)) {
  for (const suburb of suburbs) {
    SUBURB_TO_ZONE.set(normalize(suburb), zone);
  }
}

// Source: https://at.govt.nz/bus-train-ferry/fares-and-discounts/bus-and-train-fares
// (adult AT HOP fares, fetched 2026-07-19, page marked "last updated 24/06/2026") — bus and
// train only, capped at 4 zones. Ferries use a separate fare structure not modelled here.
const ADULT_HOP_FARE_BY_ZONE_COUNT: Record<number, number> = {
  1: 3.0,
  2: 4.9,
  3: 6.5,
  4: 7.9,
};

function fareForZoneCount(count: number): number {
  const clamped = Math.min(4, Math.max(1, count));
  return ADULT_HOP_FARE_BY_ZONE_COUNT[clamped];
}

// Device geocoder (no extra API) can return the same area under different fields depending
// on platform/precision — tries each in turn against the suburb table rather than trusting
// just one.
async function resolveZone(location: TransitStopLocation): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: location.lat, longitude: location.lon });
    const r = results[0];
    if (!r) return null;
    for (const candidate of [r.district, r.subregion, r.city, r.name]) {
      if (!candidate) continue;
      const zone = SUBURB_TO_ZONE.get(normalize(candidate));
      if (zone) return zone;
    }
    return null;
  } catch {
    return null;
  }
}

export interface FareEstimate {
  amount: number;
  hasFerry: boolean;
  // At least one leg's zone couldn't be resolved — the shown amount is based on whatever
  // did resolve, so it's a lower-confidence floor rather than a confirmed total.
  unresolved: boolean;
}

// Zones are meant to be counted along the whole journey (tag-on to tag-off, transfers
// included) as ONE combined fare, not summed leg by leg — this collects every bus/train
// leg's boarding and alighting stop, resolves each to a zone, and prices by the number of
// *distinct* zones actually boarded/alighted at (matching AT's own rule that a zone merely
// passed through without a tag-off doesn't count).
export async function estimateFare(route: JourneyRoute): Promise<FareEstimate | null> {
  const transitSteps = route.steps.filter((step) => step.kind === 'transit');
  if (transitSteps.length === 0) return { amount: 0, hasFerry: false, unresolved: false };

  const hasFerry = transitSteps.some((step) => step.mode === 'ferry');
  const busTrainSteps = transitSteps.filter((step) => step.mode !== 'ferry');
  if (busTrainSteps.length === 0) return { amount: 0, hasFerry: true, unresolved: false };

  const locations: TransitStopLocation[] = [];
  busTrainSteps.forEach((step) => {
    if (step.departureStop) locations.push(step.departureStop);
    if (step.arrivalStop) locations.push(step.arrivalStop);
  });
  if (locations.length === 0) return null;

  const zones = await Promise.all(locations.map(resolveZone));
  const resolvedZones = zones.filter((zone): zone is string => !!zone);
  if (resolvedZones.length === 0) return null;

  const distinctZones = new Set(resolvedZones);
  return {
    amount: fareForZoneCount(distinctZones.size),
    hasFerry,
    unresolved: resolvedZones.length < locations.length,
  };
}
