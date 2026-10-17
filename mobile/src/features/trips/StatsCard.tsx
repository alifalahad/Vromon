/**
 * The Trips tab's stats card (10-trips-tab.jpg): completed trips, total days,
 * continents, countries and cities over an original aeroplane illustration
 * (scripts/trips/render_stats_card.py) with a warm orange overlay.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { TripStats } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';

const BACKGROUND = require('../../../assets/trips/stats-card.jpg');
const OVERLAY = 'rgba(190, 82, 24, 0.78)';
const ON_CARD = '#FFFFFF';

export function StatsCard({ stats }: { stats: TripStats | undefined }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const n = (v: number | undefined) => (v ?? 0).toLocaleString(i18n.language);

  return (
    <View style={styles.card} testID="trip-stats-card">
      <Image source={BACKGROUND} style={styles.image} contentFit="cover" accessible={false} />
      <View style={styles.overlay} />
      <View style={styles.row}>
        <Stat icon="bag-suitcase-outline" label={t('trips.statTrips')} value={n(stats?.trips)} testID="stat-trips" />
        <Stat icon="clock-outline" label={t('trips.statDuration')} value={t('trips.daysShort', { count: stats?.total_days ?? 0 })} testID="stat-duration" />
      </View>
      <View style={styles.row}>
        <Stat label={t('trips.statContinents')} value={n(stats?.continents)} small />
        <Stat label={t('trips.statCountries')} value={n(stats?.countries)} small />
        <Stat label={t('trips.statCities')} value={n(stats?.cities)} small />
      </View>
      <PressableScale style={styles.allStats} onPress={() => router.push('/stats/trips')} accessibilityRole="button" testID="all-trip-stats">
        <Text style={styles.allStatsText}>{t('trips.allStats')}</Text>
        <MaterialCommunityIcons name="chevron-right" size={28} color={ON_CARD} />
      </PressableScale>
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
  small,
  testID,
}: {
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  small?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <View style={styles.statLabelRow}>
        {icon ? <MaterialCommunityIcons name={icon} size={30} color={ON_CARD} /> : null}
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValue, small && styles.statValueSmall]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    marginHorizontal: t.spacing.lg + 2,
    borderRadius: t.radius.card,
    overflow: 'hidden',
    padding: t.spacing.xl,
    paddingBottom: t.spacing.lg + 2,
    gap: t.spacing.lg,
    backgroundColor: '#8A3A12',
  },
  image: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: OVERLAY },
  row: { flexDirection: 'row', gap: t.spacing.md },
  stat: { flex: 1, gap: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 32 },
  statLabel: { ...t.type.callout, fontSize: 17, color: ON_CARD, flexShrink: 1 },
  statValue: { fontSize: 34, lineHeight: 40, fontWeight: '800', color: ON_CARD },
  statValueSmall: { fontSize: 30, lineHeight: 36 },
  allStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingLeft: t.spacing.lg,
    paddingRight: t.spacing.sm,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  allStatsText: { ...t.type.callout, fontSize: 17, color: ON_CARD },
}));
