import React, { useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}

// Drop-in Pressable replacement that scales down slightly on press — used on primary CTAs
// (Go, Get Directions, route option cards) so taps feel responsive instead of an instant
// on/off with no in-between.
export default function AnimatedPressable({ style, onPressIn, onPressOut, scaleTo = 0.96, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn(e: GestureResponderEvent) {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
    onPressIn?.(e);
  }

  function handlePressOut(e: GestureResponderEvent) {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    onPressOut?.(e);
  }

  return (
    <AnimatedPressableBase
      style={[style, { transform: [{ scale }] }]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    />
  );
}
