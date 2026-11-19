/**
 * Budget's "Change" (docs/ui-refresh step 18): a small sheet with the budget field from New trip (a typed
 * amount in any currency, or Budget, Comfort and Luxury for these travellers and days), saved through the
 * trip's PATCH. Each opening starts from the trip's budget as it is.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { makeStyles } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { BudgetCard } from '../new/BudgetCard';
import type { Currency } from '../new/currency';
import { tierBudget, type Tier } from '../new/newTrip';

const SNAP_POINTS = ['75%'];

export function ChangeBudgetSheet({
  visible,
  budget,
  travellers,
  days,
  busy,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** The trip's budget now, in taka */
  budget: number;
  travellers: number;
  days: number;
  busy: boolean;
  onClose: () => void;
  onSave: (taka: number) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const [amount, setAmount] = useState(budget);
  const [tier, setTier] = useState<Tier>('Comfort');
  const [byHand, setByHand] = useState(true);
  const [currency, setCurrency] = useState<Currency>('BDT');
  // Each opening starts from the trip's budget (typed, no level chosen)
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) {
      setAmount(budget);
      setByHand(true);
      setCurrency('BDT');
    }
  }
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );
  const changed = Math.round(amount) !== Math.round(budget);
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Edge-to-edge Android never resizes the window for the keyboard (as the other sheets with a field)
      android_keyboardInputMode="adjustPan"
      onDismiss={handleDismiss}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('budget.changeTitle')}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        testID="budget-change-sheet"
      >
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {t('budget.changeTitle')}
          </Text>
          <Text style={styles.sub}>{t('budget.changeSub')}</Text>
        </View>
        <BudgetCard
          budget={amount}
          tier={tier}
          byHand={byHand}
          travellers={travellers}
          currency={currency}
          hotelText={null}
          onBudget={(taka) => {
            setAmount(taka);
            setByHand(true);
          }}
          onTier={(x) => {
            setTier(x);
            setByHand(false);
            setAmount(tierBudget(x, travellers, days));
          }}
          onCurrency={setCurrency}
          testID="budget-change-amount"
        />
        <Button
          label={t('budget.changeSave')}
          onPress={() => onSave(Math.round(amount))}
          loading={busy}
          disabled={busy || !changed || amount <= 0}
          haptic="medium"
          testID="budget-change-save"
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.lg },
  title: { ...t.type.screenTitle, color: t.colors.textPrimary },
  sub: { ...t.type.callout, fontSize: 14.5, color: t.colors.textSecondary, marginTop: 2 },
}));
