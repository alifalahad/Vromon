/**
 * "A time you're busy" (docs/ui-refresh step 6, frame BusyTime): nothing is planned then.
 *
 * The day as chips with its date ("Day 2 · Sat 21"); From and To typed side by side (TimeField: any
 * minute), with how long that is; "All day" as one switch; "What is it?", optional. Mistakes are said
 * in words under the times (it ends before it starts, a time that doesn't exist, outside your day),
 * and the button says what it will do ("Keep Day 1, 16:10 to 21:45 free"). Opened on a busy time
 * already added, it shows its values and saving replaces it.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BusyTime } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { TimeField } from '../../../ui/TimeField';
import { Toggle } from '../../../ui/Toggle';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { addDays, minutes } from './newTrip';
import { useMustDoText } from './useMustDoText';

// The sheet's own text input moves the sheet up with the keyboard; it takes the same props as TextInput
const SheetInput = BottomSheetTextInput as unknown as typeof TextInput;

/** A new busy time starts here (an evening out) */
const FIRST = { start: '18:00', end: '20:00' };
/** "All day": the whole day, so nothing at all is planned */
export const ALL_DAY = { start: '00:00', end: '23:59' };
/** Up to this many days the chips share the width; more scroll sideways */
const CHIPS_IN_A_ROW = 3;
const CHIP_STEP = 104;

export const isAllDay = (b: Pick<BusyTime, 'start' | 'end'>) => b.start === ALL_DAY.start && b.end === ALL_DAY.end;

type Problem = 'invalid' | 'endsBefore' | 'outside' | null;
type Form = { day: number; start: string | 'invalid' | null; end: string | 'invalid' | null; allDay: boolean; label: string };

/** The sheet's fields for a busy time being changed, or for a new one */
function formOf(b: BusyTime | null): Form {
  const all = !!b && isAllDay(b);
  return { day: b?.day ?? 1, start: b && !all ? b.start : FIRST.start, end: b && !all ? b.end : FIRST.end, allDay: all, label: b?.label ?? '' };
}

/** What's wrong with a busy time, if anything (a time still being typed isn't wrong yet). */
export function busyProblem(start: string | 'invalid' | null, end: string | 'invalid' | null, window?: { start: string; end: string } | null): Problem {
  if (start === 'invalid' || end === 'invalid') return 'invalid';
  if (!start || !end) return null;
  if (minutes(end) <= minutes(start)) return 'endsBefore';
  if (window && (minutes(end) <= minutes(window.start) || minutes(start) >= minutes(window.end))) return 'outside';
  return null;
}

