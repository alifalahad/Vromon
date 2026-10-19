/**
 * Building the plan: a short transition, not a step. The route line draws itself
 * while the server plans; each check is ticked when the answer is back. If a
 * must-see doesn't fit, its choices come before "See your plan".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import type { MustSee, Place, Unplaced } from '../../../types';
import { Button } from '../../../ui/Button';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useReduceMotion } from '../../../ui/useReduceMotion';
import { UnplacedCard } from './UnplacedCard';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ROUTE = 'M30 105 C 70 105, 70 30, 120 40 S 170 105, 230 25';
const ROUTE_LENGTH = 420;

export type BuildPhase = 'building' | 'done' | 'failed';

export function Building({
  phase,
  subtitle,
  steps,
  saved,
  unplaced,
  places,
  days,
  applying,
  resolved,
  error,
  onChoose,
  onSeePlan,
  onRetry,
}: {
  phase: BuildPhase;
  subtitle: string;
  /** What the planner did, in order (ticked once the plan is back); the first is "Saved your trip" */
  steps: string[];
  /** The trip has been saved (the first check is done while the plan is still being built) */
  saved: boolean;
  unplaced: Unplaced[];
  places: readonly Place[];
  days: number;
  /** The must-see whose choice is being applied */
  applying: number | null;
  /** What each choice did, shown after it ("Left out…") */
  resolved: string[];
  error: string | null;
  onChoose: (u: Unplaced, rule: MustSee | null) => void;
  onSeePlan: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const dash = useSharedValue(ROUTE_LENGTH);
  const [ticked, setTicked] = useState(0);

  // The line draws itself while planning, then stays drawn
  useEffect(() => {
    if (reduce || phase !== 'building') {
      cancelAnimation(dash);
      dash.set(0);
      return;
    }
    dash.set(ROUTE_LENGTH);
    dash.set(withRepeat(withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [phase, reduce, dash]);

  // Checks tick one after another once the plan is back (quickly: the work is already done)
  useEffect(() => {
    if (phase !== 'done') return;
    if (ticked >= steps.length) return;
    const id = setTimeout(() => setTicked((n) => n + 1), reduce ? 0 : 110);
    return () => clearTimeout(id);
  }, [phase, ticked, steps.length, reduce]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: dash.get() }));
  const allTicked = phase === 'done' && ticked >= steps.length;
  const ready = allTicked && unplaced.length === 0;
  const heading =
    phase === 'failed' ? t('newTrip.failedTitle') : !allTicked ? t('newTrip.building') : unplaced.length ? t('newTrip.almost') : t('newTrip.ready');

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body}>
        <Svg width={260} height={130} viewBox="0 0 260 130" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AnimatedPath
            d={ROUTE}
            stroke={colors.link}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={[ROUTE_LENGTH, ROUTE_LENGTH]}
            animatedProps={lineProps}
          />
          <Circle cx={30} cy={105} r={11} fill={colors.accent} />
          <Circle cx={120} cy={40} r={11} fill={colors.accent} />
          <Circle cx={176} cy={88} r={11} fill={colors.warning} />
          <Circle cx={230} cy={25} r={11} fill={colors.accent} />
        </Svg>
        <Text style={styles.heading} accessibilityRole="header" accessibilityLiveRegion="polite" testID="building-heading">
          {heading}
        </Text>
        <Text style={styles.sub}>{subtitle}</Text>

        {phase === 'failed' ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
            {'\n'}
            {t('newTrip.failedSaved')}
          </Text>
        ) : (
          <View style={styles.steps} accessibilityLiveRegion="polite">
            {steps.map((label, i) => {
              const done = phase === 'building' ? saved && i === 0 : i < ticked;
              const active = !done && (phase === 'building' ? i === (saved ? 1 : 0) : i === ticked);
              return (
                <View key={label} style={[styles.step, !done && !active && styles.waiting]}>
                  <View style={styles.mark}>
                    {done ? (
                      <Animated.View entering={reduce ? undefined : FadeIn.duration(160)} style={styles.check}>
                        <MaterialCommunityIcons name="check" size={16} color={colors.success} />
                      </Animated.View>
                    ) : active ? (
                      <ActivityIndicator size="small" color={colors.link} />
                    ) : (
                      <View style={styles.dot} />
                    )}
                  </View>
                  <Text style={styles.stepText}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {allTicked &&
          unplaced.map((u) => (
            <View key={u.place_id} style={styles.full}>
              <UnplacedCard
                unplaced={u}
                place={places.find((p) => p.id === u.place_id)}
                days={days}
                busy={applying === u.place_id}
                onChoose={(rule) => onChoose(u, rule)}
                testID={`unplaced-${u.place_id}`}
              />
            </View>
          ))}
        {allTicked &&
          resolved.map((line) => (
            <Animated.Text key={line} entering={FadeInDown.duration(200)} style={styles.resolved}>
              {line}
            </Animated.Text>
          ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'failed' ? (
          <>
            <Button label={t('newTrip.tryAgain')} onPress={onRetry} testID="build-retry" />
            <Button label={t('newTrip.openTrip')} variant="secondary" onPress={onSeePlan} testID="build-open" />
          </>
        ) : ready ? (
          <Animated.View entering={reduce ? undefined : FadeInDown.duration(220)}>
            <Button label={t('newTrip.seePlan')} onPress={onSeePlan} haptic="medium" testID="see-plan" />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1 },
  body: { alignItems: 'center', paddingHorizontal: t.spacing.xxl, paddingTop: t.spacing.xl, paddingBottom: t.spacing.xl, gap: t.spacing.sm },
  heading: { ...t.type.title, fontSize: 26, color: t.colors.textPrimary, textAlign: 'center', marginTop: t.spacing.md },
  sub: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  steps: { alignSelf: 'stretch', marginTop: t.spacing.lg, gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  waiting: { opacity: 0.5 },
  mark: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.colors.successBg, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.surfaceRaised },
  stepText: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  full: { alignSelf: 'stretch', marginTop: t.spacing.md },
  resolved: { ...t.type.callout, fontWeight: '600', color: t.colors.success, textAlign: 'center', marginTop: t.spacing.md },
  error: { ...t.type.callout, color: t.colors.danger, textAlign: 'center', marginTop: t.spacing.lg },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm },
}));
