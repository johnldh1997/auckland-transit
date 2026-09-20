import React, { useEffect, useRef, useState } from 'react';
import { MapMarkerProps, Marker } from 'react-native-maps';

const REVEAL_AFTER_MS = 400;
// How long native view tracking is switched back on after `snapshotKey` changes — long
// enough for the native side to capture one fresh bitmap of the marker's new content.
const REFRESH_WINDOW_MS = 300;

interface Props extends MapMarkerProps {
  // --- Marker Snapshot Refresh ---
  // Once a marker is "ready" its native bitmap is frozen (tracksViewChanges=false), so a
  // change inside its children — e.g. a vehicle's heading arrow rotating — would never show
  // up. Bump this (any value that changes exactly when the visible content should change,
  // ideally a coarse bucket rather than a raw value) to re-capture the bitmap once. The
  // marker stays visible during the refresh; only the initial mount is hidden.
  snapshotKey?: string | number;
}

// Custom marker views default to tracksViewChanges=true, which keeps re-snapshotting the
// marker's native bitmap on every re-render. With many markers updating frequently (stop
// refetches on pan/zoom, vehicle polling), that repeated re-snapshotting occasionally
// drops a frame on Android and falls back to the SDK's default red pin until the next
// successful re-render — reported live as "red pins appearing out of nowhere". This app
// never intends to show that default pin anywhere, so rather than just reducing how often
// it can happen, the marker is kept fully invisible (opacity 0) for the brief window where
// it's at risk, only becoming visible once tracksViewChanges has been frozen to false —
// i.e. after a correct render is guaranteed. The red pin default can then never be seen,
// whatever the underlying native timing does behind the scenes.
export default function StableMarker({ snapshotKey, ...props }: Props) {
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastSnapshotKey = useRef(snapshotKey);

  useEffect(() => {
    const timeout = setTimeout(() => setReady(true), REVEAL_AFTER_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (snapshotKey === lastSnapshotKey.current) return;
    lastSnapshotKey.current = snapshotKey;
    // Still inside the initial window: tracking is already on and will capture the latest.
    if (!ready) return;
    setRefreshing(true);
    const timeout = setTimeout(() => setRefreshing(false), REFRESH_WINDOW_MS);
    return () => clearTimeout(timeout);
  }, [snapshotKey, ready]);

  return <Marker {...props} tracksViewChanges={!ready || refreshing} opacity={ready ? props.opacity ?? 1 : 0} />;
}
