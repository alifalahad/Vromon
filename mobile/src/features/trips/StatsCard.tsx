/**
 * The Trips tab's stats card (trip planner step 8, the "Trips tab" mockup):
 * finished trips, their days, countries and cities in one row, and "All trip
 * stats" for the rest (continents, weeks, the longest trip…).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { TripStats } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { localDigits } from './plan/usePlanFormat';

export function StatsCard({ stats }: { stats: TripStats | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const n = (v: number | undefined) => localDigits((v ?? 0).toLocaleString('en-US'), i18n.language);

  return (
    <View style={styles.card} testID="trip-stats-card">
      <View style={styles.row}>
        <Stat label={t('trips.statTrips')} value={n(stats?.trips)} testID="stat-trips" />
        <Stat label={t('trips.statDays')} value={n(stats?.total_days)} testID="stat-duration" />
        <Stat label={t('trips.statCountries')} value={n(stats?.countries)} />
        <Stat label={t('trips.statCities')} value={n(stats?.cities)} />
      </View>
      <PressableScale
        pressEffect="opacity"
        style={styles.allStats}
        onPress={() => router.push('/stats/trips')}
        accessibilityRole="button"
        testID="all-trip-stats"
      >
        <Text style={styles.allStatsText}>{t('trips.allStats')}</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.link} />
      </PressableScale>
    </View>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface, paddingTop: t.spacing.lg, paddingHorizontal: t.spacing.sm, paddingBottom: t.spacing.xs, gap: 6 },
  row: { flexDirection: 'row', gap: 4 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: t.colors.textPrimary },
  label: { ...t.type.footnote, color: t.colors.textSecondary },
  allStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
  allStatsText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
