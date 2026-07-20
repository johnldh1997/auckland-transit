import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';
import { radius, ThemeColors } from '../theme';

interface Props {
  children: React.ReactNode;
  minHeight: number;
  maxHeight: number;
  // Extra height (typically the device's safe-area bottom inset) added on top of
  // minHeight/maxHeight so the sheet's own content — and its drag handle — never sits
  // flush against a phone's gesture bar/home indicator, which otherwise makes the last
  // row and the handle hard to hit accurately. Defaults to 0 for non-bottom-anchored uses.
  bottomInset?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function DraggableSheet({ children, minHeight, maxHeight, bottomInset = 0 }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const adjustedMinHeight = minHeight + bottomInset;
  const adjustedMaxHeight = maxHeight + bottomInset;
  const height = useRef(new Animated.Value(adjustedMinHeight)).current;
  const currentHeightRef = useRef(adjustedMinHeight);
  const dragStartHeightRef = useRef(adjustedMinHeight);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = clamp(dragStartHeightRef.current - gesture.dy, adjustedMinHeight, adjustedMaxHeight);
        currentHeightRef.current = next;
        height.setValue(next);
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.sheet, { height }]}>
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.handleBar} />
      </View>
      <View style={[styles.content, { paddingBottom: bottomInset }]}>{children}</View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: 'hidden',
    },
    handleArea: { paddingVertical: 8, alignItems: 'center' },
    handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
    content: { flex: 1 },
  });
}
