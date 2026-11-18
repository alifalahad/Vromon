/**
 * Breakfast or dinner where you stay (docs/trip-upgrades, step 3): not a stop, so it's a plain row of the
 * timeline (docs/ui-refresh step 14) before "From …" (breakfast, before leaving) or after "Back at …"
 * (dinner, after getting back): its time, then "Breakfast where you stay · 45 min · No cost".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ItineraryItem } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { TIME_COL } from '../plan/PlanRows';
import { usePlanFormat } from '../plan/usePlanFormat';
import { mealTitle } from './meals';

export function StayMealRow({ item }: { item: ItineraryItem | null | undefined }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  if (!item) return null;
  const title = mealTitle(item, t) ?? item.title;
  const rest = [f.duration(item.duration_minutes), t('meals.noCost')].join(' · ');
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${f.time(item.start_time)}–${f.time(item.end_time)}, ${title}, ${t('meals.noCost')}`}
      testID={`stay-meal-${item.id}`}
    >
      <Text style={styles.time} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
        {f.time(item.start_time)}
      </Text>
      <View style={styles.body}>
        <View style={[styles.ring, { borderColor: planColors(theme).dash }]}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.text}>
          <Text style={styles.name}>{title}</Text>
          {` · ${rest}`}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, marginVertical: 2 },
  time: { width: TIME_COL, textAlign: 'right', fontSize: 13, color: t.colors.textSecondary },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12 },
  ring: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 14, color: t.colors.textSecondary },
  name: { fontWeight: '500', color: t.colors.textPrimary },
}));
