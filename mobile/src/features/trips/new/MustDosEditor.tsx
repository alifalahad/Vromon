/**
 * "Your must-dos": must-sees (each optionally on a day and at a time), busy
 * times, places to skip and the avoid-crowds switch. Used as step 3 of a new
 * trip and to change them on the trip screen.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { BusyTime, MustSee, MustSeeWhen, Place } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { TimeSheet } from '../../../ui/TimeSheet';
import { usePlanFormat } from '../plan/usePlanFormat';
import { BusySheet } from './BusySheet';
import { topicIcon } from './icons';
import { timesBetween, WHENS, withTime } from './newTrip';
import { PlacePickerSheet } from './PlacePickerSheet';
import { useMustDoText } from './useMustDoText';

export type MustDos = { mustSees: MustSee[]; busy: BusyTime[]; skip: number[]; avoidCrowds: boolean };

const EXACT_TIMES = timesBetween('06:00', '22:00');
const glide = LinearTransition.duration(220);

export function MustDosEditor({
  value,
  onChange,
  places,
  startDate,
  days,
  showCrowds = true,
}: {
  value: MustDos;
  onChange: (next: MustDos) => void;
  places: readonly Place[];
  startDate: string;
  days: number;
  showCrowds?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useMustDoText();
  const [open, setOpen] = useState<number | null>(null);
  const [picker, setPicker] = useState<'must' | 'skip' | null>(null);
  // The pick arrives after the sheet has closed (picker is null by then)
  const pickFor = useRef<'must' | 'skip'>('must');
  const openPicker = (mode: 'must' | 'skip') => {
    pickFor.current = mode;
    setPicker(mode);
  };
  const [busyOpen, setBusyOpen] = useState(false);
  const [exactFor, setExactFor] = useState<number | null>(null);

  const byId = (id: number) => places.find((p) => p.id === id);
  const set = (change: Partial<MustDos>) => onChange({ ...value, ...change });
  const setMust = (placeId: number, change: Parameters<typeof withTime>[1]) =>
    set({ mustSees: value.mustSees.map((m) => (m.place_id === placeId ? withTime(m, change) : m)) });

  return (
    <View style={styles.wrap}>
      <Text style={styles.h3} accessibilityRole="header">
        {t('newTrip.mustSee')}
      </Text>
      {value.mustSees.map((m) => {
        const place = byId(m.place_id);
        const name = place?.name ?? `#${m.place_id}`;
        return (
          <Animated.View key={m.place_id} layout={glide} entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)}>
            <MustSeeCard
              must={m}
              place={place}
              name={name}
              days={days}
              open={open === m.place_id}
              onToggle={() => setOpen(open === m.place_id ? null : m.place_id)}
              onRemove={() => {
                haptics.selection();
                set({ mustSees: value.mustSees.filter((x) => x.place_id !== m.place_id) });
              }}
              onDay={(day) => setMust(m.place_id, { day })}
              onWhen={(when) => setMust(m.place_id, { when, at: null })}
              onExact={() => setExactFor(m.place_id)}
            />
          </Animated.View>
        );
      })}
      <Animated.View layout={glide}>
        <AddRow label={t('newTrip.addPlace')} onPress={() => openPicker('must')} testID="add-must-see" />
      </Animated.View>

      <Animated.View layout={glide} style={styles.section}>
        <Text style={styles.h3} accessibilityRole="header">
          {t('newTrip.busyTimes')}
        </Text>
        {value.busy.map((b, i) => (
          <Animated.View key={`${b.day}-${b.start}-${b.end}-${i}`} layout={glide} entering={FadeIn.duration(180)} style={styles.busyRow}>
            <View style={styles.busyIcon}>
              <MaterialCommunityIcons name="calendar-clock" size={22} color={colors.textSecondary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{b.label || t('newTrip.busy')}</Text>
              <Text style={styles.cardSub}>{text.busyWhen(b, startDate)}</Text>
            </View>
            <RemoveButton
              label={t('newTrip.remove', { name: b.label || t('newTrip.busy') })}
              onPress={() => set({ busy: value.busy.filter((_, j) => j !== i) })}
            />
          </Animated.View>
        ))}
        <AddRow label={t('newTrip.addBusy')} onPress={() => setBusyOpen(true)} testID="add-busy" />
      </Animated.View>

      <Animated.View layout={glide} style={styles.section}>
        <Text style={styles.h3} accessibilityRole="header">
          {t('newTrip.skip')}
        </Text>
        <View style={styles.chips}>
          {value.skip.map((id) => {
            const name = byId(id)?.name ?? `#${id}`;
            return (
              <PressableScale
                key={id}
                haptic="selection"
                onPress={() => set({ skip: value.skip.filter((x) => x !== id) })}
                style={styles.skipChip}
                accessibilityRole="button"
                accessibilityLabel={t('newTrip.remove', { name })}
              >
                <Text style={styles.skipText}>{name}</Text>
                <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
              </PressableScale>
            );
          })}
          <PressableScale
            haptic="selection"
            onPress={() => openPicker('skip')}
            style={styles.addChip}
            accessibilityRole="button"
            accessibilityLabel={t('newTrip.pickSkip')}
            testID="add-skip"
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.link} />
            <Text style={styles.addChipText}>{t('newTrip.add')}</Text>
          </PressableScale>
        </View>
      </Animated.View>

      {showCrowds && (
        <Animated.View layout={glide}>
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={() => set({ avoidCrowds: !value.avoidCrowds })}
            style={styles.switchRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: value.avoidCrowds }}
            accessibilityLabel={t('newTrip.avoidCrowds')}
            testID="avoid-crowds"
          >
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{t('newTrip.avoidCrowds')}</Text>
              <Text style={styles.cardSub}>{t('newTrip.avoidCrowdsHint')}</Text>
            </View>
            <Switch
              value={value.avoidCrowds}
              onValueChange={(v) => set({ avoidCrowds: v })}
              trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
              thumbColor={colors.onAccent}
              importantForAccessibility="no"
            />
          </PressableScale>
        </Animated.View>
      )}

      <PlacePickerSheet
        visible={picker !== null}
        title={picker === 'skip' ? t('newTrip.pickSkip') : t('newTrip.pickMust')}
        places={places}
        exclude={[...value.mustSees.map((m) => m.place_id), ...value.skip]}
        onClose={() => setPicker(null)}
        onPick={(p) => {
          if (pickFor.current === 'skip') set({ skip: [...value.skip, p.id] });
          else {
            set({ mustSees: [...value.mustSees, { place_id: p.id, day: null, when: null, at: null }] });
            setOpen(p.id);
          }
        }}
      />
      <BusySheet
        visible={busyOpen}
        startDate={startDate}
        days={days}
        onClose={() => setBusyOpen(false)}
        onSave={(b) => set({ busy: [...value.busy, b] })}
      />
      <TimeSheet
        visible={exactFor !== null}
        title={t('newTrip.exactTitle', { name: exactFor ? (byId(exactFor)?.name ?? '') : '' })}
        times={EXACT_TIMES}
        selected={value.mustSees.find((m) => m.place_id === exactFor)?.at ?? null}
        onClose={() => setExactFor(null)}
        onSelect={(at) => exactFor && at && setMust(exactFor, { at })}
        testID="exact-time"
      />
    </View>
  );
}

/** One must-see: tap to choose its day and time. */
export function MustSeeCard({
  must,
  place,
  name,
  days,
  open,
  onToggle,
  onRemove,
  onDay,
  onWhen,
  onExact,
}: {
  must: MustSee;
  place?: Place;
  name: string;
  days: number;
  open: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  onDay: (day: number | null) => void;
  onWhen: (when: MustSeeWhen | null) => void;
  onExact: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useMustDoText();

  const chip = (label: string, on: boolean, onPress: () => void, testID: string) => (
    <PressableScale
      key={testID}
      haptic="selection"
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      testID={testID}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );

  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <View style={styles.cardHead}>
        <View style={styles.placeIcon}>
          <MaterialCommunityIcons name={topicIcon(place?.category)} size={22} color={colors.link} />
        </View>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={onToggle}
          style={styles.flex}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}. ${text.mustSeeLine(must)}`}
          accessibilityHint={t('newTrip.mustSeeHint')}
          testID={`must-see-${must.place_id}`}
        >
          <Text style={styles.cardTitle}>{name}</Text>
          <View style={styles.whenRow}>
            <Text style={styles.whenText}>{text.mustSeeLine(must)}</Text>
            <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.link} />
          </View>
        </PressableScale>
        {onRemove ? <RemoveButton label={t('newTrip.remove', { name })} onPress={onRemove} /> : null}
      </View>
      {open && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.cardBody}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={t('newTrip.busyDay')}>
            {chip(t('mustDos.anyDay'), !must.day, () => onDay(null), `ms-${must.place_id}-day-any`)}
            {Array.from({ length: days }, (_, i) => i + 1).map((n) =>
              chip(text.dayLabel(n), must.day === n, () => onDay(n), `ms-${must.place_id}-day-${n}`),
            )}
          </ScrollView>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('newTrip.time')}>
            {chip(t('mustDos.anyTime'), !must.when && !must.at, () => onWhen(null), `ms-${must.place_id}-any`)}
            {WHENS.map((w) => chip(text.whenLabel(w), must.when === w, () => onWhen(w), `ms-${must.place_id}-${w}`))}
            {chip(must.at ? text.timeLabel(must) : t('newTrip.exactTime'), !!must.at, onExact, `ms-${must.place_id}-at`)}
          </View>
          {place?.opening_time && place.closing_time ? (
            <Text style={styles.cardSub}>
              {[
                t('newTrip.openHours', { from: f.time(place.opening_time), to: f.time(place.closing_time) }),
                place.average_visit_duration ? t('newTrip.about', { dur: f.duration(place.average_visit_duration * 60) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.remove} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
    </PressableScale>
  );
}

function AddRow({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale haptic="selection" onPress={onPress} style={styles.addRow} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <MaterialCommunityIcons name="plus" size={22} color={colors.link} />
      <Text style={styles.addText}>{label}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.sm },
  section: { gap: t.spacing.sm, marginTop: t.spacing.lg },
  h3: { ...t.type.headline, color: t.colors.textPrimary },
  flex: { flex: 1 },
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.md, gap: t.spacing.md },
  cardOpen: { borderWidth: 1.5, borderColor: t.colors.accent, padding: t.spacing.md - 1.5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  cardBody: { gap: t.spacing.md },
  placeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  cardTitle: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  cardSub: { ...t.type.footnote, color: t.colors.textSecondary },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  whenText: { ...t.type.footnote, fontWeight: '600', color: t.colors.link },
  remove: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chipRow: { gap: t.spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: { ...t.type.footnote, fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
  chipTextOn: { color: t.colors.onAccent },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.md },
  busyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 52,
    paddingHorizontal: t.spacing.md,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.colors.border,
  },
  addText: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  skipChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.colors.surface },
  skipText: { ...t.type.footnote, fontSize: 14, color: t.colors.textPrimary, textDecorationLine: 'line-through' },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 14, borderRadius: t.radius.chip, borderWidth: 1, borderColor: t.colors.border },
  addChipText: { ...t.type.footnote, fontSize: 14, fontWeight: '600', color: t.colors.link },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, marginTop: t.spacing.lg, backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.md },
}));
