import { Departure, Stop } from '../types';

export const MOCK_STOPS: Stop[] = [
  { id: '7010', name: 'Britomart Train Station', code: '7010', lat: -36.8443, lon: 174.768 },
  { id: '8869', name: 'Papakura Train Station', code: '8869', lat: -37.0637, lon: 174.9455 },
  { id: '9218', name: 'Queen Street / Custom Street', code: '9218', lat: -36.8443, lon: 174.7659 },
  { id: '1044', name: 'Newmarket Train Station', code: '1044', lat: -36.8697, lon: 174.7773 },
  { id: '4118', name: 'Downtown Ferry Terminal', code: '4118', lat: -36.8434, lon: 174.7645 },
];

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function mockDeparturesFor(stopId: string): Departure[] {
  return [
    {
      tripId: `${stopId}-t1`,
      routeId: 'STH',
      routeShortName: 'STH',
      mode: 'train',
      headsign: 'Papakura',
      scheduledTime: minutesFromNow(4),
      estimatedTime: minutesFromNow(6),
      delayMinutes: 2,
      cancelled: false,
    },
    {
      tripId: `${stopId}-t2`,
      routeId: '70',
      routeShortName: '70',
      mode: 'bus',
      headsign: 'Botany Town Centre',
      scheduledTime: minutesFromNow(9),
      estimatedTime: minutesFromNow(9),
      delayMinutes: 0,
      cancelled: false,
    },
    {
      tripId: `${stopId}-t3`,
      routeId: 'WEST',
      routeShortName: 'WEST',
      mode: 'train',
      headsign: 'Swanson',
      scheduledTime: minutesFromNow(15),
      estimatedTime: minutesFromNow(15),
      delayMinutes: 0,
      cancelled: true,
    },
  ];
}
