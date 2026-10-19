/**
 * The day's conditions at a glance, under the day on the trip screen: the
 * temperature, how many warnings, sunset and the sea. Each opens the
 * conditions screen for that day.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
// Inside the plan sheet, a plain scroll view loses the sideways swipe to the sheet
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { ConditionsDay } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat } from '../plan/usePlanFormat';
import { daySky, sky } from './useConditionText';

export function ConditionChips({ day, onOpen }: { day: ConditionsDay; onOpen: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const active = day.warnings.filter((w) => !w.kept);
  const serious = active.some((w) => w.code === 'storm');

  const chip = (key: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], text: string, tone?: 'danger' | 'warning') => (
    // The changed chip cross-fades in, it never jumps
    <Animated.View key={`${key}-${text}`} entering={FadeIn.duration(250)}>
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        onPress={onOpen}
        style={[styles.chip, tone === 'danger' && styles.danger, tone === 'warning' && styles.warning]}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={t('conditions.openHint')}
        testID={`cond-chip-${key}`}
      >
        <MaterialCommunityIcons name={icon} size={18} color={tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textSecondary} />
        <Text style={[styles.text, tone === 'danger' && styles.dangerText, tone === 'warning' && styles.warningText]}>{text}</Text>
      </PressableScale>
    </Animated.View>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="condition-chips">
      {day.in_forecast && day.temp_max != null && day.temp_min != null
        ? chip('temp', sky(daySky(day)).icon, t('conditions.temps', { max: f.n(day.temp_max), min: f.n(day.temp_min) }))
        : chip('temp', 'calendar-clock', t('conditions.noForecastShort'))}
      {active.length > 0 && chip('warnings', 'alert-outline', t('conditions.warnings', { count: active.length, n: f.n(active.length) }), serious ? 'danger' : 'warning')}
      {chip('sunset', 'weather-sunset-down', t('conditions.sunsetAt', { time: f.time(day.sunset) }))}
      {day.sea && chip('sea', 'waves', t('conditions.seaChip', { wave: f.km(day.sea.wave) }), day.sea.level === 'rough' ? 'warning' : undefined)}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.spacing.sm, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: t.radius.chip, backgroundColor: t.colors.surfaceInset },
  danger: { backgroundColor: t.colors.dangerBg },
  warning: { backgroundColor: t.colors.warningBg },
  text: { ...t.type.footnote, color: t.colors.textPrimary },
  dangerText: { color: t.colors.danger, fontWeight: '600' },
  warningText: { color: t.colors.warning, fontWeight: '600' },
}));
