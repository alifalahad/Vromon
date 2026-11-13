/**
 * "Meals" on the New trip screen (docs/trip-upgrades, step 3): the plan in a line ("Best places to
 * eat" by default); opens MealsSheet. With a family stay, a one-tap offer to have breakfast and
 * dinner there (shown once).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { MealPlan } from '../../../types';
import { Button } from '../../../ui/Button';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planSummary } from './meals';

export function MealsRow({ plan, onPress }: { plan: MealPlan | null; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const summary = planSummary(plan, t);
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${t('meals.title')}. ${summary}`}
      testID="meals-open"
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name="silverware-fork-knife" size={22} color={colors.onAccentSoft} />
      </View>
      <Text style={[styles.value, styles.flex]} numberOfLines={2}>
        {summary}
      </Text>
      <Text style={styles.link}>{t('newTrip.change')}</Text>
    </PressableScale>
  );
}

/** "You're staying with family: have breakfast and dinner there?" Yes / No thanks. */
export function StayMealsOffer({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.offer} testID="meals-offer">
      <View style={styles.offerHead}>
        <MaterialCommunityIcons name="home-heart" size={22} color={colors.textSecondary} />
        <Text style={[styles.offerText, styles.flex]}>{t('meals.offer')}</Text>
      </View>
      <View style={styles.offerButtons}>
        <Button variant="secondary" label={t('meals.offerNo')} onPress={onNo} style={styles.flex} testID="meals-offer-no" />
        <Button label={t('meals.offerYes')} onPress={onYes} style={styles.flex} testID="meals-offer-yes" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 72,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
  },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  value: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  offer: { gap: t.spacing.md, padding: t.spacing.lg, borderRadius: 20, backgroundColor: t.colors.surface },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  offerText: { ...t.type.body, color: t.colors.textPrimary },
  offerButtons: { flexDirection: 'row', gap: t.spacing.sm },
}));
