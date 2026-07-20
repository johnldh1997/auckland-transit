import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'auckland-transit:read-alerts';

interface ReadAlertsContextValue {
  isRead: (alertId: string) => boolean;
  markAsRead: (alertId: string) => void;
}

const ReadAlertsContext = createContext<ReadAlertsContextValue | undefined>(undefined);

export function ReadAlertsProvider({ children }: { children: React.ReactNode }) {
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setReadIds(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
    }
  }, [readIds, loading]);

  const value = useMemo<ReadAlertsContextValue>(
    () => ({
      isRead: (alertId) => readIds.includes(alertId),
      markAsRead: (alertId) => {
        setReadIds((prev) => (prev.includes(alertId) ? prev : [...prev, alertId]));
      },
    }),
    [readIds]
  );

  return <ReadAlertsContext.Provider value={value}>{children}</ReadAlertsContext.Provider>;
}

export function useReadAlerts(): ReadAlertsContextValue {
  const ctx = useContext(ReadAlertsContext);
  if (!ctx) throw new Error('useReadAlerts must be used within ReadAlertsProvider');
  return ctx;
}
