/**
 * The first and last rows of a day's plan (docs/trip-upgrades, step 2; docs/ui-refresh step 14, frame 29):
 * "08:50 From Hotel Beach Way · 8 min walk" and "20:10 Back at Hotel Beach Way · 6 min walk", with the
 * time you leave and the time you're back. A home that isn't yours is only "with family or friends",
 * with no time or fare (the server doesn't say how far it is).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { BaseLeg, DayBase } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { TIME_COL } from '../plan/PlanRows';
import { fromMinutes } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { baseName, stayIcon } from './stays';

const MODES = ['walk', 'rickshaw', 'cng', 'car'];

export function BaseRow({
  way,
  base,
  leg,
  at,
}: {
  way: 'from' | 'back';
  base: DayBase | null | undefined;
  leg: BaseLeg | null | undefined;
  /** When you leave, or when you're back (minutes of the day) */
  at?: number | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const name = baseName(base, t);
  if (!base || !name) return null;
  const title = t(way === 'from' ? 'stays.from' : 'stays.backAt', { place: name });
  const time = at != null ? f.time(fromMinutes(at)) : null;
  const ride = leg ? (MODES.includes(leg.mode) ? t(`stays.rideBy.${leg.mode}`, { time: f.duration(leg.minutes) }) : f.duration(leg.minutes)) : null;
  const extra = [ride, way === 'back' && leg && leg.cost > 0 ? t('plan.legFare', { amount: f.money(leg.cost) }) : null, base.estimate ? t('stays.estimate') : null].filter(Boolean);
  return (
    <View style={styles.row} accessible accessibilityLabel={[time, title, ...extra].filter(Boolean).join(', ')} testID={`base-${way}`}>
      <Text style={styles.time} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
        {time ?? ''}
      </Text>
      <View style={styles.body}>
        <View style={[styles.ring, { borderColor: planColors(theme).dash }]}>
          <MaterialCommunityIcons name={stayIcon(base.kind)} size={17} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.text}>
          <Text style={styles.name}>{title}</Text>
          {extra.length ? ` · ${extra.join(' · ')}` : ''}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, marginVertical: 2 },
  time: { width: TIME_COL, textAlign: 'right', fontSize: 13, color: t.colors.textSecondary },
  // The ring's centre lines up with the stops' badges
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12 },
  ring: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 14, color: t.colors.textSecondary },
  name: { fontWeight: '500', color: t.colors.textPrimary },
}));
