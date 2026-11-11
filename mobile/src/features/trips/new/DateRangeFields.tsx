/**
 * The trip's dates as two fields you type into, From and To, each in three parts (day / month /
 * year). The cursor moves on by itself as a part fills, Backspace on an empty part goes back, and
 * each field names its weekday once the date is whole ("Wednesday"). Touching a field opens the
 * month grid under the fields: a tap there fills that field (From, then To; the grid closes).
 *
 * A From after To moves To along so the trip keeps its length. A day before today, a To before
 * From or a date that doesn't exist (31/02) shows a line under the fields and isn't used.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useReduceMotion } from '../../../ui/useReduceMotion';
import type { RevealIn } from '../CitySearch';
import { addDays, durationDays, localToday, parseDay } from '../dates';
import { localDigits } from '../plan/usePlanFormat';
import { RangeCalendar } from './RangeCalendar';

type Which = 'start' | 'end';
type Parts = { d: string; m: string; y: string };
type Problem = 'past' | 'beforeStart' | 'invalid' | null;

const pad = (n: number) => String(n).padStart(2, '0');
const partsOf = (iso: string): Parts => ({ d: iso.slice(8, 10), m: iso.slice(5, 7), y: iso.slice(0, 4) });
// Bangla keyboards type ০–৯
const digitsOnly = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');

/** The ISO day the parts spell, 'invalid' for a date that doesn't exist, or null while unfinished. */
export function isoOf(p: Parts): string | 'invalid' | null {
  if (!p.d || !p.m || p.y.length !== 4) return null;
  const d = Number(p.d);
  const m = Number(p.m);
  const y = Number(p.y);
  if (m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) return 'invalid';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A new first day: the last day keeps the trip's length when it would come before it. */
export function withStart(range: { start: string; end: string }, start: string) {
  const end = range.end < start ? addDays(start, durationDays(range.start, range.end) - 1) : range.end;
  return { start, end };
}

export function DateRangeFields({
  start,
  end,
  onChange,
  today = localToday(),
  reveal,
}: {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  today?: string;
  /** The screen's scroll view: the fields move to its top when one is touched, so the calendar fits under them */
  reveal?: RevealIn;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const { t } = useTranslation();
  // The field the calendar fills; null = calendar closed
  const [active, setActive] = useState<Which | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const endFirst = useRef<TextInput>(null);
  const wrapRef = useRef<View>(null);
  // Only a finger opens the calendar: Android gives focus back to the last field when a
  // full-screen search or sheet closes, and that mustn't pop the calendar and keyboard up
  const touching = useRef(false);
  const touched = () => {
    touching.current = true;
    setTimeout(() => (touching.current = false), 800);
  };
  const focused = (which: Which, input: TextInput | null) => {
    if (!active && !touching.current) {
      input?.blur();
      return;
    }
    open(which);
  };
  const open = (which: Which) => {
    if (!active && reveal?.innerRef.current) {
      const inner = reveal.innerRef.current;
      setTimeout(() => wrapRef.current?.measureLayout(inner, (_x, y) => reveal.scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true })), 200);
    }
    setActive(which);
  };

  const typed = (which: Which, iso: string | 'invalid') => {
    if (iso === 'invalid') return setProblem('invalid');
    if (iso < today) return setProblem('past');
    if (which === 'end' && iso < start) return setProblem('beforeStart');
    setProblem(null);
    onChange(which === 'start' ? withStart({ start, end }, iso) : { start, end: iso });
  };

  const tapDay = (day: string) => {
    setProblem(null);
    if (active === 'end' && day >= start) {
      onChange({ start, end: day });
      setActive(null);
      Keyboard.dismiss();
      return;
    }
    // From (or a day before From while picking To): a new first day, then the last one
    onChange(withStart({ start, end }, day));
    setActive('end');
    Keyboard.dismiss();
  };

  return (
    <View style={styles.wrap} ref={wrapRef}>
      <View style={styles.fields}>
        <DateField
          which="start"
          label={t('newTrip.dateFrom')}
          value={start}
          active={active === 'start'}
          onTouch={touched}
          onFocus={(input) => focused('start', input)}
          onDate={(iso) => typed('start', iso)}
          onUnfinished={() => setProblem(null)}
          onFilled={() => endFirst.current?.focus()}
        />
        <MaterialCommunityIcons name="arrow-right" size={20} color={colors.textTertiary} style={styles.arrow} />
        <DateField
          which="end"
          label={t('newTrip.dateTo')}
          value={end}
          active={active === 'end'}
          firstRef={endFirst}
          onTouch={touched}
          onFocus={(input) => focused('end', input)}
          onDate={(iso) => typed('end', iso)}
          onUnfinished={() => setProblem(null)}
          onFilled={() => {
            Keyboard.dismiss();
            setActive(null);
          }}
        />
      </View>
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite" testID="date-problem">
          {t(`newTrip.dateProblem.${problem}`)}
        </Text>
      ) : null}
      {active ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(150)} exiting={reduce ? undefined : FadeOut.duration(120)}>
          <RangeCalendar start={start} end={end} today={today} mode={active} onDay={tapDay} />
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={() => {
              Keyboard.dismiss();
              setActive(null);
            }}
            style={styles.closeCal}
            accessibilityRole="button"
            testID="cal-close"
          >
            <Text style={styles.closeCalText}>{t('newTrip.calendarClose')}</Text>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

