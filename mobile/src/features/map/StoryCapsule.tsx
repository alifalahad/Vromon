/**
 * The story capsule, top-left on the map (map home steps 2–3, mockups 1 and 4).
 *
 * At home: a ring of home regions visited, "3 of 8 divisions", and the number of
 * countries. Zoomed out to the world: countries, and the share of the world from
 * the server's count (left out until it has loaded). Counted from the visit list,
 * so it updates the moment a place is marked, offline too. Tapping it opens
 * "Your story". On a trip day (step 7) it shows the day instead ("Day 2 of 3 ·
 * Sylhet", a blue ring) and opens Today.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { TravelStats, Visit } from '../../types';
import { glass } from '../../ui/GlassSurface';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { SUNSET_CARD } from '../../ui/theme/cards';
import { localDigits } from '../trips/plan/usePlanFormat';
import { countriesVisited, homeRegionProgress, regionWord } from './home';
import { ringFraction } from './story';

const SIZE = 36;
const STROKE = 3.5;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function StoryCapsule({
  visits,
  home,
  scope = 'home',
  stats,
  today,
  onPress,
  style,
}: {
  visits: readonly Visit[];
  home: string;
  scope?: 'home' | 'world';
  stats?: TravelStats;
  /** On a trip day: what to show instead */
  today?: { title: string; subtitle: string | null; value: number; fraction: number };
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const n = (v: number) => localDigits(String(v), i18n.language);

  const countries = countriesVisited(visits);
  const countriesText = t('map.storyCountries', { count: countries, n: n(countries) });
  const progress = scope === 'home' ? homeRegionProgress(visits, home) : null;

  let title: string;
  let subtitle: string | null;
  let ringValue: number;
  let fraction: number;
  if (today) {
    title = today.title;
    subtitle = today.subtitle;
    ringValue = today.value;
    fraction = today.fraction;
  } else if (progress) {
    title = t(regionWord(home) === 'divisions' ? 'map.storyDivisions' : 'map.storyRegions', { done: n(progress.done), total: n(progress.total) });
    subtitle = countriesText;
    ringValue = progress.done;
    fraction = ringFraction(progress.done, progress.total);
  } else {
    title = countriesText;
    subtitle = stats ? t('map.story.worldPercent', { pct: localDigits(String(stats.world_percent), i18n.language) }) : null;
    ringValue = countries;
    fraction = stats ? ringFraction(stats.world_countries, stats.world_total) : 0;
  }
  const label = [title, subtitle].filter(Boolean).join(', ');

  return (
    <PressableScale
      style={[styles.capsule, style]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onPress ? t('map.story.openHint') : undefined}
      testID="story-capsule"
    >
      <Svg width={SIZE} height={SIZE} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.glassBorder} strokeWidth={STROKE} fill="none" />
        {fraction > 0 ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={today ? colors.link : SUNSET_CARD}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            // A sliver at least, so 1 country of 194 still shows
            strokeDasharray={`${Math.max(CIRCUMFERENCE * fraction, 3)} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={styles.ringValue} accessibilityElementsHidden importantForAccessibility="no">
        {n(ringValue)}
      </Text>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  capsule: {
    ...glass(t),
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 56,
    paddingLeft: 10,
    paddingRight: t.spacing.xl,
    paddingVertical: 8,
    borderRadius: 28,
  },
  // Centred over the ring (the ring is 36 wide, starting at paddingLeft)
  ringValue: { position: 'absolute', left: 10, width: SIZE, textAlign: 'center', ...t.type.footnote, fontWeight: '700', color: t.colors.textPrimary },
  texts: { gap: 1, flexShrink: 1 },
  title: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  subtitle: { ...t.type.caption, color: t.colors.textSecondary },
}));
