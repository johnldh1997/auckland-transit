import React, { useEffect, useState } from 'react';
import { MapMarkerProps, Marker } from 'react-native-maps';

const REVEAL_AFTER_MS = 400;

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
export default function StableMarker(props: MapMarkerProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setReady(true), REVEAL_AFTER_MS);
    return () => clearTimeout(timeout);
  }, []);

  return <Marker {...props} tracksViewChanges={!ready} opacity={ready ? props.opacity ?? 1 : 0} />;
}
