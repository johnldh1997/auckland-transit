import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import TripRow from '../components/TripRow';
import { useFavoriteTrips } from '../context/FavoriteTripsContext';
import { useRecentTrips } from '../context/RecentTripsContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { spacing, ThemeColors } from '../theme';
import { JourneyEndpoint, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTrips'>;

// Favourite/recent whole From→To trips, promoted out of the Journey Planner form (where
// they still also show up as a quick-start list) into their own destination — for
// jumping straight to a familiar trip without opening the planner form first.
export default function MyTripsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { trips: favoriteTrips, isFavoriteTrip, toggleFavoriteTrip } = useFavoriteTrips();
  const { trips: recentTrips, removeRecentTrip } = useRecentTrips();
  const t = useTranslation();

  function handleRunTrip(from: JourneyEndpoint, to: JourneyEndpoint) {
    navigation.navigate('JourneyPlanner', { restoredFrom: from, restoredTo: to, autoSearch: true });
  }

  const isEmpty = favoriteTrips.length === 0 && recentTrips.length === 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isEmpty && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('trips.empty')}</Text>
          <Text style={styles.emptySubtext}>{t('trips.emptyHint')}</Text>
        </View>
      )}

      {favoriteTrips.length > 0 && <Text style={styles.sectionLabel}>{t('common.favouriteTrips')}</Text>}
      {favoriteTrips.map((trip) => (
        <TripRow
          key={trip.id}
          from={trip.from}
          to={trip.to}
          isFavorite
          onPress={() => handleRunTrip(trip.from, trip.to)}
          onToggleFavorite={() => toggleFavoriteTrip(trip.from, trip.to)}
        />
      ))}

      {recentTrips.length > 0 && <Text style={styles.sectionLabel}>{t('common.recentTrips')}</Text>}
      {recentTrips.map((trip, index) => (
        <TripRow
          key={index}
          from={trip.from}
          to={trip.to}
          isFavorite={isFavoriteTrip(trip.from, trip.to)}
          onPress={() => handleRunTrip(trip.from, trip.to)}
          onToggleFavorite={() => toggleFavoriteTrip(trip.from, trip.to)}
          onDelete={() => removeRecentTrip(trip.from, trip.to)}
        />
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.sm },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    empty: { alignItems: 'center', paddingTop: spacing.xl },
    emptyText: { fontSize: 16, fontWeight: '600', color: colors.text },
    emptySubtext: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  });
}
