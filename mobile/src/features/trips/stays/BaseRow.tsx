/**
 * The first and last rows of a day's plan (docs/trip-upgrades, step 2): "From Hotel X · 15 min"
 * and "Back to Hotel X · 25 min · ৳80". A home that isn't yours is only "with family or friends",
 * with no time or fare (the server doesn't say how far it is).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { BaseLeg, DayBase } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../plan/usePlanFormat';
import { baseName, stayIcon } from './stays';

export function BaseRow({ way, base, leg }: { way: 'from' | 'back'; base: DayBase | null | undefined; leg: BaseLeg | null | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const name = baseName(base, t);
  if (!base || !name) return null;
  const parts = [
    t(way === 'from' ? 'stays.from' : 'stays.backTo', { place: name }),
    leg ? f.duration(leg.minutes) : null,
    way === 'back' && leg && leg.cost > 0 ? f.money(leg.cost) : null,
    base.estimate ? t('stays.estimate') : null,
  ].filter(Boolean);
  return (
    <View style={styles.row} accessible accessibilityLabel={parts.join(', ')} testID={`base-${way}`}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name={stayIcon(base.kind)} size={18} color={colors.textSecondary} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44, paddingVertical: 6 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  text: { ...t.type.callout, color: t.colors.textSecondary, flex: 1 },
}));
