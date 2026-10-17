/**
 * Vromon Mobile — All trip stats (09-trip-stats-travel-time.jpg).
 *
 * Travel time (total days; weeks, months and years with 2 decimals) and the
 * average trip time, then the longest trip, the most visited country, trips per
 * year and how you travelled. Completed trips only.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { flagEmoji } from '../../src/features/geo/countries';
import { useTripStats } from '../../src/features/trips/queries';
import { transportIcon } from '../../src/features/trips/transport';
import { Button } from '../../src/ui/Button';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function TripStatsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { data: s, isError, refetch } = useTripStats();
  const fixed = (v: number | undefined, digits: number) =>
    (v ?? 0).toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const maxYear = Math.max(1, ...(s?.per_year ?? []).map((y) => y.trips));
  const maxMode = Math.max(1, ...(s?.transport_modes ?? []).map((m) => m.count));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="trip-stats-screen">
      {isError ? <Button variant="secondary" label={t('common.retry')} onPress={() => refetch()} /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('trips.travelTime')}
        </Text>
        <View style={styles.totalRow} accessible accessibilityLabel={`${s?.total_days ?? 0} ${t('trips.totalDays')}`}>
          <Text style={styles.bigNumber} testID="total-days">
            {(s?.total_days ?? 0).toLocaleString(i18n.language)}
          </Text>
          <Text style={styles.unit}>{t('trips.totalDays')}</Text>
        </View>
        <View style={styles.tiles}>
          {(
            [
              ['weeks', s?.weeks],
              ['months', s?.months],
              ['years', s?.years],
            ] as const
          ).map(([key, value]) => (
            <View key={key} style={styles.tile} accessible accessibilityLabel={`${fixed(value, 2)} ${t(`trips.${key}`)}`}>
              <Text style={styles.tileValue} testID={`stat-${key}`}>
                {fixed(value, 2)}
              </Text>
              <Text style={styles.tileLabel}>{t(`trips.${key}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.centered]}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('trips.averageTime')}
        </Text>
        <View style={styles.totalRow}>
          <Text style={styles.bigNumber} testID="average-days">
            {fixed(s?.average_days, 1)}
          </Text>
          <Text style={styles.unit}>{t('trips.days')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label={t('trips.longest')} value={s?.longest_trip ? `${s.longest_trip.title} · ${t('trips.durationDays', { count: s.longest_trip.days })}` : t('trips.none')} />
        <View style={styles.divider} />
        <Row
          label={t('trips.mostVisited')}
          value={
            s?.most_visited_country
              ? `${flagEmoji(s.most_visited_country.iso2)} ${t('trips.mostVisitedValue', { name: s.most_visited_country.name, count: s.most_visited_country.trips })}`
              : t('trips.none')
          }
        />
      </View>

      {s?.per_year.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {t('trips.perYear')}
          </Text>
          {s.per_year.map((y) => (
            <Bar key={y.year} label={String(y.year)} value={y.trips} fraction={y.trips / maxYear} />
          ))}
        </View>
      ) : null}

      {s?.transport_modes.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {t('trips.byTransport')}
          </Text>
          {s.transport_modes.map((m) => (
            <Bar
              key={m.mode}
              label={t(`trips.modes.${m.mode}`)}
              value={m.count}
              fraction={m.count / maxMode}
              icon={<MaterialCommunityIcons name={transportIcon(m.mode)} size={20} color={colors.textSecondary} />}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.note}>{t('trips.completedOnly')}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Bar({ label, value, fraction, icon }: { label: string; value: number; fraction: number; icon?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.bar} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.barLabel}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(6, fraction * 100)}%` }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg + 2, gap: t.spacing.lg + 2, paddingBottom: 48 },
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.xl, gap: t.spacing.md },
  centered: { alignItems: 'center' },
  cardTitle: { ...t.type.headline, fontSize: 22, color: t.colors.textPrimary },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md },
  bigNumber: { fontSize: 48, lineHeight: 56, fontWeight: '700', color: t.colors.textPrimary },
  unit: { ...t.type.body, fontSize: 22, color: t.colors.textPrimary },
  tiles: { flexDirection: 'row', gap: t.spacing.sm + 2 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: t.spacing.lg, borderRadius: 16, backgroundColor: t.colors.surfaceInset, gap: 2 },
  tileValue: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: t.colors.textPrimary },
  tileLabel: { ...t.type.callout, color: t.colors.textPrimary },
  row: { gap: 2, minHeight: 44, justifyContent: 'center' },
  rowLabel: { ...t.type.footnote, color: t.colors.textSecondary },
  rowValue: { ...t.type.body, color: t.colors.textPrimary },
  divider: { height: 1, backgroundColor: t.colors.divider },
  bar: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 32 },
  barLabel: { width: 96, flexDirection: 'row', alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: t.colors.surfaceInset, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: t.colors.accent },
  barValue: { ...t.type.callout, color: t.colors.textPrimary, width: 28, textAlign: 'right' },
  note: { ...t.type.footnote, color: t.colors.textTertiary, textAlign: 'center' },
}));
