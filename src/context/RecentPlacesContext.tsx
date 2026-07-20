import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { JourneyEndpoint, RecentPlace } from '../types';

const STORAGE_KEY = 'auckland-transit:recent-places';
const MAX_RECENTS = 10;

interface RecentPlacesContextValue {
  places: RecentPlace[];
  loading: boolean;
  addRecent: (endpoint: JourneyEndpoint) => void;
  removeRecent: (endpoint: JourneyEndpoint) => void;
}

const RecentPlacesContext = createContext<RecentPlacesContextValue | undefined>(undefined);

function endpointKey(endpoint: JourneyEndpoint): string {
  return endpoint.kind === 'place' ? `place:${endpoint.placeId}` : `coords:${endpoint.lat}:${endpoint.lon}`;
}

export function RecentPlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<RecentPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPlaces(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    }
  }, [places, loading]);

  const value = useMemo<RecentPlacesContextValue>(
    () => ({
      places,
      loading,
      addRecent: (endpoint) => {
        // Current location isn't worth remembering as a "recent" — it's always "now".
        if (endpoint.kind === 'coordinates' && endpoint.label === 'Current Location') return;
        setPlaces((prev) => {
          const withoutDuplicate = prev.filter((p) => endpointKey(p.endpoint) !== endpointKey(endpoint));
          return [{ endpoint, searchedAt: Date.now() }, ...withoutDuplicate].slice(0, MAX_RECENTS);
        });
      },
      // Automatic dedup only catches exact placeId matches — Google's autocomplete can
      // return two different placeIds for what's really the same address (e.g. picked
      // once as a bare street address, once with the suburb included), which the
      // key-based dedup above can't tell apart. This lets the user clean those up by hand.
      removeRecent: (endpoint) => {
        setPlaces((prev) => prev.filter((p) => endpointKey(p.endpoint) !== endpointKey(endpoint)));
      },
    }),
    [places, loading]
  );

  return <RecentPlacesContext.Provider value={value}>{children}</RecentPlacesContext.Provider>;
}

export function useRecentPlaces(): RecentPlacesContextValue {
  const ctx = useContext(RecentPlacesContext);
  if (!ctx) throw new Error('useRecentPlaces must be used within RecentPlacesProvider');
  return ctx;
}
