import * as Location from 'expo-location';
import { JourneyEndpoint } from '../types';

export async function getCurrentCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({});
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

// A GPS fix (getCurrentPositionAsync) can take several seconds; the OS's cached last-known
// position returns near-instantly and is usually close enough to start a map on. Falls
// back to a fresh fix only when no cached position exists (e.g. right after boot).
export async function getFastCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown) {
    return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
  }
  const position = await Location.getCurrentPositionAsync({});
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

// Turns coordinates into a human-readable address via the device's own geocoder
// (no extra Google API involved). Returns null if the device can't resolve one.
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const r = results[0];
    if (!r) return null;
    const street = [r.streetNumber, r.street].filter(Boolean).join(' ');
    const parts = [street || r.name, r.district || r.subregion || r.city].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

export async function getCurrentLocationEndpoint(): Promise<JourneyEndpoint | null> {
  const coords = await getCurrentCoordinates();
  if (!coords) return null;
  const address = await reverseGeocode(coords.latitude, coords.longitude);
  return {
    kind: 'coordinates',
    lat: coords.latitude,
    lon: coords.longitude,
    label: address ?? 'Current Location',
  };
}
