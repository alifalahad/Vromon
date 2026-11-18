/**
 * One stop's details (tap a stop card), as frame 30 (docs/ui-refresh step 14): its number and name; when
 * you're there, with 15 minutes less or more and "Keep this time"; the weather then, the price for one
 * and for the group, the hours, busy or quiet; why it's here; Directions, Swap, Move to another day and
 * Remove; and where the place comes from. Nothing unknown is shown as known: a rating, a price or hours
 * no source gave say so, or aren't shown.
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
import { Toggle } from '../../../ui/Toggle';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { useConditionText } from '../conditions/useConditionText';
import { isPrivatePlace, isUnchecked, kindLabel } from '../../places/kinds';
import { NotCheckedBadge } from '../../places/NotCheckedBadge';
import { planColors } from './colors';
import { categoryLabel, priceText, weatherIcon, type StopWeather } from './PlanRows';
import { dayDate, dayParts, fromMinutes, stopCoord, stopKind, stopTitle, toMinutes } from './timeline';
import { usePlanFormat } from './usePlanFormat';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SNAP_POINTS = ['62%', '92%'];
const DAY_GAP = 8;
const BODY_PADDING = 16;

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
  n,
  weather,
  travellers = 1,
}: {
  item: ItineraryItem | null;
  issues: Violation[];
  editable: boolean;
  onClose: () => void;
  onExplain: (item: ItineraryItem) => void;
  onSwap: (item: ItineraryItem) => void;
  onRemove: (item: ItineraryItem) => void;
  /** The trip's days and the one this stop is on, for its date and "Move to another day" */
  days?: PickDay[];
  currentDayId?: number;
  onSetDuration?: (item: ItineraryItem, minutes: number) => void;
  onSetPinned?: (item: ItineraryItem, pinned: boolean) => void;
  onMoveDay?: (item: ItineraryItem, dayId: number) => void;
  /** Your own stop from outside Vromon's list: "Suggest this place to Vromon" (trip upgrades step 6) */
  onSuggest?: (item: ItineraryItem) => void;
  /** Its number in the day, as on its card */
  n?: number;
  /** The weather in the hour it starts, when the forecast reaches it */
  weather?: StopWeather | null;
  /** For the group's price ("৳200 for 2") */
  travellers?: number;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const pc = planColors(theme);
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const conditionText = useConditionText();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, !!item, onClose);
  const after = useRef<(() => void) | null>(null);
  // The stop whose days are open: another stop starts with them closed
  const [choosingFor, setChoosingFor] = useState<number | null>(null);
  const choosingDay = !!item && choosingFor === item.id;

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
  const known = place ?? restaurant;
  const opens = place?.opening_time ?? restaurant?.opening_time;
  const closes = place?.closing_time ?? restaurant?.closing_time;
  // An unknown rating (imported places) isn't shown
  const rating = known?.rating_known === false ? null : (place?.rating ?? restaurant?.rating);
  const hoursUnknown = known?.hours_known === false;
  // Your own stop from data Vromon hasn't checked: the badge, who sees it, and "Suggest this place to Vromon"
  const unchecked = isUnchecked(place);
  const what =
    item?.item_type === 'meal'
      ? restaurant?.cuisine?.replace(/_/g, ' ')
      : ((isPrivatePlace(place) ? kindLabel(place?.kind, t) : null) ?? categoryLabel(place?.category ?? item?.category, t));
  const crowd = place?.crowd_level === 'Low' ? t('plan.quiet') : place?.crowd_level === 'High' ? t('plan.busy') : null;
  const coord = item ? stopCoord(item) : null;
  const isVisit = item?.item_type === 'activity';
  // Planner wording that isn't for travellers (older plans say "Scheduled by CP-SAT optimizer")
  const reasons = (item?.recommendation_reasons ?? []).filter((r) => !r.includes('(penalised)') && !r.includes('CP-SAT'));
  const problems = issues.filter((v) => v.severity !== 'info');
  const description = place?.description ?? restaurant?.description;
  const day = days.find((d) => d.id === currentDayId);
  const dayText = day ? [t('plan.day', { n: f.n(day.day_number) }), day.day_date ? f.time(dayDate(day.day_date, i18n.language)) : null].filter(Boolean).join(', ') : null;
  // The price for one, and for the group when it's known
  const price = item ? priceText(item, t, f) : '';
  const priceKnown = !!item?.cost && item.cost_source !== 'placeholder' && known?.cost_known !== false && item.currency === 'BDT';
  const group = priceKnown && travellers > 1 ? t('plan.priceGroup', { amount: f.money(item!.cost * travellers), n: f.n(travellers) }) : null;
  const look = weather?.code != null ? weatherIcon(weather) : null;
  const rain = weather?.rain == null ? null : weather.rain >= 60 ? t('plan.rainLikely', { n: f.n(weather.rain) }) : weather.rain >= 30 ? t('plan.rainMaybe', { n: f.n(weather.rain) }) : t('plan.rainUnlikely');
  const skyWords = weather?.code != null ? conditionText.sky(weather.code) : '';
  // Where the place comes from, by a name a traveller knows (a source without one isn't shown)
  const sourceName = place?.source ? t(`plan.sourceNames.${place.source}`, { defaultValue: '' }) : '';
  const source = sourceName ? t(place?.checked === false ? 'plan.sourceUnchecked' : 'plan.sourceChecked', { source: sourceName }) : null;
  const canMove = editable && days.length > 1;

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
            {n != null ? (
              <View style={[styles.badge, { backgroundColor: stopKind(item) === 'meal' ? pc.meal : pc.visit }]}>
                <Text style={[styles.badgeText, { color: stopKind(item) === 'meal' ? pc.onMeal : pc.onVisit }]} maxFontSizeMultiplier={1.3}>
                  {f.n(n)}
                </Text>
              </View>
            ) : null}
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header">
                {stopTitle(item)}
              </Text>
              <Text style={styles.subtitle}>{[what, rating ? `★ ${f.n(rating)}` : null, dayText].filter(Boolean).join(' · ')}</Text>
            </View>
            <PressableScale
              pressEffect="opacity"
              onPress={() => ref.current?.dismiss()}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="stop-sheet-close"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
            </PressableScale>
          </View>
          {unchecked ? (
            <View style={styles.uncheckedBox}>
              <NotCheckedBadge testID="stop-sheet-unchecked" />
              <Text style={styles.muted}>{t('search.privateNote')}</Text>
            </View>
          ) : null}

          <TimeCard
            key={item.id}
            item={item}
            editable={editable}
            onSetDuration={(m) => onSetDuration?.(item, m)}
            onSetPinned={(p) => onSetPinned?.(item, p)}
          />

          {problems.length > 0 && (
            <View style={styles.problems}>
              {problems.map((v, i) => {
                const tone = v.severity === 'hard' ? colors.danger : colors.warning;
                return (
                  <View key={i} style={styles.problem}>
                    <MaterialCommunityIcons name="alert-outline" size={18} color={tone} />
                    <Text style={[styles.problemText, { color: tone }]}>{v.message}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.info}>
            {look ? (
              <InfoRow
                icon={look.icon}
                iconColor={look.sunny ? pc.sun : colors.textSecondary}
                text={weather?.temp != null ? t('plan.weatherThen', { temp: f.n(Math.round(weather.temp)), sky: lower(skyWords) }) : t('plan.skyThen', { sky: skyWords })}
                sub={rain}
                testID="stop-sheet-weather"
              />
            ) : null}
            <InfoRow icon="ticket-outline" text={price} sub={group} testID="stop-sheet-price" />
            {hoursUnknown ? (
              <InfoRow icon="clock-outline" text={t('plan.hoursUnknown')} testID="stop-sheet-hours" />
            ) : opens && closes ? (
              <InfoRow icon="clock-outline" text={t('plan.open', { from: f.time(opens), to: f.time(closes) })} testID="stop-sheet-hours" />
            ) : null}
            {crowd ? <InfoRow icon="account-group-outline" text={crowd} testID="stop-sheet-crowd" /> : null}
          </View>

          {(isVisit && (reasons.length > 0 || item.notes)) || description || (isVisit && !isPrivatePlace(place)) ? (
            <View style={styles.why}>
              {/* Only reasons are "why"; a place's description (a restaurant's may be its address) stands alone */}
              {isVisit && (reasons.length > 0 || item.notes) ? (
                <Text style={styles.whyTitle} accessibilityRole="header">
                  {t('plan.whyHere')}
                </Text>
              ) : null}
              {isVisit &&
                reasons.map((r, i) => (
                  <View key={i} style={styles.reason}>
                    <MaterialCommunityIcons name="check" size={16} color={colors.success} />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}
              {isVisit && item.notes ? (
                <View style={styles.reason}>
                  <MaterialCommunityIcons name="check" size={16} color={colors.success} />
                  <Text style={styles.reasonText}>{t('plan.bestTime', { when: item.notes })}</Text>
                </View>
              ) : null}
              {description ? <Text style={styles.muted}>{description}</Text> : null}
              {/* Not for your own stop: Vromon knows nothing about it, and its name isn't sent to the AI */}
              {isVisit && !isPrivatePlace(place) && (
                <PressableScale onPress={() => closeThen(() => onExplain(item))} pressEffect="opacity" style={styles.link} testID="stop-explain">
                  <Text style={styles.linkText}>{t('plan.moreAbout')}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.link} />
                </PressableScale>
              )}
            </View>
          ) : null}

          <View style={styles.actions}>
            {coord || (editable && isVisit) ? (
              <View style={styles.actionRow}>
                {coord ? (
                  <ActionButton
                    icon="navigation-variant-outline"
                    label={t('plan.directions')}
                    kind="primary"
                    onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coord.latitude},${coord.longitude}`)}
                    testID="stop-directions"
                  />
                ) : null}
                {editable && isVisit ? <ActionButton icon="swap-horizontal" label={t('plan.swap')} onPress={() => closeThen(() => onSwap(item))} testID="stop-swap" /> : null}
              </View>
            ) : null}
            {canMove || (editable && isVisit) ? (
              <View style={styles.actionRow}>
                {canMove ? (
                  <ActionButton
                    icon={choosingDay ? 'chevron-up' : 'calendar-arrow-right'}
                    label={t('plan.moveToDay')}
                    kind="plain"
                    small
                    expanded={choosingDay}
                    onPress={() => setChoosingFor(choosingDay ? null : item.id)}
                    testID="stop-move-day"
                  />
                ) : null}
                {editable && isVisit ? (
                  <ActionButton icon="trash-can-outline" label={t('plan.remove')} kind="danger" small grow={!canMove} onPress={() => closeThen(() => onRemove(item))} testID="stop-remove" />
                ) : null}
              </View>
            ) : null}
            {canMove && choosingDay ? <DayPicker days={days} currentId={currentDayId} onPick={(dayId) => closeThen(() => onMoveDay?.(item, dayId))} /> : null}
            {editable && unchecked && onSuggest ? (
              <ActionButton icon="send-outline" label={t('search.suggest')} onPress={() => closeThen(() => onSuggest(item))} testID="stop-suggest" />
            ) : null}
          </View>

          {source ? (
            <Text style={styles.source} testID="stop-source">
              {source}
            </Text>
          ) : null}
        </BottomSheetScrollView>
      ) : null}
    </BottomSheetModal>
  );
}

/** "Partly cloudy" → "partly cloudy" in the middle of a sentence (Bangla has no capitals) */
function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * When you're there (frame 30): "11:05 – 12:35", "1 h 30 there", with 15 minutes less or more, and
 * "Keep this time". Quick taps are sent as one change; closing the sheet sends it at once. A friend
 * sees the time only. A new stop gets a fresh card (key).
 */
function TimeCard({
  item,
  editable,
  onSetDuration,
  onSetPinned,
}: {
  item: ItineraryItem;
  editable: boolean;
  onSetDuration: (minutes: number) => void;
  onSetPinned: (pinned: boolean) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const [stay, setStay] = useState(item.duration_minutes);
  const [pinned, setPinned] = useState(!!item.pinned);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; minutes: number } | null>(null);
  const save = useRef(onSetDuration);
  useEffect(() => {
    save.current = onSetDuration;
  });
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
    <View style={styles.timeCard}>
      <View style={styles.timeRow}>
        <View style={styles.flex}>
          <Text style={styles.timeText} accessibilityLabel={t('plan.visitTimeA11y', { from: f.time(item.start_time), to: end })}>
            {f.time(item.start_time)} – {end}
          </Text>
          <Text style={styles.thereFor} accessibilityLiveRegion="polite" testID="stay-value">
            {t('plan.thereFor', { time: f.shortDuration(stay) })}
          </Text>
        </View>
        {editable ? (
          <>
            <PressableScale onPress={() => changeStay(-15)} accessibilityRole="button" accessibilityLabel={t('plan.stayLess')} style={styles.step} testID="stay-less">
              <MaterialCommunityIcons name="minus" size={20} color={colors.textPrimary} />
            </PressableScale>
            <PressableScale onPress={() => changeStay(15)} accessibilityRole="button" accessibilityLabel={t('plan.stayMore')} style={styles.step} testID="stay-more">
              <MaterialCommunityIcons name="plus" size={20} color={colors.textPrimary} />
            </PressableScale>
          </>
        ) : null}
      </View>
      {editable ? (
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          accessibilityRole="switch"
          accessibilityLabel={`${t('plan.keepTime')}. ${t('plan.keepTimeHint')}`}
          accessibilityState={{ checked: pinned }}
          onPress={() => {
            setPinned(!pinned);
            onSetPinned(!pinned);
          }}
          style={styles.keepRow}
          testID="stop-pin"
        >
          <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textSecondary} />
          <View style={styles.flex}>
            <Text style={styles.keepTitle}>{t('plan.keepTime')}</Text>
            <Text style={styles.keepHint}>{t('plan.keepTimeHint')}</Text>
          </View>
          {/* The row takes the tap; the switch only shows it */}
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Toggle value={pinned} />
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

function InfoRow({ icon, iconColor, text, sub, testID }: { icon: IconName; iconColor?: string; text: string; sub?: string | null; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow} accessible accessibilityLabel={[text, sub].filter(Boolean).join(', ')} testID={testID}>
      <MaterialCommunityIcons name={icon} size={20} color={iconColor ?? colors.textSecondary} />
      <Text style={styles.infoText}>
        {text}
        {sub ? <Text style={styles.infoSub}> · {sub}</Text> : null}
      </Text>
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
  // What's left of the screen inside the sheet's padding
  const inner = width - 2 * BODY_PADDING;
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

function ActionButton({
  icon,
  label,
  onPress,
  kind = 'tint',
  small,
  grow = true,
  expanded,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** primary: blue with white words; tint: soft blue; plain: grey; danger: soft red */
  kind?: 'primary' | 'tint' | 'plain' | 'danger';
  /** The second row's buttons are 48 high */
  small?: boolean;
  grow?: boolean;
  expanded?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ink = kind === 'primary' ? colors.onAccent : kind === 'danger' ? colors.danger : kind === 'plain' ? colors.textPrimary : colors.link;
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.action, small && styles.actionSmall, grow && styles.flex, styles[kind]]}
      accessibilityRole="button"
      accessibilityState={expanded == null ? undefined : { expanded }}
      testID={testID}
    >
      <MaterialCommunityIcons name={icon} size={18} color={ink} />
      <Text style={[styles.actionText, { color: ink }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => {
  const raised = t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset;
  return {
    background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
    handle: { backgroundColor: t.colors.textTertiary, width: 40 },
    body: { paddingHorizontal: BODY_PADDING, paddingTop: 4, gap: 12 },
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
    badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontSize: 16, fontWeight: '700' },
    headerText: { flex: 1, minWidth: 0, gap: 2 },
    title: { ...t.type.title, fontSize: 22, lineHeight: 26, color: t.colors.textPrimary },
    subtitle: { fontSize: 13.5, color: t.colors.textSecondary },
    close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: raised },
    uncheckedBox: { gap: 6 },
    timeCard: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6, borderRadius: 20, backgroundColor: t.colors.bg },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8 },
    timeText: { ...t.type.title, fontSize: 26, lineHeight: 30, color: t.colors.textPrimary },
    thereFor: { fontSize: 13.5, color: t.colors.textSecondary },
    step: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    keepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingTop: 6, borderTopWidth: 1, borderTopColor: t.colors.divider },
    keepTitle: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary },
    keepHint: { fontSize: 12.5, color: t.colors.textSecondary },
    problems: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: t.colors.dangerBg },
    problem: { flexDirection: 'row', gap: 8 },
    problemText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
    info: { paddingHorizontal: 4 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingVertical: 4 },
    infoText: { flex: 1, fontSize: 14.5, color: t.colors.textPrimary },
    infoSub: { color: t.colors.textSecondary },
    why: { gap: 4, paddingHorizontal: 4 },
    whyTitle: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary, marginBottom: 2 },
    reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    reasonText: { flex: 1, fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
    muted: { fontSize: 14, lineHeight: 20, color: t.colors.textSecondary },
    link: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
    linkText: { fontSize: 15, fontWeight: '600', color: t.colors.link },
    actions: { gap: 8, marginTop: 4 },
    actionRow: { flexDirection: 'row', gap: 8 },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 50,
      paddingHorizontal: 20,
      paddingVertical: 6,
      borderRadius: 25,
    },
    actionSmall: { minHeight: 48, borderRadius: 24 },
    actionText: { flexShrink: 1, fontSize: 15, fontWeight: '500', textAlign: 'center' },
    primary: { backgroundColor: t.colors.accentStrong },
    tint: { backgroundColor: t.colors.accentTint },
    plain: { backgroundColor: raised },
    danger: { backgroundColor: t.colors.dangerBg },
    source: { fontSize: 12.5, color: t.colors.textSecondary, paddingHorizontal: 4 },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: DAY_GAP, paddingVertical: 4 },
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
  };
});
