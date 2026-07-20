import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFavoritePlaces } from '../context/FavoritePlacesContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { autocompletePlace, createSessionToken } from '../services/directions';
import { getStopsNearLocation, NearbyStop, searchStops } from '../services/gtfs';
import { getCurrentLocationEndpoint, getFastCoordinates } from '../services/location';
import { radius, spacing, ThemeColors } from '../theme';
import { PlaceSuggestion, RootStackParamList, Stop } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFavorite'>;

const DEBOUNCE_MS = 300;

type ResultRow = { kind: 'stop'; stop: Stop } | { kind: 'place'; place: PlaceSuggestion };

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function AddFavoriteScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [stopResults, setStopResults] = useState<Stop[]>([]);
  const [placeResults, setPlaceResults] = useState<PlaceSuggestion[]>([]);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionToken = useRef(createSessionToken());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { addPlace } = useFavoritePlaces();
  const t = useTranslation();

  useEffect(() => {
    getFastCoordinates().then((coords) => {
      if (coords) getStopsNearLocation(coords.latitude, coords.longitude).then(setNearbyStops);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setStopResults([]);
      setPlaceResults([]);
      return;
    }
    setSearching(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      Promise.all([searchStops(query), autocompletePlace(query, sessionToken.current)])
        .then(([stops, places]) => {
          setStopResults(stops);
          setPlaceResults(places);
        })
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
  }, [query]);

  async function handleCurrentLocation() {
    const endpoint = await getCurrentLocationEndpoint();
    if (endpoint) {
      addPlace(endpoint);
      navigation.goBack();
    }
  }

  // Stops have real content worth checking before committing to favouriting one (live
  // departures, alerts, exact location) — so unlike places, tapping a stop opens it for
  // viewing (same as tapping a stop marker on the map) rather than favouriting it outright.
  // Favouriting happens from StopDetailScreen's own "Add Favorite" button.
  function handleViewStop(stop: Stop) {
    navigation.navigate('StopDetail', { stopId: stop.id, stopName: stop.name, stopCode: stop.code });
  }

  function handleAddPlace(place: PlaceSuggestion) {
    addPlace({ kind: 'place', placeId: place.placeId, label: place.mainText, secondaryLabel: place.secondaryText });
    navigation.goBack();
  }

  const showingSearch = query.trim().length > 0;
  const searchRows: ResultRow[] = [
    ...stopResults.map((stop): ResultRow => ({ kind: 'stop', stop })),
    ...placeResults.map((place): ResultRow => ({ kind: 'place', place })),
  ];

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('search.stopPlaceAddress')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {!showingSearch && (
        <View style={styles.quickOptions}>
          <Pressable style={styles.quickRow} onPress={handleCurrentLocation}>
            <Ionicons name="locate" size={18} color={colors.primary} />
            <Text style={styles.quickRowText}>{t('common.currentLocation')}</Text>
          </Pressable>
          <Pressable style={styles.quickRow} onPress={() => navigation.navigate('ChooseOnMap', { mode: 'favourite' })}>
            <Ionicons name="map-outline" size={18} color={colors.rose} />
            <Text style={styles.quickRowText}>{t('common.chooseOnMap')}</Text>
          </Pressable>
        </View>
      )}

      {searching && <ActivityIndicator style={styles.loader} color={colors.primary} />}

      {!showingSearch && (
        <FlatList
          data={nearbyStops}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            nearbyStops.length > 0 ? <Text style={styles.sectionLabel}>{t('common.stopsNearYou')}</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => handleViewStop(item)}>
              <Ionicons name="bus-outline" size={18} color={colors.emerald} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSubtitle}>
                  {t('common.stopCode', { code: item.code })} · {formatDistance(item.distanceMeters)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {showingSearch && (
        <FlatList
          data={searchRows}
          keyExtractor={(item, index) => (item.kind === 'stop' ? `stop-${item.stop.id}` : `place-${index}`)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={!searching ? <Text style={styles.empty}>{t('common.noMatchesFound')}</Text> : null}
          renderItem={({ item }) =>
            item.kind === 'stop' ? (
              <Pressable style={styles.row} onPress={() => handleViewStop(item.stop)}>
                <Ionicons name="bus-outline" size={18} color={colors.emerald} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.stop.name}</Text>
                  <Text style={styles.rowSubtitle}>{t('common.stopCode', { code: item.stop.code })}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable style={styles.row} onPress={() => handleAddPlace(item.place)}>
                <Ionicons name="location-outline" size={18} color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.place.mainText}</Text>
                  {!!item.place.secondaryText && <Text style={styles.rowSubtitle}>{item.place.secondaryText}</Text>}
                </View>
              </Pressable>
            )
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    input: {
      margin: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: colors.text,
    },
    quickOptions: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    quickRowText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    loader: { marginTop: spacing.sm },
    list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.lg },
  });
}
