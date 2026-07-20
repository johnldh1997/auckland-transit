import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { radius, spacing, ThemeColors } from '../theme';
import { JourneyEndpoint } from '../types';

interface Props {
  from: JourneyEndpoint;
  to: JourneyEndpoint;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  onDelete?: () => void;
}

export default function TripRow({ from, to, isFavorite, onPress, onToggleFavorite, onDelete }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = useTranslation();
  return (
    <View style={styles.tripRow}>
      <Pressable style={styles.tripRowMain} onPress={onPress}>
        <Text style={styles.tripText} numberOfLines={1}>
          {from.label} → {to.label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onToggleFavorite}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? t('trips.removeFavourite') : t('trips.addFavourite')}
      >
        <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={18} color={isFavorite ? colors.accent : colors.textMuted} />
      </Pressable>
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('trips.removeRecent')}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tripRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    tripRowMain: { flex: 1 },
    tripText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  });
}
