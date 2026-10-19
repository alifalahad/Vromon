/**
 * A trip on the Trips tab (trip planner step 8, the "Trips tab" mockup): a
 * compact card with a tile (a past trip's first photo when it has one), the
 * name, the dates and length, the route when the trip has several stops, and
 * what's next: "Plan not built yet" for an upcoming trip, "On your map" or
 * "Mark visited" for a finished one. `StopList` is the full route (trip details).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { Photo, Trip, TripStop } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { flagEmoji } from '../geo/countries';
import { thumbSource } from '../photos/queries';
import { localDigits } from './plan/usePlanFormat';
import { friendlyRange } from './plan/timeline';
import { durationDays, formatRange, tripPhase } from './dates';
import { transportIcon } from './transport';

export function stopName(stop: TripStop): string {
  return stop.city_name ? `${stop.city_name}, ${stop.country_name}` : stop.country_name;
}

const placeName = (stop: TripStop) => stop.city_name ?? stop.country_name;

export function TripCard({
  trip,
  today,
  onPress,
  photos = [],
  onMap,
  onMark,
  marking,
}: {
  trip: Trip;
  today: string;
  onPress: () => void;
  photos?: readonly Photo[];
  /** Finished trips: every stop is on your map already */
  onMap?: boolean;
  onMark?: () => void;
  marking?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const d = (v: number) => localDigits(String(v), i18n.language);
  const days = durationDays(trip.start_date, trip.end_date);
  const past = tripPhase(trip.start_date, trip.end_date, today) === 'past';
  const range = past ? formatRange(trip.start_date, trip.end_date, i18n.language) : friendlyRange(trip.start_date, trip.end_date, i18n.language, today);
  const stops = trip.stops ?? [];
  const route = stops.length > 1 ? stops.map((s) => `${flagEmoji(s.country_iso2)}\u00A0${placeName(s)}`).join('  →  ') : null;
  const name = trip.title || trip.destination;
  const cover = photos[0];
  const status = !past && trip.status === 'draft' ? t('trips.row.notBuilt') : null;
  const photoLine = past && photos.length ? t('trips.row.photos', { count: photos.length, n: d(photos.length) }) : null;
  const lengthText = t('trips.row.days', { count: days, n: d(days) });

  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, `${range} · ${lengthText}`, route?.replace(/→/g, ','), status, photoLine].filter(Boolean).join('. ')}
      testID={`trip-${trip.id}`}
    >
      <View style={[styles.tile, past ? styles.tilePast : styles.tileUpcoming]}>
        {cover ? (
          <Image source={thumbSource(cover)} style={styles.cover} contentFit="cover" accessible={false} transition={150} />
        ) : (
          <MaterialCommunityIcons name={past ? 'image-filter-hdr' : 'waves'} size={28} color={past ? colors.textSecondary : colors.link} />
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.range}>{`${range} · ${lengthText}`}</Text>
        {route ? <Text style={styles.route} numberOfLines={2}>{route}</Text> : null}
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {photoLine ? <Text style={styles.photos}>{photoLine}</Text> : null}
        {/* Under the text, so the name and dates keep the card's width */}
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
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
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
  // The compact card
  card: { marginHorizontal: t.spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14, padding: t.spacing.md, borderRadius: 20, backgroundColor: t.colors.surface },
  tile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileUpcoming: { backgroundColor: t.colors.accentSoft },
  tilePast: { backgroundColor: t.colors.surfaceInset },
  cover: { width: 56, height: 56 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...t.type.body, fontSize: 17, fontWeight: '600', color: t.colors.textPrimary },
  range: { ...t.type.footnote, fontSize: 14, color: t.colors.textSecondary },
  route: { ...t.type.footnote, color: t.colors.textSecondary },
  status: { ...t.type.footnote, fontWeight: '600', color: t.colors.warning },
  photos: { ...t.type.footnote, color: t.colors.textSecondary },
  onMap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  onMapText: { ...t.type.footnote, fontWeight: '600', color: t.colors.success },
  mark: { alignSelf: 'flex-start', minHeight: 40, marginTop: 6, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
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
