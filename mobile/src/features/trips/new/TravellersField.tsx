/**
 * How many are travelling (docs/ui-refresh step 4, frame NewTripWhen): − and + on either side of a
 * number you can also type. Touching the number makes it a field: the number pad, the old value
 * selected, Bangla digits accepted. A number from 1 to MAX_TRAVELLERS (D4) counts at once, so the
 * budget and every "for N travellers" line follow while typing. Leaving the field empty or out of
 * range sets the nearest allowed number and says so in a line under the row. The screen scrolls the
 * row clear of the keyboard (RevealIn, as CitySearch does). With large text the − / number / +
 * go on a line of their own, so the word "Travellers" stays whole.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, useWindowDimensions, View } from 'react-native';

import { LineIcon } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import type { RevealIn } from '../CitySearch';
import { usePlanFormat } from '../plan/usePlanFormat';
import { MAX_TRAVELLERS } from './newTrip';

export const MIN_TRAVELLERS = 1;
/** Text this much larger than normal puts the controls under the label (Android's "Larger" is 1.3) */
const STACK_FROM_FONT_SCALE = 1.2;

// Bangla keyboards type ০–৯
const digitsOnly = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');

type Note = 'tooFew' | 'tooMany' | 'kept' | null;

/** What a typed text means: a number to use now, or null while it can't be used yet. */
export function typedTravellers(text: string): number | null {
  const digits = digitsOnly(text);
  if (!digits) return null;
  const n = Number(digits);
  return n >= MIN_TRAVELLERS && n <= MAX_TRAVELLERS ? n : null;
}

/** Where a typed text ends up when the field is left, and why when it isn't what was typed. */
export function settleTravellers(text: string, current: number): { value: number; note: Note } {
  const digits = digitsOnly(text);
  if (!digits) return { value: current, note: 'kept' };
  const n = Number(digits);
  if (n < MIN_TRAVELLERS) return { value: MIN_TRAVELLERS, note: 'tooFew' };
  if (n > MAX_TRAVELLERS) return { value: MAX_TRAVELLERS, note: 'tooMany' };
  return { value: n, note: null };
}

export function TravellersField({ value, onChange, reveal }: { value: number; onChange: (n: number) => void; reveal?: RevealIn }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const stacked = useWindowDimensions().fontScale > STACK_FROM_FONT_SCALE;
  // The text while typing; null when the field isn't being typed in
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const wrapRef = useRef<View>(null);

  const scrollIntoView = useCallback(() => {
    const inner = reveal?.innerRef.current;
    if (!inner) return;
    // After the keyboard is up: the row goes near the top, clear of it
    setTimeout(() => wrapRef.current?.measureLayout(inner, (_x, y) => reveal.scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true })), 250);
  }, [reveal]);

  const type = (text: string) => {
    const digits = digitsOnly(text).slice(0, 3);
    setDraft(digits);
    setNote(null);
    const n = typedTravellers(digits);
    if (n !== null && n !== value) onChange(n);
  };

  const leave = () => {
    if (draft !== null) {
      const settled = settleTravellers(draft, value);
      if (settled.value !== value) onChange(settled.value);
      setNote(settled.note);
    }
    setDraft(null);
  };

  const step = (by: 1 | -1) => {
    // From what's typed when it can be used, else from the number in use
    const from = draft !== null ? settleTravellers(draft, value).value : value;
    const next = Math.min(MAX_TRAVELLERS, Math.max(MIN_TRAVELLERS, from + by));
    setNote(null);
    if (draft !== null) setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <View ref={wrapRef}>
      <View style={[styles.row, stacked && styles.rowStacked]}>
        <View style={styles.head}>
          <LineIcon name="friends" size={24} color={colors.textSecondary} />
          <Text style={styles.label}>{t('newTrip.travellers')}</Text>
        </View>
        <View style={styles.controls}>
          <PressableScale
            haptic="selection"
            onPress={() => step(-1)}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={t('newTrip.fewer')}
            testID="travellers-less"
          >
            <LineIcon name="minus" size={20} color={colors.textPrimary} />
          </PressableScale>
          <TextInput
            value={draft ?? f.n(value)}
            onChangeText={type}
            onFocus={() => {
              setDraft(f.n(value));
              setNote(null);
              scrollIntoView();
            }}
            onBlur={leave}
            selectTextOnFocus
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={3}
            maxFontSizeMultiplier={1.3}
            style={[styles.number, draft !== null && styles.numberEditing]}
            accessibilityLabel={t('newTrip.travellersField', { min: f.n(MIN_TRAVELLERS), max: f.n(MAX_TRAVELLERS) })}
            testID="travellers-value"
          />
          <PressableScale
            haptic="selection"
            onPress={() => step(1)}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={t('newTrip.more')}
            testID="travellers-more"
          >
            <LineIcon name="plus" size={20} color={colors.textPrimary} />
          </PressableScale>
        </View>
      </View>
      {note ? (
        <Text style={styles.note} accessibilityLiveRegion="polite" testID="travellers-note">
          {t(`newTrip.travellersNote.${note}`, { n: f.n(note === 'tooFew' ? MIN_TRAVELLERS : note === 'tooMany' ? MAX_TRAVELLERS : value) })}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 68,
    paddingLeft: t.spacing.lg,
    paddingRight: t.spacing.md,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: t.spacing.sm, paddingVertical: t.spacing.md },
  head: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  label: { ...t.type.body, flex: 1, color: t.colors.textPrimary },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing.md },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  // Frame NewTripWhen: 60 × 44, the title font; a quiet edge says it can be typed in, blue while typing
  number: {
    ...t.type.title,
    fontSize: 21,
    minWidth: 60,
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: t.spacing.xs,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
    color: t.colors.textPrimary,
    textAlign: 'center',
  },
  numberEditing: { borderColor: t.colors.accent },
  note: { ...t.type.footnote, color: t.colors.textSecondary, paddingTop: t.spacing.sm, paddingHorizontal: t.spacing.xs },
}));
