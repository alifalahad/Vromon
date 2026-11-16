/**
 * Vromon Mobile — "Your trips so far" (docs/ui-refresh step 9, frame 17), from the Trips tab's numbers and
 * the Map dashboard's Trips and Days tiles.
 *
 * The finished trips: how many, the days away and the days a trip, with what's coming up; where you went
 * (a country opens its page, a city its trips); by year (a year opens its trips); then the finished trips,
 * the longest marked, each opening its plan. Every number is the length of the list it opens: the server
 * sends the trips behind each one (TripStats), shown from the trips the app already has.
 *
 * With `?year=2026` or `?city=<GeoNames id>` the same screen shows only those trips.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { flagEmoji } from '../../src/features/geo/countries';
import { durationDays, formatRange, localToday, tripPhase } from '../../src/features/trips/dates';
import { Ticket } from '../../src/features/trips/NextTripCard';
import { PlacePicture, tripPoint } from '../../src/features/trips/PlacePicture';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { useTrips, useTripStats } from '../../src/features/trips/queries';
import { filterOf, tripsFor } from '../../src/features/trips/soFar';
import type { Trip } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

const THUMB = 60;

export default function TripStatsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string; city?: string }>();
  const today = localToday();
  const stats = useTripStats(undefined, today);
  const trips = useTrips();
  const scroll = useRef<ScrollView>(null);
  const listY = useRef(0);
  const s = stats.data;
  const all = trips.data ?? [];

  if (!s || !trips.data) {
    return (
      <View style={styles.center}>
        {stats.isError || trips.isError ? (
          <Button
            variant="secondary"
            label={t('common.retry')}
            onPress={() => {
              void stats.refetch();
              void trips.refetch();
            }}
          />
        ) : (
          <ActivityIndicator size="large" color={colors.link} />
        )}
      </View>
    );
  }

  const filter = filterOf(s, params);
  const finished = tripsFor(filter?.ids ?? s.finished, all);
  const longest = s.longest_trip?.trip_id;
  const toList = () => scroll.current?.scrollTo({ y: listY.current - 8, animated: true });

  const rows = finished.map((trip) => (
    <FinishedRow key={trip.id} trip={trip} longest={!filter && trip.id === longest && finished.length > 1} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} />
  ));

  if (filter) {
    const days = finished.reduce((sum, trip) => sum + durationDays(trip.start_date, trip.end_date), 0);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="trip-stats-screen">
        <Stack.Screen options={{ title: filter.title ?? t('screens.tripStats') }} />
        <Text style={styles.filterLine} testID="trip-stats-filter">
          {`${t('trips.numbers.tripsCount', { count: finished.length, n: f.n(finished.length) })} · ${t('trips.numbers.daysCount', { count: days, n: f.n(days) })}`}
        </Text>
        {rows}
      </ScrollView>
    );
  }

  const upcoming = all
    .filter((trip) => tripPhase(trip.start_date, trip.end_date, today) === 'upcoming')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const nextTrip = upcoming[0];
  const away = nextTrip ? durationDays(today, nextTrip.start_date) - 1 : 0;
  const maxTrips = Math.max(1, ...s.per_year.map((y) => y.trips));
  const placeNames = t('trips.soFar.placesLine', {
    countries: t('trips.numbers.countriesCount', { count: s.countries, n: f.n(s.countries) }),
    cities: t('trips.numbers.citiesCount', { count: s.cities, n: f.n(s.cities) }),
  });

  return (
    <ScrollView ref={scroll} style={styles.container} contentContainerStyle={styles.content} testID="trip-stats-screen">
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('trips.soFar.finished')}</Text>
        {s.trips > 0 ? (
          <View style={styles.heroNumbers}>
            <PressableScale pressEffect="opacity" style={styles.heroCol} onPress={toList} accessibilityRole="button" accessibilityLabel={t('trips.soFar.tripsA11y', { count: s.trips, n: f.n(s.trips) })} testID="stats-trips">
              <Text style={[styles.heroValue, styles.heroValueFirst]} maxFontSizeMultiplier={1.2}>
                {f.n(s.trips)}
              </Text>
              <Text style={styles.heroWord}>{t('trips.numbers.trips', { count: s.trips })}</Text>
            </PressableScale>
            <PressableScale
              pressEffect="opacity"
              style={[styles.heroCol, styles.heroColLine]}
              onPress={toList}
              accessibilityRole="button"
              accessibilityLabel={t('trips.soFar.daysA11y', { count: s.total_days, n: f.n(s.total_days) })}
              testID="stats-days"
            >
              <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
                {f.n(s.total_days)}
              </Text>
              <Text style={styles.heroWord}>{t('trips.soFar.daysAway', { count: s.total_days })}</Text>
            </PressableScale>
            <View style={[styles.heroCol, styles.heroColLine]} accessible testID="stats-average">
              <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
                {f.n(s.average_days)}
              </Text>
              <Text style={styles.heroWord}>{t('trips.soFar.daysATrip')}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.heroNone} testID="stats-none">
            <Text style={styles.heroNoneTitle}>{t('trips.soFar.noneTitle')}</Text>
            <Text style={styles.heroNoneBody}>{t('trips.soFar.noneBody')}</Text>
          </View>
        )}
        <Ticket />
        <PressableScale
          pressEffect="opacity"
          style={styles.coming}
          onPress={() => (nextTrip ? router.navigate('/trips') : router.push('/trip/new'))}
          accessibilityRole="button"
          testID="stats-coming"
        >
          <Text style={styles.comingText}>
            {nextTrip ? (
              <>
                <Text style={styles.comingStrong}>{t('trips.soFar.coming', { count: upcoming.length, n: f.n(upcoming.length) })}</Text>{' '}
                {t('trips.soFar.next', {
                  name: nextTrip.title || nextTrip.destination,
                  when: away <= 1 ? t(away === 1 ? 'trips.soFar.whenTomorrow' : 'trips.soFar.whenToday') : t('trips.soFar.whenInDays', { count: away, n: f.n(away) }),
                })}
              </>
            ) : (
              <Text style={styles.comingStrong}>{t('trips.soFar.nothingComing')}</Text>
            )}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onHeroSecondary} />
        </PressableScale>
      </View>

      {s.places.countries.length ? (
        <View style={styles.card} testID="stats-places">
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {t('trips.soFar.where')}
            </Text>
            <Text style={styles.cardSub}>{placeNames}</Text>
          </View>
          <View style={styles.chips}>
            {s.places.countries.map((c) => (
              <PressableScale
                key={c.iso2}
                haptic="selection"
                style={styles.chip}
                onPress={() => router.push({ pathname: '/map/country/[iso2]', params: { iso2: c.iso2 } })}
                accessibilityRole="button"
                testID={`stats-country-${c.iso2}`}
              >
                <Text style={styles.flag}>{flagEmoji(c.iso2)}</Text>
                <Text style={styles.chipText}>{i18n.language.startsWith('bn') && c.name_bn ? c.name_bn : c.name}</Text>
              </PressableScale>
            ))}
            {s.places.cities.map((c) => (
              <PressableScale
                key={c.geonameid}
                haptic="selection"
                style={styles.chip}
                onPress={() => router.push({ pathname: '/stats/trips', params: { city: String(c.geonameid) } })}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${t('trips.numbers.tripsCount', { count: c.trip_ids.length, n: f.n(c.trip_ids.length) })}`}
                testID={`stats-city-${c.geonameid}`}
              >
                <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.link} />
                <Text style={styles.chipText}>{c.name}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {s.per_year.map((y) => (
        <PressableScale
          key={y.year}
          haptic="selection"
          style={styles.year}
          onPress={() => router.push({ pathname: '/stats/trips', params: { year: String(y.year) } })}
          accessibilityRole="button"
          accessibilityLabel={`${f.n(y.year)}: ${t('trips.numbers.tripsCount', { count: y.trips, n: f.n(y.trips) })}, ${t('trips.numbers.daysCount', { count: y.days, n: f.n(y.days) })}`}
          testID={`stats-year-${y.year}`}
        >
          <Text style={styles.yearText}>{f.n(y.year)}</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${(y.trips / maxTrips) * 100}%` }]} />
          </View>
          <Text style={styles.yearSub}>{`${t('trips.numbers.tripsCount', { count: y.trips, n: f.n(y.trips) })} · ${t('trips.numbers.daysCount', { count: y.days, n: f.n(y.days) })}`}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </PressableScale>
      ))}

      {rows.length ? (
        <Text
          style={styles.listTitle}
          accessibilityRole="header"
          onLayout={(e) => {
            listY.current = e.nativeEvent.layout.y;
          }}
          testID="stats-finished"
        >
          {t('trips.soFar.finishedTrips')}
        </Text>
      ) : null}
      {rows}
    </ScrollView>
  );
}

function FinishedRow({ trip, longest, onPress }: { trip: Trip; longest: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const point = tripPoint(trip.stops);
  const days = durationDays(trip.start_date, trip.end_date);
  const name = trip.title || trip.destination;
  const line = `${formatRange(trip.start_date, trip.end_date, i18n.language)} · ${t('trips.row.days', { count: days, n: f.n(days) })}`;
  return (
    <PressableScale
      haptic="selection"
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, longest ? t('trips.soFar.longest') : null, line].filter(Boolean).join(', ')}
      testID={`stats-trip-${trip.id}`}
    >
      <View style={styles.thumb}>
        {point ? <PlacePicture lon={point.lon} lat={point.lat} width={THUMB} height={THUMB} span={3} at={[0.5, 0.42]} /> : null}
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowName} numberOfLines={2}>
            {name}
          </Text>
          {longest ? (
            <Text style={styles.badge} testID="stats-longest">
              {t('trips.soFar.longest')}
            </Text>
          ) : null}
        </View>
        <Text style={styles.rowSub}>{line}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, paddingBottom: t.spacing.xxl, gap: t.spacing.md },
  hero: { borderRadius: t.radius.hero, overflow: 'hidden', backgroundColor: t.colors.hero, paddingTop: t.spacing.xl, paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.sm, ...t.depth.raised },
  heroLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.4, color: t.colors.onHeroSecondary, textTransform: 'uppercase' },
  heroNumbers: { flexDirection: 'row', marginTop: t.spacing.md },
  heroCol: { flex: 1, gap: 4 },
  heroColLine: { paddingLeft: t.spacing.lg, borderLeftWidth: 1, borderLeftColor: t.colors.heroTrack },
  heroValue: { fontFamily: t.type.title.fontFamily, fontSize: 40, lineHeight: 44, fontWeight: 'normal', includeFontPadding: false, color: t.colors.onHero },
  heroValueFirst: { color: t.colors.highlight },
  heroWord: { fontSize: 13.5, color: t.colors.onHeroSecondary },
  heroNone: { marginTop: t.spacing.md, gap: 4 },
  heroNoneTitle: { fontFamily: t.type.title.fontFamily, fontSize: 24, lineHeight: 30, fontWeight: 'normal', color: t.colors.onHero },
  heroNoneBody: { fontSize: 14, color: t.colors.onHeroSecondary },
  coming: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 48 },
  comingText: { flex: 1, fontSize: 14.5, color: t.colors.onHeroSecondary },
  comingStrong: { fontWeight: '700', color: t.colors.onHero },
  card: { borderRadius: 22, backgroundColor: t.colors.surface, paddingTop: 14, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md, ...t.depth.card },
  cardHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: t.spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: t.colors.textPrimary },
  cardSub: { fontSize: 13.5, color: t.colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 10, paddingRight: 14, borderRadius: 20, backgroundColor: t.colors.surfaceInset },
  flag: { fontSize: 18 },
  chipText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
  year: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60, paddingLeft: t.spacing.lg, paddingRight: 10, borderRadius: 20, backgroundColor: t.colors.surface, ...t.depth.card },
  yearText: { width: 48, fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: t.colors.accent },
  yearSub: { fontSize: 14, color: t.colors.textSecondary },
  listTitle: { fontFamily: t.type.title.fontFamily, fontSize: 20, lineHeight: 26, fontWeight: 'normal', color: t.colors.textPrimary, marginTop: t.spacing.sm, marginHorizontal: t.spacing.xs },
  filterLine: { fontSize: 14.5, color: t.colors.textSecondary, marginHorizontal: t.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, paddingVertical: t.spacing.sm, paddingLeft: t.spacing.sm, paddingRight: 10, borderRadius: 20, backgroundColor: t.colors.surface, ...t.depth.card },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, overflow: 'hidden', backgroundColor: t.colors.surfaceInset },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm },
  rowName: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: t.colors.textPrimary },
  badge: {
    minHeight: 20,
    paddingHorizontal: t.spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: t.colors.warningBg,
    color: t.colors.warning,
    fontSize: 11.5,
    fontWeight: '700',
    textAlignVertical: 'center',
  },
  rowSub: { fontSize: 13.5, color: t.colors.textSecondary },
}));
