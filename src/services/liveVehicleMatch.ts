import { VehiclePosition } from '../types';
import { getVehiclePositions } from './vehicles';

// Every live vehicle currently running on any of the given route short names (e.g. all
// live "70" buses, not just the one guessed to be on this specific journey) — matching
// by route number rather than trying to guess a single vehicle, since Google's transit
// data and AT's realtime feed share no common trip ID to confirm a single match against.
export async function getVehiclesForRoutes(lineNames: string[]): Promise<VehiclePosition[]> {
  if (lineNames.length === 0) return [];
  const wanted = new Set(lineNames);
  const vehicles = await getVehiclePositions();
  return vehicles.filter((v) => v.routeShortName && wanted.has(v.routeShortName));
}
