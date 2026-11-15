/**
 * One stop's details (tap a stop card): when you're there, opening hours, price,
 * crowds, why the planner chose it, and the actions: directions, and for your
 * own trip's sightseeing stops, swap and remove.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItineraryItem, Violation } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { isPrivatePlace, isUnchecked, kindLabel } from '../../places/kinds';
import { NotCheckedBadge } from '../../places/NotCheckedBadge';
import { priceText } from './PlanRows';
import { dayParts, fromMinutes, stopCoord, stopTitle, toMinutes } from './timeline';
import { usePlanFormat } from './usePlanFormat';

const SNAP_POINTS = ['62%', '92%'];
const DAY_GAP = 8;

type PickDay = { id: number; day_number: number; day_date?: string };

export function StopSheet({
  item,
  issues,
  editable,
  onClose,
  onExplain,
  onSwap,
  onRemove,
  days = [],
  currentDayId,
  onSetDuration,
  onSetPinned,
  onMoveDay,
  onSuggest,
}: {
  item: ItineraryItem | null;
  issues: Violation[];
  editable: boolean;
  onClose: () => void;
  onExplain: (item: ItineraryItem) => void;
  onSwap: (item: ItineraryItem) => void;
  onRemove: (item: ItineraryItem) => void;
  /** The trip's days and the one this stop is on, for "Move to another day" */
  days?: PickDay[];
  currentDayId?: number;
  onSetDuration?: (item: ItineraryItem, minutes: number) => void;
  onSetPinned?: (item: ItineraryItem, pinned: boolean) => void;
  onMoveDay?: (item: ItineraryItem, dayId: number) => void;
  /** Your own stop from outside Vromon's list: "Suggest this place to Vromon" (trip upgrades step 6) */
  onSuggest?: (item: ItineraryItem) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, !!item, onClose);
  const after = useRef<(() => void) | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );
  // Close first, then act, so the next sheet or snackbar isn't hidden behind this one
  const closeThen = (fn: () => void) => {
    after.current = fn;
    ref.current?.dismiss();
  };

  const place = item?.place;
  const restaurant = item?.restaurant;
  const opens = place?.opening_time ?? restaurant?.opening_time;
  const closes = place?.closing_time ?? restaurant?.closing_time;
  // An unknown rating (imported places) isn't shown
  const rating = (place ?? restaurant)?.rating_known === false ? null : place?.rating ?? restaurant?.rating;
  const hoursUnknown = (place ?? restaurant)?.hours_known === false;
  const imported = place?.source && place.source !== 'curated' ? place : null;
  // Your own stop from data Vromon hasn't checked: the badge, who sees it, and "Suggest this place to Vromon"
  const unchecked = isUnchecked(place);
  const what = item?.item_type === 'meal' ? restaurant?.cuisine : (isPrivatePlace(place) ? kindLabel(place?.kind, t) : null) ?? place?.category ?? item?.category;
  const crowd = place?.crowd_level === 'Low' ? t('plan.quiet') : place?.crowd_level === 'High' ? t('plan.busy') : null;
  const coord = item ? stopCoord(item) : null;
  const isVisit = item?.item_type === 'activity';
  // Planner wording that isn't for travellers (older plans say "Scheduled by CP-SAT optimizer")
  const reasons = (item?.recommendation_reasons ?? []).filter((r) => !r.includes('(penalised)') && !r.includes('CP-SAT'));
  const problems = issues.filter((v) => v.severity !== 'info');
  const description = place?.description ?? restaurant?.description;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={() => {
        handleDismiss();
        const run = after.current;
        after.current = null;
        run?.();
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={item ? stopTitle(item) : undefined}
    >
      {item ? (
        <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} testID="stop-sheet">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {stopTitle(item)}
            </Text>
            <Text style={styles.subtitle}>{[what, rating ? `★ ${f.n(rating)}` : null].filter(Boolean).join(' · ')}</Text>
            {unchecked ? (
              <>
                <NotCheckedBadge testID="stop-sheet-unchecked" />
                <Text style={styles.muted}>{t('search.privateNote')}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.chips}>
            <Chip icon="clock-outline" label={t('plan.visitTime', { from: f.time(item.start_time), to: f.time(item.end_time), duration: f.duration(item.duration_minutes) })} strong />
            {hoursUnknown ? (
              <Chip icon="door-open" label={t('plan.hoursUnknown')} />
            ) : opens && closes ? (
              <Chip icon="door-open" label={t('plan.open', { from: f.time(opens), to: f.time(closes) })} />
            ) : null}
            <Chip icon="cash" label={priceText(item, t, f)} />
            {crowd ? <Chip icon="account-group-outline" label={crowd} /> : null}
          </View>

          {problems.length > 0 && (
            <View style={styles.problems}>
              <Text style={styles.sectionTitle}>{t('plan.needsAttention')}</Text>
              {problems.map((v, i) => (
                <View key={i} style={styles.problem}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={v.severity === 'hard' ? colors.danger : colors.warning} />
                  <Text style={styles.text}>{v.message}</Text>
                </View>
              ))}
            </View>
          )}

          {(isVisit && (reasons.length > 0 || item.notes)) || description ? (
            <View style={styles.why}>
              <Text style={styles.sectionTitle}>{t('plan.whyHere')}</Text>
              {isVisit &&
                reasons.map((r, i) => (
                  <Text key={i} style={styles.text}>
                    • {r}
                  </Text>
                ))}
              {isVisit && item.notes ? <Text style={styles.text}>• {t('plan.bestTime', { when: item.notes })}</Text> : null}
              {description ? <Text style={styles.muted}>{description}</Text> : null}
              {imported ? (
                <Text style={styles.muted} testID="stop-source">
                  {t(imported.checked === false ? 'plan.sourceUnchecked' : 'plan.source', { source: t(`plan.sourceNames.${imported.source}`, { defaultValue: imported.source }) })}
                </Text>
              ) : null}
              {/* Not for your own stop: Vromon knows nothing about it, and its name isn't sent to the AI */}
              {isVisit && !isPrivatePlace(place) && (
                <PressableScale onPress={() => closeThen(() => onExplain(item))} pressEffect="opacity" style={styles.link} testID="stop-explain">
                  <Text style={styles.linkText}>{t('plan.moreAbout')}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.link} />
                </PressableScale>
              )}
            </View>
          ) : null}

          {editable && (
            <StopEditor
              key={item.id}
              item={item}
              days={days}
              currentDayId={currentDayId}
              onSetDuration={(m) => onSetDuration?.(item, m)}
              onSetPinned={(p) => onSetPinned?.(item, p)}
              onMoveDay={(dayId) => closeThen(() => onMoveDay?.(item, dayId))}
            />
          )}

          <View style={styles.actions}>
            {coord && (
              <ActionButton
                icon="navigation-variant-outline"
                label={t('plan.directions')}
                onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coord.latitude},${coord.longitude}`)}
                testID="stop-directions"
              />
            )}
            {editable && isVisit && (
              <ActionButton icon="swap-horizontal" label={t('plan.swap')} onPress={() => closeThen(() => onSwap(item))} testID="stop-swap" />
            )}
            {editable && isVisit && (
              <ActionButton icon="trash-can-outline" label={t('plan.remove')} danger onPress={() => closeThen(() => onRemove(item))} testID="stop-remove" />
            )}
            {editable && unchecked && onSuggest && (
              <ActionButton icon="send-outline" label={t('search.suggest')} onPress={() => closeThen(() => onSuggest(item))} testID="stop-suggest" />
            )}
          </View>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheetModal>
  );
}

/** How long you stay, "keep this time", and moving to another day. A new stop gets a fresh editor (key). */
function StopEditor({
  item,
  days,
  currentDayId,
  onSetDuration,
  onSetPinned,
  onMoveDay,
}: {
  item: ItineraryItem;
  days: PickDay[];
  currentDayId?: number;
  onSetDuration: (minutes: number) => void;
  onSetPinned: (pinned: boolean) => void;
  onMoveDay: (dayId: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const [stay, setStay] = useState(item.duration_minutes);
  const [pinned, setPinned] = useState(!!item.pinned);
  const [choosingDay, setChoosingDay] = useState(false);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; minutes: number } | null>(null);
  const save = useRef(onSetDuration);
  useEffect(() => {
    save.current = onSetDuration;
  });
  // Several quick taps are sent as one change; closing the sheet sends it at once
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current.timer);
        save.current(pending.current.minutes);
      }
    },
    [],
  );
  const changeStay = (delta: number) => {
    const next = Math.max(15, Math.min(600, stay + delta));
    if (next === stay) return;
    setStay(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = {
      minutes: next,
      timer: setTimeout(() => {
        pending.current = null;
        save.current(next);
      }, 700),
    };
  };
  const end = f.time(fromMinutes(toMinutes(item.start_time) + stay));

  return (
    <View style={styles.editor}>
      <View style={styles.editorRow}>
        <View style={styles.editorText}>
          <Text style={styles.editorTitle}>{t('plan.stay')}</Text>
          <Text style={styles.editorSub}>
            {f.time(item.start_time)}–{end}
          </Text>
        </View>
        <PressableScale onPress={() => changeStay(-15)} accessibilityLabel={t('plan.stayLess')} style={styles.step} testID="stay-less">
          <MaterialCommunityIcons name="minus" size={22} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.stayValue} accessibilityLiveRegion="polite" testID="stay-value">
          {f.shortDuration(stay)}
        </Text>
        <PressableScale onPress={() => changeStay(15)} accessibilityLabel={t('plan.stayMore')} style={styles.step} testID="stay-more">
          <MaterialCommunityIcons name="plus" size={22} color={colors.textPrimary} />
        </PressableScale>
      </View>
      <View style={styles.divider} />
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        accessibilityRole="switch"
        accessibilityState={{ checked: pinned }}
        onPress={() => {
          setPinned(!pinned);
          onSetPinned(!pinned);
        }}
        style={styles.editorRow}
        testID="stop-pin"
      >
        <MaterialCommunityIcons name="lock-outline" size={22} color={colors.textSecondary} />
        <View style={styles.editorText}>
          <Text style={styles.editorTitle}>{t('plan.keepTime')}</Text>
          <Text style={styles.editorSub}>{t('plan.keepTimeHint')}</Text>
        </View>
        <View style={[styles.track, pinned && { backgroundColor: colors.accent }]} importantForAccessibility="no-hide-descendants">
          <View style={[styles.knob, pinned && styles.knobOn]} />
        </View>
      </PressableScale>
      {days.length > 1 && (
        <>
          <View style={styles.divider} />
          <PressableScale pressEffect="opacity" onPress={() => setChoosingDay((v) => !v)} style={styles.editorRow} accessibilityState={{ expanded: choosingDay }} testID="stop-move-day">
            <MaterialCommunityIcons name="calendar-arrow-right" size={22} color={colors.textSecondary} />
            <Text style={[styles.editorTitle, styles.editorText]}>{t('plan.moveToDay')}</Text>
            <MaterialCommunityIcons name={choosingDay ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textSecondary} />
          </PressableScale>
          {choosingDay && <DayPicker days={days} currentId={currentDayId} onPick={onMoveDay} />}
        </>
      )}
    </View>
  );
}

/**
 * Every day of the trip with its date, in a grid that holds 30 days without scrolling sideways
 * (docs/ui-refresh step 8). The stop's own day is shown, but can't be picked.
 */
function DayPicker({ days, currentId, onPick }: { days: PickDay[]; currentId?: number; onPick: (dayId: number) => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const { width, fontScale } = useWindowDimensions();
  // What's left of the screen inside the sheet's and the editor's padding
  const inner = width - 2 * (styles.body.paddingHorizontal as number) - 2 * (styles.editor.paddingHorizontal as number);
  const least = 62 * Math.min(Math.max(fontScale, 1), 1.3);
  const columns = Math.max(2, Math.min(6, Math.floor((inner + DAY_GAP) / (least + DAY_GAP))));
  const cell = Math.floor((inner - (columns - 1) * DAY_GAP) / columns);
  return (
    <View style={styles.dayGrid} testID="move-day-picker">
      {days.map((d) => {
        const here = d.id === currentId;
        const p = d.day_date ? dayParts(d.day_date, i18n.language) : null;
        const date = here ? t(cell >= 90 ? 'plan.dropHere' : 'plan.dropHereShort') : p ? `${p.weekday} ${p.day}` : '';
        const label = t('plan.day', { n: f.n(d.day_number) });
        return (
          <PressableScale
            key={d.id}
            haptic="selection"
            disabled={here}
            onPress={() => onPick(d.id)}
            style={[styles.dayCell, { width: cell }, here && styles.dayCellHere]}
            accessibilityRole="button"
            accessibilityLabel={[label, date].filter(Boolean).join(', ')}
            accessibilityState={{ disabled: here }}
            testID={here ? 'move-day-here' : `move-to-day-${d.day_number}`}
          >
            <Text style={[styles.dayCellTitle, here && styles.dayCellTextHere]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
              {label}
            </Text>
            {date ? (
              <Text style={[styles.dayCellDate, here && styles.dayCellTextHere]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
                {date}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

function Chip({ icon, label, strong }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; strong?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, strong && styles.chipStrong]}>
      <MaterialCommunityIcons name={icon} size={16} color={strong ? colors.link : colors.textSecondary} />
      <Text style={[styles.chipText, strong && styles.chipTextStrong]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  danger,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} style={[styles.action, danger && styles.actionDanger]} testID={testID}>
      <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.danger : colors.link} />
      <Text style={[styles.actionText, danger && { color: colors.danger }]}>{label}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  body: { paddingHorizontal: t.spacing.lg + 2, paddingTop: t.spacing.xs, gap: t.spacing.lg },
  header: { gap: 4 },
  title: { fontFamily: t.type.title.fontFamily, fontSize: 24, fontWeight: 'normal', color: t.colors.textPrimary },
  subtitle: { fontSize: 14, color: t.colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: t.spacing.md,
    borderRadius: 999,
    backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset,
  },
  chipStrong: { backgroundColor: t.colors.accentSoft },
  chipText: { fontSize: 13, color: t.colors.textPrimary },
  chipTextStrong: { fontWeight: '700' },
  problems: { gap: 6, padding: t.spacing.md, borderRadius: 16, backgroundColor: t.colors.dangerBg },
  problem: { flexDirection: 'row', gap: 8 },
  why: { gap: 6, padding: t.spacing.md + 2, borderRadius: 16, backgroundColor: t.colors.bg },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: t.colors.textSecondary, textTransform: 'uppercase' },
  text: { flex: 1, fontSize: 15, lineHeight: 21, color: t.colors.textPrimary },
  muted: { fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '600', color: t.colors.link },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  editor: { borderRadius: 16, paddingHorizontal: t.spacing.md + 2, backgroundColor: t.colors.bg },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60 },
  editorText: { flex: 1, gap: 2 },
  editorTitle: { fontSize: 16, color: t.colors.textPrimary },
  editorSub: { fontSize: 13, color: t.colors.textSecondary },
  divider: { height: 1, backgroundColor: t.colors.divider },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset },
  stayValue: { minWidth: 60, textAlign: 'center', fontSize: 16, fontWeight: '700', color: t.colors.textPrimary },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: t.colors.segmentThumb },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  knobOn: { transform: [{ translateX: 20 }] },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: DAY_GAP, paddingBottom: t.spacing.md },
  dayCell: {
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: t.colors.accentTint,
  },
  // The stop's own day: an outline, not a target
  dayCellHere: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.border },
  dayCellTitle: { fontSize: 15, fontWeight: '700', color: t.colors.link },
  dayCellDate: { fontSize: 12, color: t.colors.link },
  dayCellTextHere: { color: t.colors.textSecondary },
  action: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    minHeight: 52,
    paddingHorizontal: t.spacing.lg,
    borderRadius: 999,
    backgroundColor: t.colors.accentSoft,
  },
  actionDanger: { backgroundColor: t.colors.dangerBg },
  actionText: { fontSize: 15, fontWeight: '700', color: t.colors.link },
}));
