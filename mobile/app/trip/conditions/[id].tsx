/**
 * Conditions for one day of a trip (trip planner step 6), answers first:
 * what the day will be like, what to know (warnings, each with its reason,
 * source and age, and "Move to …" / "Keep"), the weather at each of your stops,
 * then the hours, the sea and what else was checked. "Refresh" asks again.
 * Vromon warns from this data only and never says a place or road is safe.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { daySky, isSerious, sky, useConditionText, warningIcon } from '../../../src/features/trips/conditions/useConditionText';
import { parseDay } from '../../../src/features/trips/dates';
import { orderedStops, stopTitle } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { ConditionWarning, ConditionsDay } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

const night = (time: string, d: ConditionsDay) => time < d.sunrise || time >= d.sunset;

export default function ConditionsScreen() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day?: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const me = useMe();
  const [dayNumber, setDayNumber] = useState(Number(dayParam) || 1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
  const day = data?.days.find((d) => d.day_number === dayNumber) ?? data?.days[0];
  const planDay = itinerary.data?.days.find((d) => d.id === day?.day_id);

  const refresh = async () => {
    setRefreshing(true);
    haptics.selection();
    try {
      queryClient.setQueryData(['conditions', tripId], await tripsApi.conditions(tripId, true));
      setMessage(null);
    } catch {
      setMessage(t('conditions.refreshFailed'));
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

  const dateLabel = (d: ConditionsDay) =>
    d.date ? f.time(parseDay(d.date).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })) : '';

  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('conditions.title') }} />
        {conditions.isError ? <Text style={styles.muted}>{(conditions.error as Error).message}</Text> : <ActivityIndicator color={colors.link} />}
      </View>
    );
  }

  const active = day?.warnings.filter((w) => !w.kept) ?? [];
  const kept = day?.warnings.filter((w) => w.kept) ?? [];
  const stops = planDay ? orderedStops(planDay).filter((i) => day?.items[String(i.id)]) : [];
  const rain = day?.rain_max ?? 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('conditions.title') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.link} colors={[colors.accent]} />}
      >
        {/* When it was updated, and a way to update it now */}
        <View style={styles.updatedRow}>
          <View style={[styles.dot, data.stale && styles.dotStale]} />
          <Text style={[styles.updated, styles.flex]} accessibilityLiveRegion="polite" testID="conditions-updated">
            {data.fetched_at
              ? [t('conditions.updated', { age: text.age(data.fetched_at) }), data.stale ? t('conditions.stale') : null].filter(Boolean).join(' · ')
              : t('conditions.never')}
          </Text>
          <PressableScale
            haptic="none"
            onPress={refresh}
            disabled={refreshing}
            style={styles.refresh}
            accessibilityRole="button"
            accessibilityLabel={t('conditions.refresh')}
            accessibilityState={{ busy: refreshing }}
            testID="conditions-refresh"
          >
            {refreshing ? <ActivityIndicator size="small" color={colors.link} /> : <MaterialCommunityIcons name="refresh" size={18} color={colors.link} />}
            <Text style={styles.refreshText}>{t('conditions.refresh')}</Text>
          </PressableScale>
        </View>

        {data.days.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow} accessibilityRole="tablist">
            {data.days.map((d) => {
              const on = d.day_number === day?.day_number;
              return (
                <PressableScale
                  key={d.day_id}
                  haptic="selection"
                  onPress={() => setDayNumber(d.day_number)}
                  style={[styles.dayChip, on && styles.dayChipOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  testID={`cond-day-${d.day_number}`}
                >
                  <Text style={[styles.dayChipText, on && styles.onAccent]}>{t('plan.day', { n: f.n(d.day_number) })}</Text>
                  <Text style={[styles.dayChipSub, on && styles.onAccent]}>{dateLabel(d)}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        )}

        {day && (
          <Animated.View key={day.day_id} entering={FadeIn.duration(200)} style={styles.body}>
            {/* The day in one look */}
            <View style={styles.summary} testID="cond-summary">
              {day.in_forecast ? (
                <>
                  <View style={styles.summaryTop}>
                    <MaterialCommunityIcons name={sky(daySky(day)).icon} size={52} color={(daySky(day) ?? 0) >= 95 ? colors.danger : colors.warning} />
                    <View style={styles.flex}>
                      <Text style={styles.summarySky}>{text.sky(daySky(day))}</Text>
                      <Text style={styles.summaryTemp}>
                        {t('conditions.range', { min: f.n(day.temp_min ?? 0), max: f.n(day.temp_max ?? 0) })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.summaryLine}>
                    <MaterialCommunityIcons name="water-outline" size={18} color={rain >= 60 ? colors.warning : colors.link} />
                    <Text style={styles.summaryText}>
                      {rain >= 60
                        ? t('conditions.rainLikelyDay', { n: f.n(rain) })
                        : rain >= 25
                          ? t('conditions.rainMaybeDay', { n: f.n(rain) })
                          : t('conditions.rainUnlikelyDay')}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.summaryLine}>
                  <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.textSecondary} />
                  <Text style={[styles.summaryText, styles.flex]}>
                    {data.forecast_until ? t('conditions.beyond', { date: dateLabelOf(data.forecast_until, i18n.language, f.time) }) : t('conditions.noForecast')}
                  </Text>
                </View>
              )}
              <View style={styles.summaryLine}>
                <MaterialCommunityIcons name="weather-sunset" size={18} color={colors.warning} />
                <Text style={styles.summaryText}>{t('conditions.sunLine', { rise: f.time(day.sunrise), set: f.time(day.sunset) })}</Text>
              </View>
            </View>

            {message && (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.message} accessibilityLiveRegion="polite">
                {message}
              </Animated.Text>
            )}

            {/* What to know */}
            <Text style={styles.h2} accessibilityRole="header">
              {active.length ? t('conditions.toKnow', { count: active.length, n: f.n(active.length) }) : t('conditions.allGood')}
            </Text>
            {active.length === 0 && <Text style={styles.muted}>{t('conditions.allGoodHint')}</Text>}
            {active.map((w) => (
              <WarningCard
                key={w.key}
                warning={w}
                fetchedAt={data.fetched_at}
                seaAt={data.sea_fetched_at}
                busy={busyKey === w.key}
                onMove={mine && w.move_to ? () => move(w) : undefined}
                onKeep={mine && w.item_id ? () => keep(w, true) : undefined}
              />
            ))}
            {kept.length > 0 && (
              <View style={styles.keptBox}>
                <Text style={styles.h3}>{t('conditions.keptTitle')}</Text>
                {kept.map((w) => (
                  <View key={w.key} style={styles.keptRow}>
                    <MaterialCommunityIcons name={warningIcon(w.code)} size={18} color={colors.textTertiary} />
                    <Text style={[styles.muted, styles.flex]}>{text.title(w)}</Text>
                    {mine && (
                      <PressableScale pressEffect="opacity" haptic="selection" onPress={() => keep(w, false)} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.link}>{t('conditions.showAgain')}</Text>
                      </PressableScale>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* The weather at each stop, when you're there */}
            {stops.length > 0 && (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.atStops')}
                </Text>
                <View style={styles.list}>
                  {stops.map((item, i) => {
                    const w = day.items[String(item.id)];
                    const label = `${f.time(item.start_time)}, ${stopTitle(item)}: ${text.sky(w.code)}, ${f.n(w.temp ?? 0)}°, ${t('conditions.rainChance', { n: f.n(w.rain ?? 0) })}`;
                    return (
                      <View key={item.id} style={[styles.stopRow, i < stops.length - 1 && styles.rowLine]} accessible accessibilityLabel={label}>
                        <Text style={styles.stopTime}>{f.time(item.start_time)}</Text>
                        <Text style={[styles.stopName, styles.flex]} numberOfLines={2}>
                          {stopTitle(item)}
                        </Text>
                        <MaterialCommunityIcons name={sky(w.code, night(item.start_time, day)).icon} size={22} color={colors.textSecondary} />
                        <Text style={styles.stopTemp}>{f.n(w.temp ?? 0)}°</Text>
                        <Text style={[styles.stopRain, (w.rain ?? 0) >= 60 && styles.warnText]}>{f.n(w.rain ?? 0)}%</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* By the hour, with the chance of rain as a bar */}
            {day.in_forecast && (
              <>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('conditions.byHour')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours} testID="cond-hours">
                  {day.hours.map((h) => {
                    const stormy = (h.code ?? 0) >= 95;
                    const chance = h.rain ?? 0;
                    return (
                      <View
                        key={h.time}
                        style={[styles.hour, stormy && styles.hourStorm]}
                        accessible
                        accessibilityLabel={`${f.time(h.time)}, ${text.sky(h.code)}, ${f.n(h.temp ?? 0)}°, ${t('conditions.rainChance', { n: f.n(chance) })}`}
                      >
                        <Text style={styles.hourTime}>{f.time(h.time)}</Text>
                        <MaterialCommunityIcons name={sky(h.code, night(h.time, day)).icon} size={22} color={stormy ? colors.danger : colors.textSecondary} />
                        <Text style={styles.hourTemp}>{f.n(h.temp ?? 0)}°</Text>
                        <View style={styles.rainTrack}>
                          <View style={[styles.rainFill, { height: `${Math.max(4, chance)}%` }, chance >= 60 && styles.rainHigh]} />
                        </View>
                        <Text style={styles.hourRain}>{f.n(chance)}%</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* The sea, in plain words */}
            {day.sea && (
              <View style={styles.seaCard}>
                <MaterialCommunityIcons name="waves" size={26} color={day.sea.level === 'rough' ? colors.warning : colors.link} />
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{t('conditions.seaAt', { place: day.sea.place })}</Text>
                  <Text style={[styles.cardText, day.sea.level === 'rough' && styles.warnText]}>
                    {t(`conditions.seaWords.${day.sea.level}`, { wave: f.km(day.sea.wave) })}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.h2} accessibilityRole="header">
              {t('conditions.alsoChecked')}
            </Text>
            <View style={styles.list}>
              {day.checks.map((c, i) => {
                const words = text.check(c);
                return (
                  <View key={c.code} style={[styles.check, i < day.checks.length - 1 && styles.rowLine]}>
                    <MaterialCommunityIcons name={c.ok ? 'check-circle-outline' : 'alert-circle-outline'} size={20} color={c.ok ? colors.success : colors.warning} />
                    <View style={styles.flex}>
                      <Text style={styles.checkTitle}>{words.title}</Text>
                      <Text style={styles.muted}>{words.text}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.disclaimer}>{t('conditions.disclaimer')}</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function dateLabelOf(iso: string, language: string, digits: (s: string) => string) {
  return digits(parseDay(iso).toLocaleDateString(language, { day: 'numeric', month: 'short' }));
}

function WarningCard({
  warning: w,
  fetchedAt,
  seaAt,
  busy,
  onMove,
  onKeep,
}: {
  warning: ConditionWarning;
  fetchedAt: string | null;
  seaAt?: string | null;
  busy: boolean;
  onMove?: () => void;
  onKeep?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useConditionText();
  const serious = isSerious(w);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.warning, serious && styles.warningSerious]} testID={`warning-${w.code}`}>
      <View style={styles.warningHead}>
        <View style={[styles.warningIcon, { backgroundColor: serious ? colors.dangerBg : colors.warningBg }]}>
          <MaterialCommunityIcons name={warningIcon(w.code)} size={22} color={serious ? colors.danger : colors.warning} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.warningTitle} accessibilityRole="header">
            {text.title(w)}
          </Text>
          <Text style={styles.warningBody}>{text.body(w)}</Text>
        </View>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.link} />
      ) : onMove || onKeep ? (
        <View style={styles.actions}>
          {onMove && w.move_to && (
            <PressableScale haptic="medium" onPress={onMove} style={[styles.action, styles.actionPrimary]} accessibilityRole="button" testID="warning-move">
              <Text style={styles.actionPrimaryText}>{t('conditions.moveTo', { day: text.weekday(w.move_to.date) })}</Text>
            </PressableScale>
          )}
          {onKeep && (
            <PressableScale haptic="selection" onPress={onKeep} style={[styles.action, styles.actionSecondary]} accessibilityRole="button" testID="warning-keep">
              <Text style={styles.actionSecondaryText}>{t('conditions.keep')}</Text>
            </PressableScale>
          )}
        </View>
      ) : null}
      <Text style={styles.source}>{text.source(w, fetchedAt, seaAt)}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: t.spacing.lg, gap: t.spacing.md },
  body: { gap: t.spacing.md },
  flex: { flex: 1 },
  onAccent: { color: t.colors.onAccent },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.success },
  dotStale: { backgroundColor: t.colors.warning },
  updated: { ...t.type.footnote, color: t.colors.textSecondary },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.colors.accentSoft },
  refreshText: { ...t.type.footnote, fontWeight: '700', color: t.colors.onAccentSoft },
  dayRow: { gap: t.spacing.sm },
  dayChip: { minHeight: 52, paddingHorizontal: t.spacing.md, borderRadius: t.radius.control, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  dayChipOn: { backgroundColor: t.colors.accent },
  dayChipText: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  dayChipSub: { ...t.type.caption, color: t.colors.textSecondary },
  summary: { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 24, backgroundColor: t.colors.surface },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
  summarySky: { ...t.type.title, color: t.colors.textPrimary },
  summaryTemp: { fontSize: 30, fontWeight: '700', color: t.colors.textPrimary },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  summaryText: { ...t.type.callout, color: t.colors.textSecondary },
  message: { ...t.type.callout, color: t.colors.success, fontWeight: '600' },
  h2: { ...t.type.headline, fontSize: 19, color: t.colors.textPrimary, marginTop: t.spacing.sm },
  h3: { ...t.type.callout, fontWeight: '700', color: t.colors.textSecondary },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  warning: { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.warning },
  warningSerious: { borderColor: t.colors.danger },
  warningHead: { flexDirection: 'row', gap: t.spacing.md },
  warningIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  warningTitle: { ...t.type.body, fontWeight: '700', color: t.colors.textPrimary },
  warningBody: { ...t.type.callout, fontSize: 14, lineHeight: 20, color: t.colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  action: { minHeight: 44, borderRadius: 14, paddingHorizontal: t.spacing.lg, justifyContent: 'center' },
  actionPrimary: { backgroundColor: t.colors.accent, flexShrink: 1 },
  actionPrimaryText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccent },
  actionSecondary: { backgroundColor: t.colors.surfaceInset },
  actionSecondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  source: { ...t.type.caption, color: t.colors.textTertiary },
  keptBox: { gap: 2 },
  keptRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 40 },
  link: { ...t.type.footnote, fontWeight: '600', color: t.colors.link },
  list: { borderRadius: 20, backgroundColor: t.colors.surface, paddingHorizontal: t.spacing.md },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 52, paddingVertical: t.spacing.sm },
  stopTime: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, width: 46 },
  stopName: { ...t.type.callout, color: t.colors.textPrimary },
  stopTemp: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary, width: 36, textAlign: 'right' },
  stopRain: { ...t.type.footnote, color: t.colors.link, width: 40, textAlign: 'right' },
  warnText: { color: t.colors.warning, fontWeight: '700' },
  hours: { gap: t.spacing.sm, paddingVertical: t.spacing.xs },
  hour: { width: 58, alignItems: 'center', gap: 4, paddingVertical: t.spacing.sm, borderRadius: 16, backgroundColor: t.colors.surface },
  hourStorm: { backgroundColor: t.colors.dangerBg },
  hourTime: { ...t.type.caption, color: t.colors.textSecondary },
  hourTemp: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  rainTrack: { width: 6, height: 28, borderRadius: 3, backgroundColor: t.colors.surfaceInset, justifyContent: 'flex-end', overflow: 'hidden' },
  rainFill: { width: 6, borderRadius: 3, backgroundColor: t.colors.link },
  rainHigh: { backgroundColor: t.colors.warning },
  hourRain: { ...t.type.caption, color: t.colors.link },
  seaCard: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface },
  cardTitle: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  cardText: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 2 },
  check: { flexDirection: 'row', gap: t.spacing.md, paddingVertical: t.spacing.md },
  checkTitle: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  disclaimer: { ...t.type.footnote, color: t.colors.textTertiary, marginTop: t.spacing.sm },
}));
