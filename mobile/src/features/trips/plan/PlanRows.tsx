/**
 * The rows of a day in the plan sheet: stop cards, travel legs and free time.
 * A stop card opens its details on tap; your own trip's sightseeing stops can
 * also be swiped left to remove (with Undo in the snackbar).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { ItineraryItem, TravelMode, Violation } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from './colors';
import { forYou, stopTitle, type StopKind } from './timeline';
import { usePlanFormat, type PlanFormat } from './usePlanFormat';


// When the order changes, the rows glide to their new places (off with "remove animations")
const GLIDE = LinearTransition.duration(220);
const APPEAR = FadeIn.duration(150);

type T = (k: string, o?: Record<string, unknown>) => string;

export function priceText(item: ItineraryItem, t: T, f: PlanFormat): string {
  if (item.cost_source === 'placeholder') return t('plan.priceUnknown');
  if (!item.cost) return item.item_type === 'meal' ? t('plan.priceUnknown') : t('plan.priceFree');
  const amount = item.currency === 'BDT' ? f.money(item.cost) : `${f.n(item.cost)} ${item.currency}`;
  return t('plan.perPerson', { amount });
}

export function stopSubtitle(item: ItineraryItem, t: T, f: PlanFormat): string {
  const what = item.item_type === 'meal' ? item.restaurant?.cuisine : item.place?.category ?? item.category;
  return [what, priceText(item, t, f)].filter(Boolean).join(' · ');
}

export type MoveActions = { earlier?: () => void; later?: () => void; toDay?: () => void };

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
  drag,
  dragging,
  translateY,
  previewStart,
  move,
  glide = true,
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
  /** Press and hold to drag (your own trip, not pinned) */
  drag?: GestureType;
  /** This card is being dragged */
  dragging?: boolean;
  translateY?: SharedValue<number>;
  /** The time it would start at while another stop is dragged */
  previewStart?: string;
  /** Glide to a new place when the order changes (not the card just dropped: it's already there) */
  glide?: boolean;
  /** TalkBack's way to move it */
  move?: MoveActions;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const { t } = useTranslation();
  const f = usePlanFormat();
  const swipe = useRef<SwipeableMethods>(null);
  // A swipe can report "opened" more than once; remove only once
  const removed = useRef(false);
  const problems = issues.filter((v) => v.severity !== 'info');
  const hard = problems.some((v) => v.severity === 'hard');
  const tag = kind === 'visit' ? forYou(item.recommendation_reasons) : null;
  const ring = dragging || selected ? theme.colors.accent : hard ? theme.colors.danger : problems.length ? theme.colors.warning : 'transparent';
  const lifted = useAnimatedStyle(() => (dragging && translateY ? { transform: [{ translateY: translateY.value }, { scale: 1.03 }] } : { transform: [] }));
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
      style={[styles.card, { borderColor: ring }]}
      accessibilityLabel={t('plan.stopA11y', { n: f.n(n), title: stopTitle(item), time: f.time(item.start_time) })}
      accessibilityHint={[stopSubtitle(item, t, f), item.pinned ? t('plan.pinned') : drag ? t('plan.dragHint') : null].filter(Boolean).join('. ')}
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
        <Text style={styles.title}>{stopTitle(item)}</Text>
        <Text style={styles.sub}>{stopSubtitle(item, t, f)}</Text>
        {tag ? <Text style={styles.tag}>{t('plan.forYou', { what: tag })}</Text> : null}
        {item.pinned ? (
          <View style={styles.pinnedRow}>
            <MaterialCommunityIcons name="lock-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.pinnedText}>{t('plan.pinned')}</Text>
          </View>
        ) : null}
        {problems.map((v, i) => (
          <View key={i} style={styles.issue}>
            <MaterialCommunityIcons name="alert-outline" size={16} color={v.severity === 'hard' ? theme.colors.danger : theme.colors.warning} />
            <Text style={styles.issueText}>{v.message}</Text>
          </View>
        ))}
      </View>
    </PressableScale>
  );

  return (
    <Animated.View
      layout={glide ? GLIDE : undefined}
      style={[styles.row, dragging && styles.rowLifted]}
      onLayout={(e) => onLayoutRow?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      <View style={[styles.timeCol, dragging && styles.hidden]}>
        <Text style={[styles.time, shownStart !== item.start_time && { color: theme.colors.link }]} maxFontSizeMultiplier={1.3}>
          {f.time(shownStart)}
        </Text>
        <Text style={styles.duration} maxFontSizeMultiplier={1.3}>
          {f.shortDuration(item.duration_minutes)}
        </Text>
      </View>
      <View style={styles.cardWrap}>
        {drag ? (
          <GestureDetector gesture={drag}>
            <Animated.View style={[lifted, dragging && styles.liftedShadow]}>{body()}</Animated.View>
          </GestureDetector>
        ) : (
          body()
        )}
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

export function LegRow({
  minutes,
  km,
  mode,
  fare,
  note,
  onPress,
}: {
  minutes: number;
  km: number;
  /** Usual (not live) slow traffic on this leg */
  note?: string;
  /** How (from road data); none for the straight-line estimate */
  mode?: TravelMode | null;
  fare?: number | null;
  /** Choose how to go (your own trip) */
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const time = f.duration(minutes);
  const kmText = f.km(km);
  const text = mode ? t('plan.legMode', { mode: t(`plan.modes.${mode}`), time, km: kmText }) : t('plan.legAbout', { time, km: kmText });
  const price = mode ? (fare ? t('plan.legFare', { amount: f.money(fare) }) : t('plan.legFree')) : null;
  const a11y = [mode ? text : t('plan.legA11y', { time, km: kmText }), price, note].filter(Boolean).join(', ');
  const body = (
    <View style={styles.leg}>
      <MaterialCommunityIcons name={mode ? MODE_ICON[mode] : 'map-marker-path'} size={18} color={mode ? colors.link : colors.textSecondary} />
      <View style={styles.flex}>
        <Text style={styles.legText}>{text}</Text>
        {note ? <Text style={styles.legNote}>{note}</Text> : null}
      </View>
      {price ? <Text style={styles.legText}>{price}</Text> : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} /> : null}
    </View>
  );
  return (
    <Animated.View layout={GLIDE} entering={APPEAR} style={styles.legRow}>
      <View style={styles.timeCol} />
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

export function FreeRow({ start, minutes, onAdd }: { start: string; minutes: number; onAdd?: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const f = usePlanFormat();
  return (
    <Animated.View layout={GLIDE} entering={APPEAR} style={styles.row}>
      <View style={styles.timeCol}>
        <Text style={[styles.time, styles.freeTime]} maxFontSizeMultiplier={1.3} accessibilityLabel={`${t('plan.freeTime')}, ${f.time(start)}, ${f.duration(minutes)}`}>
          {f.time(start)}
        </Text>
        <Text style={styles.duration} maxFontSizeMultiplier={1.3}>
          {f.shortDuration(minutes)}
        </Text>
      </View>
      <View style={styles.free}>
        <View style={styles.freeText}>
          <Text style={styles.freeTitle}>{t('plan.freeTime')}</Text>
          <Text style={styles.sub}>{t('plan.freeTimeHint')}</Text>
        </View>
        {onAdd ? (
          <PressableScale onPress={onAdd} accessibilityLabel={t('plan.addStopHere')} style={styles.freeAdd} testID="free-add">
            <MaterialCommunityIcons name="plus" size={22} color={colors.link} />
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.spacing.sm + 2, marginVertical: 3 },
  rowLifted: { zIndex: 10, elevation: 10 },
  hidden: { opacity: 0 },
  liftedShadow: {
    borderRadius: 18,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pinnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  pinnedText: { fontSize: 12, color: t.colors.textSecondary },
  timeCol: { width: 52, alignItems: 'flex-end', paddingTop: t.spacing.md },
  time: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  freeTime: { color: t.colors.textSecondary },
  duration: { fontSize: 12, color: t.colors.textTertiary },
  cardWrap: { flex: 1, minWidth: 0 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: t.scheme === 'dark' ? t.colors.surface : '#F3F3F5',
  },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  badgeText: { fontSize: 14, fontWeight: '800' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: t.colors.textPrimary },
  sub: { fontSize: 14, color: t.colors.textSecondary },
  tag: { fontSize: 13, color: t.colors.link },
  issue: { flexDirection: 'row', gap: 6, marginTop: 4 },
  issueText: { flex: 1, fontSize: 13, lineHeight: 18, color: t.colors.textPrimary },
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
  legRow: { flexDirection: 'row', gap: t.spacing.sm + 2, minHeight: 44, alignItems: 'center' },
  leg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    marginLeft: 14,
    paddingLeft: 14,
    minHeight: 44,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.colors.border,
  },
  legText: { fontSize: 13, fontWeight: '600', color: t.colors.textSecondary },
  legNote: { fontSize: 12, color: t.colors.warning, marginTop: 1 },
  flex: { flex: 1 },
  free: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.colors.border,
    padding: t.spacing.md,
  },
  freeText: { flex: 1, gap: 2 },
  freeAdd: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  freeTitle: { fontSize: 15, fontWeight: '600', color: t.colors.textPrimary },
}));
