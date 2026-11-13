/**
 * Under a day's summary (docs/trip-upgrades, step 2): where the traveller sleeps that night,
 * "Tonight: Hotel X · Change". The last day has no night: "Last day: leave from Hotel X".
 * Only the owner can change it; a friend sees a home as "With family or friends".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ItineraryDay } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { baseName, stayIcon } from './stays';

export function TonightRow({ day, lastDay, onChange }: { day: ItineraryDay; lastDay: boolean; onChange?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const base = lastDay ? day.start_base : day.end_base;
  const name = baseName(base, t);
  if (!base || !name) return null;
  const text = t(lastDay ? 'stays.lastDay' : 'stays.tonight', { place: name });
  const body = (
    <>
      <MaterialCommunityIcons name={stayIcon(base.kind)} size={18} color={colors.textSecondary} />
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
      {onChange ? <Text style={styles.link}>{t('stays.change')}</Text> : null}
    </>
  );
  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityLabel={text} testID="stays-tonight">
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onChange}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${text}. ${t('stays.change')}`}
      testID="stays-tonight"
    >
      {body}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44, paddingHorizontal: t.spacing.xs },
  text: { ...t.type.callout, color: t.colors.textSecondary, flex: 1 },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
