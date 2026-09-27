import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ImageURISource } from 'react-native';
import { TransportMode } from '../types';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

// Shared by every map that draws mode-specific markers (vehicles, stop badges), so a train
// always gets the same glyph wherever it's drawn.
export const MODE_ICON: Record<TransportMode, IconName> = {
  bus: 'directions-bus',
  train: 'train',
  ferry: 'directions-boat',
  unknown: 'help-outline',
};

const cache = new Map<string, Promise<ImageURISource | null>>();

// MaterialIcons.getImageSource rasterizes a font glyph into a real bitmap via a native
// module call — not a JS-view snapshot — so using the result as a Marker's `image` prop
// (instead of custom `children`) sidesteps the render-to-bitmap race that let Android's
// default red pin show through entirely: there's no live JS view being captured at all.
// Cached per name/size/color so every marker sharing a color resolves it only once.
//
// getImageForFont can reject (a transient native-side failure) — reported live as some
// stop markers on RoutePreviewMap staying stuck on their `pinColor` fallback for an
// entire session. A rejected promise cached here would keep re-resolving to that same
// rejection forever with no retry, so a failure clears its own cache entry instead —
// letting the next call for that color try the native call fresh.
function getMarkerIcon(name: IconName, size: number, color: string): Promise<ImageURISource | null> {
  const key = `${name}:${size}:${color}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = MaterialIcons.getImageSource(name, size, color).catch((err) => {
      console.warn('getMarkerIcon failed:', err);
      cache.delete(key);
      return null;
    });
    cache.set(key, icon);
  }
  return icon;
}

// Returns undefined until the bitmap resolves (near-instant after the first call for a
// given name/size/color, since it's cached above) — callers should fall back to a plain
// `pinColor` Marker in the meantime, never to `image={undefined}`, which would show the
// platform's own default (red) pin until this resolves.
export function useMarkerIcon(name: IconName, size: number, color: string): ImageURISource | undefined {
  const [icon, setIcon] = useState<ImageURISource | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getMarkerIcon(name, size, color).then((result) => {
      if (!cancelled && result) setIcon(result);
    });
    return () => {
      cancelled = true;
    };
  }, [name, size, color]);

  return icon;
}

export { getMarkerIcon };
