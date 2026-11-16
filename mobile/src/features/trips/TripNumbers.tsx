/**
 * The Trips tab's one line of numbers (docs/ui-refresh step 9, frame 15): your finished trips, their
 * days, countries and cities, in words that agree with each number ("1 country"). It opens "Your trips
 * so far", where each number opens the trips behind it.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { TripStats } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePlanFormat } from './plan/usePlanFormat';

/** The numbers and their words, in order: trips, days, countries, cities */
export function numberParts(stats: TripStats, t: ReturnType<typeof useTranslation>['t'], n: (v: number) => string): { value: string; word: string }[] {
  return (
    [
      ['trips', stats.trips],
      ['days', stats.total_days],
      ['countries', stats.countries],
      ['cities', stats.cities],
    ] as const
  ).map(([key, count]) => ({ value: n(count), word: t(`trips.numbers.${key}`, { count }) }));
}

export function TripNumbers({ stats, onPress }: { stats: TripStats | undefined; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const parts = stats && stats.trips > 0 ? numberParts(stats, t, f.n) : null;
  const spoken = parts ? parts.map((p) => `${p.value} ${p.word}`).join(', ') : t('trips.numbers.none');
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={stats ? t('trips.numbers.a11y', { list: spoken }) : t('trips.numbers.title')}
      testID="trip-stats-card"
    >
      <Text style={styles.text} testID="trip-numbers">
        {!stats
          ? t('trips.numbers.title')
          : parts
            ? parts.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? ' · ' : ''}
                  <Text style={styles.value}>{p.value}</Text> {p.word}
                </React.Fragment>
              ))
            : t('trips.numbers.none')}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    marginHorizontal: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 54,
    paddingVertical: t.spacing.sm,
    paddingLeft: 18,
    paddingRight: 10,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  text: { flex: 1, fontSize: 15, color: t.colors.textSecondary },
  value: { fontWeight: '700', color: t.colors.textPrimary },
}));
