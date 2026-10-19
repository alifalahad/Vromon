/**
 * Today mode (trip planner step 9, the "Today on the trip" mockup): on a trip
 * day, what's on now, when to leave for the next stop ("Leave by 14:05", from
 * your location if you turned it on, else from the plan, plus the usual
 * traffic), directions in Google Maps, "Running late?" (push the rest of the day
 * back, with a preview of what moves or is dropped, and Undo), reminders, and the
 * rest of the day. Before the trip it shows the first day; "Full plan" opens the
 * trip screen.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { durationDays, localToday, parseDay } from '../../../src/features/trips/dates';
import { MODE_ICON } from '../../../src/features/trips/plan/PlanRows';
import { dayParts, stopTitle } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { allowNotifications } from '../../../src/features/trips/today/reminders';
import { useTodaySettings } from '../../../src/features/trips/today/settings';
import { dayFor, directionsUrl, leaveBy, m2t, minuteOfDay, pointOf, t2m, todayState, type Point } from '../../../src/features/trips/today/today';
import { askForLocation, useHere } from '../../../src/features/trips/today/useHere';
import { useTripReminders } from '../../../src/features/trips/today/useTripReminders';
import { tripsApi } from '../../../src/services/api';
import type { Itinerary, ItineraryDay, LatePlan, LateUndo } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { Snackbar } from '../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { ON_SUNSET, SUNSET_CARD } from '../../../src/ui/theme/cards';
import { useReduceMotion } from '../../../src/ui/useReduceMotion';

const SUNSET = SUNSET_CARD;
const ON = ON_SUNSET;
const LATE_OPTIONS = [15, 30, 60] as const;
const TICK_MS = 30_000;

export default function TodayScreen() {
  // `at` and `date` set the clock for testing, in development builds only
  const params = useLocalSearchParams<{ id: string; at?: string; date?: string }>();
  const tripId = Number(params.id);
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const me = useMe();
  const settings = useTodaySettings();

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
  const leave = state ? leaveBy(state, hotel, isToday && here ? here : null) : null;
  const condDay = conditions.data?.days.find((d) => d.day_id === day?.id);

  // Running late
  const [lateOpen, setLateOpen] = useState(false);
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
  // "Mon 19 Oct", as on the day tabs
  const dateLabel = day?.day_date
    ? `${dayParts(day.day_date, i18n.language).weekday} ${dayParts(day.day_date, i18n.language).day} ${parseDay(day.day_date).toLocaleDateString(i18n.language, { month: 'short' })}`
    : '';
  const sub = day ? t('today.sub', { place: name, day: f.n(day.day_number), days: f.n(totalDays), date: dateLabel }) : name;
  const fullPlan = () => router.push({ pathname: '/trip/[id]', params: { id: tripId } });
  const layout = reduceMotion ? undefined : LinearTransition.duration(220);
  const late = leave && isToday && leave.atMin < now ? now - leave.atMin : 0;
  const warningsFor = (itemId: number) => condDay?.warnings.filter((w) => w.item_id === itemId && !w.kept) ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('today.title'),
          headerRight: () => (
            <PressableScale pressEffect="opacity" onPress={fullPlan} style={styles.fullPlan} accessibilityRole="button" testID="today-full-plan">
              <Text style={styles.fullPlanText}>{t('today.fullPlan')}</Text>
            </PressableScale>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <Text style={styles.sub}>{sub}</Text>

        {/* Now */}
        <NowCard day={day} state={state} isToday={isToday} now={now} today={today} startDate={trip.data.start_date} />

        {/* Next: leave by */}
        {state?.next ? (
          <Animated.View layout={layout} style={styles.card} testID="today-next">
            <View style={styles.leaveRow}>
              <View>
                <Text style={styles.leaveLabel}>{late > 0 ? t('today.leaveNow') : t('today.leaveBy')}</Text>
                <Text style={[styles.leaveTime, late > 0 && styles.leaveLate]} testID="today-leave-by">
                  {leave ? f.time(leave.at) : f.time(state.next.start_time)}
                </Text>
              </View>
              {leave?.traffic ? (
                <Text style={styles.traffic} testID="today-traffic">
                  {t('today.usualTraffic', { time: f.duration(leave.traffic.extra) }).toUpperCase()}
                </Text>
              ) : null}
            </View>
            {late > 0 ? <Text style={styles.behind}>{t('today.behind', { time: f.duration(late) })}</Text> : null}
            {leave?.far ? (
              <Text style={styles.beforeEnd} testID="today-far">{t('today.far', { place: stopTitle(state.next) })}</Text>
            ) : null}
            {late <= 0 && leave && state.current && leave.atMin < t2m(state.current.end_time) ? (
              // The plan has no time to get there after this stop (a meal "on the way"): say so
              <Text style={styles.beforeEnd} testID="today-before-end">
                {t('today.beforeEnd', { time: f.duration(t2m(state.current.end_time) - leave.atMin), place: stopTitle(state.current) })}
              </Text>
            ) : null}
            {leave ? (
              <View style={styles.travelRow}>
                <MaterialCommunityIcons name={MODE_ICON[leave.mode]} size={20} color={theme.colors.textSecondary} />
                <Text style={styles.travelText}>
                  {[
                    leave.source === 'road' && leave.km
                      ? t('today.travelRoad', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes), km: f.km(leave.km) })
                      : t('today.travelAbout', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes) }),
                    leave.from === 'location'
                      ? t('today.fromHere')
                      : leave.from === 'hotel'
                        ? t('today.fromHotel')
                        : t('today.fromPrev', { place: state.previous ? stopTitle(state.previous) : '' }),
                  ].join(' · ')}
                </Text>
              </View>
            ) : null}
            <Text style={styles.nextText}>{t('today.nextAt', { place: stopTitle(state.next), time: f.time(state.next.start_time) })}</Text>
            <View style={styles.buttons}>
              <PressableScale
                haptic="selection"
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => {
                  const to = pointOf(state.next!);
                  if (to) void Linking.openURL(directionsUrl(to, leave?.mode ?? 'cng'));
                }}
                accessibilityRole="link"
                accessibilityLabel={t('today.directionsA11y', { place: stopTitle(state.next) })}
                testID="today-directions"
              >
                <MaterialCommunityIcons name="navigation-variant-outline" size={20} color={theme.colors.onAccent} />
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
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} style={styles.latePanel} testID="today-late-panel">
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
                      <Text style={[styles.chipText, lateBy === m && styles.chipTextOn]}>
                        {m === 60 ? t('today.lateHour') : t('today.lateBy_min', { n: f.n(m) })}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
                <Text style={styles.lateEffect} accessibilityLiveRegion="polite" testID="today-late-effect">
                  {preview.data ? lateEffect(preview.data, t, f) : t('today.lateChecking')}
                </Text>
                <View style={styles.chips}>
                  <PressableScale haptic="selection" style={[styles.smallButton, styles.buttonPrimary]} onPress={applyLate} disabled={busy || !preview.data} accessibilityRole="button" testID="today-late-apply">
                    {busy ? <ActivityIndicator size="small" color={theme.colors.onAccent} /> : <Text style={styles.buttonPrimaryText}>{t('today.apply')}</Text>}
                  </PressableScale>
                  <PressableScale haptic="selection" style={[styles.smallButton, styles.outline]} onPress={() => setLateOpen(false)} accessibilityRole="button">
                    <Text style={styles.buttonSecondaryText}>{t('today.cancel')}</Text>
                  </PressableScale>
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : state && state.phase !== 'before' ? (
          <View style={styles.card}>
            <Text style={styles.muted}>{t('today.noNext')}</Text>
          </View>
        ) : null}

        {/* Switches */}
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

        {/* The day */}
        {day ? (
          <>
            <Text style={styles.h2} accessibilityRole="header">{isToday ? t('today.restTitle') : t('today.dayTitle')}</Text>
            <View style={styles.list}>
              {[...day.items]
                .sort((a, b) => t2m(a.start_time) - t2m(b.start_time))
                .map((item, i, all) => {
                  const done = isToday && t2m(item.end_time) <= now;
                  const ws = warningsFor(item.id);
                  return (
                    <Animated.View
                      key={item.id}
                      layout={layout}
                      style={[styles.restRow, i < all.length - 1 && styles.rowLine, done && styles.done]}
                      testID={`today-item-${item.id}`}
                    >
                      <Text style={styles.restTime}>{f.time(item.start_time)}</Text>
                      <Text style={styles.restTitle} numberOfLines={2}>{stopTitle(item)}</Text>
                      {ws.length ? <Text style={styles.warnTag}>{t(`today.warn.${ws[0].code}`).toUpperCase()}</Text> : null}
                      {done ? <MaterialCommunityIcons name="check" size={18} color={theme.colors.success} accessibilityLabel={t('today.done')} /> : null}
                    </Animated.View>
                  );
                })}
            </View>
          </>
        ) : null}

        <Text style={styles.footnote}>{t('today.footnote')}</Text>
      </ScrollView>
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
    ...plan.dropped.map((d) => t('today.lateDropped', { place: d.title, why: t(`today.why.${d.reason.code}`, { ...d.reason, end: 'end' in d.reason ? f.time(d.reason.end) : '', closes: 'closes' in d.reason ? f.time(d.reason.closes) : '', at: 'at' in d.reason ? f.time(d.reason.at) : '' }) })),
  ];
  return lines.join(' ');
}

