import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';
import { radius, spacing, ThemeColors } from '../theme';

interface Props {
  value: Date;
  onChange: (value: Date) => void;
}

const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
const DAYS_AHEAD = 14;
const ITEM_HEIGHT = 44;
const LIST_HEIGHT = ITEM_HEIGHT * 6;

interface TimeSlot {
  kind: 'now' | 'slot';
  hour: number;
  minute: number;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

// Nearest slot to the given hour/minute, by absolute distance — works uniformly whether
// the list starts with a "Now" entry or not, and whether `value` lines up exactly with a
// slot or not (e.g. right after selecting "Now" itself, which carries real seconds).
function findClosestSlotIndex(slots: TimeSlot[], targetHour: number, targetMinute: number): number {
  const targetTotal = targetHour * 60 + targetMinute;
  let bestIndex = 0;
  let bestDiff = Infinity;
  slots.forEach((slot, i) => {
    const diff = Math.abs(slot.hour * 60 + slot.minute - targetTotal);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  });
  return bestIndex;
}

function formatDateLabel(date: Date, index: number, isKorean: boolean, t: ReturnType<typeof useTranslation>): string {
  if (index === 0) return t('timePicker.today');
  if (index === 1) return t('timePicker.tomorrow');
  return date.toLocaleDateString(isKorean ? 'ko-KR' : 'en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Korean convention puts the AM/PM marker (오전/오후) before the time, not after — delegating
// to Intl via toLocaleTimeString handles that ordering instead of hand-rolling it.
function formatTimeLabel(hour: number, minute: number, isKorean: boolean): string {
  if (isKorean) {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export default function DepartureTimePicker({ value, onChange }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const t = useTranslation();
  const { language } = useSettings();
  const isKorean = language === 'ko';
  const [open, setOpen] = useState(false);

  const dates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const selectedDateIndex = Math.max(0, dates.findIndex((d) => isSameDay(d, value)));
  const isToday = selectedDateIndex === 0;

  // On today only: a "Now" entry up front, and every slot already in the past dropped —
  // there's no reason to offer leaving 20 minutes ago. Other days show the full day's
  // slots, since "past" only means anything relative to the current moment.
  const times = useMemo<TimeSlot[]>(() => {
    const allSlots: TimeSlot[] = Array.from({ length: SLOTS_PER_DAY }, (_, i) => ({
      kind: 'slot',
      hour: Math.floor((i * SLOT_MINUTES) / 60),
      minute: (i * SLOT_MINUTES) % 60,
    }));
    if (!isToday) return allSlots;
    const now = new Date();
    const nowTotal = now.getHours() * 60 + now.getMinutes();
    const upcoming = allSlots.filter((slot) => slot.hour * 60 + slot.minute > nowTotal);
    return [{ kind: 'now', hour: now.getHours(), minute: now.getMinutes() }, ...upcoming];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday]);

  const selectedTimeIndex = findClosestSlotIndex(times, value.getHours(), value.getMinutes());

  function selectDate(date: Date) {
    const combined = new Date(date);
    combined.setHours(value.getHours(), value.getMinutes(), 0, 0);
    // A time-of-day carried over from a previously-selected future day (e.g. 9 AM) can
    // land in the past once applied to today (e.g. if it's already 2 PM) — the same case
    // the times list itself filters out, just reached by switching dates instead of
    // picking a slot directly. Snap to "now" instead of silently landing on a past time.
    if (isSameDay(combined, new Date()) && combined.getTime() < Date.now()) {
      onChange(new Date());
      return;
    }
    onChange(combined);
  }

  function selectTime(hour: number, minute: number) {
    const combined = new Date(value);
    combined.setHours(hour, minute, 0, 0);
    onChange(combined);
  }

  function selectNow() {
    onChange(new Date());
  }

  return (
    <>
      <Pressable style={styles.summaryButton} onPress={() => setOpen(true)}>
        <Ionicons name="time-outline" size={20} color={colors.textMuted} />
        <Text style={styles.summaryText}>
          {t('timePicker.leaving', {
            date: formatDateLabel(value, selectedDateIndex, isKorean, t),
            time: formatTimeLabel(value.getHours(), value.getMinutes(), isKorean),
          })}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('timePicker.whenLeaving')}</Text>
            <View style={styles.columns}>
              <FlatList
                data={dates}
                keyExtractor={(_, i) => String(i)}
                style={styles.column}
                initialScrollIndex={selectedDateIndex}
                getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => {
                  const active = isSameDay(item, value);
                  return (
                    <Pressable style={[styles.slot, active && styles.slotActive]} onPress={() => selectDate(item)}>
                      <Text style={[styles.slotText, active && styles.slotTextActive]} numberOfLines={1}>
                        {formatDateLabel(item, index, isKorean, t)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              <FlatList
                data={times}
                keyExtractor={(_, i) => String(i)}
                style={styles.column}
                initialScrollIndex={selectedTimeIndex}
                getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const active = item.hour === value.getHours() && item.minute === value.getMinutes();
                  return (
                    <Pressable
                      style={[styles.slot, active && styles.slotActive]}
                      onPress={() => (item.kind === 'now' ? selectNow() : selectTime(item.hour, item.minute))}
                    >
                      <Text style={[styles.slotText, active && styles.slotTextActive]}>
                        {item.kind === 'now' ? t('timePicker.now') : formatTimeLabel(item.hour, item.minute, isKorean)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
            <Pressable style={styles.doneButton} onPress={() => setOpen(false)}>
              <Text style={styles.doneButtonText}>{t('common.done')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  columns: { flexDirection: 'row', height: LIST_HEIGHT, gap: spacing.sm },
  column: { flex: 1 },
  slot: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  slotActive: { backgroundColor: colors.primaryMuted },
  slotText: { fontSize: 15, color: colors.textMuted },
  slotTextActive: { color: colors.primary, fontWeight: '700' },
  doneButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  doneButtonText: { color: '#FFFFFF', fontWeight: '700' },
  });
}
