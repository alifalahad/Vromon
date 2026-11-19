/**
 * The top of the plan sheet (docs/ui-refresh step 14, frames 28 and 29): the trip's name with where it is
 * ("In 6 days", "Day 2 of 3", "Finished") and its trip room; the dates and travellers; the budget row
 * (the plan against your budget, what's left, in words as well as colour); the day tabs, each with the
 * day's sky when the forecast reaches it; then the day in a line and its conditions.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
// Inside the plan sheet, a plain scroll view loses the sideways swipe to the sheet
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';

import type { BudgetBreakdown, ConditionsDay, ItineraryDay } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { daySky, sky, useConditionText } from '../conditions/useConditionText';
import { planPhase, type PlanPhase } from '../dates';
import { planColors } from './colors';
import { dayParts } from './timeline';
import { localDigits, usePlanFormat } from './usePlanFormat';

const TAB_WIDTH = 96;
const TAB_GAP = 8;

type T = (k: string, o?: Record<string, unknown>) => string;

/** The chip's words: "In 6 days", "Tomorrow", "Day 2 of 3", "Finished", or "Not taken" (step 16). */
export function phaseText(p: PlanPhase, t: T, n: (v: number) => string, notTaken = false): string {
  if (p.kind === 'after') return t(notTaken ? 'plan.phase.notTaken' : 'plan.phase.after');
  if (p.kind === 'on') return t('plan.phase.on', { day: n(p.day), of: n(p.of) });
  return p.days <= 1 ? t('plan.phase.tomorrow') : t('plan.phase.before', { count: p.days, n: n(p.days) });
}

