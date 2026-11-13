/**
 * Meals (docs/trip-upgrades, step 3): per meal, the best places to eat (default), your own food, or
 * where you stay (breakfast and dinner only). For the whole trip it also takes what your own food
 * costs per person, in the trip's currency; for one day it can follow the trip's plan again.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fxApi } from '../../../services/api';
import type { MealPlan, MealSlot, MealSource } from '../../../types';
import { Button } from '../../../ui/Button';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { makeStyles, useTheme } from '../../../ui/theme';
import { Toggle } from '../../../ui/Toggle';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { currencySymbol, fromTaka, toTaka } from '../new/currency';
import { localDigits } from '../plan/usePlanFormat';
import { choicesFor, DEFAULT_PLAN, samePlan, SLOTS, withMeal } from './meals';

const SNAP_POINTS = ['85%'];

export function MealsSheet({
  visible,
  title,
  plan,
  tripPlan,
  currency = 'BDT',
  askCost = true,
  stayBreakfast = true,
  stayDinner = true,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** The plan being changed: the trip's, or a day's own (null: the day follows the trip's) */
  plan: MealPlan | null;
  /** One day: the trip's plan, which "Same as the whole trip" means */
  tripPlan?: MealPlan | null;
  /** The trip's currency: your own food's amount is entered in it (the server keeps taka) */
  currency?: string;
  askCost?: boolean;
  /** Where you stay isn't a choice when there's no breakfast or night there (the arrival day, the last day) */
  stayBreakfast?: boolean;
  stayDinner?: boolean;
  saving?: boolean;
  /** null: the day follows the trip's plan again */
  onSave: (plan: MealPlan | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const dayMode = tripPlan !== undefined;
  const foreign = currency !== 'BDT';
  const fx = useQuery({ queryKey: ['fx-rates'], queryFn: () => fxApi.rates(), staleTime: 60 * 60_000, enabled: visible && foreign && askCost });
  const rates = fx.data?.rates;
  // Without rates the amount is in taka
  const shownCurrency = foreign && rates ? currency : 'BDT';

  const [draft, setDraft] = useState<MealPlan>(plan ?? tripPlan ?? DEFAULT_PLAN);
  const [followTrip, setFollowTrip] = useState(dayMode && plan == null);
  const [amount, setAmount] = useState('');
  // A fresh draft each time it opens (set while rendering, not in an effect)
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      const start = plan ?? tripPlan ?? DEFAULT_PLAN;
      setDraft(start);
      setFollowTrip(dayMode && plan == null);
      const cost = start.own_cost_per_person;
      const inCurrency = cost != null ? (shownCurrency === 'BDT' ? cost : fromTaka(cost, shownCurrency, rates)) : null;
      setAmount(inCurrency != null ? String(Math.round(inCurrency)) : '');
    }
  }

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const parsed = amount.trim() === '' ? null : Number(amount.replace(/[^\d.]/g, ''));
  const badAmount = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);
  const costTaka = parsed == null || badAmount ? null : shownCurrency === 'BDT' ? parsed : toTaka(parsed, shownCurrency, rates);
  const next: MealPlan | null = followTrip ? null : { ...draft, own_cost_per_person: askCost ? (costTaka != null ? Math.round(costTaka) : null) : (plan?.own_cost_per_person ?? null) };
  const changed = dayMode ? (plan == null) !== (next == null) || (next != null && !samePlan(next, plan)) : !samePlan(next, plan ?? DEFAULT_PLAN);
  const usesOwn = !followTrip && SLOTS.some((s) => draft[s] === 'own');

  const label = (s: MealSource) => t(`meals.choice.${s}`);
  const options = (slot: MealSlot) =>
    choicesFor(slot)
      .filter((c) => c !== 'stay' || (slot === 'Breakfast' ? stayBreakfast : stayDinner))
      .map((c) => ({ value: c, label: label(c) }));

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      accessibilityLabel={title}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" testID="meals-sheet">
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.hint}>{t('meals.hint')}</Text>

        {dayMode ? (
          <View style={styles.followRow}>
            <Text style={styles.followText}>{t('meals.sameAsTrip')}</Text>
            <Toggle
              value={followTrip}
              onValueChange={(v) => {
                setFollowTrip(v);
                if (v) setDraft(tripPlan ?? DEFAULT_PLAN);
              }}
              accessibilityLabel={t('meals.sameAsTrip')}
              testID="meals-same-as-trip"
            />
          </View>
        ) : null}

        {SLOTS.map((slot) => (
          <View key={slot} style={[styles.meal, followTrip && styles.dimmed]} pointerEvents={followTrip ? 'none' : 'auto'}>
            <Text style={styles.mealName}>{t(`meals.slot.${slot}`)}</Text>
            <SegmentedControl
              options={options(slot)}
              value={draft[slot]}
              onChange={(v) => setDraft((d) => withMeal(d, slot, v))}
              testID={`meal-${slot}`}
            />
            <Text style={styles.sub}>{t(`meals.choiceSub.${draft[slot]}`)}</Text>
          </View>
        ))}

        {askCost && usesOwn ? (
          <View style={styles.meal}>
            <Text style={styles.mealName}>{t('meals.ownCost')}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>{currencySymbol(shownCurrency) ?? shownCurrency}</Text>
              <BottomSheetTextInput
                value={localDigits(amount, i18n.language)}
                onChangeText={(v) => setAmount(v.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))))}
                placeholder={t('meals.ownCostPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={7}
                style={styles.amountInput}
                accessibilityLabel={t('meals.ownCost')}
                autoComplete="off"
                importantForAutofill="no"
                testID="meals-own-cost"
              />
            </View>
            <Text style={[styles.sub, badAmount && { color: colors.danger }]}>{badAmount ? t('meals.badAmount') : t('meals.ownCostHint')}</Text>
          </View>
        ) : null}

        <Button label={t('common.save')} onPress={() => onSave(next)} disabled={!changed || badAmount || saving} loading={saving} testID="meals-save" />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.md },
  title: { ...t.type.title, color: t.colors.textPrimary },
  hint: { ...t.type.callout, color: t.colors.textSecondary },
  followRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, gap: t.spacing.md },
  followText: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  meal: { gap: t.spacing.xs },
  dimmed: { opacity: 0.45 },
  mealName: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  sub: { ...t.type.footnote, color: t.colors.textSecondary },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, borderWidth: 1, borderColor: t.colors.border, borderRadius: 12, paddingHorizontal: t.spacing.md, minHeight: 48 },
  currency: { ...t.type.body, fontWeight: '600', color: t.colors.textSecondary },
  amountInput: { ...t.type.body, color: t.colors.textPrimary, flex: 1, paddingVertical: 10 },
}));
