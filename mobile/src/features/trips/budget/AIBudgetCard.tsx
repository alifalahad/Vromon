/**
 * Vromon Mobile — the AI budget (POST /trips/{id}/budget/ai) on the budget screen.
 *
 * Gemini reads Vromon's own facts for this trip (hotel rates in the town, today's market prices,
 * entry fees, the ways there) and suggests a feasible budget per part, each with what it's based
 * on, a range, and what it had to assume. The server checks the answer and adds up the total.
 * Nothing changes until "Use as my budget"; the budget can still be set by hand when the trip is made.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ApiError, tripsApi } from '../../../services/api';
import type { AIBudget } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useReduceMotion } from '../../../ui/useReduceMotion';
import { usePlanFormat } from '../plan/usePlanFormat';

type Props = {
  tripId: number;
  /** Your own trip: the estimate can become its budget */
  mine: boolean;
  currentBudget: number;
  /** After the budget was changed (a message for the snackbar) */
  onApplied: (message: string) => void;
};

export function AIBudgetCard({ tripId, mine, currentBudget, onApplied }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const lang = i18n.language.startsWith('bn') ? 'bn' : 'en';
  // Asked for only on a tap (it takes a few seconds and calls Gemini), then kept for this visit
  const q = useQuery<AIBudget, Error>({
    queryKey: ['aiBudget', tripId, lang],
    queryFn: () => tripsApi.aiBudget(tripId, lang),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });
  const [applying, setApplying] = useState(false);
  const data = q.data;
  const loading = q.isFetching;

  const use = async () => {
    if (!data) return;
    setApplying(true);
    try {
      await tripsApi.update(tripId, { total_budget: data.total });
      haptics.success();
      for (const queryKey of [['budget', tripId], ['trip', tripId], ['trips']]) queryClient.invalidateQueries({ queryKey });
      onApplied(t('aiBudget.applied', { amount: f.money(data.total) }));
    } catch (e) {
      haptics.error();
      onApplied(`${t('budget.failed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  const errorText =
    q.error instanceof ApiError && q.error.status === 503 ? t('aiBudget.notSetUp') : q.error ? t('aiBudget.failed') : null;
  const sameAsBudget = !!data && Math.round(data.total) === Math.round(currentBudget);

  return (
    <View style={styles.card} testID="ai-budget">
      <View style={styles.head}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="creation" size={22} color={colors.link} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {t('aiBudget.title')}
          </Text>
          <Text style={styles.sub}>{t('aiBudget.sub')}</Text>
        </View>
      </View>

      {!data && !loading ? (
        <>
          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
          <PressableScale
            haptic="selection"
            onPress={() => q.refetch()}
            style={styles.primary}
            accessibilityRole="button"
            testID="ai-budget-run"
          >
            <MaterialCommunityIcons name="creation" size={18} color={colors.onAccent} />
            <Text style={styles.primaryText}>{errorText ? t('aiBudget.retry') : t('aiBudget.run')}</Text>
          </PressableScale>
        </>
      ) : null}

      {loading ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.link} />
          <Text style={styles.sub}>{t('aiBudget.reading')}</Text>
        </View>
      ) : null}

      {data && !loading ? (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(250)} style={styles.result} testID="ai-budget-result">
          <View style={styles.totalRow}>
            <Text style={styles.total} maxFontSizeMultiplier={1.6} testID="ai-budget-total">
              ≈ {f.money(data.total)}
            </Text>
            <View style={[styles.chip, styles[`chip_${data.confidence}`]]}>
              <Text style={styles.chipText}>{t(`aiBudget.confidence.${data.confidence}`)}</Text>
            </View>
          </View>
          <Text style={styles.sub}>
            {t('aiBudget.range', { low: f.money(data.low), high: f.money(data.high) })} ·{' '}
            {t('aiBudget.perPerson', { amount: f.money(data.per_person) })}
          </Text>

          <View style={styles.rows}>
            {data.categories.map((c, i) => (
              <View key={c.key} style={[styles.row, i < data.categories.length - 1 && styles.rowLine]} testID={`ai-budget-${c.key}`}>
                <View style={styles.flex}>
                  <Text style={styles.rowLabel}>{c.key === 'other' ? t('aiBudget.other') : t(`budget.parts.${c.key}`)}</Text>
                  <Text style={styles.basis}>{c.basis}</Text>
                </View>
                <View style={styles.amounts}>
                  <Text style={styles.amount}>{f.money(c.amount)}</Text>
                  {c.low !== c.high ? (
                    <Text style={styles.small}>
                      {f.money(c.low)}–{f.money(c.high)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {!data.start_known ? <Text style={styles.note}>{t('aiBudget.noStart')}</Text> : null}

          {data.assumptions.length ? (
            <View style={styles.assumptions}>
              <Text style={styles.smallHead}>{t('aiBudget.assumed')}</Text>
              {data.assumptions.map((a) => (
                <View key={a} style={styles.bullet}>
                  <Text style={styles.small}>•</Text>
                  <Text style={[styles.small, styles.flex]}>{a}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            {mine && !sameAsBudget ? (
              <PressableScale
                haptic="selection"
                onPress={use}
                disabled={applying}
                style={styles.primary}
                accessibilityRole="button"
                testID="ai-budget-use"
              >
                {applying ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryText}>{t('aiBudget.use', { amount: f.money(data.total) })}</Text>
                )}
              </PressableScale>
            ) : null}
            {sameAsBudget ? <Text style={styles.done}>{t('aiBudget.isYours')}</Text> : null}
            <PressableScale haptic="selection" onPress={() => q.refetch()} style={styles.secondary} accessibilityRole="button" testID="ai-budget-again">
              <Text style={styles.secondaryText}>{t('aiBudget.again')}</Text>
            </PressableScale>
          </View>
          <Text style={styles.note}>{t('aiBudget.footnote', { model: data.model, date: data.made_on })}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.divider },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  flex: { flex: 1, minWidth: 0 },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  sub: { ...t.type.footnote, color: t.colors.textSecondary },
  error: { ...t.type.footnote, color: t.colors.danger },
  loading: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 44 },
  result: { gap: t.spacing.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm },
  total: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: t.colors.textPrimary },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chip_low: { backgroundColor: t.colors.surfaceInset },
  chip_medium: { backgroundColor: t.colors.accentSoft },
  chip_high: { backgroundColor: t.colors.accentSoft },
  chipText: { ...t.type.caption, fontWeight: '700', color: t.colors.textPrimary },
  rows: { borderRadius: 14, backgroundColor: t.colors.surfaceInset, paddingHorizontal: t.spacing.md },
  row: { flexDirection: 'row', gap: t.spacing.md, paddingVertical: t.spacing.sm + 2 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  rowLabel: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  basis: { ...t.type.caption, color: t.colors.textSecondary, marginTop: 2 },
  amounts: { alignItems: 'flex-end' },
  amount: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  small: { ...t.type.caption, color: t.colors.textSecondary },
  smallHead: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  assumptions: { gap: 4 },
  bullet: { flexDirection: 'row', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm },
  primary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: t.spacing.lg,
    borderRadius: 999,
    backgroundColor: t.colors.accent,
  },
  primaryText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccent },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.lg, borderRadius: 999, backgroundColor: t.colors.accentSoft },
  secondaryText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccentSoft },
  done: { ...t.type.footnote, fontWeight: '600', color: t.colors.success },
  note: { ...t.type.caption, color: t.colors.textTertiary },
}));
