/**
 * "What did you spend?" (docs/ui-refresh step 19, frame 39): the amount for the whole group, typed on the number
 * keyboard (Bangla digits too); "From today's plan": what the day's plan has to pay for that isn't noted yet, where
 * one tap fills the amount, the part and the note (all three can still be changed); "What for" (seven parts); a
 * note; the day (today, or another from the day before the trip to the day after it); Save. A note you made opens
 * the same sheet, with Delete.
 */

import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
// Inside a sheet, a plain horizontal scroll view loses its swipes to the sheet
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tripsApi } from '../../../services/api';
import type { Expense, ExpenseIn, ExpensePart, ExpenseRide, ExpenseSuggestion } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { LineIcon } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { dayDate, dayParts } from '../plan/timeline';
import { localDigits, usePlanFormat } from '../plan/usePlanFormat';
import { clip, defaultDay, forGroup, NOTE_MAX, noteDays, partName, SHEET_PARTS, suggestionWords, typedAmount } from './spent';

const SNAP_POINTS = ['90%'];

type Link = { item_id: number | null; ride: ExpenseRide | null; key: string };

/** Everything that shows what's noted, after a change */
export function refreshSpent(queryClient: ReturnType<typeof useQueryClient>, tripId: number) {
  return Promise.all(
    [
      ['budget', tripId],
      ['expenses', tripId],
      ['expenseSuggestions', tripId],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function AddSpentSheet({
  visible,
  tripId,
  start,
  end,
  travellers,
  today,
  editing,
  onClose,
  onDone,
}: {
  visible: boolean;
  tripId: number;
  start: string;
  end: string;
  travellers: number;
  /** The phone's date */
  today: string;
  /** A note to change (or delete); null for a new one */
  editing: Expense | null;
  onClose: () => void;
  /** After a save or a delete: what to say, and the deleted note (for Undo) */
  onDone: (result: { message: string; deleted?: Expense }) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const scroll = useRef<BottomSheetScrollViewMethods>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const queryClient = useQueryClient();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  const [amount, setAmount] = useState('');
  const [part, setPart] = useState<ExpensePart | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState(() => defaultDay(start, end, today));
  const [link, setLink] = useState<Link | null>(null);
  const [linkTouched, setLinkTouched] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each opening starts from the note being changed, or from nothing on today
  const [shownFor, setShownFor] = useState<string | null>(null);
  const opening = visible ? `${editing?.id ?? 'new'}` : null;
  if (opening !== shownFor) {
    setShownFor(opening);
    if (opening) {
      setAmount(editing ? String(Math.round(editing.amount)) : '');
      setPart(editing?.part ?? null);
      setNote(editing?.note ?? '');
      setDay(editing?.day ?? defaultDay(start, end, today));
      setLink(null);
      setLinkTouched(false);
      setPickingDay(false);
      setError(null);
    }
  }

  const suggestions = useQuery({
    queryKey: ['expenseSuggestions', tripId, day],
    queryFn: () => tripsApi.expenseSuggestions(tripId, day),
    enabled: visible && !!tripId,
    staleTime: 0,
  });

  const value = typedAmount(amount);
  const ready = value != null && value > 0 && part != null && busy == null;
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const pick = (s: ExpenseSuggestion) => {
    Keyboard.dismiss();
    setLinkTouched(true);
    if (link?.key === s.key) {
      setLink(null);
      return;
    }
    setAmount(String(Math.round(s.amount)));
    setPart(s.part);
    setNote(suggestionWords(s, t, f).note);
    setLink({ item_id: s.item_id, ride: s.ride, key: s.key });
  };

  const save = async () => {
    if (!ready || value == null || part == null) return;
    setBusy('save');
    setError(null);
    const body: ExpenseIn = { day, amount: value, part, note: clip(note.trim()) };
    if (!editing || linkTouched) Object.assign(body, { item_id: link?.item_id ?? null, ride: link?.ride ?? null });
    try {
      if (editing) await tripsApi.changeExpense(tripId, editing.id, body);
      else await tripsApi.addExpense(tripId, body);
      haptics.success();
      await refreshSpent(queryClient, tripId);
      onDone({ message: editing ? t('spent.changed') : t('spent.added', { amount: f.money(value) }) });
    } catch (e) {
      haptics.error();
      setError(`${t('spent.failed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy('delete');
    setError(null);
    try {
      await tripsApi.deleteExpense(tripId, editing.id);
      haptics.success();
      await refreshSpent(queryClient, tripId);
      onDone({ message: t('spent.deleted'), deleted: editing });
    } catch (e) {
      haptics.error();
      setError(`${t('spent.failed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const dayWords = (iso: string) => {
    const date = f.time(dayDate(iso, i18n.language));
    return iso === today ? t('spent.dayToday', { date }) : date;
  };
  const shown = suggestions.data ?? [];
  // Save (and Delete) stay at the bottom of the sheet, over the form: on a 360 dp phone the chips and the day push
  // them out of view, and "two taps" means the second one is always there
  const renderFooter = (props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props}>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {editing ? (
            <Button
              label={t('spent.delete')}
              variant="danger"
              onPress={remove}
              loading={busy === 'delete'}
              disabled={busy != null}
              style={styles.delete}
              testID="spent-delete"
            />
          ) : null}
          <Button
            label={value ? t('spent.save', { amount: f.money(value) }) : t('spent.saveEmpty')}
            onPress={save}
            loading={busy === 'save'}
            disabled={!ready}
            style={styles.save}
            testID="spent-save"
          />
        </View>
      </View>
    </BottomSheetFooter>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      // Raised over the keyboard, it stops under the status bar
      topInset={insets.top}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Edge-to-edge Android never resizes the window for the keyboard (as the other sheets with a field)
      android_keyboardInputMode="adjustPan"
      onDismiss={handleDismiss}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t(editing ? 'spent.editTitle' : 'spent.title')}
    >
      <BottomSheetScrollView
        ref={scroll}
        // Room for the footer under the last field
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 104 }]}
        keyboardShouldPersistTaps="handled"
        testID="spent-sheet"
      >
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {t(editing ? 'spent.editTitle' : 'spent.title')}
          </Text>
          <PressableScale
            haptic="selection"
            onPress={() => ref.current?.dismiss()}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('spent.close')}
            testID="spent-close"
          >
            <LineIcon name="close" size={20} color={colors.textPrimary} />
          </PressableScale>
        </View>

        {/* The amount, for the whole group (frame 39: the ring while it's typed in) */}
        <View style={[styles.amount, focused && styles.amountFocused]}>
          <Text style={styles.taka} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
            ৳
          </Text>
          <BottomSheetTextInput
            value={localDigits(amount, i18n.language)}
            onChangeText={(v) => setAmount(v.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={9}
            style={styles.amountInput}
            maxFontSizeMultiplier={1.2}
            accessibilityLabel={`${t('spent.amountA11y')}, ${forGroup(travellers, t, f)}`}
            autoComplete="off"
            importantForAutofill="no"
            testID="spent-amount"
          />
          <Text style={styles.forGroup} maxFontSizeMultiplier={1.3} numberOfLines={2}>
            {forGroup(travellers, t, f)}
          </Text>
        </View>

        {/* "From today's plan": one tap fills the amount, what for and the note */}
        {shown.length ? (
          <View style={styles.section}>
            <Text style={styles.label}>{day === today ? t('spent.fromToday') : t('spent.fromDay', { day: f.time(dayDate(day, i18n.language)) })}</Text>
            <View style={styles.chips}>
              {shown.map((s) => {
                const on = link?.key === s.key;
                const words = suggestionWords(s, t, f);
                const text = `${words.label} ${s.estimate ? '≈\u00A0' : ''}${f.money(s.amount)}`;
                return (
                  <PressableScale
                    key={s.key}
                    haptic="selection"
                    onPress={() => pick(s)}
                    style={[styles.chip, on && styles.suggestionOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={text}
                    testID={`spent-suggestion-${s.key}`}
                  >
                    {on ? <LineIcon name="check" size={16} color={colors.onAccentSoft} strokeWidth={2.6} /> : null}
                    <Text style={[styles.chipText, on && styles.suggestionOnText]} maxFontSizeMultiplier={1.4}>
                      {text}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>{t('spent.whatFor')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('spent.whatFor')}>
            {SHEET_PARTS.map((key) => {
              const on = part === key;
              return (
                <PressableScale
                  key={key}
                  haptic="selection"
                  onPress={() => {
                    Keyboard.dismiss();
                    setPart(key);
                  }}
                  style={[styles.chip, styles.partChip, on && styles.partOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  testID={`spent-for-${key}`}
                >
                  <Text style={[styles.chipText, on && styles.partOnText]} maxFontSizeMultiplier={1.4}>
                    {partName(key, t)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label} nativeID="spent-note-label">
            {t('spent.note')}
          </Text>
          <BottomSheetTextInput
            value={note}
            onChangeText={setNote}
            // The keyboard and Save would cover it: up into view (it's the last field but the day)
            onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
            maxLength={NOTE_MAX}
            style={styles.note}
            returnKeyType="done"
            accessibilityLabel={t('spent.note')}
            accessibilityLabelledBy="spent-note-label"
            testID="spent-note"
          />
        </View>

        {/* The day: today, or another of the trip's */}
        <View style={styles.dayRow}>
          <LineIcon name="calendar" size={20} color={colors.textSecondary} />
          <Text style={styles.dayText} testID="spent-day">
            {dayWords(day)}
          </Text>
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={() => {
              Keyboard.dismiss();
              setPickingDay((v) => !v);
              // The days open under the day's row, where Save covers them: up into view
              setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
            }}
            style={styles.dayChange}
            accessibilityRole="button"
            accessibilityLabel={`${t('budget.change')}: ${t('spent.pickDay')}`}
            accessibilityState={{ expanded: pickingDay }}
            testID="spent-day-change"
          >
            <Text style={styles.dayChangeText}>{t('budget.change')}</Text>
          </PressableScale>
        </View>
        {pickingDay ? (
          <GHScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} testID="spent-days">
            {noteDays(start, end).map((iso) => {
              const on = iso === day;
              const parts = dayParts(iso, i18n.language);
              return (
                <PressableScale
                  key={iso}
                  haptic="selection"
                  onPress={() => {
                    if (iso !== day) {
                      setDay(iso);
                      // A stop or a ride of another day doesn't go with it
                      if (link) {
                        setLink(null);
                        setLinkTouched(true);
                      }
                    }
                    setPickingDay(false);
                  }}
                  style={[styles.chip, styles.partChip, on && styles.partOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={dayWords(iso)}
                  testID={`spent-day-${iso}`}
                >
                  <Text style={[styles.chipText, on && styles.partOnText]} maxFontSizeMultiplier={1.3}>
                    {iso === today ? t('today.open') : localDigits(`${parts.weekday} ${parts.day}`, i18n.language)}
                  </Text>
                </PressableScale>
              );
            })}
          </GHScrollView>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.hairline, width: 40, height: 4 },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: 4, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 4 },
  title: { flex: 1, fontFamily: t.type.title.fontFamily, fontSize: 22, lineHeight: 26, fontWeight: 'normal', color: t.colors.textPrimary },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  amount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 76,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
  },
  // Frame 39: a 2 dp blue edge with a 4 dp blue tint around it
  amountFocused: {
    borderWidth: 2,
    borderColor: t.colors.accent,
    paddingHorizontal: 15.5,
    outlineColor: t.colors.accentTint,
    outlineWidth: 4,
    outlineStyle: 'solid',
  },
  taka: { fontFamily: t.type.title.fontFamily, fontSize: 30, lineHeight: 36, fontWeight: 'normal', color: t.colors.textTertiary },
  amountInput: {
    flex: 1,
    minWidth: 0,
    height: 56,
    padding: 0,
    fontFamily: t.type.title.fontFamily,
    fontSize: 40,
    lineHeight: 48,
    color: t.colors.textPrimary,
    includeFontPadding: false,
  },
  forGroup: { flexShrink: 1, maxWidth: '40%', fontSize: 13, textAlign: 'right', color: t.colors.textSecondary },
  section: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: t.colors.textSecondary, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.colors.surfaceInset,
  },
  chipText: { fontSize: 14, color: t.colors.textPrimary },
  // A chosen suggestion (frame 39): the blue tint, a blue edge and a tick
  suggestionOn: { backgroundColor: t.colors.accentTint, borderWidth: 1.5, borderColor: t.colors.accent, paddingLeft: 10 },
  suggestionOnText: { color: t.colors.onAccentSoft, fontWeight: '500' },
  partChip: { paddingHorizontal: 16 },
  // The chosen part: the text colour as its ground
  partOn: { backgroundColor: t.colors.textPrimary },
  // (the frame's 500 weight is left out: the wider word pushed the chips onto a third line at 360 dp)
  partOnText: { color: t.colors.surface },
  note: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    fontSize: 15.5,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 4 },
  dayText: { flex: 1, fontSize: 15, color: t.colors.textPrimary },
  dayChange: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  dayChangeText: { fontSize: 14.5, fontWeight: '500', color: t.colors.link },
  days: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  error: { fontSize: 13.5, color: t.colors.danger, paddingHorizontal: 4 },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: 10, gap: 8, backgroundColor: t.colors.surface },
  actions: { flexDirection: 'row', gap: 10 },
  delete: { minHeight: 54, minWidth: 104 },
  save: { flex: 1, minHeight: 54 },
}));
