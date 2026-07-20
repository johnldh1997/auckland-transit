import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { FavoriteStop, Stop } from '../types';

const STORAGE_KEY = 'auckland-transit:favorites';

interface FavoritesContextValue {
  favorites: FavoriteStop[];
  loading: boolean;
  isFavorite: (stopId: string) => boolean;
  addFavorite: (stop: Stop) => void;
  removeFavorite: (stopId: string) => void;
  setFavoriteNotifications: (stopId: string, enabled: boolean) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setFavorites(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }
  }, [favorites, loading]);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      loading,
      isFavorite: (stopId) => favorites.some((f) => f.stopId === stopId),
      addFavorite: (stop) =>
        setFavorites((prev) =>
          prev.some((f) => f.stopId === stop.id)
            ? prev
            : [
                ...prev,
                {
                  stopId: stop.id,
                  stopName: stop.name,
                  stopCode: stop.code,
                  notificationsEnabled: false,
                  addedAt: Date.now(),
                },
              ]
        ),
      removeFavorite: (stopId) => setFavorites((prev) => prev.filter((f) => f.stopId !== stopId)),
      setFavoriteNotifications: (stopId, enabled) =>
        setFavorites((prev) =>
          prev.map((f) => (f.stopId === stopId ? { ...f, notificationsEnabled: enabled } : f))
        ),
    }),
    [favorites, loading]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
