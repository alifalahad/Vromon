/**
 * Segmented control (03-theme-midnight.jpg: Map | Friends): an inset track with
 * a raised thumb that slides to the selected segment. Selection haptic.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { makeStyles } from './theme';
import { useReduceMotion } from './useReduceMotion';

const PAD = 4;
const SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;

  const x = useSharedValue(0);
  const placed = useRef(false);
  const target = index * segment;
  useEffect(() => {
    if (segment === 0) return;
    // Jump into place on first layout; slide on later changes
    x.set(placed.current && !reduceMotion ? withSpring(target, SPRING) : target);
    placed.current = true;
  }, [target, segment, reduceMotion, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      style={[styles.track, style]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      testID={testID}
    >
      {segment > 0 ? <Animated.View style={[styles.thumb, { width: segment }, thumb]} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            haptic="selection"
            pressEffect="none"
            hitSlop={PAD}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={styles.item}
            onPress={() => !on && onChange(o.value)}
            testID={testID ? `${testID}-${o.value}` : undefined}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: { flexDirection: 'row', padding: PAD, minHeight: 48, borderRadius: 14, backgroundColor: t.colors.surfaceInset },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 10, backgroundColor: t.colors.segmentThumb },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  label: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary },
  labelOn: { fontWeight: '700' },
}));
