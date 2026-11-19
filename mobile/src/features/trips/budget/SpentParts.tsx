/**
 * Budget on the trip and after it (docs/ui-refresh step 19, frames 38 and 40), from what you noted:
 *   - on the trip: "Spent so far" (of your budget, the meter, what's left or over, what's still to come by the plan
 *     and where that would end); "Today" with today's notes and "Add what you spent"; "Spent of what's planned"
 *     (each part's bar in its colour on its lighter track); "By day" (what was spent as a bar, the plan as a mark);
 *   - after it: "The trip cost" (under or over your budget in words, "Each", "Against the plan"); the plan and what
 *     you spent as a table; the biggest costs;
 *   - nothing noted after it: the plan's estimate, said to be the plan's ("By the plan, about");
 *   - "Everything you noted", the row that opens the full list.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';

import type { BudgetBreakdown, BudgetPartKey, Expense } from '../../../types';
import { LineIcon } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import type { ThemeColors } from '../../../ui/theme/tokens';
import { dayDate, dayParts } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { partColor } from './budgetView';
import { againstPlan, dayPlan, type DayRow, noteTime, noteTitle, partName, partsAgainstPlan, planAndSpent, planDifference, planIsEstimate } from './spent';

/** Each part's lighter track (frame 38) */
function partTrack(colors: ThemeColors, key: BudgetPartKey): string {
  return {
    getting_there: colors.partGettingThereTrack,
    stay: colors.partStayTrack,
    food: colors.partFoodTrack,
    tickets: colors.partTicketsTrack,
    local: colors.partLocalTrack,
  }[key];
}

/** "Add what you spent" on the hero card (frame 40's last card) */
export function HeroAddButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <PressableScale haptic="selection" onPress={onPress} style={styles.heroAdd} accessibilityRole="button" testID="spent-add">
      <LineIcon name="plus" size={18} color={colors.onHero} />
      <Text style={styles.heroAddText}>{t('spent.addSpent')}</Text>
    </PressableScale>
  );
}

