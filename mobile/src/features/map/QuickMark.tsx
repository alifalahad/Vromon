/**
 * Press and hold to mark (map home step 8, mockup 7): the place's name and three
 * choices (Visited, Want, Lived; plus Clear when it's marked) in an arc around
 * the finger. Tap one to mark; tap anywhere else to cancel.
 *
 * The mockup's "slide to a choice and let go" isn't possible here: the touch
 * belongs to the native map view, which ends it at the long press. So the second
 * step is a tap. Every choice is a real button; TalkBack users keep tap → place
 * sheet, which has the same choices.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import type { VisitStatus } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { readableOn } from '../mapThemes/color';
import { useMapTheme } from '../mapThemes/useMapTheme';
import { STATUS_ORDER } from './style';

const R = 88;
const BUTTON = 56;
const MOTION = ReduceMotion.System;

export type QuickChoice = VisitStatus | 'clear';

const ICON: Record<QuickChoice, React.ComponentProps<typeof MaterialIcons>['name']> = {
  visited: 'check',
  want: 'star',
  lived: 'home',
  clear: 'close',
};

/** Where the choices go: an arc above the point, below it near the top, kept on screen. */
export function quickLayout(point: [number, number], count: number, width: number, top: number) {
  const below = point[1] - R - BUTTON < top + 60;
  const cx = Math.min(Math.max(point[0], R + BUTTON / 2 + 8), width - R - BUTTON / 2 - 8);
  const span = count === 4 ? 150 : 120;
  return Array.from({ length: count }, (_, i) => {
    const deg = (below ? 90 : -90) + (count === 1 ? 0 : -span / 2 + (span * i) / (count - 1));
    const rad = (deg * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: point[1] + R * Math.sin(rad), below };
  });
}

export function QuickMark({
  name,
  point,
  status,
  topInset,
  onPick,
  onCancel,
}: {
  name: string;
  point: [number, number];
  status: VisitStatus | null;
  topInset: number;
  onPick: (choice: QuickChoice) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const mapTheme = useMapTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const choices: QuickChoice[] = status ? [...STATUS_ORDER, 'clear'] : [...STATUS_ORDER];
  const spots = quickLayout(point, choices.length, width, topInset);
  const below = spots[0]?.below;
  const chipY = below ? point[1] + R + BUTTON / 2 + 34 : point[1] - R - BUTTON / 2 - 44;

  return (
    <Animated.View style={styles.overlay} entering={FadeIn.duration(120).reduceMotion(MOTION)} exiting={FadeOut.duration(120).reduceMotion(MOTION)} testID="quick-mark">
      <PressableScale pressEffect="none" haptic="none" style={styles.scrim} onPress={onCancel} accessibilityLabel={t('common.cancel')} testID="quick-mark-cancel" />
      <View pointerEvents="none" style={[styles.ring, { left: point[0] - 30, top: point[1] - 30 }]} />
      <View pointerEvents="none" style={[styles.chip, { top: chipY, left: 16, right: 16 }]}>
        <Text style={styles.chipText} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {choices.map((c, i) => {
        const on = c === status;
        const fill = c === 'clear' ? colors.surfaceRaised : mapTheme.status[c];
        const fg = c === 'clear' ? colors.danger : readableOn(fill);
        return (
          <Animated.View
            key={c}
            entering={ZoomIn.delay(i * 30).duration(160).reduceMotion(MOTION)}
            style={[styles.choice, { left: spots[i].x - BUTTON / 2, top: spots[i].y - BUTTON / 2 }]}
          >
            <PressableScale
              haptic={c === 'clear' ? 'light' : 'none'}
              style={[styles.button, { backgroundColor: fill }, on && styles.buttonOn]}
              onPress={() => onPick(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c === 'clear' ? t('map.clear') : t(`map.status.${c}`)}
              testID={`quick-mark-${c}`}
            >
              <MaterialIcons name={ICON[c]} size={24} color={fg} />
            </PressableScale>
            <Text style={styles.label} numberOfLines={1}>
              {c === 'clear' ? t('map.clear') : t(`map.statusShort.${c}`)}
            </Text>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(8, 10, 13, 0.45)' },
  ring: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.7)' },
  chip: { position: 'absolute', alignItems: 'center' },
  chipText: {
    ...t.type.callout,
    fontWeight: '700',
    color: '#11151B',
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    overflow: 'hidden',
  },
  choice: { position: 'absolute', width: BUTTON, alignItems: 'center', gap: 6 },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonOn: { borderWidth: 3, borderColor: '#FFFFFF' },
  label: { ...t.type.caption, fontWeight: '700', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4, width: 90, textAlign: 'center' },
}));
