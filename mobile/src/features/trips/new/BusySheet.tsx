/**
 * "A time I'm busy": a day, from, to and an optional label (a wedding, a
 * meeting). Nothing is planned then.
 */

import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BusyTime } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { addDays, minutes, timesBetween } from './newTrip';
import { useMustDoText } from './useMustDoText';

const TIMES = timesBetween('06:00', '23:30');
const FIRST: Omit<BusyTime, 'day'> = {
  start: '18:00',
  end: '20:00',
  label: null,
};
/** A time chip's width plus the gap after it */
const CHIP_STEP = 80;

export function BusySheet({
  visible,
  startDate,
  days,
  onSave,
  onClose,
}: {
  visible: boolean;
  startDate: string;
  days: number;
  onSave: (busy: BusyTime) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useMustDoText();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(FIRST.start);
  const [end, setEnd] = useState(FIRST.end);
  const [label, setLabel] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const saved = useRef<BusyTime | null>(null);
  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    ),
    [],
  );

  const pickStart = (time: string) => {
    setStart(time);
    // It must end after it starts: keep the same length, or an hour
    if (minutes(end) <= minutes(time)) setEnd(TIMES[Math.min(TIMES.indexOf(time) + 2, TIMES.length - 1)]);
  };

  const timeRow = (value: string, onPick: (t: string) => void, after: string | null, testID: string) => {
    const times = TIMES.filter((time) => !after || minutes(time) > minutes(after));
    // Opens with the chosen time in view (one chip before it shows there's more)
    const offset = Math.max(0, times.indexOf(value) - 1) * CHIP_STEP;
    return (
      <ScrollView
        key={`${testID}-${after ?? ''}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timeRow}
        contentOffset={{ x: offset, y: 0 }}
        keyboardShouldPersistTaps="handled"
      >
        {times.map((time) => {
          const on = time === value;
          return (
            <PressableScale
              key={time}
              haptic="selection"
              onPress={() => onPick(time)}
              style={[styles.time, on && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              testID={`${testID}-${time}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.time(time)}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      onDismiss={() => {
        handleDismiss();
        const b = saved.current;
        saved.current = null;
        // Ready for the next one
        setDay(1);
        setStart(FIRST.start);
        setEnd(FIRST.end);
        setLabel('');
        setInputKey((k) => k + 1);
        if (b) onSave(b);
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('newTrip.busyTitle')}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          {t('newTrip.busyTitle')}
        </Text>

        <Text style={styles.label}>{t('newTrip.busyDay')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
          {Array.from({ length: days }, (_, i) => i + 1).map((n) => {
            const on = n === day;
            return (
              <PressableScale
                key={n}
                haptic="selection"
                onPress={() => setDay(n)}
                style={[styles.dayChip, on && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                testID={`busy-day-${n}`}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{text.dayLabel(n)}</Text>
                <Text style={[styles.chipSub, on && styles.chipTextOn]}>{text.shortDate(addDays(startDate, n - 1))}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>{t('newTrip.busyFrom')}</Text>
        {timeRow(start, pickStart, null, 'busy-from')}
        <Text style={styles.label}>{t('newTrip.busyTo')}</Text>
        {timeRow(end, setEnd, start, 'busy-to')}

        <Text style={styles.label}>{t('newTrip.busyLabel')}</Text>
        <BottomSheetTextInput
          key={inputKey}
          defaultValue=""
          onChangeText={setLabel}
          placeholder={t('newTrip.busyLabelHint')}
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          maxLength={60}
          accessibilityLabel={t('newTrip.busyLabel')}
          testID="busy-label"
        />

        <Button
          label={t('newTrip.busySave', {
            day: text.dayLabel(day),
            from: f.time(start),
            to: f.time(end),
          })}
          onPress={() => {
            saved.current = { day, start, end, label: label.trim() || null };
            Keyboard.dismiss();
            ref.current?.dismiss();
          }}
          testID="busy-save"
          style={styles.save}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
  },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: {
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.sm,
    gap: t.spacing.sm,
  },
  title: {
    ...t.type.title,
    color: t.colors.textPrimary,
    marginBottom: t.spacing.xs,
  },
  label: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    marginTop: t.spacing.sm,
  },
  timeRow: { gap: t.spacing.sm, paddingRight: t.spacing.xl },
  time: {
    width: 72,
    minHeight: 48,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
  },
  dayChip: {
    minWidth: 84,
    minHeight: 56,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.md,
  },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: {
    ...t.type.callout,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  chipSub: { ...t.type.caption, color: t.colors.textSecondary },
  chipTextOn: { color: t.colors.onAccent },
  input: {
    ...t.type.body,
    color: t.colors.textPrimary,
    minHeight: 48,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
  },
  save: { marginTop: t.spacing.lg },
}));
