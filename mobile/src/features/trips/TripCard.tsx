/**
 * A trip on the Trips tab (10-trips-tab.jpg): the date range, "Duration N days"
 * in green, and the stops, each with its country's flag, how you get there and
 * "City, Country", joined by a dotted line.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Trip, TripStop } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { flagEmoji } from '../geo/countries';
import { durationDays, formatRange } from './dates';
import { transportIcon } from './transport';

export function stopName(stop: TripStop): string {
  return stop.city_name ? `${stop.city_name}, ${stop.country_name}` : stop.country_name;
}

export function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const days = durationDays(trip.start_date, trip.end_date);
  const range = formatRange(trip.start_date, trip.end_date, i18n.language);
  const stops = trip.stops ?? [];

  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`${range}. ${t('trips.duration')} ${t('trips.durationDays', { count: days })}. ${stops.map(stopName).join(', ') || trip.destination}`}
      testID={`trip-${trip.id}`}
    >
      <View style={styles.top}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={22} color={colors.textSecondary} />
        <Text style={styles.range} numberOfLines={1}>
          {range}
        </Text>
        <Text style={styles.durationLabel}>
          {t('trips.duration')} <Text style={styles.durationValue}>{t('trips.durationDays', { count: days })}</Text>
        </Text>
      </View>

      {stops.length ? <StopList stops={stops} /> : <Text style={styles.place}>{trip.destination}</Text>}

      {trip.status === 'draft' ? (
        <View style={styles.draft}>
          <Text style={styles.draftText}>{t('trips.draft')}</Text>
        </View>
      ) : null}
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
  card: { marginHorizontal: t.spacing.lg + 2, backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.xl, gap: t.spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  range: { ...t.type.callout, fontSize: 17, color: t.colors.textSecondary, flex: 1 },
  durationLabel: { ...t.type.callout, color: t.colors.textSecondary },
  durationValue: { color: t.colors.success, fontWeight: '600' },
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
  draft: { alignSelf: 'flex-start', borderWidth: 1, borderColor: t.colors.warning, borderRadius: t.radius.chip, paddingHorizontal: 10, paddingVertical: 2, marginTop: -t.spacing.sm },
  draftText: { ...t.type.caption, fontWeight: '600', color: t.colors.warning },
}));
