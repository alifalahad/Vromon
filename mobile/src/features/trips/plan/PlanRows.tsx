/**
 * The rows of a day in the plan sheet, as a timeline (docs/ui-refresh step 14, frame 29): stop cards with
 * their time, length and weather, rides between them (a dotted line under the badges) and free time.
 * A stop card opens its details on tap; your own trip's sightseeing stops can also be swiped left to
 * remove (with Undo in the snackbar), and dragged when they don't keep their time.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import type { ItineraryItem, TravelMode, Violation } from '../../../types';
import { LineIcon } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { sky, useConditionText } from '../conditions/useConditionText';
import { isPrivatePlace, isUnchecked, kindLabel } from '../../places/kinds';
import { NotCheckedBadge } from '../../places/NotCheckedBadge';
import { mealTitle, slotOf, sourceOf } from '../meals/meals';
import { planColors } from './colors';
import { forYou, stopTitle, type StopKind } from './timeline';
import { usePlanFormat, type PlanFormat } from './usePlanFormat';

// When the order changes, the rows glide to their new places (off with "remove animations")
const GLIDE = LinearTransition.duration(220);
const APPEAR = FadeIn.duration(150);

/** The time column's width; the badges' centres (and the rides' dotted line) are 27 dp into the card */
export const TIME_COL = 52;

type T = (k: string, o?: Record<string, unknown>) => string;

export function priceText(item: ItineraryItem, t: T, f: PlanFormat): string {
  // Your own food costs what you said (nothing when you didn't); where you stay, nothing (step 3)
  if (sourceOf(item) === 'stay' || (sourceOf(item) === 'own' && !item.cost)) return t('meals.noCost');
  // A price nobody has checked isn't shown as if known (docs/ui-refresh step 14)
  if (item.cost_source === 'placeholder' || (item.place ?? item.restaurant)?.cost_known === false) return t('plan.priceUnknown');
  if (!item.cost) return item.item_type === 'meal' ? t('plan.priceUnknown') : t('plan.priceFree');
  const amount = item.currency === 'BDT' ? f.money(item.cost) : `${f.n(item.cost)} ${item.currency}`;
  return t('plan.perPerson', { amount });
}

export function stopSubtitle(item: ItineraryItem, t: T, f: PlanFormat): string {
  const own = sourceOf(item) === 'own';
  // A packed meal: where it's eaten ("At Laboni Beach")
  const what = own ? (item.notes?.startsWith('At ') ? t('meals.atPlace', { place: item.notes.slice(3) }) : null)
    : item.item_type === 'meal' ? item.restaurant?.cuisine?.replace(/_/g, ' ')
    : (isPrivatePlace(item.place) ? kindLabel(item.place?.kind, t) : null) ?? categoryLabel(item.place?.category ?? item.category, t);
  return [what, priceText(item, t, f)].filter(Boolean).join(' · ');
}

/** The card's title: a packed meal or one where you stay in words, else the place or "Lunch · restaurant". */
export function cardTitle(item: ItineraryItem, t: T): string {
  const slot = slotOf(item);
  if (slot && item.restaurant && sourceOf(item) === 'restaurant') return `${t(`meals.slot.${slot}`)} · ${item.restaurant.name}`;
  return mealTitle(item, t) ?? stopTitle(item);
}

/** A Vromon category in the traveller's language ("Family" → "পরিবার"), as the interests name them; else as it is. */
export function categoryLabel(category: string | null | undefined, t: T): string | null {
  return category ? t(`interests.${category}`, { defaultValue: category }) : null;
}

export type MoveActions = { earlier?: () => void; later?: () => void; toDay?: () => void };

/** The weather in the hour a stop starts (the conditions' items), when the forecast reaches it */
export type StopWeather = { temp: number | null; rain: number | null; code: number | null; night?: boolean };

/** The sky's icon and whether it's the sun (drawn in the frames' marigold) */
export function weatherIcon(w: StopWeather) {
  const s = sky(w.code, w.night);
  return { ...s, sunny: !w.night && (s.key === 'clear' || s.key === 'partly') };
}

