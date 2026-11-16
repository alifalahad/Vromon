/**
 * A trip in the Trips tab's list (docs/ui-refresh step 9, frame 15): a date block, the name, the dates
 * and length. A trip without a plan says so; a finished one has "Mark visited" (or "On your map").
 * `StopList` is the full route (trip details).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { Trip, TripStop } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { flagEmoji } from '../geo/countries';
import { localDigits } from './plan/usePlanFormat';
import { friendlyRange } from './plan/timeline';
import { durationDays, formatRange, parseDay, tripPhase } from './dates';
import { transportIcon } from './transport';

export function stopName(stop: TripStop): string {
  return stop.city_name ? `${stop.city_name}, ${stop.country_name}` : stop.country_name;
}

export function TripRow({
  trip,
  today,
  onPress,
  onMap,
  onMark,
  marking,
}: {
  trip: Trip;
  today: string;
  onPress: () => void;
  /** Finished trips: every stop is on your map already */
  onMap?: boolean;
  onMark?: () => void;
  marking?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const d = (v: number | string) => localDigits(String(v), i18n.language);
  const days = durationDays(trip.start_date, trip.end_date);
  const past = tripPhase(trip.start_date, trip.end_date, today) === 'past';
  const range = past ? formatRange(trip.start_date, trip.end_date, i18n.language) : friendlyRange(trip.start_date, trip.end_date, i18n.language, today);
  const stops = trip.stops ?? [];
  const name = trip.title || trip.destination;
  const status = !past && trip.status === 'draft' ? t('trips.row.notBuilt') : null;
  const lengthText = t('trips.row.days', { count: days, n: d(days) });
  const start = parseDay(trip.start_date);

  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, `${range} · ${lengthText}`, status].filter(Boolean).join('. ')}
      testID={`trip-${trip.id}`}
    >
      <View style={[styles.date, past && styles.datePast]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.dateDay, past && styles.dateTextPast]} maxFontSizeMultiplier={1.2}>
          {d(start.getDate())}
        </Text>
        <Text style={[styles.dateMonth, past && styles.dateTextPast]} maxFontSizeMultiplier={1.2}>
          {start.toLocaleDateString(i18n.language, { month: 'short' }).toUpperCase()}
        </Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.range}>{`${range} · ${lengthText}`}</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {past && onMap ? (
          <View style={styles.onMap} testID={`on-map-${trip.id}`}>
            <MaterialCommunityIcons name="check" size={16} color={colors.success} />
            <Text style={styles.onMapText}>{t('trips.row.onMap')}</Text>
          </View>
        ) : past && onMark ? (
          <PressableScale
            haptic="selection"
            onPress={onMark}
            disabled={marking}
            style={styles.mark}
            accessibilityRole="button"
            accessibilityLabel={t('trips.row.markA11y', { places: stops.map(stopName).join(', ') || name })}
            testID={`mark-visited-${trip.id}`}
          >
            {marking ? <ActivityIndicator size="small" color={colors.link} /> : <Text style={styles.markText}>{t('trips.row.markVisited')}</Text>}
          </PressableScale>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </PressableScale>
  );
}

/** The stops, each with its flag, how you get there and "City, Country", joined by a dotted line. */
export function StopList({ stops }: { stops: readonly TripStop[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.stops}>
      {stops.map((stop, i) => (
        <View key={stop.position} style={styles.stop}>
          <View style={styles.flagColumn}>
            <View style={styles.flagBox}>
              <Text style={styles.flag}>{flagEmoji(stop.country_iso2)}</Text>
            </View>
            {i < stops.length - 1 ? <View style={styles.connector} /> : null}
          </View>
          <View style={styles.stopText}>
            <View style={styles.modeRow}>
              <MaterialCommunityIcons name={transportIcon(stop.transport_mode)} size={18} color={colors.textSecondary} />
              <Text style={styles.mode}>{t(`trips.modes.${stop.transport_mode ?? 'none'}`)}</Text>
            </View>
            <Text style={styles.place} numberOfLines={2}>
              {stopName(stop)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The row (frame 15)
  card: {
    marginHorizontal: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingVertical: t.spacing.sm + 2,
    paddingLeft: t.spacing.md,
    paddingRight: 10,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  date: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentTint },
  datePast: { backgroundColor: t.colors.surfaceInset },
  dateDay: { fontFamily: t.type.title.fontFamily, fontSize: 21, lineHeight: 24, fontWeight: 'normal', includeFontPadding: false, color: t.colors.link },
  dateMonth: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: t.colors.link },
  dateTextPast: { color: t.colors.textSecondary },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: t.colors.textPrimary },
  range: { fontSize: 13.5, color: t.colors.textSecondary },
  status: { ...t.type.footnote, fontWeight: '600', color: t.colors.warning },
  onMap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onMapText: { ...t.type.footnote, fontWeight: '600', color: t.colors.success },
  mark: { alignSelf: 'flex-start', minHeight: 40, marginTop: 4, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  markText: { ...t.type.footnote, fontWeight: '700', color: t.colors.onAccentSoft },
  // The full route (trip details)
  stops: { gap: 0 },
  stop: { flexDirection: 'row', gap: t.spacing.lg },
  flagColumn: { width: 48, alignItems: 'center' },
  flagBox: { width: 48, height: 36, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  flag: { fontSize: 34, lineHeight: 40 },
  connector: { flex: 1, width: 0, minHeight: 22, borderLeftWidth: 2, borderStyle: 'dotted', borderColor: t.colors.textTertiary, marginVertical: 4 },
  stopText: { flex: 1, gap: 2, paddingBottom: t.spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mode: { ...t.type.footnote, fontSize: 15, color: t.colors.textSecondary },
  place: { ...t.type.headline, fontSize: 19, fontWeight: '500', color: t.colors.textPrimary },
}));
