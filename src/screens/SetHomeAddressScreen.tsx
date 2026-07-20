import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useHomeAddress } from '../context/HomeAddressContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { autocompletePlace, createSessionToken } from '../services/directions';
import { getCurrentLocationEndpoint } from '../services/location';
import { radius, spacing, ThemeColors } from '../theme';
import { PlaceSuggestion, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SetHomeAddress'>;

const DEBOUNCE_MS = 300;

// A direct "search for an address" flow to set Home — separate from picking an existing
// favourite (still offered in Settings too), since not everyone will have already
// favourited their home address before wanting to set it here.
export default function SetHomeAddressScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionToken = useRef(createSessionToken());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { setHomeAddress } = useHomeAddress();
  const t = useTranslation();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      autocompletePlace(query, sessionToken.current)
        .then(setResults)
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
  }, [query]);

  async function handleCurrentLocation() {
    const endpoint = await getCurrentLocationEndpoint();
    if (endpoint) {
      setHomeAddress(endpoint);
      navigation.goBack();
    }
  }

  function handlePick(place: PlaceSuggestion) {
    setHomeAddress({ kind: 'place', placeId: place.placeId, label: place.mainText, secondaryLabel: place.secondaryText });
    navigation.goBack();
  }

  const showingSearch = query.trim().length > 0;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('search.homeAddress')}
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
          <Pressable style={styles.quickRow} onPress={() => navigation.navigate('ChooseOnMap', { mode: 'home' })}>
            <Ionicons name="map-outline" size={18} color={colors.rose} />
            <Text style={styles.quickRowText}>{t('common.chooseOnMap')}</Text>
          </Pressable>
        </View>
      )}

      {searching && <ActivityIndicator style={styles.loader} color={colors.primary} />}

      {showingSearch && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.placeId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={!searching ? <Text style={styles.empty}>{t('common.noMatchesFound')}</Text> : null}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => handlePick(item)}>
              <Ionicons name="location-outline" size={18} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.mainText}</Text>
                {!!item.secondaryText && <Text style={styles.rowSubtitle}>{item.secondaryText}</Text>}
              </View>
            </Pressable>
          )}
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
