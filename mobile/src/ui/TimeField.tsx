/**
 * A time you type (docs/ui-refresh step 6, frame BusyTime): hours and minutes as two boxes, in the
 * manner of the date fields (DateRangeFields.tsx). The number pad; the old value selected when a box
 * is touched; it moves on to the minutes by itself; Backspace in an empty minute box goes back. Any
 * minute. Bangla digits are accepted and the boxes show the app's own digits (as usePlanFormat's
 * time does). The value is "HH:MM", or 'invalid' for a time that doesn't exist (25:70), or null
 * while unfinished.
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { localDigits } from '../features/trips/plan/usePlanFormat';
import { makeStyles, useTheme } from './theme';

type Parts = { h: string; m: string };

// Bangla keyboards type ০–৯
const digitsOnly = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');
const pad = (s: string) => s.padStart(2, '0');

/** The time two boxes spell: "HH:MM", 'invalid' for one that doesn't exist, null while unfinished. */
export function timeOf(p: Parts): string | 'invalid' | null {
  if (!p.h || !p.m || p.m.length < 2) return null;
  const h = Number(p.h);
  const m = Number(p.m);
  if (h > 23 || m > 59) return 'invalid';
  return `${pad(p.h)}:${pad(p.m)}`;
}

const partsOf = (value: string | null): Parts => (value ? { h: value.slice(0, 2), m: value.slice(3, 5) } : { h: '', m: '' });

export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
  Input = TextInput,
  testID,
}: {
  label: string;
  value: string | null;
  onChange: (time: string | 'invalid' | null) => void;
  disabled?: boolean;
  /** In a bottom sheet, the sheet's own text input (so the sheet moves up with the keyboard) */
  Input?: typeof TextInput;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [parts, setParts] = useState<Parts>(() => partsOf(value));
  const [focused, setFocused] = useState<'h' | 'm' | null>(null);
  // A time set from outside (the sheet opened on another busy time) shows in the boxes
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (timeOf(parts) !== value) setParts(partsOf(value));
  }
  const hRef = useRef<TextInput>(null);
  const mRef = useRef<TextInput>(null);

  const change = (key: keyof Parts, raw: string) => {
    let v = digitsOnly(raw).slice(0, 2);
    // An hour of 3–9 or a minute of 6–9 can't take a second digit: it's whole already
    if (key === 'h' && v.length === 1 && Number(v) > 2) v = `0${v}`;
    if (key === 'm' && v.length === 1 && Number(v) > 5) v = `0${v}`;
    const next = { ...parts, [key]: v };
    setParts(next);
    if (key === 'h' && v.length === 2) mRef.current?.focus();
    onChange(timeOf(next));
  };

  const box = (key: keyof Parts, ref: React.RefObject<TextInput | null>, a11y: string) => (
    <Input
      ref={ref}
      value={localDigits(parts[key], i18n.language)}
      onChangeText={(v) => change(key, v)}
      onKeyPress={(e) => key === 'm' && e.nativeEvent.key === 'Backspace' && !parts.m && hRef.current?.focus()}
      onFocus={() => setFocused(key)}
      onBlur={() => {
        setFocused(null);
        // "9" is 09, "7" minutes is 07, once the box is left
        if (parts[key].length === 1) {
          const next = { ...parts, [key]: pad(parts[key]) };
          setParts(next);
          onChange(timeOf(next));
        }
      }}
      selectTextOnFocus
      editable={!disabled}
      keyboardType="number-pad"
      maxLength={2}
      maxFontSizeMultiplier={1.2}
      placeholder={key === 'h' ? t('timeField.hh') : t('timeField.mm')}
      placeholderTextColor={colors.textTertiary}
      style={[styles.part, focused === key && styles.partFocused, disabled && styles.disabled]}
      accessibilityLabel={`${label}, ${a11y}`}
      testID={testID ? `${testID}-${key}` : undefined}
    />
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <View style={[styles.box, focused !== null && styles.boxActive, disabled && styles.boxDisabled]}>
        {box('h', hRef, t('timeField.hour'))}
        <Text style={[styles.colon, disabled && styles.disabled]} maxFontSizeMultiplier={1.2}>
          :
        </Text>
        {box('m', mRef, t('timeField.minute'))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { flex: 1, gap: 6 },
  label: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, paddingLeft: t.spacing.xs },
  // Frame BusyTime: 66 tall, 18 corners; ringed in blue while typing
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 66,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
  },
  boxActive: { borderColor: t.colors.accent },
  boxDisabled: { backgroundColor: t.colors.surfaceInset },
  // The title font's digits are tall: no font padding and a line of their own, so typing never clips them
  part: {
    ...t.type.title,
    fontSize: 30,
    lineHeight: 40,
    width: 54,
    height: 50,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 10,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: t.colors.textPrimary,
  },
  partFocused: { backgroundColor: t.colors.accentTint },
  colon: { ...t.type.title, fontSize: 30, color: t.colors.textTertiary },
  disabled: { color: t.colors.textTertiary },
}));