/** On the trip (frame 38): what's spent so far against your budget, and where the plan would end. */
export function SpentHero({ b }: { b: BudgetBreakdown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const spent = b.spent?.total ?? 0;
  const left = b.total_budget - spent;
  const share = b.total_budget > 0 ? Math.min(1, spent / b.total_budget) : 1;
  const toCome = b.to_come ?? 0;
  const end = b.projected ?? spent;
  return (
    <View style={styles.hero} testID="spent-hero">
      <Text style={styles.eyebrow}>{t('spent.spentSoFar').toLocaleUpperCase(i18n.language)}</Text>
      <Text style={styles.total} maxFontSizeMultiplier={1.2} accessibilityRole="header" testID="spent-total">
        {f.money(spent)}
      </Text>
      <Text style={styles.of}>{t('budget.ofYour', { amount: f.money(b.total_budget) })}</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('budget.meterA11y', { n: f.n(Math.round((spent / Math.max(1, b.total_budget)) * 100)) })}
      >
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
      <View style={styles.statusRow} testID="spent-status">
        <MaterialCommunityIcons
          name={left >= 0 ? 'check-circle-outline' : 'alert-outline'}
          size={18}
          color={left >= 0 ? colors.heroGood : colors.heroDanger}
          style={styles.statusIcon}
        />
        <Text style={[styles.statusMain, left < 0 && { color: colors.heroDanger }]}>
          {left >= 0 ? t('budget.statusLeft', { amount: f.money(left) }) : t('budget.statusOver', { amount: f.money(-left) })}
        </Text>
      </View>
      <Text style={styles.line} testID="spent-to-come">
        {toCome > 0 ? t('spent.toCome', { amount: f.money(toCome), end: f.money(end) }) : t('spent.toComeNone')}
      </Text>
      {left >= 0 && end > b.total_budget ? (
        <View style={styles.statusRow}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.heroWarning} style={styles.statusIcon} />
          <Text style={[styles.line, styles.lineWarning]}>{t('spent.endOver', { amount: f.money(end - b.total_budget) })}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** After the trip (frame 40): what it cost against your budget, each traveller's share, and against the plan. */
export function CostHero({ b }: { b: BudgetBreakdown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const cost = b.spent?.total ?? 0;
  const under = Math.round(b.total_budget - cost);
  const share = b.total_budget > 0 ? Math.min(1, cost / b.total_budget) : 1;
  return (
    <View style={styles.hero} testID="spent-hero">
      <Text style={styles.eyebrow}>{t('spent.tripCost').toLocaleUpperCase(i18n.language)}</Text>
      <Text style={styles.total} maxFontSizeMultiplier={1.2} accessibilityRole="header" testID="spent-total">
        {f.money(cost)}
      </Text>
      <Text style={styles.of}>{t('budget.ofYour', { amount: f.money(b.total_budget) })}</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('budget.meterA11y', { n: f.n(Math.round((cost / Math.max(1, b.total_budget)) * 100)) })}
      >
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
      <View style={styles.statusRow} testID="spent-status">
        <MaterialCommunityIcons
          name={under >= 0 ? 'check-circle-outline' : 'alert-outline'}
          size={18}
          color={under >= 0 ? colors.heroGood : colors.heroDanger}
          style={styles.statusIcon}
        />
        <Text style={[styles.statusMain, under < 0 && { color: colors.heroDanger }]}>
          {under > 0 ? t('spent.under', { amount: f.money(under) }) : under < 0 ? t('spent.overBudget', { amount: f.money(-under) }) : t('spent.onBudget')}
        </Text>
      </View>
      <View style={styles.cells}>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>{t('budget.each')}</Text>
          <Text style={styles.cellValue}>{f.money(Math.round(cost / Math.max(1, b.num_travelers)))}</Text>
        </View>
        {b.total > 0 ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>{t('spent.againstPlan')}</Text>
            <Text style={styles.cellValue} testID="spent-against-plan">
              {againstPlan(planDifference(b), 0, t, f)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** After the trip with nothing noted (frame 40's last card): the plan's estimate, said to be the plan's. */
export function ByPlanHero({ b, onAdd }: { b: BudgetBreakdown; onAdd?: () => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  return (
    <View style={[styles.hero, styles.heroPlan]} testID="spent-by-plan">
      <Text style={styles.eyebrow}>{t('spent.byPlanAbout').toLocaleUpperCase(i18n.language)}</Text>
      <Text style={[styles.total, styles.totalPlan]} maxFontSizeMultiplier={1.2} accessibilityRole="header" testID="spent-total">
        {`${planIsEstimate(b) ? '≈\u00A0' : ''}${f.money(b.total)}`}
      </Text>
      <Text style={[styles.line, styles.lineFirst]}>{t('spent.noNotes')}</Text>
      {onAdd ? <HeroAddButton onPress={onAdd} /> : null}
    </View>
  );
}

/** One of your notes in a list: when it was noted, what for, how much; it opens to be changed. */
export function NoteRow({
  e,
  onOpen,
  last,
  parts = 'tripWide',
}: {
  e: Expense;
  onOpen?: (e: Expense) => void;
  last?: boolean;
  /** Say each note's part ("all": the full list), or only for getting there and the stay, which no day's plan counts */
  parts?: 'all' | 'tripWide';
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const time = noteTime(e);
  const title = noteTitle(e, t);
  const tripWide = e.part === 'getting_there' || e.part === 'stay';
  // Large text: no time column (Bangla at 1.6× broke "২৩:২৬" over two lines); the time leads the line under the note
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const sub = [
    stacked && time ? f.time(time) : null,
    e.note && (parts === 'all' || tripWide) ? partName(e.part, t) : null,
    tripWide ? t('spent.forTrip') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      {stacked ? null : (
        <Text style={styles.noteTime} numberOfLines={1}>
          {time ? f.time(time) : ''}
        </Text>
      )}
      <View style={styles.noteWords}>
        <Text style={styles.noteTitle}>{title}</Text>
        {sub ? <Text style={styles.noteSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.noteAmount}>{f.money(e.amount)}</Text>
    </>
  );
  return onOpen ? (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={() => onOpen(e)}
      style={[styles.noteRow, !last && styles.rowLine]}
      accessibilityRole="button"
      accessibilityLabel={t('spent.noteA11y', { title, amount: f.money(e.amount), part: partName(e.part, t) })}
      testID={`spent-note-${e.id}`}
    >
      {body}
    </PressableScale>
  ) : (
    <View style={[styles.noteRow, !last && styles.rowLine]} testID={`spent-note-${e.id}`}>
      {body}
    </View>
  );
}

/** "Today · Sat 21": today's notes against today's plan, and "Add what you spent" (frame 38). */
export function TodayCard({
  b,
  today,
  notes,
  onAdd,
  onOpen,
}: {
  b: BudgetBreakdown;
  today: string;
  notes: readonly Expense[];
  onAdd?: () => void;
  onOpen?: (e: Expense) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const spent = b.spent?.today ?? 0;
  const plan = dayPlan(b, today);
  const planText = plan ? `${plan.estimate ? '≈\u00A0' : ''}${f.money(plan.amount)}` : null;
  const over = plan && spent > plan.amount;
  const mine = notes.filter((e) => e.day === today).sort((a, c) => c.id - a.id);
  return (
    <View style={styles.card} testID="spent-today">
      <View style={styles.todayHead}>
        <Text style={styles.h2Card} accessibilityRole="header">
          {t('spent.today', { date: f.time(`${dayParts(today, i18n.language).weekday} ${dayParts(today, i18n.language).day}`) })}
        </Text>
        <Text style={styles.todaySum} testID="spent-today-sum">
          {spent > 0 ? <Text style={styles.strong}>{f.money(spent)}</Text> : null}
          {spent > 0 && planText ? ` ${t('spent.ofPlan', { amount: planText })}` : spent > 0 ? '' : planText ? t('spent.planToday', { amount: planText }) : ''}
        </Text>
      </View>
      {plan && plan.amount > 0 && spent > 0 ? (
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${Math.min(1, spent / plan.amount) * 100}%`, backgroundColor: over ? colors.danger : colors.accent }]} />
        </View>
      ) : null}
      {mine.length ? (
        <View style={styles.noteList}>
          {mine.map((e, i) => (
            <NoteRow key={e.id} e={e} onOpen={onOpen} last={i === mine.length - 1} />
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>{t('spent.nothingToday')}</Text>
      )}
      {onAdd ? (
        <PressableScale haptic="selection" onPress={onAdd} style={styles.addButton} accessibilityRole="button" testID="spent-add">
          <LineIcon name="plus" size={20} color={colors.onAccent} strokeWidth={2.2} />
          <Text style={styles.addText}>{t('spent.addSpent')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** "Spent of what's planned" (frame 38): the five parts, each a bar in its colour on its lighter track. */
export function PartsAgainstPlan({ b }: { b: BudgetBreakdown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const rows = partsAgainstPlan(b);
  return (
    <View style={[styles.card, styles.partsCard]}>
      {rows.map((p) => {
        // Nothing noted for a part is said as that ("Nothing noted · plan ≈ ৳4,780"), never "৳0 of …"
        const planned = p.planned != null ? `${p.estimate ? '≈\u00A0' : ''}${f.money(p.planned)}` : null;
        const spentText = p.spent > 0 ? f.money(p.spent) : t('spent.nothingNoted');
        const planText =
          p.spent > 0
            ? planned
              ? t('spent.ofPlan', { amount: planned })
              : `· ${t('spent.noPlan')}`
            : planned
              ? `· ${t('spent.planAmount', { amount: planned })}`
              : `· ${t('spent.noPlan')}`;
        return (
          <View
            key={p.key}
            style={styles.partRow}
            accessible
            accessibilityLabel={t('spent.partA11y', {
              part: partName(p.key, t),
              spent: spentText,
              plan: p.over > 0 ? t('spent.over', { amount: f.money(p.over) }) : planText,
            })}
            testID={`spent-part-${p.key}`}
          >
            <View style={styles.partLine}>
              <Text style={styles.partName}>{partName(p.key, t)}</Text>
              <View style={styles.partRight}>
                <Text style={styles.partSpent}>
                  <Text style={p.spent > 0 ? styles.strong : undefined}>{spentText}</Text>
                  {p.over > 0 ? '' : ` ${planText}`}
                </Text>
                {p.over > 0 ? (
                  <View style={styles.overRow}>
                    <MaterialCommunityIcons name="alert-outline" size={15} color={colors.danger} />
                    <Text style={styles.overText}>{t('spent.over', { amount: f.money(p.over) })}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {p.planned ? (
              <View style={[styles.partTrack, { backgroundColor: partTrack(colors, p.key) }]}>
                <View style={[styles.partFill, { width: `${(p.over > 0 ? 1 : p.share) * 100}%`, backgroundColor: partColor(colors, p.key) }]} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "By day" (frames 38 and 40): what was spent as a bar, the plan as a mark, the amounts at the end, and the key. */
export function SpentByDay({ rows }: { rows: readonly DayRow[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  // Large text: the date and the amounts on a line, the drawing under them
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const [width, setWidth] = useState(156);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.spent ?? 0, r.plan ?? 0)));
  const x = (v: number) => (v / max) * Math.max(0, width - 6);
  return (
    <View style={styles.card} accessibilityLabel={t('spent.byDayA11y')} testID="spent-by-day">
      {rows.map((r) => {
        const label = r.when === 'today' ? t('today.open') : f.time(`${dayParts(r.date, i18n.language).weekday} ${dayParts(r.date, i18n.language).day}`);
        const spent = r.spent != null ? f.money(r.spent) : r.when === 'future' ? t('spent.notYet') : t('spent.nothingNoted');
        const plan = r.plan != null ? t('spent.planAmount', { amount: `${r.estimate ? '≈\u00A0' : ''}${f.money(r.plan)}` }) : null;
        const drawing = (
          <View style={stacked ? styles.dayDrawingStacked : styles.dayDrawing} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {r.spent ? <View style={[styles.daySpent, { width: Math.max(2, x(r.spent)) }]} /> : null}
            {r.plan != null ? <View style={[styles.dayMark, { left: x(r.plan) }]} /> : null}
          </View>
        );
        const amounts = (
          <View style={styles.dayAmounts}>
            <Text style={[styles.dayAmount, r.spent == null && styles.dayAmountNone]}>{spent}</Text>
            {plan ? <Text style={styles.dayPlan}>{plan}</Text> : null}
          </View>
        );
        return (
          <View
            key={r.date}
            style={[styles.dayRow, stacked && styles.dayRowStacked]}
            accessible
            accessibilityLabel={[label, spent, plan].filter(Boolean).join(', ')}
            testID={`spent-day-${r.date}`}
          >
            {stacked ? (
              <>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayLabel, r.when === 'today' && styles.dayLabelToday]}>{label}</Text>
                  {amounts}
                </View>
                {drawing}
              </>
            ) : (
              <>
                <Text style={[styles.dayLabel, r.when === 'today' && styles.dayLabelToday]} numberOfLines={1}>
                  {label}
                </Text>
                {drawing}
                {amounts}
              </>
            )}
          </View>
        );
      })}
      <View style={styles.key} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.keyItem}>
          <View style={[styles.keySpent, { backgroundColor: colors.accent }]} />
          <Text style={styles.keyText}>{t('spent.keySpent')}</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={[styles.keyMark, { backgroundColor: colors.textPrimary }]} />
          <Text style={styles.keyText}>{t('spent.keyPlan')}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * "The plan and what you spent" (frame 40): a row for each part, what wasn't in the plan, and all together. At large
 * text each row stacks, its numbers under its words with "Plan" and "Spent" beside them (Bangla at 1.6× broke the
 * parts' names mid-word in a column beside two number columns).
 */
export function PlanTable({ b }: { b: BudgetBreakdown }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const table = planAndSpent(b);
  const plain = (x: number) => f.money(x).replace('৳', '');
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const sub = (spent: number | null, planned: number | null) =>
    spent == null ? t('spent.nothingNoted') : planned == null ? t('spent.notPlanned') : againstPlan(spent, planned, t, f);
  // The two numbers of a row: in their columns, or (large text) on a line of their own with their names
  const numbers = (plan: string, spent: string, total = false) =>
    stacked ? (
      <View style={styles.tdNumbers}>
        <Text style={styles.tdNumberLabel}>
          {`${t('spent.colPlan')} `}
          <Text style={styles.tdPlanInline}>{plan}</Text>
        </Text>
        <Text style={styles.tdNumberLabel}>
          {`${t('spent.colSpent')} `}
          <Text style={[styles.tdSpentInline, total && styles.tfootSpent]}>{spent}</Text>
        </Text>
      </View>
    ) : (
      <>
        <Text style={styles.tdPlan} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {plan}
        </Text>
        <Text style={[styles.tdSpent, total && styles.tfootSpent]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {spent}
        </Text>
      </>
    );
  const row = [styles.tr, stacked && styles.trStacked];
  return (
    <View style={[styles.card, styles.tableCard]} testID="spent-table">
      <Text style={styles.h2Card} accessibilityRole="header">
        {t('spent.planAndSpent')}
      </Text>
      {stacked ? null : (
        <View style={styles.tableHead} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.th, styles.thPart]}>{t('spent.colPart')}</Text>
          <Text style={styles.th}>{t('spent.colPlan')}</Text>
          <Text style={styles.th}>{t('spent.colSpent')}</Text>
        </View>
      )}
      {table.rows.map((r) => {
        const words = sub(r.spent, r.planned);
        const more = r.spent != null && r.planned != null && r.spent > r.planned;
        const planText = r.planned != null ? `${r.estimate ? '≈\u00A0' : ''}${plain(r.planned)}` : '–';
        return (
          <View
            key={r.key}
            style={row}
            accessible
            accessibilityLabel={`${partName(r.key, t)}: ${t('spent.colPlan')} ${planText}, ${t('spent.colSpent')} ${r.spent != null ? f.money(r.spent) : '–'}, ${words}`}
            testID={`spent-row-${r.key}`}
          >
            <View style={styles.tdPart}>
              <View style={styles.tdName}>
                <View style={[styles.swatch, { backgroundColor: partColor(colors, r.key) }]} />
                <Text style={styles.tdNameText}>{partName(r.key, t)}</Text>
              </View>
              <View style={styles.tdSubRow}>
                {more ? <MaterialCommunityIcons name="alert-outline" size={14} color={colors.danger} /> : null}
                <Text style={[styles.tdSub, more && styles.tdSubOver]}>{words}</Text>
              </View>
            </View>
            {numbers(planText, r.spent != null ? plain(r.spent) : '–')}
          </View>
        );
      })}
      {table.unplanned ? (
        <View
          style={row}
          accessible
          accessibilityLabel={`${t('spent.notInPlan')}: ${table.unplanned.parts.map((k) => partName(k, t)).join(', ')}, ${f.money(table.unplanned.spent)}`}
          testID="spent-row-unplanned"
        >
          <View style={styles.tdPart}>
            <View style={styles.tdName}>
              <View style={[styles.swatch, { backgroundColor: colors.partUnplanned }]} />
              <Text style={styles.tdNameText}>{t('spent.notInPlan')}</Text>
            </View>
            <Text style={[styles.tdSub, styles.tdSubIndent]}>
              {table.unplanned.parts.map((k, i) => (i ? partName(k, t).toLocaleLowerCase() : partName(k, t))).join(', ')}
            </Text>
          </View>
          {numbers('–', plain(table.unplanned.spent))}
        </View>
      ) : null}
      <View
        style={[styles.tfoot, stacked && styles.trStacked]}
        accessible
        accessibilityLabel={`${t('spent.allTogether')}: ${t('spent.colPlan')} ${table.planEstimate ? '≈\u00A0' : ''}${f.money(table.planTotal)}, ${t('spent.colSpent')} ${f.money(table.spentTotal)}`}
      >
        <Text style={styles.tfootName}>{t('spent.allTogether')}</Text>
        {numbers(`${table.planEstimate ? '≈\u00A0' : ''}${plain(table.planTotal)}`, plain(table.spentTotal), true)}
      </View>
    </View>
  );
}

/** "The biggest costs" (frame 40): the largest notes, each opening to be changed */
export function BiggestCosts({ notes, onOpen }: { notes: readonly Expense[]; onOpen?: (e: Expense) => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  return (
    <View style={[styles.card, styles.listCard]} testID="spent-biggest">
      {notes.map((e, i) => {
        const title = noteTitle(e, t);
        // A note without words is titled by its part: the line under it is then its day alone
        const day = f.time(dayDate(e.day, i18n.language));
        const sub = e.note ? `${partName(e.part, t)} · ${day}` : day;
        const body = (
          <>
            <View style={styles.flex}>
              <Text style={styles.bigTitle}>{title}</Text>
              <Text style={styles.bigSub}>{sub}</Text>
            </View>
            <Text style={styles.bigAmount}>{f.money(e.amount)}</Text>
          </>
        );
        return onOpen ? (
          <PressableScale
            key={e.id}
            pressEffect="opacity"
            haptic="selection"
            onPress={() => onOpen(e)}
            style={[styles.bigRow, i < notes.length - 1 && styles.rowLine]}
            accessibilityRole="button"
            accessibilityLabel={t('spent.noteA11y', { title, amount: f.money(e.amount), part: sub })}
            testID={`spent-biggest-${e.id}`}
          >
            {body}
          </PressableScale>
        ) : (
          <View key={e.id} style={[styles.bigRow, i < notes.length - 1 && styles.rowLine]}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** "Everything you noted" with how many, opening the full list */
export function NotedRow({ count, onPress }: { count: number; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={styles.noted}
      accessibilityRole="button"
      accessibilityLabel={`${t('spent.everything')}, ${f.n(count)}`}
      testID="spent-all"
    >
      <Text style={styles.notedText}>{t('spent.everything')}</Text>
      <Text style={styles.notedCount}>{f.n(count)}</Text>
      <LineIcon name="chevronRight" size={20} color={colors.textTertiary} strokeWidth={2} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700', color: t.colors.textPrimary },
  muted: { fontSize: 13.5, color: t.colors.textSecondary, marginTop: 10 },
  hero: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18, borderRadius: t.radius.hero, backgroundColor: t.colors.hero },
  heroPlan: { paddingTop: 18 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.96, color: t.colors.highlight },
  total: {
    marginTop: 4,
    fontFamily: t.type.title.fontFamily,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: 'normal',
    color: t.colors.onHero,
    includeFontPadding: false,
  },
  totalPlan: { fontSize: 36, lineHeight: 42 },
  of: { fontSize: 15, color: t.colors.onHeroSecondary, minHeight: 22 },
  track: { height: 8, marginTop: 12, borderRadius: 4, backgroundColor: t.colors.heroBarTrack, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: t.colors.heroBar },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12 },
  statusIcon: { marginTop: 1 },
  statusMain: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '700', color: t.colors.onHero },
  line: { marginTop: 6, fontSize: 13.5, lineHeight: 19.5, color: t.colors.onHeroSecondary },
  lineFirst: { marginTop: 4 },
  lineWarning: { flex: 1, marginTop: 0, color: t.colors.heroWarning },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.heroQuiet },
  cell: { flexGrow: 1, flexBasis: 120, gap: 2 },
  cellLabel: { fontSize: 12, color: t.colors.onHeroSecondary },
  cellValue: { fontSize: 16, fontWeight: '700', color: t.colors.onHero },
  heroAdd: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: t.colors.heroQuiet,
  },
  heroAddText: { fontSize: 15, fontWeight: '500', color: t.colors.onHero },
  card: { padding: t.spacing.lg, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  h2Card: { flexShrink: 1, fontFamily: t.type.title.fontFamily, fontSize: 19, lineHeight: 24, fontWeight: 'normal', color: t.colors.textPrimary },
  todayHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 },
  todaySum: { fontSize: 13.5, color: t.colors.textSecondary },
  meter: { height: 6, marginTop: 10, borderRadius: 3, backgroundColor: t.colors.accentTrack, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  noteList: { marginTop: 8 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  noteTime: { width: 42, fontSize: 13, color: t.colors.textSecondary },
  noteWords: { flex: 1, minWidth: 0 },
  noteTitle: { fontSize: 14.5, color: t.colors.textPrimary },
  noteSub: { fontSize: 12.5, color: t.colors.textSecondary, marginTop: 1 },
  noteAmount: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  addButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: t.colors.accentStrong,
  },
  addText: { fontSize: 15.5, fontWeight: '500', color: t.colors.onAccent },
  partsCard: { paddingVertical: 8 },
  partRow: { minHeight: 58, justifyContent: 'center', gap: 8, paddingVertical: 6 },
  partLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 },
  partName: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  partRight: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  partSpent: { fontSize: 14.5, color: t.colors.textSecondary, textAlign: 'right' },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overText: { fontSize: 13.5, fontWeight: '700', color: t.colors.danger },
  partTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  partFill: { height: 8, borderRadius: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  dayRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 6 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  dayLabel: { minWidth: 50, fontSize: 13.5, color: t.colors.textSecondary },
  dayLabelToday: { fontWeight: '700', color: t.colors.textPrimary },
  dayDrawing: { flex: 1, height: 20 },
  dayDrawingStacked: { height: 20 },
  // Frame 38: a 12 dp bar, square at the start and rounded 4 dp at its end; the plan a 2 dp mark the bar's height and more
  daySpent: { position: 'absolute', left: 0, top: 4, height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: t.colors.accent },
  dayMark: { position: 'absolute', top: 0, width: 2, height: 20, backgroundColor: t.colors.textPrimary },
  dayAmounts: { alignItems: 'flex-end', gap: 1, minWidth: 84 },
  dayAmount: { fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
  dayAmountNone: { fontWeight: '400', color: t.colors.textSecondary },
  dayPlan: { fontSize: 12, color: t.colors.textSecondary },
  key: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 6 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySpent: { width: 14, height: 8, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  keyMark: { width: 2, height: 14 },
  keyText: { fontSize: 12.5, lineHeight: 17, color: t.colors.textSecondary },
  tableCard: { paddingBottom: 6 },
  tableHead: { flexDirection: 'row', alignItems: 'center', minHeight: 28, marginTop: 8 },
  th: { width: 76, fontSize: 12.5, fontWeight: '500', textAlign: 'right', color: t.colors.textSecondary },
  // The parts' column needs no heading on screen (frame 40); screen readers read each row whole
  thPart: { flex: 1, width: undefined, opacity: 0 },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.colors.divider },
  tdPart: { flex: 1, minWidth: 0, gap: 2 },
  tdName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  tdNameText: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  tdSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 18 },
  tdSub: { flexShrink: 1, fontSize: 12.5, color: t.colors.textSecondary },
  tdSubIndent: { paddingLeft: 18 },
  tdSubOver: { fontWeight: '700', color: t.colors.danger },
  tdPlan: { width: 76, fontSize: 14.5, textAlign: 'right', color: t.colors.textSecondary },
  tdSpent: { width: 76, fontSize: 14.5, fontWeight: '700', textAlign: 'right', color: t.colors.textPrimary },
  trStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 10 },
  tdNumbers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, paddingLeft: 18 },
  tdNumberLabel: { fontSize: 13, color: t.colors.textSecondary },
  tdPlanInline: { fontSize: 14.5, color: t.colors.textSecondary },
  tdSpentInline: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  tfoot: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: 2, borderTopColor: t.colors.textPrimary },
  tfootName: { flex: 1, fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  tfootSpent: { fontSize: 15.5 },
  listCard: { paddingVertical: 4 },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8 },
  bigTitle: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  bigSub: { fontSize: 13, color: t.colors.textSecondary, marginTop: 2 },
  bigAmount: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  noted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  notedText: { flex: 1, fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  notedCount: { fontSize: 14, color: t.colors.textSecondary },
}));
