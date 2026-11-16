/**
 * The next trip, the first thing on the Trips tab (docs/ui-refresh step 9, frames 15 and 16). Three states:
 *
 * - Before the trip: a picture of where it goes (drawn from the app's own shapes), the days to go, the
 *   name, dates and travellers, the forecast, how day 1 begins, the budget as planned of the total,
 *   "Open plan", and "Invite" for planning together.
 * - On the trip: "On now", which day, how many stops are done, what's next and when to leave (the same
 *   helpers as Today and the map). Its main button says what it opens: "Open today"; "Full plan" beside it.
 * - No plan yet: says so, with "Build the plan", built right here.
 *
 * The card's colour is the look's hero card. The whole card opens what its main button opens.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { tripsApi } from '../../services/api';
import type { ItineraryItem, Trip, TripConditions } from '../../types';
import { Button } from '../../ui/Button';
import { LineIcon } from '../../ui/LineIcon';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { notify } from '../../utils/dialogs';
import { useTripToday } from '../map/useTripToday';
import { daySky, sky } from './conditions/useConditionText';
import { durationDays, parseDay, tripPhase } from './dates';
import { PlacePicture, tripPoint } from './PlacePicture';
import { buildPlan } from './plan/build';
import { friendlyRange, stopTitle } from './plan/timeline';
import { usePlanFormat } from './plan/usePlanFormat';
import { refreshTrips } from './queries';
import { pointOf } from './today/today';

const PICTURE_HEIGHT = 124;

export type NextTripState = 'noPlan' | 'before' | 'onTrip';

/** Which card a trip gets: no plan yet, before it starts, or on it (from its first day to its last). */
export function nextTripState(trip: Trip, today: string): NextTripState {
  if (trip.status === 'draft') return 'noPlan';
  return tripPhase(trip.start_date, trip.end_date, today) === 'ongoing' ? 'onTrip' : 'before';
}

export function NextTripCard({ trip, today }: { trip: Trip; today: string }) {
  const state = nextTripState(trip, today);
  if (state === 'noPlan') return <NoPlanCard trip={trip} today={today} />;
  return state === 'onTrip' ? <OnTripCard trip={trip} today={today} /> : <BeforeCard trip={trip} today={today} />;
}

