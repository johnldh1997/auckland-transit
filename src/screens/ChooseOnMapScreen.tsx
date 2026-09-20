import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedPressable from '../components/AnimatedPressable';
import { useFavoritePlaces } from '../context/FavoritePlacesContext';
import { useHomeAddress } from '../context/HomeAddressContext';
import { useThemeColors, useThemeScheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { darkMapStyle, lightMapStyle } from '../mapStyle';
import { getFastCoordinates, reverseGeocode } from '../services/location';
import { radius, spacing, ThemeColors } from '../theme';
import { JourneyEndpoint, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ChooseOnMap'>;

const DEFAULT_REGION: Region = {
  latitude: -36.8485,
  longitude: 174.7633,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

const PICK_DELTA = 0.008;
const LOCATION_TIMEOUT_MS = 5_000;

export default function ChooseOnMapScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useThemeScheme() === 'dark';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const params = route.params;
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [confirming, setConfirming] = useState(false);
  const { addPlace } = useFavoritePlaces();
  const { setHomeAddress } = useHomeAddress();
  const t = useTranslation();

  useEffect(() => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        setInitialRegion(DEFAULT_REGION);
      }
    }, LOCATION_TIMEOUT_MS);

    getFastCoordinates()
      .then((coords) => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          const start = coords ? { ...coords, latitudeDelta: PICK_DELTA, longitudeDelta: PICK_DELTA } : DEFAULT_REGION;
          setInitialRegion(start);
          setRegion(start);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          setInitialRegion(DEFAULT_REGION);
        }
      });

    return () => clearTimeout(timeout);
  }, []);

  async function handleConfirm() {
    setConfirming(true);
    const address = await reverseGeocode(region.latitude, region.longitude);
    const endpoint: JourneyEndpoint = {
      kind: 'coordinates',
      lat: region.latitude,
      lon: region.longitude,
      label: address ?? `Pinned location (${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)})`,
    };

    if (params.mode === 'favourite') {
      addPlace(endpoint);
      navigation.pop(2);
      return;
    }

    if (params.mode === 'home') {
      setHomeAddress(endpoint);
      navigation.pop(2);
      return;
    }

    // Carry the full from+to pair back (not just the field being picked), so the other
    // field's in-progress selection isn't lost on the way back to whichever form opened
    // this picker — Home's inline form, or the Journey Planner results page (which
    // re-searches straight away, since its shown options would otherwise be stale).
    const restoredFrom = params.pickingFor === 'from' ? endpoint : params.currentFrom;
    const restoredTo = params.pickingFor === 'to' ? endpoint : params.currentTo;
    if (params.returnTo === 'JourneyPlanner') {
      navigation.navigate('JourneyPlanner', { restoredFrom, restoredTo, autoSearch: !!(restoredFrom && restoredTo) });
    } else {
      navigation.navigate('Home', { restoredFrom, restoredTo });
    }
  }

  if (!initialRegion) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('map.findingLocation')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        customMapStyle={isDark ? darkMapStyle : lightMapStyle}
      />

      <View style={styles.pin} pointerEvents="none">
        <Ionicons name="location" size={40} color={colors.rose} />
      </View>

      <AnimatedPressable
        style={[styles.confirmButton, { bottom: spacing.lg + insets.bottom }]}
        onPress={handleConfirm}
        disabled={confirming}
      >
        {confirming ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.confirmButtonText}>{t('chooseOnMap.confirm')}</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    loading: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.background },
    loadingText: { color: colors.textMuted, fontSize: 14 },
    pin: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: [{ translateX: -20 }, { translateY: -40 }],
    },
    confirmButton: {
      position: 'absolute',
      bottom: spacing.lg,
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    confirmButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  });
}
