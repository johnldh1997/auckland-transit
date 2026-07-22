import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFavoritePlaces } from '../context/FavoritePlacesContext';
import { useHomeAddress } from '../context/HomeAddressContext';
import { useSettings } from '../context/SettingsContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { ensureNotificationSetup } from '../services/notifications';
import { hasApiKey } from '../services/atClient';
import { radius, spacing, ThemeColors } from '../theme';
import { Language, RootStackParamList, ThemeMode, TransportMode } from '../types';

const MODE_FILTERS: { key: TransportMode; labelKey: 'mode.bus' | 'mode.train' | 'mode.ferry' }[] = [
  { key: 'bus', labelKey: 'mode.bus' },
  { key: 'train', labelKey: 'mode.train' },
  { key: 'ferry', labelKey: 'mode.ferry' },
];

const THEME_MODE_OPTIONS: { key: ThemeMode; labelKey: 'theme.bright' | 'theme.dark' | 'theme.auto' }[] = [
  { key: 'light', labelKey: 'theme.bright' },
  { key: 'dark', labelKey: 'theme.dark' },
  { key: 'auto', labelKey: 'theme.auto' },
];

const LANGUAGE_OPTIONS: { key: Language; labelKey: 'language.english' | 'language.korean' }[] = [
  { key: 'en', labelKey: 'language.english' },
  { key: 'ko', labelKey: 'language.korean' },
];

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    notificationsMasterEnabled,
    setNotificationsMasterEnabled,
    showLiveVehicles,
    setShowLiveVehicles,
    vehicleModeFilters,
    toggleVehicleModeFilter,
    themeMode,
    setThemeMode,
    language,
    setLanguage,
  } = useSettings();
  const { places: favoritePlaces } = useFavoritePlaces();
  const { homeAddress, setHomeAddress } = useHomeAddress();
  const t = useTranslation();

  async function handleMasterToggle(value: boolean) {
    if (value) {
      const granted = await ensureNotificationSetup();
      if (!granted) return;
    }
    setNotificationsMasterEnabled(value);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.section}>
        <View style={styles.filterRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = language === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setLanguage(option.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(option.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('settings.homeAddress')}</Text>
      <View style={styles.section}>
        {homeAddress ? (
          <View style={styles.row}>
            <Ionicons name="home" size={18} color={colors.amber} />
            <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={1}>
              {homeAddress.label}
            </Text>
            <Pressable onPress={() => setHomeAddress(null)} hitSlop={8}>
              <Text style={styles.clearLink}>{t('common.clear')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable style={styles.row} onPress={() => navigation.navigate('SetHomeAddress')}>
              <Ionicons name="search-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { flex: 1 }]}>{t('settings.enterAddress')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            {favoritePlaces.length > 0 && (
              <>
                <Text style={styles.rowHint}>{t('settings.pickFavouriteHint')}</Text>
                {favoritePlaces.map((place) => (
                  <Pressable
                    key={place.id}
                    style={styles.homeOptionRow}
                    onPress={() => setHomeAddress(place.endpoint)}
                  >
                    <Ionicons name="location-outline" size={16} color={colors.primary} />
                    <Text style={styles.homeOptionText} numberOfLines={1}>
                      {place.endpoint.label}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
      <View style={styles.section}>
        <View style={styles.filterRow}>
          {THEME_MODE_OPTIONS.map((option) => {
            const active = themeMode === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setThemeMode(option.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(option.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        {themeMode === 'auto' && (
          <Text style={styles.rowHint}>
            {Platform.OS === 'android' ? t('settings.autoHintAndroid') : t('settings.autoHintIos')}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t('settings.notifications')}</Text>
            <Text style={styles.rowHint}>{t('settings.notificationsHint')}</Text>
          </View>
          <Switch
            value={notificationsMasterEnabled}
            onValueChange={handleMasterToggle}
            accessibilityLabel={t('settings.notifications')}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('settings.liveVehicles')}</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t('settings.showLiveVehicles')}</Text>
            <Text style={styles.rowHint}>{t('settings.showLiveVehiclesHint')}</Text>
          </View>
          <Switch
            value={showLiveVehicles}
            onValueChange={setShowLiveVehicles}
            accessibilityLabel={t('settings.showLiveVehicles')}
          />
        </View>
        {showLiveVehicles && (
          <View style={styles.filterRow}>
            {MODE_FILTERS.map((filter) => {
              const active = vehicleModeFilters.includes(filter.key);
              return (
                <Pressable
                  key={filter.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => toggleVehicleModeFilter(filter.key)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(filter.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.apiStatus}>{hasApiKey() ? t('settings.apiConnected') : t('settings.apiNotConnected')}</Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
    scrollContent: { paddingBottom: spacing.xl },
    section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    filterRow: { flexDirection: 'row', gap: spacing.xs },
    filterChip: {
      flex: 1,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    filterChipTextActive: { color: '#FFFFFF' },
    rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    clearLink: { color: colors.danger, fontWeight: '600', fontSize: 13 },
    homeOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    homeOptionText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    apiStatus: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 12,
      padding: spacing.lg,
    },
  });
}
