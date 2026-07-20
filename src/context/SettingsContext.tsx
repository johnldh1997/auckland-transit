import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Language, ThemeMode, TransportMode } from '../types';

// Exported so code that can't use the useSettings() hook (e.g. the background journey-
// notification task in journeyNotification.ts, which runs outside the React tree) can
// still read the persisted language directly from AsyncStorage.
export const STORAGE_KEY = 'auckland-transit:settings';

interface Settings {
  notificationsMasterEnabled: boolean;
  showLiveVehicles: boolean;
  vehicleModeFilters: TransportMode[];
  themeMode: ThemeMode;
  language: Language;
}

interface SettingsContextValue extends Settings {
  loading: boolean;
  setNotificationsMasterEnabled: (enabled: boolean) => void;
  setShowLiveVehicles: (enabled: boolean) => void;
  toggleVehicleModeFilter: (mode: TransportMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (language: Language) => void;
}

const DEFAULT_SETTINGS: Settings = {
  notificationsMasterEnabled: false,
  showLiveVehicles: true,
  vehicleModeFilters: ['bus', 'train', 'ferry'],
  themeMode: 'auto',
  language: 'en',
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, loading]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      loading,
      setNotificationsMasterEnabled: (enabled) =>
        setSettings((prev) => ({ ...prev, notificationsMasterEnabled: enabled })),
      setShowLiveVehicles: (enabled) => setSettings((prev) => ({ ...prev, showLiveVehicles: enabled })),
      toggleVehicleModeFilter: (mode) =>
        setSettings((prev) => ({
          ...prev,
          vehicleModeFilters: prev.vehicleModeFilters.includes(mode)
            ? prev.vehicleModeFilters.filter((m) => m !== mode)
            : [...prev.vehicleModeFilters, mode],
        })),
      setThemeMode: (mode) => setSettings((prev) => ({ ...prev, themeMode: mode })),
      setLanguage: (language) => setSettings((prev) => ({ ...prev, language })),
    }),
    [settings, loading]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