export function PhaseChip({ start, end, today, notTaken = false }: { start: string; end: string; today: string; notTaken?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const p = planPhase(start, end, today);
  // On the trip it's green with a dot (frame 31): it's happening now
  const [bg, ink] =
    p.kind === 'before'
      ? [colors.warningBg, colors.warning]
      : p.kind === 'on'
        ? [colors.successBg, colors.success]
        : [colors.surfaceInset, colors.textSecondary];
  return (
    <View style={[styles.chip, p.kind === 'after' && styles.chipAfter, { backgroundColor: bg }]} testID="trip-phase">
      {p.kind === 'on' ? <View style={[styles.chipDot, { backgroundColor: colors.success }]} /> : null}
      {/* After it (frame 33): a tick for "Finished"; a trip that didn't happen says so with a cross */}
      {p.kind === 'after' ? <MaterialCommunityIcons name={notTaken ? 'close' : 'check'} size={15} color={ink} /> : null}
      <Text style={[styles.chipText, { color: ink }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {phaseText(p, t, f.n, notTaken)}
      </Text>
    </View>
  );
}

/** The trip room as a round button beside the chip, with what's unread (friends-chat step 7). */
export function RoomButton({ unread, onPress }: { unread: number; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      style={styles.room}
      accessibilityRole="button"
      accessibilityLabel={unread ? `${t('tripRoom.open')}, ${t('chat.unread', { count: unread, n: f.n(unread) })}` : t('tripRoom.open')}
      testID="open-trip-room"
    >
      <MaterialCommunityIcons name="forum-outline" size={22} color={colors.onAccentSoft} />
      {unread ? (
        <View style={styles.roomBadge}>
          <Text style={styles.roomBadgeText} maxFontSizeMultiplier={1.2}>
            {f.n(unread)}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/**
 * The budget row (frame 28): "≈ ৳20,540 of ৳25,000", the meter, "৳4,460 left". The same numbers as the
 * Budget screen (total, left, status). Close to the budget it's amber and says "Only … left"; over it,
 * red and "… over": never colour alone.
 */
export function BudgetRow({ data, onPress }: { data: BudgetBreakdown; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  // (an older answer has only the planned total: one row never takes the screen down)
  const total = data.total ?? data.estimated_total ?? 0;
  const remaining = data.left ?? data.total_budget - total;
  const estimate = data.low !== data.high || (data.parts ?? []).some((p) => p.estimate);
  const spent = `${estimate ? '≈ ' : ''}${f.money(total)}`;
  const share = data.total_budget > 0 ? total / data.total_budget : null;
  const status = data.status === 'over' || remaining < 0 ? 'over' : (data.status ?? 'ok');
  const left =
    status === 'over'
      ? t('plan.budgetOver', { amount: f.money(Math.abs(remaining)) })
      : status === 'close'
        ? t('plan.budgetClose', { amount: f.money(remaining) })
        : t('plan.budgetLeft', { amount: f.money(remaining) });
  const tone = status === 'over' ? colors.danger : status === 'close' ? colors.warning : colors.accent;
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={styles.budget}
      accessibilityRole="button"
      accessibilityLabel={t('plan.budgetRowA11y', { spent, total: f.money(data.total_budget), left })}
      testID="trip-budget"
    >
      <MaterialCommunityIcons name="wallet-outline" size={22} color={colors.textSecondary} />
      <View style={styles.budgetBody}>
        <View style={styles.budgetLine}>
          <Text style={styles.budgetText} maxFontSizeMultiplier={1.4}>
            <Text style={styles.budgetSpent}>{spent}</Text>
            {data.total_budget > 0 ? ` ${t('plan.budgetOf', { total: f.money(data.total_budget) })}` : ''}
          </Text>
          {data.total_budget > 0 ? (
            <Text style={[styles.budgetLeft, status !== 'ok' && { color: tone, fontWeight: '700' }]} maxFontSizeMultiplier={1.4} testID="trip-budget-left">
              {left}
            </Text>
          ) : null}
        </View>
        {share != null ? (
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${Math.round(Math.min(1, share) * 100)}%`, backgroundColor: tone }]} />
          </View>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </PressableScale>
  );
}

/** A day's sky for its tab, when the forecast reaches it. */
function tabSky(day: ConditionsDay | undefined) {
  if (!day?.in_forecast) return null;
  const code = daySky(day);
  return code == null ? null : { code, ...sky(code) };
}

/**
 * The day tabs (frame 28): "Day 1", "Fri 20" and the sky. More days than fit scroll; the chosen day stays in view.
 * On the trip (frame 31): days gone by say "Done" with a tick, and today's says "Today".
 */
export function DayTabs({
  days,
  index,
  conditions,
  onPick,
  today,
}: {
  days: ItineraryDay[];
  index: number;
  conditions?: readonly ConditionsDay[];
  onPick: (i: number) => void;
  /** The phone's date, while the trip is on */
  today?: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const sunColor = planColors(theme).sun;
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const scrollable = days.length > 3;
  const strip = useRef<GHScrollView>(null);
  useEffect(() => {
    if (scrollable) strip.current?.scrollTo({ x: Math.max(0, index * (TAB_WIDTH + TAB_GAP) - TAB_WIDTH), animated: true });
  }, [index, scrollable]);
  const tabs = days.map((d, i) => {
    const on = i === index;
    const parts = d.day_date ? dayParts(d.day_date, i18n.language) : null;
    const gone = !!today && !!d.day_date && d.day_date < today;
    const isToday = !!today && d.day_date === today;
    const s = gone || isToday ? null : tabSky(conditions?.find((c) => c.day_id === d.id));
    const sun = s && (s.key === 'clear' || s.key === 'partly');
    const label = [
      t('plan.day', { n: f.n(d.day_number) }),
      isToday ? t('today.open') : parts ? `${parts.weekday} ${parts.day}` : null,
      gone ? t('today.done') : null,
      s ? text.sky(s.code) : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <PressableScale
        key={d.id}
        haptic="selection"
        onPress={() => onPick(i)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        style={[styles.tab, scrollable ? styles.tabFixed : styles.tabFlex, on && styles.tabOn]}
        testID={`day-tab-${d.day_number}`}
      >
        <Text style={[styles.tabTitle, gone && !on && styles.tabTitleGone, on && styles.tabTextOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {t('plan.day', { n: f.n(d.day_number) })}
        </Text>
        <View style={styles.tabSubRow}>
          {gone ? (
            <>
              <MaterialCommunityIcons name="check" size={13} color={on ? colors.onAccent : colors.success} />
              <Text style={[styles.tabSub, on && styles.tabTextOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {t('today.done')}
              </Text>
            </>
          ) : isToday ? (
            <Text style={[styles.tabSub, on && styles.tabTextOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {t('today.open')}
            </Text>
          ) : parts ? (
            <Text style={[styles.tabSub, on && styles.tabTextOn]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {localDigits(`${parts.weekday} ${parts.day}`, i18n.language)}
            </Text>
          ) : null}
          {s ? <MaterialCommunityIcons name={s.icon} size={15} color={on ? colors.onAccent : sun ? sunColor : colors.textSecondary} /> : null}
        </View>
      </PressableScale>
    );
  });
  return scrollable ? (
    <GHScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
      accessibilityRole="tablist"
      testID="day-tabs"
    >
      {tabs}
    </GHScrollView>
  ) : (
    <View style={styles.tabs} accessibilityRole="tablist" testID="day-tabs">
      {tabs}
    </View>
  );
}

/**
 * The day in a line (frame 28): its summary, then "4 places, 2 meals · ≈ ৳2,780 for 2 · 2 h on the road".
 * The money is the day's food, tickets and rides for the group: Budget's "By day", the same number.
 */
export function DayLine({
  title,
  places,
  meals,
  money,
  travellers,
  roadMinutes,
}: {
  title: string | null;
  places: number;
  meals: number;
  /** Budget's "By day" for this day (null until the budget is loaded) */
  money: { amount: number; estimate: boolean } | null;
  travellers: number;
  roadMinutes: number;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const counts = [places ? t('plan.places', { count: places, n: f.n(places) }) : null, meals ? t('plan.meals', { count: meals, n: f.n(meals) }) : null]
    .filter(Boolean)
    .join(', ');
  const line = [
    counts || null,
    money && money.amount > 0
      ? t('plan.dayMoney', { amount: `${money.estimate ? '≈ ' : ''}${f.money(money.amount)}`, count: travellers, n: f.n(travellers) })
      : null,
    roadMinutes > 0 ? t('plan.onTheRoad', { time: f.duration(roadMinutes) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.dayLine}>
      {title ? (
        <Text style={styles.dayTitle} testID="day-summary">
          {title}
        </Text>
      ) : null}
      {line ? (
        <Text style={styles.dayStats} testID="day-stats">
          {line}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  chip: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipAfter: { gap: 5, paddingLeft: 9 },
  chipText: { fontSize: 13, fontWeight: '700' },
  room: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentTint, flexShrink: 0 },
  roomBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accentStrong,
    borderWidth: 2,
    borderColor: t.scheme === 'dark' ? t.colors.bg : t.colors.surface,
  },
  roomBadgeText: { fontSize: 11, fontWeight: '700', color: t.colors.onAccent },
  budget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: t.scheme === 'dark' ? t.colors.surface : t.colors.bg,
  },
  budgetBody: { flex: 1, gap: 7 },
  budgetLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 },
  budgetText: { fontSize: 14.5, color: t.colors.textSecondary },
  budgetSpent: { fontWeight: '700', color: t.colors.textPrimary },
  budgetLeft: { fontSize: 13, color: t.colors.textSecondary },
  meter: { height: 6, borderRadius: 3, backgroundColor: t.colors.accentTint, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  tabs: { flexDirection: 'row', gap: TAB_GAP },
  tab: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: t.spacing.sm,
    backgroundColor: t.colors.surfaceInset,
  },
  tabFlex: { flex: 1 },
  tabFixed: { width: TAB_WIDTH },
  tabOn: { backgroundColor: t.colors.accentStrong },
  tabTitle: { fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  tabTitleGone: { color: t.colors.textSecondary },
  tabSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabSub: { fontSize: 12.5, color: t.colors.textSecondary },
  tabTextOn: { color: t.colors.onAccent },
  dayLine: { gap: 3, paddingHorizontal: t.spacing.xs },
  dayTitle: { fontSize: 17, fontWeight: '700', lineHeight: 21, color: t.colors.textPrimary },
  dayStats: { fontSize: 13.5, color: t.colors.textSecondary },
}));
