/**
 * The app's only pressable. Springs to 0.97 on press (or dims, for rows and when
 * the system "Reduce motion" setting is on) and fires a haptic on press.
 */

import React from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic, type HapticKind } from './haptics';
import { useReduceMotion } from './useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Haptic fired on press. Default `light`. */
  haptic?: HapticKind | 'none';
  /** `scale` for buttons and cards, `opacity` for list rows, `none` for backdrops. */
  pressEffect?: 'scale' | 'opacity' | 'none';
};

export function PressableScale({
  haptic: hapticKind = 'light',
  pressEffect = 'scale',
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  accessibilityRole = 'button',
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);
  const effect = pressEffect === 'scale' && reduceMotion ? 'opacity' : pressEffect;

  const animatedStyle = useAnimatedStyle(() => {
    if (effect === 'scale') return { transform: [{ scale: 1 - 0.03 * pressed.value }] };
    if (effect === 'opacity') return { opacity: 1 - 0.35 * pressed.value };
    return {};
  });

  const handlePressIn = (e: GestureResponderEvent) => {
    pressed.value = effect === 'scale' ? withSpring(1, SPRING) : withTiming(1, { duration: 80 });
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    pressed.value = effect === 'scale' ? withSpring(0, SPRING) : withTiming(0, { duration: 140 });
    onPressOut?.(e);
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (hapticKind !== 'none') haptic(hapticKind);
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}
