/**
 * A slider over whole steps (2 … 7): drag the thumb or tap a point on the track. The thumb snaps
 * to each step with a tick of haptics. Screen readers get an adjustable control (swipe up/down).
 */

import React, { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from './haptics';
import { makeStyles } from './theme';

const THUMB = 28;

export function StepSlider({
  min,
  max,
  value,
  onChange,
  label,
  valueText,
  stepLabel = String,
  testID,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  /** For screen readers */
  label: string;
  /** For screen readers: the value said in words ("4 stops a day") */
  valueText: string;
  /** The numbers under the track (locale digits) */
  stepLabel?: (n: number) => string;
  testID?: string;
}) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const steps = max - min;
  const span = Math.max(0, width - THUMB);
  const place = (v: number) => ((v - min) / steps) * span;
  // Where the thumb rests is always the value's place; while a finger drags it, it follows the finger
  const rest = useSharedValue(0);
  const finger = useSharedValue(0);
  const dragging = useSharedValue(false);
  const last = useSharedValue(value);
  useEffect(() => {
    rest.set(withTiming(place(value), { duration: 120 }));
    last.set(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place() reads span, min and steps
  }, [value, span]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const pick = (v: number) => {
    if (v === value) return;
    haptics.selection();
    onChange(v);
  };

  const atX = (px: number) => {
    'worklet';
    if (span <= 0) return min;
    const clamped = Math.min(Math.max(px - THUMB / 2, 0), span);
    return Math.round((clamped / span) * steps) + min;
  };
  const follow = (px: number) => {
    'worklet';
    finger.set(Math.min(Math.max(px - THUMB / 2, 0), span));
    const v = atX(px);
    if (v !== last.get()) {
      last.set(v);
      scheduleOnRN(pick, v);
    }
  };

  // Sideways drags and taps only: scrolling the page over the slider leaves it alone
  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-10, 10])
    .onStart((e) => {
      dragging.set(true);
      follow(e.x);
    })
    .onUpdate((e) => follow(e.x))
    .onFinalize(() => {
      dragging.set(false);
    });
  const tap = Gesture.Tap().onEnd((e) => follow(e.x));
  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragging.get() ? finger.get() : rest.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: dragging.get() ? finger.get() : rest.get() }));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && value < max) pick(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && value > min) pick(value - 1);
      }}
      testID={testID}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.hit} onLayout={onLayout} collapsable={false}>
          <View style={styles.track} />
          <Animated.View style={[styles.fill, fillStyle]} />
          {Array.from({ length: steps + 1 }, (_, i) => (
            <View key={i} style={[styles.tick, { left: place(i + min) + THUMB / 2 - 3 }, i + min <= value && styles.tickOn]} />
          ))}
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
      <View style={styles.numbers} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: steps + 1 }, (_, i) => (
          <Text
            key={i}
            style={[styles.number, i + min === value && styles.numberOn, { left: place(i + min) + THUMB / 2 - 12 }]}
            testID={testID ? `${testID}-${i + min}` : undefined}
            onPress={() => pick(i + min)}
          >
            {stepLabel(i + min)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hit: { height: 44, justifyContent: 'center' },
  track: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceInset },
  fill: { position: 'absolute', left: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: t.colors.accentStrong },
  tick: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.switchOff },
  tickOn: { backgroundColor: t.colors.onAccent },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: t.colors.accentStrong,
    elevation: 3,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  numbers: { height: 24 },
  number: { position: 'absolute', width: 24, textAlign: 'center', ...t.type.footnote, color: t.colors.textSecondary },
  numberOn: { color: t.colors.textPrimary, fontWeight: '700' },
}));
