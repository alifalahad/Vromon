/**
 * Breakfast or dinner where you stay (docs/trip-upgrades, step 3): not a stop, so it's a plain row
 * before "From …" (breakfast, before leaving) or after "Back to …" (dinner, after getting back).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ItineraryItem } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../plan/usePlanFormat';
import { mealTitle } from './meals';

export function StayMealRow({ item }: { item: ItineraryItem | null | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  if (!item) return null;
  const title = mealTitle(item, t) ?? item.title;
  const text = [`${f.time(item.start_time)}–${f.time(item.end_time)}`, title, t('meals.noCost')].join(' · ');
  return (
    <View style={styles.row} accessible accessibilityLabel={text} testID={`stay-meal-${item.id}`}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={colors.textSecondary} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44, paddingVertical: 6 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  text: { ...t.type.callout, color: t.colors.textSecondary, flex: 1 },
}));
