/** "Where you'll stay" on the New trip screen: the nights' choice in a line; opens StaysSheet. */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../plan/usePlanFormat';
import { allSame, freeNights, pickName, stayIcon, type StayPick } from './stays';

export function StaysRow({ picks, onPress }: { picks: readonly StayPick[]; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const same = allSame(picks);
  const summary = same ? pickName(picks[0], t) : t('stays.differs');
  const free = freeNights(picks);
  const hint = same
    ? picks[0].kind === 'auto'
      ? t('stays.autoSub')
      : free
        ? t('stays.noCost')
        : null
    : free
      ? t('stays.freeNights', { count: free, n: f.n(free) })
      : null;
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={[t('stays.title'), summary, hint].filter(Boolean).join('. ')}
      testID="stays-open"
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name={stayIcon(same ? picks[0].kind : 'auto')} size={22} color={colors.onAccentSoft} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.value} numberOfLines={2}>
          {summary}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Text style={styles.link}>{t('newTrip.change')}</Text>
    </PressableScale>
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
  hint: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: 2 },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
