/**
 * Today mode (trip planner step 9; docs/ui-refresh step 15, frame 32): on a trip day, the "Now" card in the
 * hero colour with the weather now; when to leave for the next stop ("Leave by 12:40", from your location if
 * you turned it on, else from the plan, plus the usual traffic), with Directions and "Running late?" (push
 * the rest of the day back, with a preview of what moves or is dropped, and Undo); "The rest of today", where
 * a stop with a warning says so and opens Conditions; the way back; what you spent today with "Add" (step 19);
 * the three switches. The evening before the trip it shows the first day ("Starts tomorrow"); "Full plan" opens
 * the trip screen.
 *
 * "Now" and "Leave by" come from the same state (today.ts's `nowView`), as on the plan's Now card.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { lateCard } from '../../../src/features/chat/onTheTrip';
import { useConversations } from '../../../src/features/chat/queries';
import { sendCard } from '../../../src/features/chat/share';
import { durationDays, localToday, parseDay, planPhase } from '../../../src/features/trips/dates';
import { isUnchecked } from '../../../src/features/places/kinds';
import { NotCheckedBadge } from '../../../src/features/places/NotCheckedBadge';
import { useConditionText } from '../../../src/features/trips/conditions/useConditionText';
import { cardTitle, MODE_ICON, priceText } from '../../../src/features/trips/plan/PlanRows';
import { dayParts } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { allowNotifications } from '../../../src/features/trips/today/reminders';
import { useTodaySettings } from '../../../src/features/trips/today/settings';
import { baseName, stayIcon } from '../../../src/features/trips/stays/stays';
import { NowCard } from '../../../src/features/trips/today/NowCard';
import { AddSpentSheet } from '../../../src/features/trips/budget/AddSpentSheet';
import { dayPlan } from '../../../src/features/trips/budget/spent';
import {
  backAt,
  dayFor,
  dayStart,
  directionsUrl,
  leaveBy,
  m2t,
  minuteOfDay,
  nowView,
  pointOf,
  t2m,
  todayState,
  type Point,
} from '../../../src/features/trips/today/today';
import { askForLocation, useHere } from '../../../src/features/trips/today/useHere';
import { useTripReminders } from '../../../src/features/trips/today/useTripReminders';
import { tripsApi } from '../../../src/services/api';
import type { Itinerary, ItineraryDay, LatePlan, LateUndo, TravelMode } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { LineIcon } from '../../../src/ui/LineIcon';
import { PressableScale } from '../../../src/ui/PressableScale';
import { Snackbar } from '../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { useReduceMotion } from '../../../src/ui/useReduceMotion';
import { Toggle } from '../../../src/ui/Toggle';

const LATE_OPTIONS = [15, 30, 60] as const;
const TICK_MS = 30_000;
const MODES: readonly TravelMode[] = ['walk', 'rickshaw', 'cng', 'car'];

export default function TodayScreen() {
  // `at` and `date` set the clock for testing, in development builds only
  // `late=1`: opened from the map's "Running late" (map home step 4)
  const params = useLocalSearchParams<{ id: string; at?: string; date?: string; late?: string }>();
  const tripId = Number(params.id);
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const conditionText = useConditionText();
  const me = useMe();
  // The trip's room, if friends plan it with you: running late can tell them (friends-chat step 8)
  const room = useConversations(!!me.data).data?.find((c) => c.kind === 'trip' && c.trip_id === tripId) ?? null;
  const [tellRoom, setTellRoom] = useState(true);
  const settings = useTodaySettings();
  // Large text: the next stop goes under the leave time, not squeezed beside it (seen at 1.6× in Bangla)
  const stacked = useWindowDimensions().fontScale >= 1.3;

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const today = (__DEV__ && params.date) || localToday(clock);
  const now = __DEV__ && params.at ? t2m(params.at) : minuteOfDay(clock);

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const itinerary = useQuery({ queryKey: ['itinerary', tripId], queryFn: () => tripsApi.getItinerary(tripId), enabled: !!tripId });
  const conditions = useQuery({ queryKey: ['conditions', tripId], queryFn: () => tripsApi.conditions(tripId), enabled: !!tripId, refetchInterval: 10 * 60_000 });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  useTripReminders(tripId, mine ? itinerary.data : undefined, mine ? conditions.data : undefined, today);
  const { here, status: hereStatus } = useHere(settings.useLocation);
  // What you spent today (docs/ui-refresh step 19): the budget's numbers, and the sheet to note one
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: !!tripId && mine });
  const [adding, setAdding] = useState(false);
  const spentToday = budget.data?.spent?.today ?? 0;
  const todayPlan = budget.data ? dayPlan(budget.data, today) : null;

  const days = itinerary.data?.days ?? [];
  // Today's day; before the trip, its first day (as it will be)
  const day: ItineraryDay | null = dayFor(days, today) ?? (days[0]?.day_date && days[0].day_date > today ? days[0] : null);
  const isToday = !!day && day.day_date === today;
  const minute = isToday ? now : -1;
  const state = useMemo(() => (day ? todayState(day, minute) : null), [day, minute]);
  const hotel: Point | null =
    itinerary.data?.hotel?.latitude != null && itinerary.data.hotel.longitude != null
      ? { lat: itinerary.data.hotel.latitude, lon: itinerary.data.hotel.longitude }
      : null;
  // From the day's stay (docs/trip-upgrades, step 2), and back to it after the last stop
  const leave = state ? leaveBy(state, dayStart(day, hotel), isToday && here ? here : null, day?.start_leg) : null;
  const back = backAt(day);
  const backName = baseName(day?.end_base, t);
  const backPoint: Point | null = day?.end_base?.latitude != null && day.end_base.longitude != null ? { lat: day.end_base.latitude, lon: day.end_base.longitude } : null;
  const view = isToday && state ? nowView(state, leave, now, back) : null;
  const condDay = conditions.data?.days.find((d) => d.day_id === day?.id);

  // Running late
  const [lateOpen, setLateOpen] = useState(params.late === '1');
  const [lateBy, setLateBy] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ message: string; undo?: { dayId: number; undo: LateUndo } } | null>(null);
  const preview = useQuery({
    queryKey: ['late', tripId, day?.id, m2t(now), lateBy],
    queryFn: () => tripsApi.late(tripId, day!.id, m2t(now), lateBy),
    enabled: lateOpen && !!day && isToday,
    staleTime: 0,
  });

  const landed = (newDay: ItineraryDay) => {
    queryClient.setQueryData<Itinerary>(['itinerary', tripId], (old) =>
      old ? { ...old, days: old.days.map((d) => (d.id === newDay.id ? newDay : d)) } : old,
    );
    for (const queryKey of [['itinerary', tripId], ['budget', tripId], ['conditions', tripId], ['dayRoute']]) queryClient.invalidateQueries({ queryKey });
  };
  const applyLate = async () => {
    if (!day) return;
    setBusy(true);
    try {
      const res = await tripsApi.applyLate(tripId, day.id, m2t(now), lateBy);
      landed(res.day);
      haptics.success();
      setLateOpen(false);
      if (room && tellRoom && me.data) sendCard(queryClient, me.data.id, room.id, lateCard(lateBy, 'today'));
      const parts = [t('today.lateApplied', { count: res.moved.length, n: f.n(res.moved.length) })];
      if (res.dropped.length) parts.push(t('today.lateDroppedCount', { count: res.dropped.length, n: f.n(res.dropped.length) }));
      setSnack({ message: parts.join(' · '), undo: { dayId: day.id, undo: res.undo } });
    } catch (e) {
      haptics.error();
      setSnack({ message: `${t('today.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  const undoLate = async () => {
    const u = snack?.undo;
    if (!u) return;
    setSnack(null);
    try {
      const res = await tripsApi.undoLate(tripId, u.dayId, u.undo);
      landed(res.day);
      setSnack({ message: t('today.undone') });
    } catch (e) {
      setSnack({ message: `${t('today.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // Switches: turning one on asks for its permission first
  const [notice, setNotice] = useState<string | null>(null);
  const toggleLocation = async (on: boolean) => {
    if (on && !(await askForLocation())) {
      setNotice(t('today.locationDenied'));
      return;
    }
    setNotice(null);
    settings.set({ useLocation: on });
  };
  const toggleReminder = async (key: 'leaveReminders' | 'weatherReminders', on: boolean) => {
    if (on && !(await allowNotifications(true))) {
      setNotice(t('today.notificationsDenied'));
      return;
    }
    setNotice(null);
    settings.set({ [key]: on });
  };

  if (!itinerary.data || !trip.data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('today.title') }} />
        {itinerary.isError ? <Text style={styles.muted}>{(itinerary.error as Error).message}</Text> : <ActivityIndicator color={theme.colors.link} />}
      </View>
    );
  }

  const name = trip.data.title || trip.data.destination;
  const totalDays = durationDays(trip.data.start_date, trip.data.end_date);
  // One rule for where the trip is (dates.ts): before it, how many days away
  const phase = planPhase(trip.data.start_date, trip.data.end_date, today);
  // "Mon 19 Oct", as on the day tabs
  const dateLabel = day?.day_date
    ? `${dayParts(day.day_date, i18n.language).weekday} ${dayParts(day.day_date, i18n.language).day} ${parseDay(day.day_date).toLocaleDateString(i18n.language, { month: 'short' })}`
    : '';
  const sub = day ? t('today.sub', { place: name, day: f.n(day.day_number), days: f.n(totalDays), date: dateLabel }) : name;
  const fullPlan = () => router.push({ pathname: '/trip/[id]', params: { id: tripId } });
  const openConditions = () => router.push({ pathname: '/trip/conditions/[id]', params: { id: tripId, day: day?.day_number ?? 1 } });
  const layout = reduceMotion ? undefined : LinearTransition.duration(220);
  const late = leave && isToday && leave.atMin < now ? now - leave.atMin : 0;
  const warningsFor = (itemId: number) => condDay?.warnings.filter((w) => w.item_id === itemId && !w.kept) ?? [];
  const items = day ? [...day.items].sort((a, b) => t2m(a.start_time) - t2m(b.start_time)) : [];
  // The rest of today: what's still to come (what's on now is in the Now card); before the trip, the whole day
  const rest = isToday ? items.filter((i) => t2m(i.start_time) > now && i.id !== state?.current?.id) : items;
  // The weather now: the forecast's hour that has begun
  const hour = isToday && condDay?.in_forecast ? [...condDay.hours].reverse().find((h) => t2m(h.time) <= now && h.code != null) : undefined;
  const weatherNow = hour
    ? { temp: hour.temp, code: hour.code, night: m2t(now) >= condDay!.sunset || m2t(now) < condDay!.sunrise, words: conditionText.sky(hour.code) }
    : null;
  const backMode = day?.return_leg && MODES.includes(day.return_leg.mode as TravelMode) ? (day.return_leg.mode as TravelMode) : null;
  const backLine = back
    ? [backMode ? t(`plan.modes.${backMode}`) : null, f.duration(back.minutes), back.cost > 0 ? t('plan.legFare', { amount: f.money(back.cost) }) : null].filter(Boolean).join(' · ')
    : '';
  // The way back in the list, after the last stop (meals where you stay come after it); after the last stop
  // it has a card of its own instead
  const showBackRow = !!back && !!backName && (!isToday || (t2m(back.at) > now && !!state?.next));

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('today.title'),
          headerRight: () => (
            <PressableScale pressEffect="opacity" onPress={fullPlan} style={styles.fullPlan} accessibilityRole="button" testID="today-full-plan">
              {/* (at the largest text it would squeeze the screen's title to "আ…") */}
              <Text style={styles.fullPlanText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {t('today.fullPlan')}
              </Text>
            </PressableScale>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <Text style={styles.sub}>{sub}</Text>

        {/* Now (frame 32): the hero card, with the weather now */}
        <NowCard
          variant="today"
          view={view}
          now={now}
          startsIn={phase.kind === 'before' ? phase.days : null}
          firstStart={items[0]?.start_time ?? null}
          back={back ? { at: back.at, minutes: back.minutes, place: backName, point: backPoint } : null}
          weather={weatherNow}
          onWeather={openConditions}
          testID="today-now"
        />
        {view?.kind === 'at' && isUnchecked(view.item.place) ? <NotCheckedBadge testID="today-now-unchecked" /> : null}

        {/* Next: leave by */}
        {state?.next ? (
          <Animated.View layout={layout} style={styles.card} testID="today-next">
            <View style={[styles.leaveTop, stacked && styles.leaveTopStacked]}>
              <View style={styles.leaveCol}>
                <Text style={styles.leaveLabel}>{late > 0 ? t('today.leaveNow') : t('today.leaveBy')}</Text>
                <Text style={[styles.leaveTime, late > 0 && styles.leaveLate]} maxFontSizeMultiplier={1.3} testID="today-leave-by">
                  {leave ? f.time(leave.at) : f.time(state.next.start_time)}
                </Text>
                {late > 0 ? (
                  <Text style={styles.behind}>{t('today.behind', { time: f.duration(late) })}</Text>
                ) : leave && isToday && leave.atMin > now ? (
                  <Text style={styles.leaveIn}>{t('today.inTime', { time: f.duration(leave.atMin - now) })}</Text>
                ) : null}
              </View>
              <View style={stacked ? styles.hline : styles.vline} />
              <View style={styles.nextCol}>
                <Text style={styles.nextLabel}>{t('today.nextLabel', { time: f.time(state.next.start_time) }).toUpperCase()}</Text>
                <Text style={styles.nextTitle}>{cardTitle(state.next, t)}</Text>
                {leave ? (
                  <View style={styles.rideRow}>
                    <MaterialCommunityIcons name={MODE_ICON[leave.mode]} size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.rideText}>
                      {[
                        leave.source === 'road' && leave.km
                          ? t('today.travelRoad', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes), km: f.km(leave.km) })
                          : t('today.travelAbout', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes) }),
                        leave.from === 'location'
                          ? t('today.fromHere')
                          : leave.from === 'hotel'
                            ? baseName(day?.start_base, t)
                              ? t('stays.from', { place: baseName(day?.start_base, t) })
                              : t('today.fromHotel')
                            : t('today.fromPrev', { place: state.previous ? cardTitle(state.previous, t) : '' }),
                      ].join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {leave?.traffic ? (
              <Text style={styles.note} testID="today-traffic">
                {t('today.usualTraffic', { time: f.duration(leave.traffic.extra) })}
              </Text>
            ) : null}
            {leave?.far ? (
              <Text style={styles.note} testID="today-far">
                {t('today.far', { place: cardTitle(state.next, t) })}
              </Text>
            ) : null}
            {late <= 0 && leave && state.current && leave.atMin < t2m(state.current.end_time) ? (
              // The plan has no time to get there after this stop (a meal "on the way"): say so
              <Text style={styles.note} testID="today-before-end">
                {t('today.beforeEnd', { time: f.duration(t2m(state.current.end_time) - leave.atMin), place: cardTitle(state.current, t) })}
              </Text>
            ) : null}
            {isUnchecked(state.next.place) ? <NotCheckedBadge testID="today-next-unchecked" /> : null}
            <View style={styles.buttons}>
              <PressableScale
                haptic="selection"
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => {
                  const to = pointOf(state.next!);
                  if (to) void Linking.openURL(directionsUrl(to, leave?.mode ?? 'cng'));
                }}
                accessibilityRole="link"
                accessibilityLabel={t('today.directionsA11y', { place: cardTitle(state.next, t) })}
                testID="today-directions"
              >
                <MaterialCommunityIcons name="navigation-variant-outline" size={18} color={theme.colors.onAccent} />
                <Text style={styles.buttonPrimaryText}>{t('today.directions')}</Text>
              </PressableScale>
              {mine && isToday ? (
                <PressableScale
                  haptic="selection"
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => setLateOpen((o) => !o)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: lateOpen }}
                  testID="today-late"
                >
                  <Text style={styles.buttonSecondaryText}>{t('today.late')}</Text>
                </PressableScale>
              ) : null}
            </View>

            {lateOpen ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(180)}
                exiting={reduceMotion ? undefined : FadeOut.duration(120)}
                style={styles.latePanel}
                testID="today-late-panel"
              >
                <Text style={styles.lateTitle}>{t('today.lateTitle')}</Text>
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {LATE_OPTIONS.map((m) => (
                    <PressableScale
                      key={m}
                      haptic="selection"
                      onPress={() => setLateBy(m)}
                      style={[styles.chip, lateBy === m && styles.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: lateBy === m }}
                      testID={`today-late-${m}`}
                    >
                      <Text style={[styles.chipText, lateBy === m && styles.chipTextOn]}>{m === 60 ? t('today.lateHour') : t('today.lateBy_min', { n: f.n(m) })}</Text>
                    </PressableScale>
                  ))}
                </View>
                <Text style={styles.lateEffect} accessibilityLiveRegion="polite" testID="today-late-effect">
                  {preview.data ? lateEffect(preview.data, t, f) : t('today.lateChecking')}
                </Text>
                {room ? (
                  <View style={styles.tellRow}>
                    <Text style={styles.tellText}>{t('today.tellRoom')}</Text>
                    <Toggle value={tellRoom} onValueChange={setTellRoom} accessibilityLabel={t('today.tellRoom')} testID="today-tell-room" />
                  </View>
                ) : null}
                <View style={styles.chips}>
                  <PressableScale
                    haptic="selection"
                    style={[styles.smallButton, styles.buttonPrimary]}
                    onPress={applyLate}
                    disabled={busy || !preview.data}
                    accessibilityRole="button"
                    testID="today-late-apply"
                  >
                    {busy ? <ActivityIndicator size="small" color={theme.colors.onAccent} /> : <Text style={styles.buttonPrimaryText}>{t('today.apply')}</Text>}
                  </PressableScale>
                  <PressableScale haptic="selection" style={[styles.smallButton, styles.outline]} onPress={() => setLateOpen(false)} accessibilityRole="button">
                    <Text style={styles.buttonSecondaryText}>{t('today.cancel')}</Text>
                  </PressableScale>
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : state && state.phase !== 'before' && !(back && backName) ? (
          // (with a way back to the stay, its card below says what's next)
          <View style={styles.card}>
            <Text style={styles.muted}>{t('today.noNext')}</Text>
          </View>
        ) : null}

        {/* After the last stop: the way back to where you sleep */}
        {back && backName && !state?.next ? (
          <View style={styles.card} testID="today-back">
            <View style={styles.backRow} accessible accessibilityLabel={t('today.backTo', { place: backName, time: f.time(back.at), travel: f.duration(back.minutes) })}>
              <View style={styles.backIcon}>
                <MaterialCommunityIcons name={stayIcon(day!.end_base!.kind)} size={22} color={theme.colors.textSecondary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.backTitle}>{t('today.backAbout', { place: backName, time: f.time(back.at) })}</Text>
                {backLine ? <Text style={styles.restSub}>{backLine}</Text> : null}
              </View>
            </View>
            {backPoint ? (
              <PressableScale
                haptic="selection"
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => void Linking.openURL(directionsUrl(backPoint, backMode ?? 'cng'))}
                accessibilityRole="link"
                accessibilityLabel={t('today.directionsA11y', { place: backName })}
                testID="today-back-directions"
              >
                <MaterialCommunityIcons name="navigation-variant-outline" size={18} color={theme.colors.onAccent} />
                <Text style={styles.buttonPrimaryText}>{t('today.directions')}</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        {/* The rest of today: one list; a stop with a warning says so and opens Conditions */}
        {day && (rest.length || showBackRow) ? (
          <>
            <Text style={styles.h2} accessibilityRole="header">
              {isToday ? t('today.restTitle') : t('today.dayTitle')}
            </Text>
            <View style={styles.list}>
              {(() => {
                const rows: React.ReactNode[] = [];
                const stops = rest.filter((i) => i.meal_source !== 'stay');
                const lastStop = stops[stops.length - 1];
                const pushBack = () =>
                  rows.push(
                    <View key="back" style={styles.restRow} accessible testID="today-back-row">
                      <Text style={styles.restTime}>{f.time(back!.at)}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.restTitle}>{t('stays.backAt', { place: backName })}</Text>
                        {backLine ? <Text style={styles.restSub}>{backLine}</Text> : null}
                      </View>
                    </View>,
                  );
                let backDone = false;
                rest.forEach((item) => {
                  // The way back comes after the last stop, before dinner where you stay
                  if (showBackRow && !backDone && item.meal_source === 'stay' && (!lastStop || t2m(item.start_time) >= t2m(lastStop.end_time))) {
                    pushBack();
                    backDone = true;
                  }
                  const ws = warningsFor(item.id);
                  const next = state?.next?.id === item.id;
                  const body = (
                    <>
                      <Text style={styles.restTime}>{f.time(item.start_time)}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.restTitle} numberOfLines={2}>
                          {cardTitle(item, t)}
                        </Text>
                        <Text style={styles.restSub}>{[f.duration(item.duration_minutes), priceText(item, t, f)].join(' · ')}</Text>
                        {ws.length ? (
                          <View style={styles.warnRow}>
                            <MaterialCommunityIcons name="alert-outline" size={15} color={theme.colors.warning} />
                            <Text style={styles.warnText}>{conditionText.title(ws[0])}</Text>
                          </View>
                        ) : null}
                        {isUnchecked(item.place) ? <NotCheckedBadge testID={`today-unchecked-${item.id}`} /> : null}
                      </View>
                      {next ? (
                        <View style={styles.nextPill}>
                          <Text style={styles.nextPillText}>{t('plan.statusNext')}</Text>
                        </View>
                      ) : ws.length ? (
                        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
                      ) : null}
                    </>
                  );
                  rows.push(
                    ws.length ? (
                      <PressableScale
                        key={item.id}
                        pressEffect="opacity"
                        haptic="selection"
                        onPress={openConditions}
                        style={styles.restRow}
                        accessibilityRole="button"
                        accessibilityHint={t('conditions.openHint')}
                        testID={`today-item-${item.id}`}
                      >
                        {body}
                      </PressableScale>
                    ) : (
                      <Animated.View key={item.id} layout={layout} style={styles.restRow} testID={`today-item-${item.id}`}>
                        {body}
                      </Animated.View>
                    ),
                  );
                });
                if (showBackRow && !backDone) pushBack();
                return rows.map((row, i) => (
                  <React.Fragment key={i}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    {row}
                  </React.Fragment>
                ));
              })()}
            </View>
          </>
        ) : null}

        {/* What you spent today (frame 32), with "Add"; the plan for today when nothing is noted */}
        {mine && isToday && phase.kind === 'on' && !trip.data.not_taken && budget.data ? (
          <View style={styles.spentRow} testID="today-spent">
            <View style={styles.backIcon}>
              <LineIcon name="wallet" size={22} color={theme.colors.textSecondary} />
            </View>
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={() => router.push({ pathname: '/trip/budget/[id]', params: { id: tripId } })}
              style={styles.flex}
              accessibilityRole="button"
              testID="today-spent-open"
            >
              <Text style={styles.backTitle}>
                {spentToday > 0 ? t('spent.todayRow', { amount: f.money(spentToday) }) : t('spent.nothingToday')}
              </Text>
              {todayPlan ? (
                <Text style={styles.restSub}>{t('spent.todayPlan', { amount: `${todayPlan.estimate ? '≈\u00A0' : ''}${f.money(todayPlan.amount)}` })}</Text>
              ) : null}
            </PressableScale>
            <PressableScale
              haptic="selection"
              onPress={() => setAdding(true)}
              style={styles.spentAdd}
              accessibilityRole="button"
              accessibilityLabel={t('spent.todayAddA11y')}
              testID="today-spent-add"
            >
              <LineIcon name="plus" size={17} color={theme.colors.onAccentSoft} strokeWidth={2.4} />
              <Text style={styles.spentAddText}>{t('spent.add')}</Text>
            </PressableScale>
          </View>
        ) : null}

        {/* Switches, in one card */}
        {mine ? (
          <View style={styles.switches}>
            <ToggleRow
              title={t('today.useLocation')}
              sub={
                settings.useLocation && hereStatus === 'denied'
                  ? t('today.locationDenied')
                  : settings.useLocation && hereStatus === 'asking'
                    ? t('today.locationWaiting')
                    : t('today.useLocationSub')
              }
              value={settings.useLocation}
              onChange={toggleLocation}
              testID="today-use-location"
            />
            <ToggleRow
              title={t('today.remindLeave')}
              // From Android 14 the phone may delay reminders unless "Alarms & reminders" is allowed
              sub={settings.leaveReminders && Platform.OS === 'android' && Number(Platform.Version) >= 34 ? t('today.exactHint') : undefined}
              value={settings.leaveReminders}
              onChange={(v) => toggleReminder('leaveReminders', v)}
              testID="today-remind-leave"
            />
            {settings.leaveReminders && Platform.OS === 'android' && Number(Platform.Version) >= 34 ? (
              <PressableScale pressEffect="opacity" onPress={() => void Linking.openSettings()} style={styles.settingsLink} accessibilityRole="link">
                <Text style={styles.settingsLinkText}>{t('today.openSettings')}</Text>
              </PressableScale>
            ) : null}
            <ToggleRow title={t('today.remindWeather')} value={settings.weatherReminders} onChange={(v) => toggleReminder('weatherReminders', v)} testID="today-remind-weather" last />
          </View>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Text style={styles.footnote}>{t('today.footnote')}</Text>
      </ScrollView>
      {mine ? (
        <AddSpentSheet
          visible={adding}
          tripId={tripId}
          start={trip.data.start_date}
          end={trip.data.end_date}
          travellers={trip.data.num_travelers}
          today={today}
          editing={null}
          onClose={() => setAdding(false)}
          onDone={({ message }) => {
            setAdding(false);
            setSnack({ message });
          }}
        />
      ) : null}
      <Snackbar message={snack?.message ?? null} actionLabel={snack?.undo ? t('plan.undo') : undefined} onAction={undoLate} testID="today-snackbar" />
    </View>
  );
}

type T = ReturnType<typeof useTranslation>['t'];
type F = ReturnType<typeof usePlanFormat>;

/** "Lunch moves to 12:40. Sunset Boat Ride stays at 15:45." or what's dropped and why. */
export function lateEffect(plan: LatePlan, t: T, f: F): string {
  if (!plan.moved.length && !plan.dropped.length) return t('today.lateNothing');
  const lines = [
    ...plan.moved.slice(0, 3).map((m) => t('today.lateMoves', { place: m.title, time: f.time(m.to) })),
    ...plan.kept.slice(0, 2).map((k) => t('today.lateKept', { place: k.title, time: f.time(k.at) })),
    ...plan.dropped.map((d) =>
      t('today.lateDropped', {
        place: d.title,
        why: t(`today.why.${d.reason.code}`, {
          ...d.reason,
          end: 'end' in d.reason ? f.time(d.reason.end) : '',
          closes: 'closes' in d.reason ? f.time(d.reason.closes) : '',
          at: 'at' in d.reason ? f.time(d.reason.at) : '',
        }),
      }),
    ),
  ];
  return lines.join(' ');
}

function ToggleRow({
  title,
  sub,
  value,
  onChange,
  testID,
  last,
}: {
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={() => onChange(!value)}
      style={[styles.toggle, !last && styles.rowLine]}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={sub}
      accessibilityState={{ checked: value }}
      testID={`${testID}-row`}
    >
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <Toggle testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden value={value} onValueChange={onChange} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => {
  const card = {
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.shadow,
    shadowOpacity: t.scheme === 'dark' ? 0 : 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: t.scheme === 'dark' ? 0 : 1,
  } as const;
  return {
    container: { flex: 1, backgroundColor: t.colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: t.spacing.lg, paddingTop: 4, gap: 12 },
    flex: { flex: 1, minWidth: 0 },
    sub: { fontSize: 14, color: t.colors.textSecondary, paddingHorizontal: 4 },
    muted: { ...t.type.callout, color: t.colors.textSecondary },
    // Frame 32: the blue-tint pill in the header
    fullPlan: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.colors.accentTint, justifyContent: 'center' },
    fullPlanText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccentSoft },
    card: { ...card, padding: 16, gap: 12 },
    leaveTop: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
    leaveCol: { flexShrink: 0 },
    leaveLabel: { fontSize: 13, color: t.colors.textSecondary },
    leaveTime: { ...t.type.title, fontSize: 44, lineHeight: 48, color: t.colors.textPrimary },
    leaveLate: { color: t.colors.danger },
    leaveIn: { fontSize: 13.5, color: t.colors.textSecondary },
    behind: { fontSize: 13.5, fontWeight: '600', color: t.colors.danger },
    vline: { width: 1, backgroundColor: t.colors.divider },
    leaveTopStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
    hline: { height: 1, backgroundColor: t.colors.divider },
    nextCol: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 },
    nextLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, color: t.colors.link },
    nextTitle: { fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
    rideRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rideText: { flex: 1, fontSize: 13, color: t.colors.textSecondary },
    note: { fontSize: 13.5, fontWeight: '600', color: t.colors.warning },
    buttons: { flexDirection: 'row', gap: 8 },
    button: { flex: 1, minHeight: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
    buttonPrimary: { backgroundColor: t.colors.accentStrong },
    buttonPrimaryText: { fontSize: 15.5, fontWeight: '500', color: t.colors.onAccent },
    buttonSecondary: { backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset },
    buttonSecondaryText: { fontSize: 15.5, fontWeight: '500', color: t.colors.textPrimary },
    latePanel: { padding: 14, borderRadius: 18, backgroundColor: t.scheme === 'dark' ? t.colors.surfaceInset : t.colors.bg, gap: 10 },
    lateTitle: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
    chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: t.colors.surface, justifyContent: 'center' },
    chipOn: { backgroundColor: t.colors.accentStrong },
    chipText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
    chipTextOn: { color: t.colors.onAccent },
    lateEffect: { fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
    tellRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    tellText: { fontSize: 15, color: t.colors.textPrimary, flex: 1 },
    smallButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    outline: { borderWidth: 1, borderColor: t.colors.divider },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset },
    backTitle: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
    h2: { ...t.type.title, fontSize: 19, lineHeight: 24, color: t.colors.textPrimary, marginTop: 8, paddingHorizontal: 4 },
    list: { ...card },
    divider: { height: 1, marginLeft: 16, backgroundColor: t.colors.divider },
    restRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8, paddingLeft: 16, paddingRight: 14 },
    restTime: { width: 44, fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
    restTitle: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
    restSub: { fontSize: 13, color: t.colors.textSecondary, marginTop: 2 },
    warnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    warnText: { flex: 1, fontSize: 13, fontWeight: '500', color: t.colors.warning },
    nextPill: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', backgroundColor: t.colors.accentTint },
    nextPillText: { fontSize: 12, fontWeight: '700', color: t.colors.onAccentSoft },
    // Frame 32: what you spent today, its wallet in a grey square and "Add" on the blue tint
    spentRow: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 12, paddingRight: 10 },
    spentAdd: {
      minHeight: 44,
      paddingLeft: 12,
      paddingRight: 16,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: t.colors.accentTint,
    },
    spentAddText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccentSoft },
    switches: { ...card },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10, paddingLeft: 16, paddingRight: 14 },
    toggleTitle: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
    toggleSub: { fontSize: 12.5, color: t.colors.textSecondary, marginTop: 2 },
    rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
    notice: { fontSize: 13, color: t.colors.warning },
    settingsLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 16 },
    settingsLinkText: { fontSize: 13, fontWeight: '700', color: t.colors.link },
    footnote: { fontSize: 12.5, lineHeight: 18, color: t.colors.textSecondary, paddingHorizontal: 4 },
  };
});
