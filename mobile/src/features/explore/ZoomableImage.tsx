/**
 * An image you can pinch to zoom (1× to 5×), drag when zoomed, and double-tap to zoom in or back
 * out. Used for the district maps, which are detailed enough to read at full size.
 */

import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX = 5;

export function ZoomableImage({
  uri,
  placeholder,
  aspectRatio,
  style,
  accessibilityLabel,
}: {
  uri: string;
  /** a smaller copy shown while the full image loads */
  placeholder?: string;
  aspectRatio: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    saved.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.02) reset();
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        x.value = startX.value + e.translationX;
        y.value = startY.value + e.translationY;
      }
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) reset();
      else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
      }
    });

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.wrap, style]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <Animated.View style={[{ width: '100%', aspectRatio }, animated]}>
          <Image
            source={{ uri }}
            placeholder={placeholder ? { uri: placeholder } : undefined}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="disk"
            transition={150}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
});
