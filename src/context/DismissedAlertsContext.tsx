import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'auckland-transit:dismissed-alerts';

interface DismissedAlertsContextValue {
  isDismissed: (alertId: string) => boolean;
  dismissAlert: (alertId: string) => void;
}

const DismissedAlertsContext = createContext<DismissedAlertsContextValue | undefined>(undefined);

export function DismissedAlertsProvider({ children }: { children: React.ReactNode }) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setDismissedIds(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dismissedIds));
    }
  }, [dismissedIds, loading]);

  const value = useMemo<DismissedAlertsContextValue>(
    () => ({
      isDismissed: (alertId) => dismissedIds.includes(alertId),
      dismissAlert: (alertId) => {
        setDismissedIds((prev) => (prev.includes(alertId) ? prev : [...prev, alertId]));
      },
    }),
    [dismissedIds]
  );

  return <DismissedAlertsContext.Provider value={value}>{children}</DismissedAlertsContext.Provider>;
}

export function useDismissedAlerts(): DismissedAlertsContextValue {
  const ctx = useContext(DismissedAlertsContext);
  if (!ctx) throw new Error('useDismissedAlerts must be used within DismissedAlertsProvider');
  return ctx;
}
