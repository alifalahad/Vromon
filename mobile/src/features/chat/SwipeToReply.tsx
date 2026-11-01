/**
 * Swipe a message right to reply (step 5), cheap to mount: one pan gesture and one
 * animated value per bubble, and the reply arrow only while it's dragged. ReanimatedSwipeable
 * did the same with several values and two action panels per bubble, and mounting it was
 * half of each bubble's cost: a long chat stalled for ~300 ms whenever older messages came
 * into view (step 10). It feels the same: the bubble follows at half the finger's speed and
 * replies when let go past 64 points. Screen readers reply through the bubble's actions.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const FRICTION = 2;
const THRESHOLD = 64;
const MAX = 80;

/** `onReply` should keep its identity between renders: a new one makes a new gesture, which attaches again. */
export function SwipeToReply({ onReply, iconColor, children }: { onReply: () => void; iconColor: string; children: React.ReactNode }) {
  const x = useSharedValue(0);
  const [dragging, setDragging] = useState(false);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Rightwards only; up and down stays the list's scroll
        .activeOffsetX([-1000, 12])
        .failOffsetY([-12, 12])
        .onStart(() => {
          scheduleOnRN(setDragging, true);
        })
        .onUpdate((e) => {
          x.set(Math.min(Math.max(e.translationX / FRICTION, 0), MAX));
        })
        .onEnd(() => {
          if (x.get() >= THRESHOLD) scheduleOnRN(onReply);
        })
        .onFinalize(() => {
          x.set(withTiming(0, { duration: 180 }, () => scheduleOnRN(setDragging, false)));
        }),
    [x, onReply],
  );
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        {dragging ? <ReplyArrow x={x} color={iconColor} /> : null}
        <Animated.View style={follow}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Shows more as the bubble nears the point where letting go replies. */
function ReplyArrow({ x, color }: { x: SharedValue<number>; color: string }) {
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, THRESHOLD], [0, 1], 'clamp') }));
  return (
    <Animated.View style={[styles.arrow, fade]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <MaterialCommunityIcons name="reply" size={22} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  arrow: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 56, alignItems: 'center', justifyContent: 'center' },
});
