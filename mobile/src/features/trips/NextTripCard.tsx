/**
 * The next trip, at the top of the Trips tab (trip planner step 8): how soon
 * (or which day of it, while you're on it), where and when, the weather from
 * the forecast with the first storm or rain it expects, and "Open plan" with
 * the day's stops and the budget. A trip without a plan yet says so.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { tripsApi } from '../../services/api';
import type { Trip, TripConditions } from '../../types';
import { ON_SUNSET, SUNSET_CARD } from '../../ui/theme/cards';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { daySky, sky } from './conditions/useConditionText';
import { durationDays, parseDay, tripPhase } from './dates';
import { friendlyRange } from './plan/timeline';
import { usePlanFormat } from './plan/usePlanFormat';

const SUNSET = SUNSET_CARD;
const ON = ON_SUNSET;

export function NextTripCard({ trip, today, onOpen }: { trip: Trip; today: string; onOpen: () => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const built = trip.status !== 'draft';
  const ongoing = tripPhase(trip.start_date, trip.end_date, today) === 'ongoing';

  const itinerary = useQuery({ queryKey: ['itinerary', trip.id], queryFn: () => tripsApi.getItinerary(trip.id), enabled: built });
  const budget = useQuery({ queryKey: ['budget', trip.id], queryFn: () => tripsApi.budget(trip.id), enabled: built });
  const conditions = useQuery({ queryKey: ['conditions', trip.id], queryFn: () => tripsApi.conditions(trip.id), enabled: built });

  const name = trip.title || trip.destination;
  const range = friendlyRange(trip.start_date, trip.end_date, i18n.language, today);
  const when = ongoing
    ? t('trips.next.onNow', { day: f.n(durationDays(trip.start_date, today)), days: f.n(durationDays(trip.start_date, trip.end_date)) })
    : whenText(durationDays(today, trip.start_date) - 1, t, f.n);
  const days = itinerary.data?.days ?? [];
  const day = days.find((d) => d.day_date === today) ?? days[0];
  const stops = day ? day.items.filter((i) => i.item_type === 'activity').length : 0;
  const weather = conditions.data ? weatherLine(conditions.data, ongoing ? today : null, t, f, i18n.language) : null;

  return (
    <PressableScale
      style={styles.card}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('trips.next.a11y', { name, when, range })}
      testID="next-trip"
    >
      <Svg width={230} height={150} viewBox="0 0 230 150" fill="none" stroke={ON} strokeWidth={2} strokeLinecap="round" style={styles.art}>
        <Circle cx={160} cy={58} r={26} />
        <Path d="M60 96c12 0 12-8 24-8s12 8 24 8 12-8 24-8 12 8 24 8 12-8 24-8 12 8 24 8" />
        <Path d="M40 116c12 0 12-8 24-8s12 8 24 8 12-8 24-8 12 8 24 8 12-8 24-8 12 8 24 8 12-8 24-8" />
        <Path d="M70 136c12 0 12-8 24-8s12 8 24 8 12-8 24-8 12 8 24 8 12-8 24-8" />
      </Svg>
      <Text style={styles.when} testID="next-trip-when">{t('trips.next.label', { when }).toUpperCase()}</Text>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      <Text style={styles.range}>{`${range} · ${t('plan.travellers', { count: trip.num_travelers, n: f.n(trip.num_travelers) })}`}</Text>
      {weather ? (
        <View style={styles.weather} testID="next-trip-weather">
          <MaterialCommunityIcons name={weather.icon} size={20} color={ON} />
          <Text style={styles.weatherText}>{weather.text}</Text>
        </View>
      ) : null}
      <View style={styles.bottom}>
        <View style={styles.open}>
          <Text style={styles.openText}>{t('trips.next.open')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SUNSET} />
        </View>
        <View style={styles.facts}>
          {!built ? (
            <Text style={styles.fact}>{t('trips.next.notBuilt')}</Text>
          ) : (
            <>
              {day ? <Text style={styles.fact}>{t('trips.next.stopsOnDay', { count: stops, n: f.n(stops), day: f.n(day.day_number) })}</Text> : null}
              {budget.data ? (
                <Text style={styles.fact}>{t('trips.next.budget', { spent: f.money(budget.data.estimated_total), total: f.money(budget.data.total_budget) })}</Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function whenText(daysAway: number, t: T, n: (v: number) => string): string {
  if (daysAway <= 0) return t('trips.next.today');
  if (daysAway === 1) return t('trips.next.tomorrow');
  return t('trips.next.inDays', { count: daysAway, n: n(daysAway) });
}

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
  if (!first) return c.days.length ? { icon: 'calendar-clock', text: t('trips.next.forecastLater') } : null;
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
  card: { marginHorizontal: t.spacing.lg, borderRadius: 24, backgroundColor: SUNSET, padding: 20, gap: 6, overflow: 'hidden' },
  art: { position: 'absolute', right: -20, top: 18, opacity: 0.22 },
  when: { ...t.type.footnote, fontWeight: '600', letterSpacing: 0.6, color: ON },
  name: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: ON },
  range: { ...t.type.callout, color: ON },
  weather: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: 10 },
  weatherText: { ...t.type.callout, fontSize: 14, color: ON, flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md, marginTop: 14 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingLeft: 18, paddingRight: 12, borderRadius: 999, backgroundColor: ON },
  openText: { ...t.type.callout, fontWeight: '700', color: SUNSET },
  facts: { flexShrink: 1, alignItems: 'flex-end' },
  fact: { ...t.type.footnote, color: ON, textAlign: 'right' },
}));
