import { MapStyleElement } from 'react-native-maps';

// Shared region delta for every "center tightly on my current location" moment across
// the app — the Home map's startup position, the Locate button, and the zoom-in that
// happens when a tracked journey starts (`focusOnUserAt`). One shared constant so tuning
// it (e.g. "zoom in more") only ever needs to change in one place, not several.
export const MY_LOCATION_ZOOM_DELTA = 0.005;

// Google Maps' own map tiles (roads, water, labels) have a separate style system from
// this app's color palette — react-native-maps' `customMapStyle` prop is the only way to
// theme them. Google's own published "Night mode" example JSON, applied when the resolved
// theme is dark so the map itself doesn't stay bright while the rest of the UI goes dark.
//
// Every stop the app cares about already gets its own custom bus-icon marker (see
// VehicleMap.tsx/RoutePreviewMap.tsx/StopLocationMap.tsx) — Google's own base map tiles
// separately draw a default bus-stop icon at the same coordinate, so without this the two
// markers sit stacked on top of each other. Turning off the default one avoids that
// duplicate-marker clutter and keeps tapping unambiguous.
const HIDE_DEFAULT_BUS_STOP_MARKERS: MapStyleElement[] = [
  { featureType: 'transit.station.bus', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// A module-level constant (not a fresh `[]`/array literal built inline per render) so
// callers have a *stable* reference — passing a fresh literal inline
// (`customMapStyle={isDark ? darkMapStyle : []}`) creates a new array every render, and
// react-native-maps reapplies/reloads the native map's style on every prop change it can't
// reference-compare away. Under Home's live map (polling vehicles every 15s, refetching
// stops on every pan/zoom), that repeated native style churn was enough to occasionally
// drop a marker snapshot mid-redraw and fall back to Android's default red pin — reported
// live as "red pins appearing again", the same underlying class of bug StableMarker.tsx
// already exists to prevent, just triggered here at the whole-map level instead of a
// single marker's own re-render.
export const lightMapStyle: MapStyleElement[] = [...HIDE_DEFAULT_BUS_STOP_MARKERS];

export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
  ...HIDE_DEFAULT_BUS_STOP_MARKERS,
];
