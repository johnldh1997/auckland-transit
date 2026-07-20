import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useThemeColors, useThemeScheme } from '../context/ThemeContext';
import { darkMapStyle, lightMapStyle } from '../mapStyle';
import { useMarkerIcon } from '../services/markerIcon';
import { radius, spacing, ThemeColors } from '../theme';

interface Props {
  lat: number;
  lon: number;
}

// Tight zoom so the road layout is visible and it's clear which side of the
// road the stop sits on, rather than just a dot on an unreadably zoomed-out map.
const ZOOM_DELTA = 0.0015;

// The bus-icon bitmap (see markerIcon.ts) is a plain square glyph, not a teardrop pin — the
// native default anchor (bottom-center) would leave it floating above the real coordinate
// instead of centered on it. A stable module-level reference, same reasoning as VehicleMap.tsx.
const CENTER_ANCHOR = { x: 0.5, y: 0.5 };

export default function StopLocationMap({ lat, lon }: Props) {
  const colors = useThemeColors();
  const isDark = useThemeScheme() === 'dark';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stopIcon = useMarkerIcon('directions-bus', 28, colors.primary);
  return (
    <View style={styles.container}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ latitude: lat, longitude: lon, latitudeDelta: ZOOM_DELTA, longitudeDelta: ZOOM_DELTA }}
        toolbarEnabled={false}
        customMapStyle={isDark ? darkMapStyle : lightMapStyle}
      >
        <Marker
          coordinate={{ latitude: lat, longitude: lon }}
          image={stopIcon}
          pinColor={colors.primary}
          anchor={CENTER_ANCHOR}
        />
      </MapView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      height: 160,
      borderRadius: radius.md,
      overflow: 'hidden',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
  });
}
