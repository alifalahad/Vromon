/**
 * Conditions for a trip's days (docs/ui-refresh step 17, frames 34–36), answers first. The days as a strip,
 * then the chosen day in one look:
 *   - to come: what the day will be like, what to know (each warning with its reason, source and age, and
 *     "Move to …" / "Keep"), "By the hour", the weather at each stop, the sea, what else was checked;
 *   - today: now, the next hours, what's left to know for the rest of today, the stops still to come,
 *     tomorrow, and the evening-before reminder (the same switch as Today's);
 *   - over: as it was, with no warnings (D22); too early: when the forecast opens.
 * Refresh (the icon, or pull down) asks again; offline, the last copy shows with its age and "Try again".
 * Vromon warns from this data only and never says a place or road is safe.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useMe } from '../../../src/features/account/useMe';
import { ConditionsHero } from '../../../src/features/trips/conditions/ConditionsHero';
import {
  ChecksList,
  NextHours,
  OfflineCard,
  SeaCard,
  StopsWeather,
  TomorrowRow,
  useDoneLine,
  WarningCard,
} from '../../../src/features/trips/conditions/ConditionsParts';
import { DayStrip } from '../../../src/features/trips/conditions/DayStrip';
import { dayWhen, nextHours, weatherNow } from '../../../src/features/trips/conditions/dayView';
import { figureStops, HourFigure } from '../../../src/features/trips/conditions/HourFigure';
import { useConditionText, warningIcon } from '../../../src/features/trips/conditions/useConditionText';
import { addDays, localToday } from '../../../src/features/trips/dates';
import { orderedStops } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { allowNotifications } from '../../../src/features/trips/today/reminders';
import { useTodaySettings } from '../../../src/features/trips/today/settings';
import { minuteOfDay, t2m } from '../../../src/features/trips/today/today';
import { tripsApi } from '../../../src/services/api';
import type { ConditionWarning } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { Toggle } from '../../../src/ui/Toggle';

export default function ConditionsScreen() {
  // `at` and `date` (development builds only) show the screen at another time, as Today and the plan do
  const { id, day: dayParam, at, date } = useLocalSearchParams<{ id: string; day?: string; at?: string; date?: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const doneLine = useDoneLine();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const me = useMe();
  const settings = useTodaySettings();
  const scroll = useRef<ScrollView>(null);
  const [picked, setPicked] = useState<number | null>(dayParam ? Number(dayParam) : null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The phone couldn't reach Vromon on the last refresh (no connection): the last copy stays, said so
  const [unreachable, setUnreachable] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = (__DEV__ && date) || localToday(clock);
  const now = __DEV__ && at ? t2m(at) : minuteOfDay(clock);

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const itinerary = useQuery({ queryKey: ['itinerary', tripId], queryFn: () => tripsApi.getItinerary(tripId), enabled: !!tripId });
  const conditions = useQuery({
    queryKey: ['conditions', tripId],
    queryFn: () => tripsApi.conditions(tripId),
    enabled: !!tripId,
    refetchInterval: 10 * 60_000,
  });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const data = conditions.data;
  const whenOf = (d: { date: string | null; when?: 'past' | 'today' | 'coming' }) => dayWhen(d, today);
  const todayDay = data?.days.find((d) => whenOf(d) === 'today');
  // Opened without a day: today's on the trip, else the first
  const chosen = picked ?? todayDay?.day_number ?? 1;
  const day = data?.days.find((d) => d.day_number === chosen) ?? data?.days[0];
  const when = day ? whenOf(day) : 'coming';
  const planDay = itinerary.data?.days.find((d) => d.id === day?.day_id);

  const refresh = async () => {
    setRefreshing(true);
    haptics.selection();
    try {
      queryClient.setQueryData(['conditions', tripId], await tripsApi.conditions(tripId, true));
      setMessage(null);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    } finally {
      setRefreshing(false);
    }
  };
  const after = async (line: string) => {
    haptics.success();
    setMessage(line);
    await Promise.all(
      [['conditions', tripId], ['itinerary', tripId], ['trip', tripId], ['budget', tripId]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
    setBusyKey(null);
  };
  const failed = (e: unknown) => {
    haptics.error();
    setMessage(e instanceof Error ? e.message : String(e));
    setBusyKey(null);
  };
  const move = async (w: ConditionWarning) => {
    if (!w.item_id || !w.move_to) return;
    setBusyKey(w.key);
    try {
      await tripsApi.moveItem(tripId, w.item_id, w.move_to.day_id);
      await after(t('conditions.moved', { place: w.place ?? '', day: text.weekday(w.move_to.date) }));
    } catch (e) {
      failed(e);
    }
  };
  const keep = async (w: ConditionWarning, kept: boolean) => {
    if (!w.item_id) return;
    setBusyKey(w.key);
    try {
      await tripsApi.keepWarning(tripId, w.item_id, w.code, kept);
      await after(kept ? t('conditions.keptMsg', { place: w.place ?? '' }) : t('conditions.unkeptMsg'));
    } catch (e) {
      failed(e);
    }
  };
  // The evening-before reminder: the same switch as on Today (turning it on asks to notify first)
  const [notice, setNotice] = useState<string | null>(null);
  const toggleReminder = async (on: boolean) => {
    if (on && !(await allowNotifications(true))) {
      setNotice(t('today.notificationsDenied'));
      return;
    }
    setNotice(null);
    settings.set({ weatherReminders: on });
  };
  const openDay = (n: number) => {
    setPicked(n);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const header = (
    <Stack.Screen
      options={{
        title: t('conditions.title'),
        headerRight: () => (
          <PressableScale
            pressEffect="opacity"
            haptic="none"
            onPress={refresh}
            disabled={refreshing}
            style={styles.refresh}
            accessibilityRole="button"
            accessibilityLabel={t('conditions.refresh')}
            accessibilityState={{ busy: refreshing }}
            testID="conditions-refresh"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.link} />
            ) : (
              <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Path d="M20 12a8 8 0 1 1-2.3-5.6M20 4.5V9h-4.5" fill="none" stroke={colors.link} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
          </PressableScale>
        ),
      }}
    />
  );

  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        {header}
        {conditions.isError ? <Text style={styles.muted}>{(conditions.error as Error).message}</Text> : <ActivityIndicator color={colors.link} />}
      </View>
    );
  }

  const active = day?.warnings.filter((w) => !w.kept) ?? [];
  const kept = day?.warnings.filter((w) => w.kept) ?? [];
  const stops = planDay ? orderedStops(planDay) : [];
  const numberOf = (item: (typeof stops)[number]) => stops.indexOf(item) + 1;
  const withWeather = stops.filter((i) => day?.items[String(i.id)]);
  const tomorrow = data.days.find((d) => d.date && d.date === addDays(today, 1));
  // The place (frame 34: "Cox's Bazar · updated 5 min ago")
  const place = trip.data?.destination;
  const age = data.fetched_at ? text.age(data.fetched_at) : null;
  // Offline (frame 36): the weather service couldn't be asked, or the phone couldn't reach Vromon
  const offline = data.stale || unreachable || conditions.isRefetchError;

  // Today: what's still to come, what's done and where you are
  const ended = (i: (typeof stops)[number]) => t2m(i.end_time) <= now;
  const toCome = stops.filter((i) => t2m(i.start_time) > now);
  const nowStop = stops.find((i) => t2m(i.start_time) <= now && !ended(i));
  const restWarnings = active.filter((w) => {
    const item = stops.find((i) => i.id === w.item_id);
    return !item || !ended(item);
  });

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.link} colors={[colors.accent]} />}
      >
        {/* Where, and how fresh */}
        <View style={styles.updatedRow}>
          <View style={[styles.dot, offline && styles.dotStale]} />
          <Text style={[styles.updated, styles.flex]} accessibilityLiveRegion="polite" testID="conditions-updated">
            {[place, age ? t('conditions.updatedLower', { age }) : data.stale ? t('conditions.never') : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {offline ? <OfflineCard age={age} busy={refreshing} onRetry={refresh} /> : null}

        {data.days.length > 1 ? <DayStrip days={data.days} chosen={day?.day_number ?? 1} whenOf={whenOf} onTrip={!!todayDay} onPick={openDay} /> : null}

        {day && (
          <Animated.View key={day.day_id} entering={FadeIn.duration(200)} style={styles.body}>
            <ConditionsHero day={day} when={when} conditions={data} now={now} />

            {message ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.message} accessibilityLiveRegion="polite">
                {message}
              </Animated.Text>
            ) : null}

            {when === 'today' && day.in_forecast ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.nextHours')}
                </Text>
                <NextHours hours={nextHours(day, now)} day={day} live={weatherNow(data, day, now)} />
              </>
            ) : null}

            {/* What to know: for the rest of today on a trip day; nothing for a day that's over */}
            {when !== 'past' ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {when === 'today'
                    ? t('conditions.restOfToday')
                    : active.length
                      ? t('conditions.toKnow', { count: active.length, n: f.n(active.length) })
                      : day.in_forecast
                        ? t('conditions.allGood')
                        : t('conditions.allGoodLater')}
                </Text>
                {(when === 'today' ? restWarnings : active).length === 0 ? (
                  <Text style={styles.muted}>
                    {when === 'today' ? t('conditions.restAllGood') : day.in_forecast ? t('conditions.allGoodHint') : t('conditions.allGoodLaterHint')}
                  </Text>
                ) : null}
                {(when === 'today' ? restWarnings : active).map((w) => (
                  <WarningCard
                    key={w.key}
                    warning={w}
                    fetchedAt={data.fetched_at}
                    seaAt={data.sea_fetched_at}
                    busy={busyKey === w.key}
                    tomorrowId={tomorrow?.day_id ?? null}
                    onMove={mine && w.move_to ? () => move(w) : undefined}
                    onKeep={mine && w.item_id ? () => keep(w, true) : undefined}
                  />
                ))}
                {kept.length > 0 ? (
                  <View style={styles.keptBox}>
                    <Text style={styles.h3}>{t('conditions.keptTitle')}</Text>
                    {kept.map((w) => (
                      <View key={w.key} style={styles.keptRow}>
                        <MaterialCommunityIcons name={warningIcon(w.code)} size={18} color={colors.textTertiary} />
                        <Text style={[styles.muted, styles.flex]}>{text.title(w)}</Text>
                        {mine ? (
                          <PressableScale pressEffect="opacity" haptic="selection" onPress={() => keep(w, false)} hitSlop={8} accessibilityRole="button">
                            <Text style={styles.link}>{t('conditions.showAgain')}</Text>
                          </PressableScale>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}

            {/* By the hour, before the day */}
            {when === 'coming' && day.in_forecast ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.byHour')}
                </Text>
                <HourFigure day={day} stops={figureStops(stops)} testID="cond-hours" />
              </>
            ) : null}

            {/* The weather at each stop, when you're there; on the trip, the ones still to come */}
            {when === 'coming' && withWeather.length > 0 ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.atStops')}
                </Text>
                <StopsWeather day={day} stops={withWeather} numberOf={numberOf} />
              </>
            ) : null}
            {when === 'today' && stops.length > 0 ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.stillToCome')}
                </Text>
                <StopsWeather
                  day={day}
                  stops={toCome.filter((i) => day.items[String(i.id)])}
                  numberOf={numberOf}
                  footer={doneLine(stops.filter(ended).map(numberOf), nowStop ? numberOf(nowStop) : null) ?? (toCome.length ? null : t('conditions.allDone'))}
                />
              </>
            ) : null}

            {when === 'coming' && day.sea ? <SeaCard sea={day.sea} /> : null}

            {when === 'today' && tomorrow ? <TomorrowRow day={tomorrow} onOpen={() => openDay(tomorrow.day_number)} /> : null}
            {when === 'today' && mine ? (
              <PressableScale
                pressEffect="opacity"
                haptic="selection"
                onPress={() => toggleReminder(!settings.weatherReminders)}
                style={styles.switchRow}
                accessibilityRole="switch"
                accessibilityLabel={t('today.remindWeather')}
                accessibilityState={{ checked: settings.weatherReminders }}
                testID="cond-remind-weather-row"
              >
                <Text style={[styles.switchText, styles.flex]}>{t('today.remindWeather')}</Text>
                <Toggle
                  value={settings.weatherReminders}
                  onValueChange={toggleReminder}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  testID="cond-remind-weather"
                />
              </PressableScale>
            ) : null}
            {notice ? <Text style={styles.muted}>{notice}</Text> : null}

            {when === 'coming' && day.checks.length > 0 ? (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.alsoChecked')}
                </Text>
                <ChecksList checks={day.checks} />
              </>
            ) : null}
            {when !== 'past' ? <Text style={styles.disclaimer}>{t('conditions.disclaimer')}</Text> : null}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, gap: 12 },
  body: { gap: 10 },
  flex: { flex: 1 },
  refresh: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.success },
  dotStale: { backgroundColor: t.colors.warning },
  updated: { fontSize: 13.5, color: t.colors.textSecondary },
  message: { ...t.type.callout, color: t.colors.success, fontWeight: '600' },
  h2: { fontFamily: t.type.title.fontFamily, fontSize: 19, lineHeight: 24, fontWeight: 'normal', color: t.colors.textPrimary, marginTop: 10, marginHorizontal: 4 },
  h3: { ...t.type.callout, fontWeight: '700', color: t.colors.textSecondary },
  muted: { ...t.type.footnote, color: t.colors.textSecondary, marginHorizontal: 4 },
  keptBox: { gap: 2, marginHorizontal: 4 },
  keptRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44 },
  link: { ...t.type.footnote, fontWeight: '600', color: t.colors.link },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  switchText: { fontSize: 15, lineHeight: 20, fontWeight: '500', color: t.colors.textPrimary },
  disclaimer: { fontSize: 12.5, lineHeight: 18, color: t.colors.textSecondary, marginTop: 4, marginHorizontal: 4 },
}));
