/**
 * Budget's parts (docs/ui-refresh step 18, frame 37):
 *   - the hero: what the plan costs (≈ when a part is a guess), of your budget with "Change", the meter, one
 *     status line with an icon and words, the likely range, "Each" and "Of it, estimated" (on the trip with
 *     nothing noted, "Add what you spent" too: step 19);
 *   - "Where it goes": one bar in pieces with each part's share written inside when it fits, then the five
 *     parts as rows that are also its key; a part that isn't known has no colour and no piece, and says why;
 *   - "By day": one blue bar a day with the amount at its end;
 *   - a way to save: what changes, what it costs in time or comfort, "Save ৳…", Apply.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';

import type { BudgetBreakdown, BudgetPart } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { dayParts } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { anyEstimate, eachAmount, estimatedAmount, onPartColor, PART_ORDER, partColor, partDetail, pieces, statusKind, stayRows } from './budgetView';
import { HeroAddButton } from './SpentParts';

/** The total against the budget, in the hero colour. On the trip with nothing noted yet, "Add what you spent" under it (step 19). */
export function BudgetHero({
  b,
  onChange,
  onAdd,
}: {
  b: BudgetBreakdown;
  /** Your own trip: "Change" */
  onChange?: () => void;
  /** Your own trip under way, nothing noted: "Add what you spent" */
  onAdd?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const guess = anyEstimate(b);
  const kind = statusKind(b);
  const share = b.total_budget > 0 ? Math.min(1, b.total / b.total_budget) : 1;
  const tone = kind === 'left' ? colors.heroGood : kind === 'over' ? colors.heroDanger : colors.heroWarning;
  const main =
    kind === 'over'
      ? t('budget.statusOver', { amount: f.money(-b.left) })
      : kind === 'only'
        ? t('budget.statusOnly', { amount: f.money(b.left) })
        : t('budget.statusLeft', { amount: f.money(b.left) });
  const rest =
    kind === 'reach'
      ? t('budget.couldReach', { high: f.money(b.high) })
      : b.low !== b.high
        ? t('budget.likely', { low: f.money(b.low), high: f.money(b.high) })
        : null;
  const estimated = estimatedAmount(b);
  return (
    <View style={styles.hero} testID="budget-total">
      <Text style={styles.eyebrow}>{t(guess ? 'budget.planCosts' : 'budget.planCostsExact').toLocaleUpperCase(i18n.language)}</Text>
      <Text style={styles.total} maxFontSizeMultiplier={1.2} accessibilityRole="header">
        {`${guess ? '≈ ' : ''}${f.money(b.total)}`}
      </Text>
      <View style={styles.ofRow}>
        <Text style={styles.of}>{t('budget.ofYour', { amount: f.money(b.total_budget) })}</Text>
        {onChange ? (
          <PressableScale pressEffect="opacity" haptic="selection" onPress={onChange} style={styles.change} accessibilityRole="button" testID="budget-change">
            <Text style={styles.changeText}>{t('budget.change')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <View
        style={styles.track}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('budget.meterA11y', { n: f.n(Math.round((b.total / Math.max(1, b.total_budget)) * 100)) })}
      >
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
      <View style={styles.statusRow} accessibilityLiveRegion="polite" testID="budget-status">
        <MaterialCommunityIcons name={kind === 'left' ? 'check-circle-outline' : 'alert-outline'} size={18} color={tone} style={styles.statusIcon} />
        <Text style={styles.status}>
          <Text style={[styles.statusMain, kind !== 'left' && { color: tone }]}>{main}</Text>
          {rest ? ` · ${rest}` : ''}
        </Text>
      </View>
      <View style={styles.cells}>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>{t('budget.each')}</Text>
          <Text style={styles.cellValue}>{`${guess ? '≈ ' : ''}${f.money(eachAmount(b))}`}</Text>
        </View>
        {estimated > 0 ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>{t('budget.ofItEstimated')}</Text>
            <Text style={styles.cellValue}>{`≈ ${f.money(estimated)}`}</Text>
          </View>
        ) : null}
      </View>
      {onAdd ? <HeroAddButton onPress={onAdd} /> : null}
    </View>
  );
}

/** "Where it goes": the bar in pieces, then the parts as its key. */
export function WhereItGoes({ b }: { b: BudgetBreakdown }) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const f = usePlanFormat();
  // The frame's width until the bar is laid out
  const [width, setWidth] = useState(326);
  const shown = pieces(b);
  const room = width - 2 * Math.max(0, shown.length - 1);
  const parts = PART_ORDER.map((key) => b.parts.find((p) => p.key === key)).filter((p): p is BudgetPart => !!p);
  const name = (key: string, i: number) => {
    const n = t(`budget.parts.${key}`);
    return i === 0 ? n : n.toLocaleLowerCase();
  };
  return (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header">
        {t('budget.whereItGoes')}
      </Text>
      {shown.length ? (
        <View
          style={styles.bar}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={shown.map((p, i) => t('budget.barShare', { part: name(p.key, i), n: f.n(Math.round(p.share * 100)) })).join(', ')}
          testID="budget-bar"
        >
          {shown.map((p) => {
            const w = p.share * room;
            return (
              <View
                key={p.key}
                style={[styles.piece, { flexGrow: p.amount, backgroundColor: partColor(colors, p.key) }, w < 8 && styles.pieceTiny]}
                testID={`budget-piece-${p.key}`}
              >
                {w >= 34 ? (
                  <Text style={[styles.pieceText, { color: onPartColor(colors, p.key) }]} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                    {`${f.n(Math.round(p.share * 100))}%`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.rows}>
        {parts.map((p, i) => (
          <View key={p.key} style={i < parts.length - 1 && styles.rowLine}>
            <View style={styles.partRow} testID={`budget-part-${p.key}`}>
              <View style={[styles.swatch, p.known ? { backgroundColor: partColor(colors, p.key) } : styles.swatchNone]} />
              <View style={styles.flex}>
                <Text style={styles.partName}>{t(`budget.parts.${p.key}`)}</Text>
                <Text style={styles.partDetail}>{partDetail(p, b, t, f)}</Text>
              </View>
              <Text style={[styles.partAmount, !p.known && styles.unknown]}>
                {p.known ? `${p.estimate ? '≈ ' : ''}${f.money(p.amount ?? 0)}` : t('budget.unknown')}
              </Text>
            </View>
            {/* Several stays, or no hotel at all: a line for each, under the stay (trip upgrades step 2) */}
            {stayRows(p, t, f).map((l) => (
              <View key={l.key} style={styles.stayLine} accessible accessibilityLabel={`${l.nights}, ${l.name}, ${l.amount}`} testID={`budget-stay-${l.key}`}>
                <Text style={styles.stayNights}>{l.nights}</Text>
                <Text style={styles.stayName} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[styles.stayAmount, l.free && styles.unknown]}>{l.amount}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** "By day": a blue bar a day, the amount at its end, and what's counted. */
export function ByDay({ days }: { days: BudgetBreakdown['by_day'] }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  // Large text: the date and the amount on a line, the bar under them (Bangla at 1.6× broke the date and cut the amount)
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const max = Math.max(1, ...days.map((d) => d.amount));
  const label = (d: BudgetBreakdown['by_day'][number]) => {
    if (!d.date) return t('budget.dayLabel', { n: f.n(d.day_number) });
    const parts = dayParts(d.date, i18n.language);
    return f.time(`${parts.weekday} ${parts.day}`);
  };
  return (
    <View style={styles.card}>
      {days.map((d) => {
        const amount = `${d.estimate ? '≈ ' : ''}${f.money(d.amount)}`;
        return (
          <View
            key={d.day_number}
            style={[styles.dayRow, stacked && styles.dayRowStacked]}
            accessible
            accessibilityLabel={`${label(d)}: ${amount}`}
            testID={`budget-day-${d.day_number}`}
          >
            {stacked ? (
              <>
                <View style={styles.dayHead}>
                  <Text style={styles.dayLabel}>{label(d)}</Text>
                  <Text style={styles.dayAmount}>{amount}</Text>
                </View>
                <View style={[styles.dayBar, { width: `${(d.amount / max) * 100}%` }]} />
              </>
            ) : (
              <>
                <Text style={styles.dayLabel} numberOfLines={1}>
                  {label(d)}
                </Text>
                <View style={styles.dayTrack}>
                  {/* The longest day takes three quarters of the row: its amount follows the bar's end */}
                  <View style={[styles.dayBar, { width: `${(d.amount / max) * 72}%` }]} />
                  <Text style={styles.dayAmount}>{amount}</Text>
                </View>
              </>
            )}
          </View>
        );
      })}
      <Text style={styles.note}>{t('budget.byDayNote')}</Text>
    </View>
  );
}

/** One way to save: what changes, what it costs, the saving, and Apply (your own trip only). */
export function SaveCard({
  saveKey,
  title,
  sub,
  saving,
  busy,
  disabled,
  onApply,
}: {
  saveKey: string;
  title: string;
  sub: string | null;
  saving: string;
  busy: boolean;
  disabled: boolean;
  /** Absent on a friend's trip */
  onApply?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Large text: Apply under the words, not squeezing them
  const stacked = useWindowDimensions().fontScale >= 1.3;
  return (
    <View style={[styles.save, stacked && styles.saveStacked]} testID={`budget-save-${saveKey}`}>
      <View style={[styles.flex, styles.saveWords]}>
        <Text style={styles.saveTitle}>{title}</Text>
        {sub ? <Text style={styles.saveSub}>{sub}</Text> : null}
        <Text style={styles.saving}>{saving}</Text>
      </View>
      {onApply ? (
        <PressableScale
          haptic="selection"
          onPress={onApply}
          disabled={disabled}
          style={[styles.apply, stacked && styles.applyStacked, disabled && !busy && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={t('budget.applyA11y', { what: title, saving })}
          testID={`budget-apply-${saveKey}`}
        >
          {busy ? <ActivityIndicator size="small" color={colors.link} /> : <Text style={styles.applyText}>{t('budget.apply')}</Text>}
        </PressableScale>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  hero: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18, borderRadius: t.radius.hero, backgroundColor: t.colors.hero },
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
  ofRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', minHeight: 44 },
  of: { flexShrink: 1, fontSize: 15, color: t.colors.onHeroSecondary },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: 12, paddingRight: 4 },
  changeText: { fontSize: 14.5, fontWeight: '500', color: t.colors.heroLink },
  track: { height: 8, borderRadius: 4, backgroundColor: t.colors.heroBarTrack, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: t.colors.heroBar },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12 },
  statusIcon: { marginTop: 1 },
  status: { flex: 1, fontSize: 13.5, lineHeight: 19, color: t.colors.onHeroSecondary },
  statusMain: { fontWeight: '700', color: t.colors.onHero },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.heroQuiet },
  cell: { flexGrow: 1, flexBasis: 120, gap: 2 },
  cellLabel: { fontSize: 12, color: t.colors.onHeroSecondary },
  cellValue: { fontSize: 16, fontWeight: '700', color: t.colors.onHero },
  card: { padding: t.spacing.lg, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  h2: { fontFamily: t.type.title.fontFamily, fontSize: 19, lineHeight: 24, fontWeight: 'normal', color: t.colors.textPrimary },
  bar: { flexDirection: 'row', gap: 2, height: 28, marginTop: 12 },
  piece: { flexBasis: 0, minWidth: 4, borderRadius: 4, justifyContent: 'center', paddingLeft: 8, overflow: 'hidden' },
  pieceTiny: { borderRadius: 2, paddingLeft: 0 },
  pieceText: { fontSize: 12, fontWeight: '700' },
  rows: { marginTop: 8 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 8 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  // A part that isn't known has no colour (frame 37's rule): an empty mark keeps the rows lined up
  swatchNone: { borderWidth: 1.5, borderColor: t.colors.hairline },
  partName: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  partDetail: { fontSize: 13, lineHeight: 18, color: t.colors.textSecondary, marginTop: 2 },
  partAmount: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  unknown: { fontWeight: '400', color: t.colors.textSecondary },
  stayLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 32, paddingLeft: 24, paddingBottom: t.spacing.xs },
  stayNights: { ...t.type.footnote, color: t.colors.textSecondary, minWidth: 72 },
  stayName: { ...t.type.footnote, color: t.colors.textPrimary, flex: 1 },
  stayAmount: { ...t.type.footnote, fontWeight: '600', color: t.colors.textPrimary },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  dayRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingVertical: 6 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  // At least the frame's 50: Bangla's "বৃহস্পতি ২৬" is longer
  dayLabel: { minWidth: 54, fontSize: 13.5, color: t.colors.textSecondary },
  dayTrack: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayBar: { height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: t.colors.accent },
  dayAmount: { fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
  note: { marginTop: 10, fontSize: 12.5, lineHeight: 17, color: t.colors.textSecondary },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 92,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  saveStacked: { flexDirection: 'column', alignItems: 'stretch', paddingRight: 16 },
  saveWords: { gap: 3 },
  saveTitle: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: t.colors.textPrimary },
  saveSub: { fontSize: 13, lineHeight: 18, color: t.colors.textSecondary },
  saving: { fontSize: 13.5, fontWeight: '700', color: t.colors.success },
  apply: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: t.colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyStacked: { alignSelf: 'flex-start' },
  applyText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccentSoft },
  dim: { opacity: 0.5 },
}));
