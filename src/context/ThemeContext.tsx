import { LightSensor } from 'expo-sensors';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from './SettingsContext';
import { darkColors, lightColors, ThemeColors } from '../theme';

// Ambient light only ever needs to flip a light/dark decision, not track exact lux — polling
// this often is plenty responsive without waking the sensor (and re-rendering the app) constantly.
const SENSOR_UPDATE_INTERVAL_MS = 2_000;

// Two thresholds rather than one: without this gap, a reading sitting right at the boundary
// (e.g. a hand briefly shadowing the sensor) would flip the whole app's theme back and forth.
const DARK_BELOW_LUX = 10;
const LIGHT_ABOVE_LUX = 30;

type ResolvedScheme = 'light' | 'dark';

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: ResolvedScheme;
}

const ThemeContext = createContext<ThemeContextValue>({ colors: lightColors, scheme: 'light' });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { themeMode } = useSettings();
  const systemScheme = useColorScheme();
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [ambientIsDark, setAmbientIsDark] = useState(false);

  useEffect(() => {
    if (themeMode !== 'auto') return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    // The light sensor only exists on Android — iOS exposes no ambient-light API to apps
    // at all, so "auto" there just falls back to the system light/dark setting below.
    LightSensor.isAvailableAsync().then((available) => {
      if (cancelled) return;
      setSensorAvailable(available);
      if (!available) return;

      LightSensor.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
      subscription = LightSensor.addListener(({ illuminance }) => {
        setAmbientIsDark((prevIsDark) => {
          if (prevIsDark && illuminance > LIGHT_ABOVE_LUX) return false;
          if (!prevIsDark && illuminance < DARK_BELOW_LUX) return true;
          return prevIsDark;
        });
      });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [themeMode]);

  const scheme: ResolvedScheme = useMemo(() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    if (sensorAvailable) return ambientIsDark ? 'dark' : 'light';
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [themeMode, sensorAvailable, ambientIsDark, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = scheme === 'dark' ? darkColors : lightColors;
    return { colors, scheme };
  }, [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useThemeScheme(): ResolvedScheme {
  return useContext(ThemeContext).scheme;
}
