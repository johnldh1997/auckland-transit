import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { getStopsNearLocation, NearbyStop, searchStops } from '../services/gtfs';
import { getPrimaryHeadsignsForStops } from '../services/gtfsStatic';
import { getFastCoordinates } from '../services/location';
import { radius, spacing, ThemeColors } from '../theme';
import { RootStackParamList, Stop } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SearchStops'>;

const DEBOUNCE_MS = 300;

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Plain "look up a stop to view it" — no favouriting framing, unlike AddFavoriteScreen
// (which is specifically about building the Favourites list and also covers places).
export default function SearchStopsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stop[]>([]);
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [searching, setSearching] = useState(false);
  const [headsigns, setHeadsigns] = useState<Map<string, string>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const t = useTranslation();

  useEffect(() => {
    getFastCoordinates().then((coords) => {
      if (coords) getStopsNearLocation(coords.latitude, coords.longitude).then(setNearbyStops);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      searchStops(query)
        .then(setResults)
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
  }, [query]);

  function handleSelect(stop: Stop) {
    navigation.navigate('Home', { focusStop: { lat: stop.lat, lon: stop.lon, requestedAt: Date.now() } });
  }

  const showingSearch = query.trim().length > 0;
  const listData: (Stop | NearbyStop)[] = showingSearch ? results : nearbyStops;

  // AT often has two stops sharing the same name for opposite directions — showing each
  // one's most common headsign ("Towards Britomart") right in the list is the only way to
  // tell them apart before tapping one.
  useEffect(() => {
    const currentList = showingSearch ? results : nearbyStops;
    getPrimaryHeadsignsForStops(currentList.map((stop) => stop.id)).then(setHeadsigns);
  }, [results, nearbyStops, showingSearch]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('search.forAStop')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {searching && <ActivityIndicator style={styles.loader} color={colors.primary} />}

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          !showingSearch && nearbyStops.length > 0 ? <Text style={styles.sectionLabel}>{t('common.stopsNearYou')}</Text> : null
        }
        ListEmptyComponent={showingSearch && !searching ? <Text style={styles.empty}>{t('common.noMatchesFound')}</Text> : null}
        renderItem={({ item }) => {
          const headsign = headsigns.get(item.id);
          return (
          <Pressable style={styles.row} onPress={() => handleSelect(item)}>
            <Ionicons name="bus-outline" size={18} color={colors.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {t('common.stopCode', { code: item.code })}
                {'distanceMeters' in item ? ` · ${formatDistance(item.distanceMeters)}` : ''}
              </Text>
              {!!headsign && <Text style={styles.rowDirection}>{t('common.towards', { headsign })}</Text>}
            </View>
          </Pressable>
          );
        }}
      />
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
    rowDirection: { fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '600' },
    empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.lg },
  });
}
