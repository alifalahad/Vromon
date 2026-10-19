/**
 * Pick the trip's dates on a month grid: tap the first day, then the last.
 * Tapping a day before the first starts again from there. Days before today
 * can't be picked.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { localToday, parseDay } from '../dates';
import { localDigits } from '../plan/usePlanFormat';

type Props = {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  today?: string;
};

export function RangeCalendar({ start, end, onChange, today = localToday() }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => {
    const d = parseDay(start);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // The first tap picks the first day; the next one the last day
  const [picking, setPicking] = useState<'start' | 'end'>('start');

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= count; d++) out.push(localToday(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2026, 1, i + 1).toLocaleDateString(i18n.language, { weekday: 'narrow' })),
    [i18n.language],
  );
  const title = month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  const thisMonth = parseDay(today);
  const canGoBack = month > new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);

  const tap = (day: string) => {
    if (picking === 'start' || day < start) {
      onChange({ start: day, end: day });
      setPicking('end');
    } else {
      onChange({ start, end: day });
      setPicking('start');
    }
  };

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          disabled={!canGoBack}
          onPress={() => shift(-1)}
          style={[styles.arrow, !canGoBack && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={t('newTrip.prevMonth')}
          accessibilityState={{ disabled: !canGoBack }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.month} accessibilityRole="header">
          {localDigits(title, i18n.language)}
        </Text>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => shift(1)}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityLabel={t('newTrip.nextMonth')}
        >
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textPrimary} />
        </PressableScale>
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.cell} />;
          const past = day < today;
          const isEdge = day === start || day === end;
          const inside = day > start && day < end;
          const label = parseDay(day).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <View key={day} style={[styles.cell, (inside || (isEdge && start !== end)) && styles.band, day === start && styles.bandStart, day === end && styles.bandEnd]}>
              <PressableScale
                haptic="selection"
                disabled={past}
                onPress={() => tap(day)}
                style={[styles.day, isEdge && styles.dayOn]}
                accessibilityRole="button"
                accessibilityLabel={localDigits(label, i18n.language)}
                accessibilityState={{ selected: isEdge || inside, disabled: past }}
                testID={`day-${day}`}
              >
                <Text style={[styles.dayText, past && styles.dayPast, isEdge && styles.dayTextOn]}>
                  {localDigits(String(parseDay(day).getDate()), i18n.language)}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </View>
      <Text style={styles.hint}>{picking === 'end' ? t('newTrip.pickLast') : t('newTrip.pickFirst')}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.md, gap: t.spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  disabled: { opacity: 0.3 },
  month: { ...t.type.headline, color: t.colors.textPrimary },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...t.type.caption, color: t.colors.textTertiary, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: t.colors.accentSoft },
  bandStart: { borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  bandEnd: { borderTopRightRadius: 22, borderBottomRightRadius: 22 },
  day: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: t.colors.accent },
  dayText: { ...t.type.callout, color: t.colors.textPrimary },
  dayTextOn: { color: t.colors.onAccent, fontWeight: '700' },
  dayPast: { color: t.colors.textTertiary, opacity: 0.5 },
  hint: { ...t.type.footnote, color: t.colors.textSecondary, textAlign: 'center', paddingTop: t.spacing.xs },
}));
