import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useDismissedAlerts } from '../context/DismissedAlertsContext';
import { useReadAlerts } from '../context/ReadAlertsContext';
import { useSettings } from '../context/SettingsContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { getAllActiveAlerts, getNearbyActiveAlerts, invalidateAlertsCache } from '../services/alerts';
import { getRouteInfo } from '../services/gtfs';
import { radius, spacing, ThemeColors } from '../theme';
import { Language, ServiceAlert } from '../types';

// Uses the Korean locale's own date/time conventions when that's the active language,
// rather than translating a fixed English format string.
function formatDateTime(iso: string, language: Language): string {
  const date = new Date(iso);
  const locale = language === 'ko' ? 'ko-KR' : undefined;
  return `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
}

interface AlertWithRoutes extends ServiceAlert {
  routeShortNames: string[];
}

type FilterMode = 'nearby' | 'all';

async function withRouteBadges(raw: ServiceAlert[]): Promise<AlertWithRoutes[]> {
  return Promise.all(
    raw.map(async (alert) => {
      const infos = await Promise.all(alert.routeIds.map((id) => getRouteInfo(id)));
      const routeShortNames = Array.from(
        new Set(infos.filter((info): info is NonNullable<typeof info> => !!info).map((info) => info.shortName))
      );
      return { ...alert, routeShortNames };
    })
  );
}

// Every currently-active service alert — until now, alerts only ever showed up
// contextually (on a stop you're viewing, or a journey you're tracking), so there was no
// way to just check "what's disrupted right now" without already being somewhere
// affected by it. Defaults to alerts near the user (nearby stops, or routes that serve
// them — see getNearbyActiveAlerts), with an "All" toggle for the full network-wide list.
export default function AlertsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<FilterMode>('nearby');
  const [alerts, setAlerts] = useState<AlertWithRoutes[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { isRead, markAsRead } = useReadAlerts();
  const { isDismissed, dismissAlert } = useDismissedAlerts();
  const { language } = useSettings();
  const t = useTranslation();
  const visibleAlerts = alerts?.filter((alert) => !isDismissed(alert.id)) ?? null;

  function loadAlerts(currentMode: FilterMode): Promise<AlertWithRoutes[]> {
    const load = currentMode === 'nearby' ? getNearbyActiveAlerts() : getAllActiveAlerts();
    return load.then(withRouteBadges);
  }

  useEffect(() => {
    let cancelled = false;
    setAlerts(null);
    loadAlerts(mode)
      .then((withRoutes) => {
        if (!cancelled) setAlerts(withRoutes);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Dragging down on the list is how the user manually checks for new alerts, rather than
  // waiting for the next scheduled poll or having to leave and reopen the screen —
  // invalidateAlertsCache forces this to actually hit the network instead of just
  // re-serving whatever the last fetch (up to 2 minutes old) already had.
  function handleRefresh() {
    setRefreshing(true);
    invalidateAlertsCache();
    loadAlerts(mode)
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setRefreshing(false));
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(['nearby', 'all'] as const).map((option) => {
          const active = mode === option;
          return (
            <Pressable
              key={option}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setMode(option)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {option === 'nearby' ? t('alerts.nearMe') : t('alerts.all')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!visibleAlerts ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleAlerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{mode === 'nearby' ? t('alerts.emptyNearby') : t('alerts.emptyAll')}</Text>
          }
          renderItem={({ item }) => {
            const read = isRead(item.id);
            return (
              <Pressable
                style={[styles.card, read && styles.cardRead]}
                onPress={() => markAsRead(item.id)}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.badgeRow}>
                    {item.routeShortNames.map((name) => (
                      <View key={name} style={[styles.badge, read && styles.badgeRead]}>
                        <Text style={styles.badgeText}>{name}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => dismissAlert(item.id)}
                    hitSlop={8}
                    style={styles.dismissButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('alerts.removeLabel')}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={[styles.header, read && styles.headerRead]}>{item.headerText}</Text>
                {!!item.descriptionText && <Text style={styles.description}>{item.descriptionText}</Text>}
                {!!item.postedAt && (
                  <Text style={styles.postedAt}>
                    {t('alerts.postedAt', { date: formatDateTime(item.postedAt, language) })}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    filterRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterChip: {
      flex: 1,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    filterChipTextActive: { color: '#FFFFFF' },
    list: { padding: spacing.lg, gap: spacing.sm },
    card: {
      backgroundColor: colors.dangerMuted,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger,
      padding: spacing.md,
      gap: spacing.xs,
    },
    cardRead: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      opacity: 0.6,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.xs },
    dismissButton: { marginTop: -4, marginRight: -4 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
    badge: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
    badgeRead: { backgroundColor: colors.textMuted },
    badgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
    header: { color: colors.danger, fontWeight: '700', fontSize: 14 },
    headerRead: { color: colors.textMuted },
    description: { color: colors.text, fontSize: 13 },
    postedAt: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  });
}