function NowCard({
  day,
  state,
  isToday,
  now,
  today,
  startDate,
}: {
  day: ItineraryDay | null;
  state: ReturnType<typeof todayState> | null;
  isToday: boolean;
  now: number;
  today: string;
  startDate: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  let label: string;
  let title: string;
  let line: string | null = null;
  let progress: number | null = null;
  if (!day || !state) {
    label = t('today.title').toUpperCase();
    title = t('today.dayDone');
  } else if (!isToday) {
    const away = durationDays(today, startDate) - 1;
    label = t('today.startsIn', { when: away <= 1 ? t('today.tomorrow') : t('today.inDays', { count: away, n: f.n(away) }) }).toUpperCase();
    title = t('today.beforeDay');
    line = state.next ? t('today.startsAt', { time: f.time([...day.items].sort((a, b) => t2m(a.start_time) - t2m(b.start_time))[0]?.start_time ?? '') }) : null;
  } else {
    label = t('today.now', { time: f.time(m2t(now)) }).toUpperCase();
    if (state.current) {
      const s = t2m(state.current.start_time);
      const e = t2m(state.current.end_time);
      title = stopTitle(state.current);
      line = t('today.until', { end: f.time(state.current.end_time), left: f.duration(e - now) });
      progress = Math.min(1, Math.max(0, (now - s) / Math.max(1, e - s)));
    } else if (state.phase === 'before') {
      title = t('today.beforeDay');
      line = state.rest[0] ? t('today.startsAt', { time: f.time(state.rest[0].start_time) }) : null;
    } else if (state.phase === 'after') {
      title = t('today.dayDone');
      line = t('today.dayDoneBody');
    } else {
      title = t('today.freeTime');
      line = state.rest[0] ? t('today.freeUntil', { time: f.time(state.rest[0].start_time) }) : null;
    }
  }
  return (
    <View style={styles.now} testID="today-now" accessible accessibilityLabel={[label, title, line].filter(Boolean).join('. ')}>
      <Text style={styles.nowLabel}>{label}</Text>
      <Text style={styles.nowTitle}>{title}</Text>
      {line ? <Text style={styles.nowLine}>{line}</Text> : null}
      {progress != null ? (
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
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
  const { colors } = useTheme();
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
      <Switch
        testID={testID}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
        thumbColor={colors.onAccent}
      />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: t.spacing.lg, gap: 14 },
  flex: { flex: 1 },
  sub: { ...t.type.footnote, color: t.colors.textSecondary },
  muted: { ...t.type.callout, color: t.colors.textSecondary },
  fullPlan: { height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.colors.surface, justifyContent: 'center' },
  fullPlanText: { ...t.type.callout, fontSize: 14, fontWeight: '600', color: t.colors.link },
  now: { padding: 18, borderRadius: 24, backgroundColor: SUNSET, gap: 6 },
  nowLabel: { ...t.type.footnote, fontWeight: '700', letterSpacing: 0.6, color: ON },
  nowTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: ON },
  nowLine: { ...t.type.callout, color: ON },
  progress: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ON },
  card: { padding: 18, borderRadius: 24, backgroundColor: t.colors.surface, gap: 12 },
  leaveRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.spacing.md },
  leaveLabel: { ...t.type.footnote, color: t.colors.textSecondary },
  leaveTime: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, color: t.colors.textPrimary },
  leaveLate: { color: t.colors.danger },
  traffic: { ...t.type.caption, fontWeight: '700', color: t.colors.warning, paddingBottom: 6, flexShrink: 1, textAlign: 'right' },
  behind: { ...t.type.callout, fontWeight: '600', color: t.colors.danger },
  beforeEnd: { ...t.type.callout, fontWeight: '600', color: t.colors.warning },
  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  travelText: { ...t.type.callout, color: t.colors.textPrimary, flex: 1 },
  nextText: { ...t.type.callout, color: t.colors.textSecondary },
  buttons: { flexDirection: 'row', gap: t.spacing.sm },
  button: { flex: 1, minHeight: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.md },
  buttonPrimary: { backgroundColor: t.colors.accent },
  buttonPrimaryText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccent },
  buttonSecondary: { backgroundColor: t.colors.surfaceInset },
  buttonSecondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  latePanel: { padding: 14, borderRadius: 16, backgroundColor: t.colors.surfaceInset, gap: 10 },
  lateTitle: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  chips: { flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  chipTextOn: { color: t.colors.onAccent },
  lateEffect: { ...t.type.callout, fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
  smallButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  outline: { borderWidth: 1, borderColor: t.colors.divider },
  switches: { borderRadius: 20, backgroundColor: t.colors.surface, paddingHorizontal: t.spacing.lg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60, paddingVertical: t.spacing.md },
  toggleTitle: { ...t.type.body, color: t.colors.textPrimary },
  toggleSub: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 2 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  notice: { ...t.type.footnote, color: t.colors.warning },
  settingsLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  settingsLinkText: { ...t.type.footnote, fontWeight: '700', color: t.colors.link },
  h2: { ...t.type.headline, fontSize: 18, color: t.colors.textPrimary, marginTop: 4 },
  list: { borderRadius: 20, backgroundColor: t.colors.surface, paddingHorizontal: t.spacing.lg, paddingVertical: 4 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 56 },
  done: { opacity: 0.6 },
  restTime: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary, width: 52 },
  restTitle: { ...t.type.callout, color: t.colors.textPrimary, flex: 1 },
  warnTag: { ...t.type.caption, fontWeight: '700', color: t.colors.danger },
  footnote: { ...t.type.footnote, color: t.colors.textTertiary, lineHeight: 19 },
}));
