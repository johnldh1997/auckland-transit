import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { JourneyEndpoint } from '../types';

const STORAGE_KEY = 'auckland-transit:home-address';

interface HomeAddressContextValue {
  homeAddress: JourneyEndpoint | null;
  loading: boolean;
  setHomeAddress: (endpoint: JourneyEndpoint | null) => void;
}

const HomeAddressContext = createContext<HomeAddressContextValue | undefined>(undefined);

export function HomeAddressProvider({ children }: { children: React.ReactNode }) {
  const [homeAddress, setHomeAddress] = useState<JourneyEndpoint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setHomeAddress(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (homeAddress) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(homeAddress));
    else AsyncStorage.removeItem(STORAGE_KEY);
  }, [homeAddress, loading]);

  const value = useMemo<HomeAddressContextValue>(
    () => ({ homeAddress, loading, setHomeAddress }),
    [homeAddress, loading]
  );

  return <HomeAddressContext.Provider value={value}>{children}</HomeAddressContext.Provider>;
}

export function useHomeAddress(): HomeAddressContextValue {
  const ctx = useContext(HomeAddressContext);
  if (!ctx) throw new Error('useHomeAddress must be used within HomeAddressProvider');
  return ctx;
}