export function StopCard({
  item,
  n,
  kind,
  issues,
  selected,
  removable,
  onPress,
  onRemove,
  onLayoutRow,
  onCardWidth,
  drag,
  dragging,
  dimmed,
  previewStart,
  move,
  glide = true,
  onEatNearby,
  weather,
  mustDo,
  status,
}: {
  item: ItineraryItem;
  n: number;
  kind: StopKind;
  issues: Violation[];
  selected: boolean;
  removable: boolean;
  onPress: () => void;
  onRemove: () => void;
  onLayoutRow?: (y: number, height: number) => void;
  /** The card's width (the copy that follows the finger while dragging is as wide) */
  onCardWidth?: (width: number) => void;
  /** Press and hold to drag (your own trip, a stop that doesn't keep its time): the card shows its grip */
  drag?: GestureType;
  /** This card is being dragged: its copy follows the finger and an outline keeps its place */
  dragging?: boolean;
  /** Another stop is being dragged */
  dimmed?: boolean;
  /** The time it would start at while another stop is dragged */
  previewStart?: string;
  /** Glide to a new place when the order changes (not the card just dropped: it's already there) */
  glide?: boolean;
  /** TalkBack's way to move it */
  move?: MoveActions;
  /** A packed meal: "Places to eat nearby", in case of a change of mind (step 3) */
  onEatNearby?: () => void;
  /** The weather in the hour it starts, under its time */
  weather?: StopWeather | null;
  /** "Your must-do at sunset": one of the traveller's must-dos, with when they wanted it */
  mustDo?: string | null;
  /** On the trip (docs/ui-refresh step 15, frame 31): the stop that's on now, or the next one */
  status?: 'now' | 'next' | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const { t } = useTranslation();
  const f = usePlanFormat();
  const conditionText = useConditionText();
  const swipe = useRef<SwipeableMethods>(null);
  // A swipe can report "opened" more than once; remove only once
  const removed = useRef(false);
  const problems = issues.filter((v) => v.severity !== 'info');
  const hard = problems.some((v) => v.severity === 'hard');
  const tag = kind === 'visit' && !mustDo ? forYou(item.recommendation_reasons) : null;
  const ring =
    dragging || selected || status === 'now' ? theme.colors.accent : hard ? theme.colors.danger : problems.length ? theme.colors.warning : 'transparent';
  // Only what's true: a must-do says so, and "keeps its time" only when it does (kept with "Keep this time")
  const keepLine = mustDo ? (item.pinned ? `${mustDo} · ${t('plan.keepsTime')}` : mustDo) : item.pinned ? t('plan.pinned') : null;
  const look = weather?.code != null ? weatherIcon(weather) : null;
  const temp = weather?.temp != null ? `${f.n(Math.round(weather.temp))}°` : null;
  const actions = [
    ...(removable ? [{ name: 'activate', label: t('plan.detailsAction') }, { name: 'remove', label: t('plan.removeAction') }] : []),
    ...(move?.earlier ? [{ name: 'earlier', label: t('plan.moveEarlier') }] : []),
    ...(move?.later ? [{ name: 'later', label: t('plan.moveLater') }] : []),
    ...(move?.toDay ? [{ name: 'toDay', label: t('plan.moveToDay') }] : []),
  ];
  const onAction = (name: string) => {
    if (name === 'remove') onRemove();
    else if (name === 'earlier') move?.earlier?.();
    else if (name === 'later') move?.later?.();
    else if (name === 'toDay') move?.toDay?.();
    else onPress();
  };
  const shownStart = previewStart ?? item.start_time;

  const card = (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      style={[styles.card, status === 'now' && styles.cardNow, { borderColor: ring }]}
      accessibilityLabel={[
        t('plan.stopA11y', { n: f.n(n), title: cardTitle(item, t), time: f.time(item.start_time) }),
        status ? t(status === 'now' ? 'plan.statusNow' : 'plan.statusNext') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={[
        f.duration(item.duration_minutes),
        look ? [temp, conditionText.sky(weather?.code)].filter(Boolean).join(', ') : null,
        stopSubtitle(item, t, f),
        keepLine,
        isUnchecked(item.place) ? t('search.notCheckedA11y') : null,
        ...problems.map((v) => v.message),
        drag ? t('plan.dragHint') : null,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityActions={actions.length ? actions : undefined}
      onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
      testID={`stop-${item.id}`}
    >
      <View style={[styles.badge, { backgroundColor: kind === 'meal' ? colors.meal : colors.visit }]}>
        <Text style={[styles.badgeText, { color: kind === 'meal' ? colors.onMeal : colors.onVisit }]} maxFontSizeMultiplier={1.3}>
          {f.n(n)}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{cardTitle(item, t)}</Text>
        <Text style={styles.sub}>{stopSubtitle(item, t, f)}</Text>
        {tag ? <Text style={styles.tag}>{t('plan.forYou', { what: tag })}</Text> : null}
        {keepLine ? (
          <View style={styles.keepRow} testID={`stop-keeps-${item.id}`}>
            <MaterialCommunityIcons name={item.pinned ? 'lock-outline' : 'star-outline'} size={13} color={theme.colors.textSecondary} />
            <Text style={styles.keepText}>{keepLine}</Text>
          </View>
        ) : null}
        {isUnchecked(item.place) ? <NotCheckedBadge testID={`stop-unchecked-${item.id}`} /> : null}
        {onEatNearby ? (
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={onEatNearby}
            hitSlop={8}
            style={styles.eatNearby}
            accessibilityRole="button"
            testID={`eat-nearby-${item.id}`}
          >
            <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={theme.colors.link} />
            <Text style={styles.eatNearbyText}>{t('meals.eatNearby')}</Text>
          </PressableScale>
        ) : null}
        {problems.map((v, i) => {
          const tone = v.severity === 'hard' ? theme.colors.danger : theme.colors.warning;
          return (
            <View key={i} style={styles.issue}>
              <MaterialCommunityIcons name="alert-outline" size={15} color={tone} />
              <Text style={[styles.issueText, { color: tone }]}>{v.message}</Text>
            </View>
          );
        })}
      </View>
      {status ? (
        <View style={[styles.pill, status === 'now' ? styles.pillNow : styles.pillNext]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.pillText, status === 'now' ? styles.pillNowText : styles.pillNextText]} maxFontSizeMultiplier={1.3}>
            {t(status === 'now' ? 'plan.statusNow' : 'plan.statusNext')}
          </Text>
        </View>
      ) : null}
      {/* Only on a stop that can be moved */}
      {drag ? (
        <View style={styles.grip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`stop-grip-${item.id}`}>
          <LineIcon name="grip" size={20} color={theme.colors.textTertiary} />
        </View>
      ) : null}
    </PressableScale>
  );

  return (
    <Animated.View
      layout={glide ? GLIDE : undefined}
      style={[styles.row, dimmed && styles.dimmed]}
      onLayout={(e) => onLayoutRow?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      <View style={[styles.timeCol, dragging && styles.hidden]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {/* One line, shrunk to fit: Bangla digits with large text wrapped "০৯:০" / "০" (step 8) */}
        <Text
          style={[styles.time, shownStart !== item.start_time && { color: theme.colors.link }]}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {f.time(shownStart)}
        </Text>
        <Text style={styles.duration} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
          {f.shortDuration(item.duration_minutes)}
        </Text>
        {look ? (
          <View style={styles.weather} testID={`stop-weather-${item.id}`}>
            <MaterialCommunityIcons name={look.icon} size={13} color={look.sunny ? colors.sun : theme.colors.textSecondary} />
            {temp ? (
              <Text style={styles.duration} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {temp}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.cardWrap} onLayout={(e) => onCardWidth?.(e.nativeEvent.layout.width)}>
        {drag ? (
          <GestureDetector gesture={drag}>
            <Animated.View style={dragging && styles.hidden}>{body()}</Animated.View>
          </GestureDetector>
        ) : (
          body()
        )}
        {/* Its place while its copy is dragged (frames 13 and 14) */}
        {dragging ? <View pointerEvents="none" style={styles.outline} testID="drag-outline" /> : null}
      </View>
    </Animated.View>
  );

  // The swipe stays mounted while dragging (only disabled): changing the gesture's view mid-drag ends it
  function body() {
    return removable ? (
          <ReanimatedSwipeable
            ref={swipe}
            enabled={!dragging}
            friction={1.5}
            rightThreshold={72}
            overshootRight={false}
            renderRightActions={() => (
              <View style={styles.swipeAction} importantForAccessibility="no-hide-descendants">
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.colors.danger} />
                <Text style={styles.swipeText}>{t('plan.swipeRemove')}</Text>
              </View>
            )}
            onSwipeableOpen={() => {
              swipe.current?.close();
              if (removed.current) return;
              removed.current = true;
              onRemove();
              // The card comes back if Undo is used
              setTimeout(() => (removed.current = false), 600);
            }}
          >
            {card}
          </ReanimatedSwipeable>
    ) : (
      card
    );
  }
}

/** Icons for the ways to get from one stop to the next */
export const MODE_ICON: Record<TravelMode, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  walk: 'walk',
  rickshaw: 'rickshaw',
  cng: 'rickshaw-electric',
  car: 'car',
};

/** The rides' dotted line, under the badges (frame 29) */
function DottedLine({ color, height = 30 }: { color: string; height?: number }) {
  return (
    <Svg width={2} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={1} y1={0} x2={1} y2={height} stroke={color} strokeWidth={2} strokeDasharray="2 3" />
    </Svg>
  );
}

export function LegRow({
  minutes,
  km,
  mode,
  fare,
  note,
  crossing,
  onPress,
  dimmed,
  leaveAt,
}: {
  minutes: number;
  km: number;
  /** No road: by boat or ferry between two ghats (estimates, check the local schedule) */
  crossing?: { from_ghat: string; to_ghat: string; water_km: number } | null;
  /** Usual (not live) slow traffic on this leg */
  note?: string;
  /** How (from road data); none for the straight-line estimate */
  mode?: TravelMode | null;
  fare?: number | null;
  /** Choose how to go (your own trip) */
  onPress?: () => void;
  /** A stop is being dragged */
  dimmed?: boolean;
  /** On the trip: when to leave for the next stop (frame 31: "12:40" beside its ride) */
  leaveAt?: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const f = usePlanFormat();
  const time = f.duration(minutes);
  const kmText = f.distance(km);
  const text = crossing
    ? t('plan.legBoat', { from: crossing.from_ghat, to: crossing.to_ghat, time })
    : mode ? t('plan.legMode', { mode: t(`plan.modes.${mode}`), time, km: kmText }) : t('plan.legAbout', { time, km: kmText });
  const price = mode && !crossing ? (fare ? t('plan.legFare', { amount: f.money(fare) }) : t('plan.legFree')) : null;
  const legNote = [crossing ? t('plan.legBoatNote') : null, note].filter(Boolean).join(' ');
  const a11y = [
    leaveAt ? t('today.leaveByAt', { time: f.time(leaveAt) }) : null,
    crossing ? text : mode ? t('plan.legModeA11y', { mode: t(`plan.modes.${mode}`), time, km: kmText }) : t('plan.legA11y', { time, km: kmText }),
    price,
    legNote,
  ]
    .filter(Boolean)
    .join(', ');
  const body = (
    <View style={styles.leg}>
      <DottedLine color={planColors(theme).dotted} />
      <MaterialCommunityIcons name={crossing ? 'ferry' : mode ? MODE_ICON[mode] : 'map-marker-path'} size={18} color={crossing || mode ? colors.link : colors.textSecondary} />
      <View style={styles.flex}>
        <Text style={styles.legText}>{text}</Text>
        {legNote ? <Text style={styles.legNote}>{legNote}</Text> : null}
      </View>
      {price ? <Text style={styles.legPrice}>{price}</Text> : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} /> : null}
    </View>
  );
  return (
    <Animated.View layout={GLIDE} entering={APPEAR} style={[styles.legRow, dimmed && styles.dimmed]}>
      {leaveAt ? (
        <Text style={styles.leaveAt} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit importantForAccessibility="no" accessibilityElementsHidden testID="leg-leave-at">
          {f.time(leaveAt)}
        </Text>
      ) : (
        <View style={styles.timeColEmpty} />
      )}
      {onPress ? (
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={onPress}
          style={styles.flex}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint={t('plan.legHint')}
          testID="leg-row"
        >
          {body}
        </PressableScale>
      ) : (
        <View style={styles.flex} accessible accessibilityLabel={a11y}>
          {body}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * A finished stop on the trip (docs/ui-refresh step 15, frame 31): a short row with a tick and "Done". It still
 * opens the stop's details; it can't be moved or removed.
 */
export function DoneRow({ item, onPress, dimmed }: { item: ItineraryItem; onPress?: () => void; dimmed?: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const title = cardTitle(item, t);
  const inside = (
    <>
      <Text style={styles.sideTime} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
        {f.time(item.start_time)}
      </Text>
      <View style={styles.doneBody}>
        <View style={styles.doneTick}>
          <MaterialCommunityIcons name="check" size={16} color={theme.colors.success} />
        </View>
        <Text style={styles.doneTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.doneWord} maxFontSizeMultiplier={1.3}>
          {t('today.done')}
        </Text>
      </View>
    </>
  );
  const label = `${f.time(item.start_time)}, ${title}, ${t('today.done')}`;
  return (
    <Animated.View layout={GLIDE} style={[styles.doneRow, dimmed && styles.dimmed]}>
      {onPress ? (
        <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.doneInner} accessibilityRole="button" accessibilityLabel={label} testID={`stop-${item.id}`}>
          {inside}
        </PressableScale>
      ) : (
        <View style={styles.doneInner} accessible accessibilityLabel={label} testID={`stop-${item.id}`}>
          {inside}
        </View>
      )}
    </Animated.View>
  );
}

/** Free time (frame 29): a dashed row, "Free time · 45 min", and "Add", which adds a stop there */
export function FreeRow({ start, minutes, onAdd, dimmed }: { start: string; minutes: number; onAdd?: () => void; dimmed?: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = t('plan.freeFor', { time: f.duration(minutes) });
  const inside = (
    <>
      <Text style={styles.freeText}>{text}</Text>
      {onAdd ? (
        <View style={styles.freeAdd}>
          <MaterialCommunityIcons name="plus" size={16} color={theme.colors.link} />
          <Text style={styles.freeAddText}>{t('plan.freeAdd')}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <Animated.View layout={GLIDE} entering={APPEAR} style={[styles.freeRow, dimmed && styles.dimmed]}>
      <Text style={styles.sideTime} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit importantForAccessibility="no" accessibilityElementsHidden>
        {f.time(start)}
      </Text>
      {onAdd ? (
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={onAdd}
          style={[styles.free, { borderColor: planColors(theme).dash }]}
          accessibilityRole="button"
          accessibilityLabel={t('plan.freeA11y', { from: f.time(start), time: f.duration(minutes) })}
          testID="free-add"
        >
          {inside}
        </PressableScale>
      ) : (
        <View style={[styles.free, { borderColor: planColors(theme).dash }]} accessible accessibilityLabel={`${t('plan.freeTime')}, ${f.time(start)}, ${f.duration(minutes)}`}>
          {inside}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The stop being dragged, lifted over everything and following the finger (docs/ui-refresh step 8,
 * frames 13 and 14): a clear shadow, a blue ring and its grip. With reduced motion it isn't scaled.
 */
export function DragGhost({
  item,
  n,
  kind,
  x,
  y,
  width,
  still,
}: {
  item: ItineraryItem;
  n: number;
  kind: StopKind;
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  /** Reduced motion: no scaling */
  still: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const { t } = useTranslation();
  const f = usePlanFormat();
  const place = useAnimatedStyle(() => ({ left: x.get(), top: y.get(), width: width.get(), transform: [{ scale: still ? 1 : 1.03 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.ghost, place]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="drag-ghost">
      <View style={[styles.badge, { backgroundColor: kind === 'meal' ? colors.meal : colors.visit }]}>
        <Text style={[styles.badgeText, { color: kind === 'meal' ? colors.onMeal : colors.onVisit }]} maxFontSizeMultiplier={1.3}>
          {f.n(n)}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={2}>
          {cardTitle(item, t)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {stopSubtitle(item, t, f)}
        </Text>
      </View>
      <View style={styles.grip}>
        <LineIcon name="grip" size={20} color={theme.colors.accent} />
      </View>
    </Animated.View>
  );
}

/** Where the dragged stop would land, with the time it would start at */
export function LandingLine({ time }: { time?: string }) {
  const styles = useStyles();
  const f = usePlanFormat();
  return (
    <View style={styles.landing} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="drop-line">
      <View style={styles.landingTimeCol}>
        {time ? (
          <Text style={styles.landingTime} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit testID="drop-line-time">
            {f.time(time)}
          </Text>
        ) : null}
      </View>
      <View style={styles.landingLine}>
        <View style={styles.landingBar} />
        <View style={styles.landingDot} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Frame 29: the time column, 12 dp, then the card; rows 4 dp apart
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  // The rest of the day while a stop is dragged (frames 13 and 14)
  dimmed: { opacity: 0.42 },
  hidden: { opacity: 0 },
  outline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.colors.textTertiary,
  },
  grip: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  ghost: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: t.colors.accent,
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
    zIndex: 40,
  },
  landing: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 24, marginVertical: 2 },
  landingTimeCol: { width: TIME_COL, alignItems: 'flex-end' },
  landingTime: { fontSize: 14, fontWeight: '700', color: t.colors.link },
  landingLine: { flex: 1, height: 14, justifyContent: 'center' },
  landingBar: { height: 4, borderRadius: 2, backgroundColor: t.colors.accent },
  landingDot: { position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: t.colors.accent, backgroundColor: t.colors.surface },
  keepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keepText: { flexShrink: 1, fontSize: 12, color: t.colors.textSecondary },
  eatNearby: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  eatNearbyText: { fontSize: 13, fontWeight: '600', color: t.colors.link },
  timeCol: { width: TIME_COL, alignItems: 'flex-end', gap: 1 },
  timeColEmpty: { width: TIME_COL },
  time: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  duration: { fontSize: 12, color: t.colors.textSecondary },
  weather: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardWrap: { flex: 1, minWidth: 0 },
  // 2 dp of the padding is the ring (selected, or a problem), clear otherwise
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 2,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: t.scheme === 'dark' ? t.colors.surface : t.colors.bg,
  },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  badgeText: { fontSize: 14, fontWeight: '700' },
  texts: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 2 },
  title: { fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  sub: { fontSize: 13, color: t.colors.textSecondary },
  tag: { fontSize: 12, fontWeight: '500', color: t.colors.link },
  issue: { flexDirection: 'row', gap: 5, marginTop: 2 },
  issueText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  swipeAction: {
    width: 104,
    marginLeft: t.spacing.sm,
    borderRadius: 18,
    backgroundColor: t.colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeText: { fontSize: 13, fontWeight: '700', color: t.colors.danger },
  legRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  leg: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingLeft: 26, paddingRight: 6, paddingVertical: 4 },
  legText: { fontSize: 13, color: t.colors.textSecondary },
  legPrice: { fontSize: 13, color: t.colors.textPrimary },
  legNote: { fontSize: 12, color: t.colors.warning, marginTop: 1 },
  flex: { flex: 1 },
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  sideTime: { width: TIME_COL, textAlign: 'right', fontSize: 13, color: t.colors.textSecondary },
  free: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  freeText: { flex: 1, fontSize: 13.5, color: t.colors.textSecondary },
  freeAdd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  freeAddText: { fontSize: 13.5, fontWeight: '500', color: t.colors.link },
  // On the trip (frame 31)
  cardNow: {
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pill: { minHeight: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', alignSelf: 'center' },
  pillNow: { backgroundColor: t.colors.markTint },
  pillNext: { backgroundColor: t.colors.accentTint },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillNowText: { color: t.colors.warning },
  pillNextText: { color: t.colors.onAccentSoft },
  leaveAt: { width: TIME_COL, textAlign: 'right', fontSize: 13, fontWeight: '700', color: t.colors.link },
  doneRow: { marginVertical: 1 },
  doneInner: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  doneBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 8 },
  doneTick: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.successBg },
  doneTitle: { flex: 1, fontSize: 14.5, color: t.colors.textSecondary },
  doneWord: { fontSize: 12.5, fontWeight: '500', color: t.colors.success },
}));