function DateField({
  which,
  label,
  value,
  active,
  firstRef,
  onTouch,
  onFocus,
  onDate,
  onUnfinished,
  onFilled,
}: {
  which: Which;
  label: string;
  value: string;
  active: boolean;
  firstRef?: React.RefObject<TextInput | null>;
  onTouch: () => void;
  onFocus: (input: TextInput | null) => void;
  onDate: (iso: string | 'invalid') => void;
  onUnfinished: () => void;
  onFilled: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [parts, setParts] = useState<Parts>(() => partsOf(value));
  // A date set from outside (the calendar, or From moving To along) shows in the parts
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (isoOf(parts) !== value) setParts(partsOf(value));
  }
  const own = useRef<TextInput>(null);
  const dRef = firstRef ?? own;
  const mRef = useRef<TextInput>(null);
  const yRef = useRef<TextInput>(null);

  const change = (key: keyof Parts, raw: string) => {
    const max = key === 'y' ? 4 : 2;
    let v = digitsOnly(raw).slice(0, max);
    // A day of 4–9 or a month of 2–9 can't take a second digit: it's whole already
    if (key === 'd' && v.length === 1 && Number(v) > 3) v = `0${v}`;
    if (key === 'm' && v.length === 1 && Number(v) > 1) v = `0${v}`;
    const next = { ...parts, [key]: v };
    setParts(next);
    if (v.length === max) {
      if (key === 'd') mRef.current?.focus();
      else if (key === 'm') yRef.current?.focus();
    }
    const iso = isoOf(next);
    if (iso === null) onUnfinished();
    else {
      onDate(iso);
      if (key === 'y' && iso !== 'invalid') {
        haptics.selection();
        onFilled();
      }
    }
  };
  const back = (key: keyof Parts) => {
    if (parts[key]) return;
    if (key === 'y') mRef.current?.focus();
    else if (key === 'm') dRef.current?.focus();
  };

  const whole = isoOf(parts);
  const weekday = whole && whole !== 'invalid' ? parseDay(whole).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' }) : ' ';
  const part = (key: keyof Parts, ref: React.RefObject<TextInput | null>, placeholder: string, a11y: string) => (
    <TextInput
      ref={ref}
      value={parts[key]}
      onChangeText={(v) => change(key, v)}
      onKeyPress={(e) => e.nativeEvent.key === 'Backspace' && back(key)}
      onPressIn={onTouch}
      onFocus={() => onFocus(ref.current)}
      selectTextOnFocus
      keyboardType="number-pad"
      maxLength={key === 'y' ? 4 : 2}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      style={[styles.part, key === 'y' && styles.partYear]}
      accessibilityLabel={`${label}, ${a11y}`}
      testID={`date-${which}-${key}`}
    />
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, active && styles.boxActive]}>
        {part('d', dRef, t('newTrip.datePart.dd'), t('newTrip.datePart.day'))}
        <Text style={styles.slash}>/</Text>
        {part('m', mRef, t('newTrip.datePart.mm'), t('newTrip.datePart.month'))}
        <Text style={styles.slash}>/</Text>
        {part('y', yRef, t('newTrip.datePart.yyyy'), t('newTrip.datePart.year'))}
      </View>
      <Text style={styles.weekday} numberOfLines={1} testID={`date-${which}-weekday`}>
        {localDigits(weekday, i18n.language)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.sm },
  fields: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  arrow: { marginTop: 4 },
  field: { flex: 1, gap: 4 },
  label: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  boxActive: { borderColor: t.colors.accent },
  part: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary, minWidth: 30, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 2 },
  partYear: { minWidth: 50 },
  slash: { ...t.type.body, color: t.colors.textTertiary },
  weekday: { ...t.type.caption, color: t.colors.textSecondary, paddingHorizontal: 4 },
  problem: { ...t.type.callout, color: t.colors.danger },
  closeCal: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.lg },
  closeCalText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
