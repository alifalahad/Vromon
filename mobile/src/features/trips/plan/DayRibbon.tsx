/**
 * The day at a glance: visits, meals and travel on one bar, to scale, with hour
 * labels below. Tapping the bar jumps to the stop at that time.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors, ribbonVisit } from './colors';
import { fromMinutes, type RibbonSegment } from './timeline';
import { usePlanFormat } from './usePlanFormat';

const BAR = 14;

export function DayRibbon({
  segments,
  window,
  accessibilityLabel,
  onPickTime,
}: {
  segments: RibbonSegment[];
  window: { start: number; end: number };
  accessibilityLabel: string;
  /** Minutes since midnight where the bar was tapped */
  onPickTime?: (minutes: number) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const visit = ribbonVisit(theme);
  const f = usePlanFormat();
  const [width, setWidth] = useState(0);
  const span = window.end - window.start;
  const x = (min: number) => ((Math.min(Math.max(min, window.start), window.end) - window.start) / span) * width;
  const step = span > 10 * 60 ? 180 : 120;
  const ticks: number[] = [];
  for (let m = window.start; m <= window.end; m += step) ticks.push(m);

  return (
    <PressableScale
      pressEffect="none"
      haptic="none"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => width && onPickTime?.(window.start + (e.nativeEvent.locationX / width) * span)}
      style={styles.wrap}
      testID="day-ribbon"
    >
      {width > 0 && (
        <Svg width={width} height={BAR}>
          <Defs>
            <Pattern id="hatch" patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
              <Rect x={0} y={0} width={2} height={5} fill={colors.travel} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={width} height={BAR} rx={BAR / 2} fill={theme.colors.surfaceInset} />
          {segments.map((s, i) => (
            <Rect
              key={i}
              x={x(s.start)}
              y={0}
              width={Math.max(2, x(s.end) - x(s.start) - 1)}
              height={BAR}
              rx={3}
              fill={s.kind === 'travel' ? 'url(#hatch)' : s.kind === 'meal' ? colors.meal : visit}
            />
          ))}
        </Svg>
      )}
      <View style={styles.ticks} importantForAccessibility="no-hide-descendants">
        {width > 0 &&
          ticks.map((m) => (
            <Text key={m} maxFontSizeMultiplier={1.2} style={[styles.tick, { left: Math.min(Math.max(x(m) - 18, 0), width - 36) }]}>
              {f.time(fromMinutes(m))}
            </Text>
          ))}
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { minHeight: 48, justifyContent: 'center' },
  ticks: { height: 18, marginTop: 4 },
  tick: { position: 'absolute', width: 36, textAlign: 'center', fontSize: 11, color: t.colors.textTertiary },
}));
