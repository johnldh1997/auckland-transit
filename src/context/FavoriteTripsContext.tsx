import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { FavoriteTrip, JourneyEndpoint } from '../types';

const STORAGE_KEY = 'auckland-transit:favorite-trips';

interface FavoriteTripsContextValue {
  trips: FavoriteTrip[];
  loading: boolean;
  isFavoriteTrip: (from: JourneyEndpoint, to: JourneyEndpoint) => boolean;
  addFavoriteTrip: (from: JourneyEndpoint, to: JourneyEndpoint) => void;
  removeFavoriteTrip: (id: string) => void;
  toggleFavoriteTrip: (from: JourneyEndpoint, to: JourneyEndpoint) => void;
}

const FavoriteTripsContext = createContext<FavoriteTripsContextValue | undefined>(undefined);

function endpointKey(endpoint: JourneyEndpoint): string {
  return endpoint.kind === 'place' ? `place:${endpoint.placeId}` : `coords:${endpoint.lat}:${endpoint.lon}`;
}

function tripKey(from: JourneyEndpoint, to: JourneyEndpoint): string {
  return `${endpointKey(from)}=>${endpointKey(to)}`;
}

export function FavoriteTripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<FavoriteTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setTrips(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    }
  }, [trips, loading]);

  const value = useMemo<FavoriteTripsContextValue>(
    () => ({
      trips,
      loading,
      isFavoriteTrip: (from, to) => trips.some((t) => tripKey(t.from, t.to) === tripKey(from, to)),
      addFavoriteTrip: (from, to) =>
        setTrips((prev) =>
          prev.some((t) => tripKey(t.from, t.to) === tripKey(from, to))
            ? prev
            : [...prev, { id: tripKey(from, to), from, to, addedAt: Date.now() }]
        ),
      removeFavoriteTrip: (id) => setTrips((prev) => prev.filter((t) => t.id !== id)),
      toggleFavoriteTrip: (from, to) =>
        setTrips((prev) =>
          prev.some((t) => tripKey(t.from, t.to) === tripKey(from, to))
            ? prev.filter((t) => tripKey(t.from, t.to) !== tripKey(from, to))
            : [...prev, { id: tripKey(from, to), from, to, addedAt: Date.now() }]
        ),
    }),
    [trips, loading]
  );

  return <FavoriteTripsContext.Provider value={value}>{children}</FavoriteTripsContext.Provider>;
}

export function useFavoriteTrips(): FavoriteTripsContextValue {
  const ctx = useContext(FavoriteTripsContext);
  if (!ctx) throw new Error('useFavoriteTrips must be used within FavoriteTripsProvider');
  return ctx;
}
