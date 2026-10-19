/**
 * The whole trip's cost (trip planner step 7), from GET /trips/{id}/budget: the
 * total against your budget (amber before it goes over), each part with where
 * it comes from (getting there, stay, food, tickets, local travel; estimates
 * marked ≈), the days, and the ways to save that apply to this plan. Each is
 * applied in one tap, with Undo. A friend's trip is read-only.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { dayParts } from '../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { BudgetBreakdown, BudgetPart, BudgetSave, Itinerary, SaveAction, SaveResult } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { Snackbar } from '../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { useReduceMotion } from '../../../src/ui/useReduceMotion';

/** One colour per part, in the bar and next to each row (from the step 1 mockup) */
const PART_COLORS = {
  dark: { getting_there: '#6EA0F6', stay: '#B794F0', food: '#F2B13C', tickets: '#4CAF50', local: '#8A8A8A' },
  light: { getting_there: '#2563D9', stay: '#7B4FC9', food: '#E39A2D', tickets: '#2E8B3A', local: '#9A9A9A' },
} as const;

export default function TripBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ message: string; undo?: SaveAction } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: !!tripId });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const colors = PART_COLORS[theme.scheme];
  const data = budget.data;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await budget.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // The server's answer goes straight into the caches; the rest of the trip refreshes
  const landed = (res: SaveResult) => {
    queryClient.setQueryData(['budget', tripId], res.budget);
    queryClient.setQueryData<Itinerary>(['itinerary', tripId], (old) =>
      old ? { ...old, days: old.days.map((d) => res.days.find((c) => c.id === d.id) ?? d), validation: res.validation } : old,
    );
    for (const queryKey of [['itinerary', tripId], ['trip', tripId], ['trips'], ['conditions', tripId], ['dayRoute']]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const run = async (key: string, action: SaveAction, message: (res: SaveResult) => string, undoable: boolean) => {
    setBusy(key);
    try {
      const res = await tripsApi.saveBudget(tripId, action);
      landed(res);
      haptics.success();
      setSnack({ message: message(res), undo: undoable && res.undo ? res.undo : undefined });
    } catch (e) {
      haptics.error();
      setSnack({ message: `${t('budget.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const apply = (s: BudgetSave) =>
    run(s.key, s.action, () => {
      if (s.key === 'hotel') return t('budget.appliedHotel', { name: s.detail.to });
      if (s.key === 'skip') return t('budget.appliedSkip', { name: s.detail.title });
      return t('budget.appliedRickshaw');
    }, true);
  const undo = () => {
    if (!snack?.undo) return;
    const action = snack.undo;
    setSnack(null);
    run('undo', action, () => t('budget.undone'), false);
  };

  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('budget.title') }} />
        {budget.isError ? <Text style={styles.muted}>{(budget.error as Error).message}</Text> : <ActivityIndicator color={theme.colors.link} />}
      </View>
    );
  }

  const known = data.parts.filter((p) => p.known && (p.amount ?? 0) > 0);
  const nights = data.nights;
  const days = data.by_day.length || (trip.data?.num_days ?? 0);
  const sub = [
    t('budget.travellers', { count: data.num_travelers, n: f.n(data.num_travelers) }),
    t('budget.days', { count: days, n: f.n(days) }),
    t('budget.nights', { count: nights, n: f.n(nights) }),
  ].join(' · ');
  const tone = data.status === 'over' ? theme.colors.danger : data.status === 'close' ? theme.colors.warning : theme.colors.success;
  const statusLine =
    data.status === 'over'
      ? t('budget.over', { amount: f.money(-data.left) })
      : data.status === 'close' && data.total >= data.total_budget * 0.9
        ? t('budget.close', { amount: f.money(data.left) })
        : data.status === 'close'
          ? t('budget.mightGoOver', { amount: f.money(data.left), high: f.money(data.high) })
          : t('budget.left', { amount: f.money(data.left) });
  const maxDay = Math.max(1, ...data.by_day.map((d) => d.amount));
  const layout = reduceMotion ? undefined : LinearTransition.duration(220);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('budget.title') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.link} colors={[theme.colors.accent]} />}
      >
        <Text style={styles.sub}>{sub}</Text>

        {/* The total against the budget */}
        <View style={styles.card} testID="budget-total">
          <View style={styles.totalRow}>
            <Text style={styles.total} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
              {data.low !== data.high ? '≈ ' : ''}
              {f.money(data.total)}
            </Text>
            <Text style={styles.of}>{t('budget.of', { total: f.money(data.total_budget) })}</Text>
          </View>
          <View
            style={styles.bar}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('budget.barA11y', {
              parts: known.map((p) => `${t(`budget.parts.${p.key}`)} ${f.money(p.amount ?? 0)}`).join(', '),
            })}
          >
            {known.map((p) => (
              <Animated.View
                key={p.key}
                layout={layout}
                style={{ flex: p.amount ?? 0, backgroundColor: colors[p.key] }}
              />
            ))}
            {data.total < data.total_budget && <Animated.View layout={layout} style={{ flex: data.total_budget - data.total }} />}
          </View>
          <View style={styles.statusRow} accessibilityLiveRegion="polite" testID="budget-status">
            <MaterialCommunityIcons name={data.status === 'ok' ? 'check-circle-outline' : 'alert-outline'} size={18} color={tone} />
            <Text style={[styles.status, { color: tone }]}>{statusLine}</Text>
          </View>
          {data.low !== data.high && (
            <Text style={styles.muted}>{t('budget.range', { low: f.money(data.low), high: f.money(data.high) })}</Text>
          )}
        </View>

        {/* Each part */}
        <View style={styles.list}>
          {data.parts.map((p, i) => (
            <View key={p.key} style={[styles.partRow, i < data.parts.length - 1 && styles.rowLine]} testID={`budget-part-${p.key}`}>
              <View style={[styles.swatch, { backgroundColor: p.known ? colors[p.key] : theme.colors.surfaceInset }]} />
              <View style={styles.flex}>
                <Text style={styles.partLabel}>{t(`budget.parts.${p.key}`)}</Text>
                <Text style={styles.partDetail}>{partDetail(p, data, t, f)}</Text>
              </View>
              <Animated.Text key={`${p.key}-${p.amount}`} entering={reduceMotion ? undefined : FadeIn.duration(250)} style={[styles.amount, !p.known && styles.unknown]}>
                {p.known ? `${p.estimate ? '≈ ' : ''}${f.money(p.amount ?? 0)}` : t('budget.unknown')}
              </Animated.Text>
            </View>
          ))}
        </View>

        {/* By day */}
        {data.by_day.length > 0 && (
          <>
            <Text style={styles.h2} accessibilityRole="header">{t('budget.byDay')}</Text>
            <View style={[styles.card, styles.days]}>
              {data.by_day.map((d) => (
                <View key={d.day_number} style={styles.dayRow} accessible accessibilityLabel={`${dayLabel(d.date, d.day_number, i18n.language, t, f)}: ${f.money(d.amount)}`}>
                  <Text style={styles.dayLabel}>{dayLabel(d.date, d.day_number, i18n.language, t, f)}</Text>
                  <View style={styles.dayTrack}>
                    <Animated.View layout={layout} style={[styles.dayFill, { width: `${Math.round((d.amount / maxDay) * 100)}%` }]} />
                  </View>
                  <Text style={styles.dayAmount}>{d.estimate ? '≈ ' : ''}{f.money(d.amount)}</Text>
                </View>
              ))}
              <Text style={styles.note}>{t('budget.byDayNote')}</Text>
            </View>
          </>
        )}

        {/* Ways to save */}
        <Text style={styles.h2} accessibilityRole="header">{t('budget.saves')}</Text>
        {data.saves.length === 0 ? (
          <Text style={styles.muted}>{t('budget.noSaves')}</Text>
        ) : (
          data.saves.map((s) => {
            const title = saveTitle(s, t, f);
            const saving = t(s.estimate ? 'budget.savingAbout' : 'budget.saving', { amount: f.money(s.saving) });
            return (
              <Animated.View
                key={`${s.key}-${JSON.stringify(s.action)}`}
                entering={reduceMotion ? undefined : FadeIn.duration(220)}
                exiting={reduceMotion ? undefined : FadeOut.duration(160)}
                layout={layout}
                style={styles.save}
                testID={`budget-save-${s.key}`}
              >
                <View style={styles.flex}>
                  <Text style={styles.saveTitle}>{title}</Text>
                  {saveSub(s, t, f) ? <Text style={styles.partDetail}>{saveSub(s, t, f)}</Text> : null}
                  <Text style={styles.saving}>{saving}</Text>
                </View>
                {mine && (
                  <PressableScale
                    haptic="selection"
                    onPress={() => apply(s)}
                    disabled={busy !== null}
                    style={[styles.apply, busy !== null && busy !== s.key && styles.dim]}
                    accessibilityRole="button"
                    accessibilityLabel={t('budget.applyA11y', { what: title, saving })}
                    testID={`budget-apply-${s.key}`}
                  >
                    {busy === s.key ? <ActivityIndicator size="small" color={theme.colors.link} /> : <Text style={styles.applyText}>{t('budget.apply')}</Text>}
                  </PressableScale>
                )}
              </Animated.View>
            );
          })
        )}

        <Text style={styles.footnote}>{t('budget.footnote')}</Text>
      </ScrollView>
      <Snackbar message={snack?.message ?? null} actionLabel={snack?.undo ? t('plan.undo') : undefined} onAction={undo} testID="budget-snackbar" />
    </View>
  );
}

type T = ReturnType<typeof useTranslation>['t'];
type F = ReturnType<typeof usePlanFormat>;

function dayLabel(date: string | null, n: number, language: string, t: T, f: F) {
  if (!date) return t('budget.dayLabel', { n: f.n(n) });
  // "Mon 26", as on the day tabs
  const parts = dayParts(date, language);
  return `${parts.weekday} ${parts.day}`;
}

function partDetail(p: BudgetPart, data: BudgetBreakdown, t: T, f: F): string {
  const d = p.detail;
  const who = (n: number) => (n === 1 ? t('budget.youOne') : n === 2 ? t('budget.youTwo') : t('budget.youMany', { n: f.n(n) }));
  switch (p.key) {
    case 'getting_there':
      if (!p.known) return t('budget.noOrigin');
      return t('budget.gettingThere', {
        mode: t(`trips.modes.${d.mode}`),
        from: d.from,
        to: d.to,
        who: t(d.fare_per === 'vehicle' ? 'budget.cars' : 'budget.seats', { count: d.count ?? 1, n: f.n(d.count ?? 1) }),
      });
    case 'stay': {
      if (!p.known) {
        if (d.reason === 'currency') return t('budget.otherCurrency', { currency: d.currency });
        return d.reason === 'no_price' ? t('budget.hotelNoPrice', { hotel: d.hotel }) : t('budget.noHotel');
      }
      const nights = t('budget.nights', { count: d.nights ?? 0, n: f.n(d.nights ?? 0) });
      const args = { hotel: d.hotel, nights, price: f.money(d.per_night ?? 0), rooms: f.n(d.rooms ?? 1) };
      return (d.rooms ?? 1) > 1 ? t('budget.stayRooms', args) : t('budget.stay', args);
    }
    case 'food': {
      const days = t('budget.days', { count: d.days ?? 0, n: f.n(d.days ?? 0) });
      return t(d.placeholder_meals ? 'budget.foodSome' : 'budget.food', { days, who: who(d.travellers ?? data.num_travelers) });
    }
    case 'tickets': {
      const base = d.free ? t('budget.ticketsFree', { count: d.free, n: f.n(d.free) }) : t('budget.tickets');
      return d.unknown ? `${base} · ${t('budget.ticketsUnknown', { count: d.unknown, n: f.n(d.unknown) })}` : base;
    }
    case 'local': {
      // "CNG and rickshaw": names in a sentence are lower case, short forms stay as they are
      const modes = (d.modes ?? []).map((m) => t(`plan.modes.${m}`)).map((w) => (w === w.toUpperCase() ? w : w.toLowerCase()));
      if (!modes.length) return t('budget.localWalk');
      const list = modes.length === 1 ? modes[0] : t('budget.and', { a: modes.slice(0, -1).join(', '), b: modes[modes.length - 1] });
      const line = t('budget.local', { modes: list });
      return line.charAt(0).toUpperCase() + line.slice(1);
    }
  }
}

function saveTitle(s: BudgetSave, t: T, f: F): string {
  if (s.key === 'hotel') return t('budget.saveHotel', { to: s.detail.to, from: s.detail.from });
  if (s.key === 'skip') return t('budget.saveSkip', { title: s.detail.title });
  return t('budget.saveRickshaw', { count: s.detail.legs, n: f.n(s.detail.legs) });
}

function saveSub(s: BudgetSave, t: T, f: F): string | null {
  if (s.key === 'hotel') return t('budget.saveHotelSub', { to: f.km(s.detail.to_rating), from: f.km(s.detail.from_rating) });
  if (s.key === 'skip') return t('budget.saveSkipSub', { day: f.n(s.detail.day_number) });
  return t('budget.saveRickshawSub', { time: f.duration(s.detail.extra_min) });
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: t.spacing.lg, gap: t.spacing.md },
  flex: { flex: 1, minWidth: 0 },
  sub: { ...t.type.footnote, color: t.colors.textSecondary },
  card: { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: t.spacing.sm },
  total: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5, color: t.colors.textPrimary },
  of: { ...t.type.callout, color: t.colors.textSecondary },
  bar: { height: 14, borderRadius: 7, overflow: 'hidden', flexDirection: 'row', gap: 2, backgroundColor: t.colors.surfaceInset },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm },
  status: { ...t.type.callout, fontSize: 14, fontWeight: '600', flex: 1 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  list: { borderRadius: 20, backgroundColor: t.colors.surface, paddingHorizontal: t.spacing.lg, paddingVertical: 4 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60, paddingVertical: t.spacing.sm },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  partLabel: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  partDetail: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 2 },
  amount: { ...t.type.body, fontWeight: '700', color: t.colors.textPrimary },
  unknown: { fontWeight: '400', color: t.colors.textTertiary },
  h2: { ...t.type.headline, fontSize: 19, color: t.colors.textPrimary, marginTop: t.spacing.sm },
  days: { gap: t.spacing.md },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  dayLabel: { ...t.type.footnote, color: t.colors.textSecondary, width: 64 },
  dayTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: t.colors.surfaceInset, overflow: 'hidden' },
  dayFill: { height: 10, borderRadius: 5, backgroundColor: t.colors.accent },
  dayAmount: { ...t.type.footnote, fontWeight: '600', color: t.colors.textPrimary, minWidth: 72, textAlign: 'right' },
  note: { ...t.type.caption, color: t.colors.textTertiary },
  save: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.md, paddingLeft: t.spacing.lg, borderRadius: 18, backgroundColor: t.colors.surface },
  saveTitle: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  saving: { ...t.type.footnote, fontWeight: '600', color: t.colors.success, marginTop: 4 },
  apply: { minHeight: 44, minWidth: 88, paddingHorizontal: t.spacing.lg, borderRadius: 999, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  applyText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccentSoft },
  dim: { opacity: 0.5 },
  footnote: { ...t.type.footnote, color: t.colors.textTertiary, marginTop: t.spacing.sm },
}));
