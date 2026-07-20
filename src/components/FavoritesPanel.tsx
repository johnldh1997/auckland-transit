import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { mergeDepartures } from '../services/departures';
import { getScheduledDeparturesForStop } from '../services/gtfsStatic';
import { getDeparturesForStops } from '../services/realtime';
import { radius, spacing, ThemeColors } from '../theme';
import { Departure } from '../types';
import DepartureRow from './DepartureRow';
import DraggableSheet from './DraggableSheet';

const POLL_INTERVAL_MS = 30_000;

export const PANEL_PEEK_HEIGHT = 88;
const PANEL_MAX_HEIGHT = 340;

interface Props {
  onStopPress: (stopId: string, stopName: string, stopCode: string) => void;
  // Device safe-area bottom inset, so the sheet's peek and its drag handle lift clear of
  // the gesture bar/home indicator instead of sitting flush against it.
  bottomInset?: number;
}

// Quick-glance access to favourite stops' next departure directly from the Home map,
// without navigating away — the app's whole point is fast "when's my bus" access, and
// that was still a few taps away (menu -> Favorites -> tap a stop) before this.
export default function FavoritesPanel({ onStopPress, bottomInset = 0 }: Props) {
  const { favorites } = useFavorites();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = useTranslation();
  const [departuresByStop, setDeparturesByStop] = useState<Map<string, Departure[]>>(new Map());

  useEffect(() => {
    if (favorites.length === 0) return;
    let cancelled = false;
    const stopIds = favorites.map((f) => f.stopId);

    function load() {
      Promise.all([
        getDeparturesForStops(stopIds),
        Promise.all(stopIds.map((id) => getScheduledDeparturesForStop(id).catch(() => []))),
      ]).then(([liveByStop, scheduledLists]) => {
        if (cancelled) return;
        const merged = new Map<string, Departure[]>();
        stopIds.forEach((stopId, index) => {
          merged.set(stopId, mergeDepartures(liveByStop.get(stopId) ?? [], scheduledLists[index]));
        });
        setDeparturesByStop(merged);
      });
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // stopIds is derived from favorites each render; comparing favorites.length keeps this
    // from re-subscribing on every unrelated re-render while still picking up add/remove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites.length]);

  if (favorites.length === 0) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <DraggableSheet minHeight={PANEL_PEEK_HEIGHT} maxHeight={PANEL_MAX_HEIGHT} bottomInset={bottomInset}>
        <Text style={styles.title}>{t('menu.favourites')}</Text>
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.stopId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const next = departuresByStop.get(item.stopId)?.[0];
            return (
              <Pressable
                style={styles.row}
                onPress={() => onStopPress(item.stopId, item.stopName, item.stopCode)}
              >
                <Text style={styles.stopName} numberOfLines={1}>
                  {item.stopName}
                </Text>
                {next ? (
                  <DepartureRow departure={next} />
                ) : (
                  <Text style={styles.empty}>{t('favorites.noDepartures')}</Text>
                )}
              </Pressable>
            );
          }}
        />
      </DraggableSheet>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: 2,
  },
  stopName: { fontSize: 13, fontWeight: '700', color: colors.textMuted, paddingHorizontal: spacing.md },
  empty: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  });
}
