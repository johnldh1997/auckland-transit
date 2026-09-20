import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { LegProgress } from '../services/legProgress';
import { radius, spacing, ThemeColors } from '../theme';
import { Stop } from '../types';

interface Props {
  stops: Stop[];
  // The leg's own color (matches its route line and badge), used for the direction rail and
  // the "towards" header so the list reads as part of that leg.
  color: string;
  headsign?: string;
  // Present only while a journey is active and the rider is confirmed on this leg — without it
  // (route preview, or riding another leg) the list is just the leg's stops in order.
  progress: LegProgress | null;
}

// --- Journey Stop List ---
// Every stop a transit leg passes through, top to bottom in the direction of travel, under a
// coloured "towards <headsign>" header. With live progress it highlights the stop the rider is
// at, marks the next one, and folds the stops already behind them into a single line so the
// current stop leads the list; the final stop is always flagged as the one to get off at.
export default function LegStopList({ stops, color, headsign, progress }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = useTranslation();
  const lastIndex = stops.length - 1;
  const firstShown = progress && progress.currentIndex > 0 ? progress.currentIndex : 0;

  return (
    <View style={styles.list}>
      {!!headsign && (
        <View style={styles.towardsRow}>
          <Ionicons name="arrow-down-circle" size={16} color={color} />
          <Text style={[styles.towardsText, { color }]}>{t('common.towards', { headsign })}</Text>
        </View>
      )}
      {firstShown > 0 && <Text style={styles.passedText}>{t('journey.stopsPassed', { count: firstShown })}</Text>}
      {stops.slice(firstShown).map((stop, offset) => {
        const index = firstShown + offset;
        const isFirst = index === 0;
        const isLast = index === lastIndex;
        const isHere = progress?.currentIndex === index;
        const isNext = progress?.nextIndex === index;

        // One tag per row, most important first: where you are, then the stop to get off at,
        // then what's coming next, then the boarding stop.
        const tag = isHere
          ? { label: t('journey.youAreHere'), tint: color }
          : isLast
            ? { label: t('journey.getOffHere'), tint: colors.danger }
            : isNext
              ? { label: t('journey.nextStop'), tint: color }
              : isFirst
                ? { label: t('journey.getOnHere'), tint: colors.textMuted }
                : null;
        const emphasised = isHere || isNext || isLast || isFirst;

        return (
          <View key={stop.id} style={[styles.row, isHere && { backgroundColor: `${color}22` }]}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.railLine,
                  { backgroundColor: color, top: index === firstShown ? '50%' : 0, bottom: isLast ? '50%' : 0 },
                ]}
              />
              {isLast ? (
                <Ionicons name="flag" size={15} color={colors.danger} />
              ) : (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: color },
                    isHere && styles.dotHere,
                    isNext && [styles.dotNext, { borderColor: color }],
                  ]}
                />
              )}
            </View>
            <Text style={[styles.name, emphasised && styles.nameEmphasised]} numberOfLines={1}>
              {stop.name}
            </Text>
            {tag && <Text style={[styles.tag, { color: tag.tint }]}>{tag.label}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { marginTop: spacing.xs, paddingBottom: spacing.xs },
    towardsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
    towardsText: { fontSize: 12, fontWeight: '700' },
    passedText: { color: colors.textMuted, fontSize: 11, paddingVertical: 2, paddingLeft: 30 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 30,
      paddingRight: spacing.xs,
      borderRadius: radius.sm,
    },
    // A fixed-width column so every dot lines up; the line runs the full row height so
    // consecutive rows join into one continuous route line.
    rail: { width: 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    railLine: { position: 'absolute', width: 3, borderRadius: 2, opacity: 0.55 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotHere: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.surface },
    dotNext: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: colors.surface },
    name: { flex: 1, color: colors.textMuted, fontSize: 13 },
    nameEmphasised: { color: colors.text, fontWeight: '700' },
    tag: { fontSize: 11, fontWeight: '700' },
  });
}
