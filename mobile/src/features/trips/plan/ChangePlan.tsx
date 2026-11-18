/**
 * "Not quite right?" under the day (docs/ui-refresh step 14, frame 29): the whole trip more relaxed,
 * cheaper, quieter or fuller (every day changes, the must-dos stay), or new ideas for only this day.
 * The same actions and confirmations as before; only your own trip has it.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AdaptationType } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from './usePlanFormat';

const CHANGES: { type: AdaptationType; key: 'relax' | 'cheaper' | 'quieter' | 'fuller' }[] = [
  { type: 'relax', key: 'relax' },
  { type: 'reduce_budget', key: 'cheaper' },
  { type: 'avoid_crowds', key: 'quieter' },
  { type: 'energise', key: 'fuller' },
];

export function ChangePlan({
  dayNumber,
  busy,
  onChange,
  onNewIdeas,
}: {
  dayNumber: number;
  busy: boolean;
  onChange: (type: AdaptationType) => void;
  onNewIdeas: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (
    <View style={styles.card} testID="change-plan">
      <Text style={styles.title} accessibilityRole="header">
        {t('plan.notQuiteRight')}
      </Text>
      <Text style={styles.label}>{t('plan.wholeTrip')}</Text>
      <View style={styles.chips}>
        {CHANGES.map((c) => (
          <PressableScale
            key={c.type}
            haptic="medium"
            disabled={busy}
            onPress={() => onChange(c.type)}
            style={[styles.chip, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityHint={t('plan.changeAllHint')}
            accessibilityState={{ disabled: busy }}
            testID={`change-${c.type}`}
          >
            <Text style={styles.chipText}>{t(`plan.${c.key}`)}</Text>
          </PressableScale>
        ))}
      </View>
      <Text style={styles.hint}>{t('plan.changeAllHint')}</Text>
      <Text style={[styles.label, styles.second]}>{t('plan.onlyThisDay')}</Text>
      <PressableScale
        haptic="medium"
        disabled={busy}
        onPress={onNewIdeas}
        style={[styles.ideas, busy && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        testID="new-ideas"
      >
        <MaterialCommunityIcons name="refresh" size={18} color={colors.textPrimary} />
        <Text style={styles.chipText}>{t('plan.newIdeasDay', { n: f.n(dayNumber) })}</Text>
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const chipBg = t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset;
  return {
    card: { padding: 16, borderRadius: 22, borderWidth: 1, borderColor: t.colors.border },
    title: { ...t.type.title, fontSize: 19, lineHeight: 24, color: t.colors.textPrimary },
    label: { marginTop: 10, fontSize: 13, fontWeight: '700', color: t.colors.textSecondary },
    second: { marginTop: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: chipBg },
    chipText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
    hint: { marginTop: 8, fontSize: 13, color: t.colors.textSecondary },
    ideas: {
      marginTop: 8,
      minHeight: 48,
      borderRadius: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      backgroundColor: chipBg,
    },
    disabled: { opacity: 0.5 },
  };
});