export function BusySheet({
  visible,
  startDate,
  days,
  initial = null,
  dayWindow,
  onSave,
  onClose,
}: {
  visible: boolean;
  startDate: string;
  days: number;
  /** A busy time already added: the sheet opens on it, and saving replaces it */
  initial?: BusyTime | null;
  /** The planned hours of each day (the first and last day's arriving and leaving included) */
  dayWindow?: (day: number) => { start: string; end: string } | null;
  onSave: (busy: BusyTime) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const dayRow = useRef<ScrollView>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useMustDoText();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const { day, start, end, allDay, label } = form;
  const edit = (change: Partial<Form>) => setForm((cur) => ({ ...cur, ...change }));
  const saved = useRef<BusyTime | null>(null);
  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  // Each time it opens: on the busy time being changed, or a new one
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setForm(formOf(initial));
  }

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const window = dayWindow?.(day) ?? null;
  const problem = allDay ? null : busyProblem(start, end, window);
  const ready = allDay || (problem === null && !!start && !!end && start !== 'invalid' && end !== 'invalid');
  const length = ready && !allDay ? minutes(end as string) - minutes(start as string) : null;
  const scroll = days > CHIPS_IN_A_ROW;

  const save = () => {
    if (!ready) return;
    const times = allDay ? ALL_DAY : { start: start as string, end: end as string };
    saved.current = { day, ...times, label: label.trim() || null };
    Keyboard.dismiss();
    ref.current?.dismiss();
  };

  const dayChips = Array.from({ length: days }, (_, i) => i + 1).map((n) => {
    const on = n === day;
    return (
      <PressableScale
        key={n}
        haptic="selection"
        onPress={() => edit({ day: n })}
        onLayout={on && scroll ? (e) => dayRow.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - CHIP_STEP), animated: false }) : undefined}
        style={[styles.dayChip, scroll ? styles.dayChipScroll : styles.dayChipShare, on && styles.chipOn]}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        testID={`busy-day-${n}`}
      >
        <Text style={[styles.dayName, on && styles.onAccent]} maxFontSizeMultiplier={1.3}>
          {text.dayLabel(n)}
        </Text>
        <Text style={[styles.dayDate, on && styles.onAccent]} maxFontSizeMultiplier={1.3}>
          {text.shortDate(addDays(startDate, n - 1))}
        </Text>
      </PressableScale>
    );
  });

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Edge-to-edge Android never resizes the window for the keyboard: the sheet moves up by itself
      android_keyboardInputMode="adjustPan"
      onDismiss={() => {
        handleDismiss();
        const b = saved.current;
        saved.current = null;
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
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {t('newTrip.busyTitle')}
          </Text>
          <Text style={styles.sub}>{t('newTrip.busySub')}</Text>
        </View>

        <View accessibilityRole="radiogroup" accessibilityLabel={t('newTrip.busyDay')}>
          {scroll ? (
            <ScrollView ref={dayRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {dayChips}
            </ScrollView>
          ) : (
            <View style={styles.dayRow}>{dayChips}</View>
          )}
        </View>

        <View style={styles.times}>
          <TimeField
            label={t('newTrip.busyFrom')}
            value={allDay ? null : start}
            onChange={(v) => edit({ start: v })}
            disabled={allDay}
            Input={SheetInput}
            testID="busy-from"
          />
          <MaterialCommunityIcons name="arrow-right" size={22} color={colors.textTertiary} style={styles.arrow} />
          <TimeField
            label={t('newTrip.busyTo')}
            value={allDay ? null : end}
            onChange={(v) => edit({ end: v })}
            disabled={allDay}
            Input={SheetInput}
            testID="busy-to"
          />
        </View>
        {problem ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite" testID="busy-problem">
            {t(`newTrip.busyProblem.${problem}`, window ? { from: f.time(window.start), to: f.time(window.end) } : undefined)}
          </Text>
        ) : null}

        <View style={styles.lengthRow}>
          <View style={styles.length}>
            {length !== null ? (
              <>
                <MaterialCommunityIcons name="clock-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.lengthText} testID="busy-length">
                  {f.duration(length)}
                </Text>
              </>
            ) : null}
          </View>
          <Text style={styles.allDay} nativeID="busy-all-day-label">
            {t('newTrip.busyAllDay')}
          </Text>
          <Toggle value={allDay} onValueChange={(on) => edit({ allDay: on })} accessibilityLabel={t('newTrip.busyAllDay')} testID="busy-all-day" />
        </View>

        <View style={styles.labelBlock}>
          <Text style={styles.fieldLabel}>
            {t('newTrip.busyLabel')} <Text style={styles.optional}>{t('newTrip.optional')}</Text>
          </Text>
          <BottomSheetTextInput
            value={label}
            onChangeText={(v) => edit({ label: v })}
            placeholder={t('newTrip.busyLabelHint')}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            maxLength={60}
            accessibilityLabel={t('newTrip.busyLabel')}
            testID="busy-label"
          />
        </View>

        <Button
          label={
            allDay
              ? t('newTrip.busySaveAllDay', { day: text.dayLabel(day) })
              : t('newTrip.busySave', {
                  day: text.dayLabel(day),
                  from: start && start !== 'invalid' ? f.time(start) : '…',
                  to: end && end !== 'invalid' ? f.time(end) : '…',
                })
          }
          onPress={save}
          disabled={!ready}
          testID="busy-save"
          style={styles.save}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.lg },
  title: { ...t.type.screenTitle, color: t.colors.textPrimary },
  sub: { ...t.type.callout, fontSize: 14.5, color: t.colors.textSecondary, marginTop: 2 },
  dayRow: { flexDirection: 'row', gap: t.spacing.sm },
  dayChip: {
    minHeight: 58,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: t.spacing.sm,
  },
  dayChipShare: { flex: 1 },
  dayChipScroll: { width: CHIP_STEP - t.spacing.sm },
  chipOn: { backgroundColor: t.colors.accent },
  dayName: { ...t.type.callout, fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  dayDate: { ...t.type.footnote, fontSize: 12.5, color: t.colors.textSecondary },
  onAccent: { color: t.colors.onAccent },
  times: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  arrow: { marginBottom: 21 },
  problem: { ...t.type.footnote, color: t.colors.danger, marginTop: -t.spacing.sm },
  lengthRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 48, marginTop: -t.spacing.sm },
  length: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  lengthText: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
  allDay: { ...t.type.callout, fontSize: 14.5, color: t.colors.textPrimary },
  labelBlock: { gap: 6 },
  fieldLabel: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, paddingLeft: t.spacing.xs },
  optional: { fontWeight: '400' },
  input: {
    ...t.type.body,
    color: t.colors.textPrimary,
    minHeight: 54,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
  },
  save: { marginTop: t.spacing.xs },
}));
