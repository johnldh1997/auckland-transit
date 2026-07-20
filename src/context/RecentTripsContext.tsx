import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { JourneyEndpoint, RecentTrip } from '../types';

const STORAGE_KEY = 'auckland-transit:recent-trips';
const MAX_RECENT_TRIPS = 10;

interface RecentTripsContextValue {
  trips: RecentTrip[];
  loading: boolean;
  addRecentTrip: (from: JourneyEndpoint, to: JourneyEndpoint) => void;
  removeRecentTrip: (from: JourneyEndpoint, to: JourneyEndpoint) => void;
}

const RecentTripsContext = createContext<RecentTripsContextValue | undefined>(undefined);

function endpointKey(endpoint: JourneyEndpoint): string {
  return endpoint.kind === 'place' ? `place:${endpoint.placeId}` : `coords:${endpoint.lat}:${endpoint.lon}`;
}

function tripKey(from: JourneyEndpoint, to: JourneyEndpoint): string {
  return `${endpointKey(from)}=>${endpointKey(to)}`;
}

export function RecentTripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<RecentTrip[]>([]);
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

  const value = useMemo<RecentTripsContextValue>(
    () => ({
      trips,
      loading,
      addRecentTrip: (from, to) =>
        setTrips((prev) => {
          const withoutDuplicate = prev.filter((t) => tripKey(t.from, t.to) !== tripKey(from, to));
          return [{ from, to, searchedAt: Date.now() }, ...withoutDuplicate].slice(0, MAX_RECENT_TRIPS);
        }),
      removeRecentTrip: (from, to) =>
        setTrips((prev) => prev.filter((t) => tripKey(t.from, t.to) !== tripKey(from, to))),
    }),
    [trips, loading]
  );

  return <RecentTripsContext.Provider value={value}>{children}</RecentTripsContext.Provider>;
}

export function useRecentTrips(): RecentTripsContextValue {
  const ctx = useContext(RecentTripsContext);
  if (!ctx) throw new Error('useRecentTrips must be used within RecentTripsProvider');
  return ctx;
}