function BeforeCard({ trip, today }: { trip: Trip; today: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const itinerary = useQuery({ queryKey: ['itinerary', trip.id], queryFn: () => tripsApi.getItinerary(trip.id) });
  const budget = useQuery({ queryKey: ['budget', trip.id], queryFn: () => tripsApi.budget(trip.id) });
  const conditions = useQuery({ queryKey: ['conditions', trip.id], queryFn: () => tripsApi.conditions(trip.id) });

  const name = trip.title || trip.destination;
  const away = durationDays(today, trip.start_date) - 1;
  const point = tripPoint(trip.stops);
  const weather = conditions.data ? weatherLine(conditions.data, null, t, f, i18n.language) : null;
  const first = firstStop(itinerary.data?.days.find((d) => d.day_number === 1)?.items);
  const b = budget.data && budget.data.total_budget > 0 ? budget.data : null;
  const over = !!b && b.estimated_total > b.total_budget;
  const openPlan = () => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });

  const chips = (
    <View style={[styles.chips, point ? styles.chipsOver : null]}>
      <Text style={[styles.chip, styles.chipText]} maxFontSizeMultiplier={1.3}>
        {t('trips.next.chip')}
      </Text>
      {weather ? (
        <View style={[styles.chip, styles.weatherChip]} testID="next-trip-weather">
          <MaterialCommunityIcons name={weather.icon} size={16} color={colors.onHero} />
          <Text style={styles.weatherChipText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {weather.text}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <PressableScale style={styles.hero} onPress={openPlan} accessible={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="next-trip">
      {point && width > 0 ? (
        <View style={styles.picture}>
          <PlacePicture lon={point.lon} lat={point.lat} width={width} height={PICTURE_HEIGHT} at={[0.33, 0.45]} dot="marigold" fadeTo={colors.hero} testID="next-trip-picture" />
          {chips}
        </View>
      ) : (
        <View style={styles.chipsRow}>{chips}</View>
      )}
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.names}>
            <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
              {name}
            </Text>
            <Text style={styles.range}>{`${friendlyRange(trip.start_date, trip.end_date, i18n.language, today)} · ${t('plan.travellers', { count: trip.num_travelers, n: f.n(trip.num_travelers) })}`}</Text>
          </View>
          <View style={styles.count} accessible accessibilityLabel={t('trips.next.daysToGoA11y', { count: away, n: f.n(away) })} testID="next-trip-when">
            <Text style={styles.countValue} maxFontSizeMultiplier={1.2}>
              {f.n(away)}
            </Text>
            <Text style={styles.countLabel} maxFontSizeMultiplier={1.3}>
              {t('trips.next.daysToGo', { count: away })}
            </Text>
          </View>
        </View>
        <Ticket />
        <View style={styles.facts}>
          {first ? (
            <View style={styles.fact} accessible testID="next-trip-day1">
              <Text style={styles.factLabel}>{t('trips.next.day1Starts')}</Text>
              <Text style={styles.factValue}>{t('trips.next.at', { time: f.time(first.start_time), place: stopTitle(first) })}</Text>
            </View>
          ) : null}
          {b ? (
            <View style={styles.fact} accessible testID="next-trip-budget">
              <Text style={styles.factLabel}>{over ? t('trips.next.budgetOver') : t('trips.next.budgetLabel')}</Text>
              <Text style={styles.factValue}>
                {f.money(b.estimated_total)} <Text style={styles.factOf}>{t('trips.next.of', { total: f.money(b.total_budget) })}</Text>
              </Text>
              <View style={styles.meter}>
                <View style={[styles.meterFill, { width: `${Math.min(100, (b.estimated_total / b.total_budget) * 100)}%` }, over && styles.meterOver]} />
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.buttons}>
          <PressableScale haptic="selection" style={styles.main} onPress={openPlan} accessibilityRole="button" testID="next-trip-open">
            <Text style={styles.mainText} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('trips.next.open')}
            </Text>
            <LineIcon name="arrowRight" size={20} color={colors.onHeroButton} />
          </PressableScale>
          <PressableScale
            haptic="selection"
            style={styles.round}
            onPress={() => router.push({ pathname: '/trip/invite/[id]', params: { id: String(trip.id) } })}
            accessibilityRole="button"
            accessibilityLabel={t('trips.next.invite')}
            testID="next-trip-invite"
          >
            <LineIcon name="invite" size={22} color={colors.onHero} />
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

function OnTripCard({ trip, today }: { trip: Trip; today: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const tripToday = useTripToday(trip);
  const conditions = useQuery({ queryKey: ['conditions', trip.id], queryFn: () => tripsApi.conditions(trip.id) });

  const name = trip.title || trip.destination;
  const day = durationDays(trip.start_date, today);
  const days = durationDays(trip.start_date, trip.end_date);
  const items = tripToday.day?.items.filter((i) => pointOf(i)) ?? [];
  const done = tripToday.state?.done.filter((i) => pointOf(i)).length ?? 0;
  const next = tripToday.state?.next ?? null;
  const leave = tripToday.leave;
  const weather = conditions.data ? weatherLine(conditions.data, today, t, f, i18n.language) : null;
  const openToday = () => router.push({ pathname: '/trip/today/[id]', params: { id: trip.id } });

  return (
    <PressableScale style={[styles.hero, styles.padded]} onPress={openToday} accessible={false} testID="next-trip">
      <View style={styles.onRow}>
        <Text style={styles.onNow} maxFontSizeMultiplier={1.3}>
          {t('trips.next.onNowChip')}
        </Text>
        {weather ? (
          <View style={styles.onWeather} testID="next-trip-weather">
            <MaterialCommunityIcons name={weather.icon} size={18} color={colors.highlight} />
            <Text style={styles.onWeatherText} numberOfLines={1}>
              {weather.text}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.top, styles.onTop]}>
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
            {name}
          </Text>
          <Text style={styles.range}>
            {[friendlyRange(today, today, i18n.language, today), items.length ? t('trips.next.stopsDone', { done: f.n(done), total: f.n(items.length) }) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.count} accessible accessibilityLabel={t('trips.next.dayOfA11y', { day: f.n(day), days: f.n(days) })} testID="next-trip-when">
          <Text style={styles.dayValue} maxFontSizeMultiplier={1.2}>
            {t('plan.day', { n: f.n(day) })}
          </Text>
          <Text style={styles.countLabel} maxFontSizeMultiplier={1.3}>
            {t('trips.next.ofDays', { n: f.n(days) })}
          </Text>
        </View>
      </View>
      <Ticket />
      {next ? (
        <View style={styles.next} accessible testID="next-trip-next">
          <Text style={styles.factLabel}>{t('trips.next.nextLabel')}</Text>
          <Text style={styles.nextName}>{stopTitle(next)}</Text>
          {leave ? (
            <Text style={styles.range}>
              {t('trips.next.leaveBy')} <Text style={styles.leaveTime}>{f.time(leave.at)}</Text>
              {` · ${t('trips.next.travel', { time: f.duration(leave.minutes), mode: t(`plan.modes.${leave.mode}`) })}`}
            </Text>
          ) : (
            <Text style={styles.range}>{t('trips.next.startsAt', { time: f.time(next.start_time) })}</Text>
          )}
        </View>
      ) : tripToday.day ? (
        <Text style={styles.nextName} testID="next-trip-next">
          {t('today.dayDone')}
        </Text>
      ) : tripToday.loading ? (
        <ActivityIndicator color={colors.onHero} />
      ) : null}
      <View style={styles.buttons}>
        <PressableScale haptic="selection" style={styles.main} onPress={openToday} accessibilityRole="button" testID="next-trip-open">
          <Text style={styles.mainText} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t('trips.next.openToday')}
          </Text>
          <LineIcon name="arrowRight" size={20} color={colors.onHeroButton} />
        </PressableScale>
        <PressableScale
          haptic="selection"
          style={styles.quiet}
          onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
          accessibilityRole="button"
          testID="next-trip-full-plan"
        >
          <Text style={styles.quietText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {t('today.fullPlan')}
          </Text>
        </PressableScale>
      </View>
    </PressableScale>
  );
}

function NoPlanCard({ trip, today }: { trip: Trip; today: string }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const name = trip.title || trip.destination;
  const away = durationDays(today, trip.start_date) - 1;
  const open = () => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
  const build = useMutation({
    mutationFn: () => buildPlan(trip.id, false),
    onSuccess: () => {
      refreshTrips(queryClient, trip.id);
      void queryClient.invalidateQueries({ queryKey: ['itinerary', trip.id] });
      open();
    },
    onError: (e) => notify(t('plan.buildFailed'), e instanceof Error ? e.message : String(e), 'error'),
  });
  const when =
    tripPhase(trip.start_date, trip.end_date, today) === 'ongoing'
      ? t('trips.next.onNow', { day: f.n(durationDays(trip.start_date, today)), days: f.n(durationDays(trip.start_date, trip.end_date)) })
      : away <= 1
        ? t(away === 1 ? 'trips.next.tomorrow' : 'trips.next.today')
        : t('trips.next.inDays', { count: away, n: f.n(away) });

  return (
    <PressableScale style={styles.plain} onPress={open} accessible={false} testID="next-trip">
      <View style={styles.onRow}>
        <Text style={styles.plainChip} maxFontSizeMultiplier={1.3}>
          {t('trips.next.chip')}
        </Text>
        <Text style={styles.plainWhen} testID="next-trip-when">
          {when}
        </Text>
      </View>
      <Text style={[styles.name, styles.plainName]} numberOfLines={2} accessibilityRole="header">
        {name}
      </Text>
      <Text style={styles.plainRange}>{`${friendlyRange(trip.start_date, trip.end_date, i18n.language, today)} · ${t('plan.travellers', { count: trip.num_travelers, n: f.n(trip.num_travelers) })}`}</Text>
      <Text style={styles.plainNote}>{t('trips.next.notPlanned')}</Text>
      <Button
        label={build.isPending ? t('plan.building') : t('trips.next.build')}
        onPress={() => build.mutate()}
        disabled={build.isPending}
        style={styles.build}
        testID="next-trip-build"
      />
    </PressableScale>
  );
}

/** The ticket's dashed line, with a notch in the page's colour at each end (frames 15–17) */
export function Ticket() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View style={styles.ticket} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {width > 0 ? (
        <Svg width={width} height={2} style={styles.ticketLine}>
          <Line x1={0} y1={1} x2={width} y2={1} stroke={colors.heroLine} strokeWidth={1.5} strokeDasharray="5 4" />
        </Svg>
      ) : null}
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

/** The first stop of a day (its first visit, else its first stop) */
function firstStop(items: readonly ItineraryItem[] | undefined): ItineraryItem | null {
  const sorted = [...(items ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.order_index - b.order_index);
  return sorted.find((i) => i.item_type === 'activity') ?? sorted[0] ?? null;
}

type T = ReturnType<typeof useTranslation>['t'];

/**
 * "31° · storms likely Mon": the first forecast day of the trip (today's while
 * you're on it), and the first storm (else rain) the forecast has for any day.
 */
export function weatherLine(
  c: TripConditions,
  today: string | null,
  t: T,
  f: ReturnType<typeof usePlanFormat>,
  language: string,
): { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string } | null {
  const forecast = c.days.filter((d) => d.in_forecast && (!today || (d.date ?? '') >= today));
  const first = forecast[0];
  if (!first) return null;
  const weekday = (iso: string | null) => (iso ? f.time(parseDay(iso).toLocaleDateString(language, { weekday: 'short' })) : '');
  const active = (code: string) => forecast.find((d) => d.warnings.some((w) => w.code === code && !w.kept));
  const storm = active('storm');
  const rain = storm ? undefined : active('rain');
  const s = sky(daySky(first));
  const what = storm
    ? t('trips.next.storm', { day: weekday(storm.date) })
    : rain
      ? t('trips.next.rain', { day: weekday(rain.date) })
      : t(`conditions.sky.${s.key}`).toLowerCase();
  const icon = storm ? 'weather-lightning-rainy' : rain ? 'weather-rainy' : s.icon;
  return { icon, text: first.temp_max != null ? t('trips.next.weather', { temp: f.n(first.temp_max), what }) : what };
}

const useStyles = makeStyles((t) => ({
  hero: {
    marginHorizontal: t.spacing.lg,
    borderRadius: t.radius.hero,
    overflow: 'hidden',
    backgroundColor: t.colors.hero,
    borderWidth: t.scheme === 'dark' ? 1 : 0,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    ...t.depth.raised,
  },
  padded: { paddingTop: 18, paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xl },
  picture: { height: PICTURE_HEIGHT },
  chipsRow: { paddingTop: 14, paddingHorizontal: 14 },
  chips: { flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm },
  chipsOver: { position: 'absolute', left: 14, right: 14, top: 14 },
  chip: { minHeight: 26, paddingHorizontal: 11, borderRadius: 13, backgroundColor: t.colors.heroChip, justifyContent: 'center' },
  chipText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, color: t.colors.onHero, textAlignVertical: 'center' },
  weatherChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: t.spacing.sm, flexShrink: 1 },
  weatherChipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '500', color: t.colors.onHero },
  body: { paddingTop: 2, paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xl },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.spacing.md },
  onTop: { marginTop: 14 },
  names: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: t.type.title.fontFamily, fontSize: 30, lineHeight: 36, fontWeight: 'normal', includeFontPadding: false, color: t.colors.onHero },
  range: { fontSize: 14, color: t.colors.onHeroSecondary },
  count: { alignItems: 'center', gap: 2 },
  countValue: { fontFamily: t.type.title.fontFamily, fontSize: 46, lineHeight: 48, fontWeight: 'normal', includeFontPadding: false, color: t.colors.highlight },
  dayValue: { fontFamily: t.type.title.fontFamily, fontSize: 22, lineHeight: 28, fontWeight: 'normal', includeFontPadding: false, color: t.colors.highlight },
  countLabel: { fontSize: 12, fontWeight: '500', color: t.colors.onHeroSecondary },
  ticket: { height: 2, marginTop: t.spacing.lg, marginBottom: 14, marginHorizontal: -t.spacing.xl, justifyContent: 'center' },
  ticketLine: { position: 'absolute', left: 0, top: 0 },
  notch: { position: 'absolute', top: -10, width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.bg },
  notchLeft: { left: -11 },
  notchRight: { right: -11 },
  facts: { flexDirection: 'row', gap: t.spacing.lg },
  fact: { flex: 1, gap: 4 },
  factLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: t.colors.onHeroSecondary, textTransform: 'uppercase' },
  factValue: { fontSize: 15, fontWeight: '500', color: t.colors.onHero },
  factOf: { fontWeight: '400', color: t.colors.onHeroSecondary },
  meter: { height: 5, borderRadius: 3, backgroundColor: t.colors.heroTrack, overflow: 'hidden' },
  meterFill: { height: 5, borderRadius: 3, backgroundColor: t.colors.heroMeter },
  meterOver: { backgroundColor: t.colors.highlight },
  // "Full plan" goes under the main button when both don't fit (Bangla, large text)
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  main: { flexGrow: 1, flexShrink: 0, minWidth: 120, maxWidth: '100%', paddingHorizontal: t.spacing.md, minHeight: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm, backgroundColor: t.colors.heroButton },
  mainText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: t.colors.onHeroButton },
  round: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: t.colors.heroOutline, alignItems: 'center', justifyContent: 'center' },
  quiet: { flexGrow: 1, flexShrink: 0, maxWidth: '100%', minHeight: 50, paddingHorizontal: t.spacing.lg, borderRadius: 25, borderWidth: 1.5, borderColor: t.colors.heroOutline, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontSize: 15, fontWeight: '500', color: t.colors.onHero },
  onRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm },
  onNow: {
    minHeight: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: t.colors.highlight,
    color: t.colors.onHighlight,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlignVertical: 'center',
  },
  onWeather: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  onWeatherText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: t.colors.onHeroSecondary },
  next: { gap: 4 },
  nextName: { fontSize: 17, fontWeight: '700', color: t.colors.onHero },
  leaveTime: { fontWeight: '700', color: t.colors.onHero },
  plain: { marginHorizontal: t.spacing.lg, borderRadius: t.radius.hero, padding: t.spacing.xl, paddingTop: 18, backgroundColor: t.colors.surface, ...t.depth.raised },
  plainChip: {
    minHeight: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: t.colors.accentTint,
    color: t.colors.link,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlignVertical: 'center',
  },
  plainWhen: { fontSize: 13, fontWeight: '500', color: t.colors.textSecondary },
  plainName: { marginTop: 14, marginBottom: 4, color: t.colors.textPrimary },
  plainRange: { fontSize: 14, color: t.colors.textSecondary },
  plainNote: { marginTop: 14, fontSize: 14.5, lineHeight: 21, color: t.colors.textSecondary },
  build: { marginTop: t.spacing.lg },
}));
