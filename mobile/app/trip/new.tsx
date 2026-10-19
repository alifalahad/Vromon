/**
 * Vromon Mobile — plan a new trip (trip planner step 4).
 *
 * 1 Where & when (required) · 2 Your style · 3 Your must-dos, then building the
 * plan (a transition, not a step). "Build my plan" works from step 2 or 3, so
 * someone in a hurry answers only step 1. Every answer can be changed later on
 * the trip screen.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { INTERESTS } from '../../src/constants/trip';
import { CitySearch } from '../../src/features/trips/CitySearch';
import { formatRange } from '../../src/features/trips/dates';
import { Building, type BuildPhase } from '../../src/features/trips/new/Building';
import { topicIcon } from '../../src/features/trips/new/icons';
import { MustDosEditor } from '../../src/features/trips/new/MustDosEditor';
import {
  ARRIVE_TIMES,
  defaultNewTrip,
  END_TIMES,
  hotelLevel,
  LEAVE_TIMES,
  MAX_TRAVELLERS,
  PACES,
  START_TIMES,
  TIERS,
  toPayload,
  tripLength,
  update,
  whereWhenError,
  type NewTrip,
} from '../../src/features/trips/new/newTrip';
import { RangeCalendar } from '../../src/features/trips/new/RangeCalendar';
import { useMustDoText } from '../../src/features/trips/new/useMustDoText';
import { buildPlan } from '../../src/features/trips/plan/build';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { refreshTrips } from '../../src/features/trips/queries';
import { destinationsApi, placesApi, tripsApi } from '../../src/services/api';
import type { Hotel, ItineraryDay, MustSee, TransportMode, Trip, Unplaced } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { TimeSheet } from '../../src/ui/TimeSheet';
import { useReduceMotion } from '../../src/ui/useReduceMotion';

const MODES: { mode: TransportMode; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { mode: 'bus', icon: 'bus' },
  { mode: 'train', icon: 'train' },
  { mode: 'plane', icon: 'airplane' },
  { mode: 'car', icon: 'car' },
];

type TimeField = 'arrive' | 'leave' | 'dayStart' | 'dayEnd';
type Build = { phase: BuildPhase; tripId: number | null; unplaced: Unplaced[]; applying: number | null; resolved: string[]; error: string | null };

const DEST_CARD = 156;
const DEST_GAP = 12; // spacing.md

export default function NewTripScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useMustDoText();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const queryClient = useQueryClient();
  // Set when arriving from a destination screen ("Plan a trip here")
  const params = useLocalSearchParams<{ destination?: string }>();
  const [trip, setTrip] = useState<NewTrip>(() => defaultNewTrip(new Date(), params.destination ?? ''));
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);
  const [showError, setShowError] = useState(false);
  const [timeField, setTimeField] = useState<TimeField | null>(null);
  const [build, setBuild] = useState<Build | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const reveal = useMemo(() => ({ scrollRef, innerRef }), []);

  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const destination = destinations.data?.find((d) => d.name === trip.destination);
  // The chosen destination stays in view (also when it comes from a destination's page)
  const destScroll = useRef<ScrollView>(null);
  const chosenIndex = destinations.data?.findIndex((d) => d.name === trip.destination) ?? -1;
  useEffect(() => {
    if (chosenIndex > 0) destScroll.current?.scrollTo({ x: Math.max(0, chosenIndex * (DEST_CARD + DEST_GAP) - DEST_GAP), animated: true });
  }, [chosenIndex]);
  const places = useQuery({
    queryKey: ['places', trip.destination],
    queryFn: () => placesApi.list({ destination: trip.destination }),
    enabled: !!trip.destination,
  });
  const hotels = useQuery({
    queryKey: ['hotels', destination?.id],
    queryFn: () => destinationsApi.hotels(destination!.id),
    enabled: !!destination,
  });

  const days = tripLength(trip);
  const nights = days - 1;
  const set = (change: Partial<NewTrip>) => setTrip((cur) => update(cur, change));
  const problem = whereWhenError(trip);

  const go = (to: number) => {
    setForward(to > step);
    setStep(to);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const next = () => {
    if (step === 0 && problem) {
      setShowError(true);
      haptics.error();
      return;
    }
    go(step + 1);
  };
  const back = () => (step === 0 ? router.back() : go(step - 1));

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------
  const startBuild = async () => {
    if (problem) {
      go(0);
      setShowError(true);
      haptics.error();
      return;
    }
    setBuild((b) => ({ phase: 'building', tripId: b?.tripId ?? null, unplaced: [], applying: null, resolved: [], error: null }));
    let tripId = build?.tripId ?? null;
    try {
      if (tripId === null) {
        const id = (await tripsApi.create(toPayload(trip))).id;
        tripId = id;
        refreshTrips(queryClient, id);
        setBuild((b) => b && { ...b, tripId: id });
      }
      const result = await buildPlan(tripId);
      haptics.success();
      setBuild({ phase: 'done', tripId, unplaced: result.unplaced ?? [], applying: null, resolved: [], error: null });
    } catch (e) {
      haptics.error();
      setBuild({ phase: 'failed', tripId, unplaced: [], applying: null, resolved: [], error: e instanceof Error ? e.message : String(e) });
    }
  };

  const choose = async (u: Unplaced, rule: MustSee | null) => {
    if (!build?.tripId) return;
    const mustSees = rule
      ? trip.mustSees.map((m) => (m.place_id === u.place_id ? rule : m))
      : trip.mustSees.filter((m) => m.place_id !== u.place_id);
    setBuild((b) => b && { ...b, applying: u.place_id });
    try {
      const res = await tripsApi.updateMustDos(build.tripId, { must_sees: mustSees });
      setTrip((cur) => ({ ...cur, mustSees }));
      const still = res.unplaced.find((x) => x.place_id === u.place_id);
      const placed = rule && !still ? findPlaced(res.trip, u.place_id) : null;
      const line = !rule
        ? t('mustDos.leftOut', { name: u.name })
        : still
          ? t('mustDos.stillNoFit', { name: u.name })
          : placed
            ? t('mustDos.placedAt', { name: u.name, n: f.n(placed.day), time: f.time(placed.time) })
            : t('mustDos.placed', { name: u.name });
      haptics.success();
      setBuild((b) => b && { ...b, unplaced: res.unplaced, applying: null, resolved: [...b.resolved, line] });
    } catch (e) {
      haptics.error();
      setBuild((b) => b && { ...b, applying: null, resolved: [...b.resolved, e instanceof Error ? e.message : String(e)] });
    }
  };

  const seePlan = () => {
    if (!build?.tripId) return;
    refreshTrips(queryClient, build.tripId);
    queryClient.invalidateQueries({ queryKey: ['itinerary', build.tripId] });
    router.replace({ pathname: '/trip/[id]', params: { id: build.tripId } });
  };

  const buildSteps = () => {
    const out = [t('newTrip.stepSaved')];
    if (trip.mustSees.length) out.push(t('newTrip.stepMust', { count: trip.mustSees.length }));
    if (trip.busy.length === 1) {
      out.push(t('newTrip.stepBusy', { when: text.busyWhen(trip.busy[0], trip.start) }));
    } else if (trip.busy.length > 1) out.push(t('newTrip.stepBusyMany', { count: trip.busy.length }));
    if (trip.arrive) out.push(t('newTrip.stepArrive', { time: f.time(trip.arrive) }));
    if (trip.leave) out.push(t('newTrip.stepLeave', { time: f.time(trip.leave) }));
    out.push(
      trip.interests.length
        ? t('newTrip.stepFill', { what: trip.interests.slice(0, 3).map((i) => t(`interests.${i}`)).join(', ') })
        : t('newTrip.stepFillAny'),
    );
    out.push(t('newTrip.stepBudget', { amount: f.money(trip.budget) }));
    return out;
  };

  if (build) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Building
          phase={build.phase}
          subtitle={`${trip.destination} · ${f.time(formatRange(trip.start, trip.end, i18n.language))}`}
          steps={buildSteps()}
          saved={build.tripId !== null}
          unplaced={build.unplaced}
          places={places.data ?? []}
          days={days}
          applying={build.applying}
          resolved={build.resolved}
          error={build.error}
          onChoose={choose}
          onSeePlan={seePlan}
          onRetry={startBuild}
        />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // The three steps
  // -------------------------------------------------------------------------
  const entering = reduce ? undefined : (forward ? FadeInRight : FadeInLeft).duration(200);
  const timeSheet = timeSheetFor(timeField, trip, t);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior="padding">
      <View style={styles.header}>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={back}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? t('newTrip.cancel') : t('newTrip.back')}
          testID="new-back"
        >
          <MaterialCommunityIcons name={step === 0 ? 'close' : 'arrow-left'} size={26} color={colors.textPrimary} />
        </PressableScale>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('newTrip.title')}
        </Text>
        <Text style={styles.stepOf} accessibilityLabel={t('newTrip.stepOfA11y', { n: step + 1, total: 3 })}>
          {t('newTrip.stepOf', { n: f.n(step + 1), total: f.n(3) })}
        </Text>
      </View>
      <View style={styles.bar} importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.barPart, i <= step && styles.barPartOn]} />
        ))}
      </View>

      <ScrollView ref={scrollRef} innerViewRef={innerRef as React.RefObject<View>} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={entering} style={styles.stepBody}>
          {step === 0 && (
            <>
              <Text style={styles.h2} accessibilityRole="header">
                {t('newTrip.whereTo')}
              </Text>
              {destinations.isLoading && <ActivityIndicator color={colors.link} />}
              {destinations.isError && (
                <View style={styles.loadError}>
                  <Text style={styles.error}>{(destinations.error as Error).message}</Text>
                  <Button label={t('common.retry')} variant="small" onPress={() => destinations.refetch()} />
                </View>
              )}
              {/* A row to scroll sideways (11 destinations since step 10): the next one peeks in */}
              <ScrollView
                ref={destScroll}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.destScroll}
                contentContainerStyle={styles.destRow}
                testID="destinations"
              >
                {destinations.data?.map((d) => {
                  const on = trip.destination === d.name;
                  return (
                    <PressableScale
                      key={d.id}
                      haptic="selection"
                      onPress={() => set({ destination: d.name, mustSees: [], skip: [] })}
                      style={[styles.destCard, on && styles.destCardOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={[d.name, t('newTrip.placesCount', { count: d.place_count ?? 0, n: d.place_count ?? 0 }), d.checked === false ? t('newTrip.notChecked') : null].filter(Boolean).join('. ')}
                      testID={`destination-${d.id}`}
                    >
                      <View style={styles.destArt}>
                        <CoastArt />
                        {on && (
                          <View style={styles.destCheck}>
                            <MaterialCommunityIcons name="check" size={16} color={colors.onAccent} />
                          </View>
                        )}
                      </View>
                      <View style={styles.destText}>
                        <Text style={styles.destName}>{d.name}</Text>
                        <Text style={styles.muted}>{t('newTrip.placesCount', { count: d.place_count ?? 0, n: f.n(d.place_count ?? 0) })}</Text>
                        {d.checked === false ? <Text style={styles.unchecked}>{t('newTrip.notChecked')}</Text> : null}
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>
              {destinations.data?.some((d) => d.checked === false) ? <Text style={styles.sourcesNote}>{t('newTrip.sourcesNote')}</Text> : null}
              {showError && problem === 'destination' && <Text style={styles.error}>{t('newTrip.errDestination')}</Text>}

              <View style={styles.h2Row}>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.when')}
                </Text>
                <Text style={styles.muted}>
                  {t('newTrip.daysNights', {
                    days: t('newTrip.days', { count: days, n: f.n(days) }),
                    nights: t('newTrip.nights', { count: nights, n: f.n(nights) }),
                  })}
                </Text>
              </View>
              <RangeCalendar start={trip.start} end={trip.end} onChange={(r) => set(r)} />
              {showError && problem === 'tooLong' && <Text style={styles.error}>{t('newTrip.errTooLong')}</Text>}

              <View style={styles.rowCard}>
                <MaterialCommunityIcons name="account-multiple-outline" size={24} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, styles.flex]}>{t('newTrip.travellers')}</Text>
                <Stepper
                  value={trip.travellers}
                  onLess={() => set({ travellers: Math.max(1, trip.travellers - 1) })}
                  onMore={() => set({ travellers: Math.min(MAX_TRAVELLERS, trip.travellers + 1) })}
                  lessLabel={t('newTrip.fewer')}
                  moreLabel={t('newTrip.more')}
                  testID="travellers"
                />
              </View>

              <View style={styles.h2Row}>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.firstLast')}
                </Text>
                <Text style={styles.muted}>{t('newTrip.optional')}</Text>
              </View>
              <View style={styles.group}>
                <TimeRow
                  icon="airplane-landing"
                  label={t('newTrip.arriving', { date: text.shortDate(trip.start) })}
                  value={trip.arrive ? f.time(trip.arrive) : t('newTrip.morning')}
                  onPress={() => setTimeField('arrive')}
                  testID="arrive-time"
                />
                <View style={styles.divider} />
                <TimeRow
                  icon="airplane-takeoff"
                  label={t('newTrip.leaving', { date: text.shortDate(trip.end) })}
                  value={trip.leave ? f.time(trip.leave) : t('newTrip.evening')}
                  onPress={() => setTimeField('leave')}
                  testID="leave-time"
                />
              </View>

              <Text style={styles.h2} accessibilityRole="header">
                {t('newTrip.gettingThere')}
              </Text>
              <View style={styles.group}>
                {trip.origin ? (
                  <View style={styles.originRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={24} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, styles.flex]}>{t('newTrip.from', { place: trip.origin.label })}</Text>
                    <PressableScale pressEffect="opacity" haptic="selection" onPress={() => set({ origin: null })} hitSlop={8} accessibilityRole="button" testID="origin-clear">
                      <Text style={styles.link}>{t('newTrip.change')}</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <View style={styles.originSearch}>
                    <CitySearch
                      label={t('newTrip.fromWhere')}
                      reveal={reveal}
                      testID="origin-search"
                      onPick={(city, country) => set({ origin: { city_geonameid: city.geonameid, label: `${city.name}, ${country}` } })}
                    />
                  </View>
                )}
                <View style={styles.modes} accessibilityRole="radiogroup">
                  {MODES.map(({ mode, icon }) => {
                    const on = trip.mode === mode;
                    return (
                      <PressableScale
                        key={mode}
                        haptic="selection"
                        onPress={() => set({ mode: on ? null : mode })}
                        style={[styles.mode, on && styles.modeOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={t(`trips.modes.${mode}`)}
                        testID={`mode-${mode}`}
                      >
                        <MaterialCommunityIcons name={icon} size={20} color={on ? colors.onAccent : colors.textSecondary} />
                        <Text style={[styles.modeText, on && styles.onAccent]} numberOfLines={1}>
                          {t(`trips.modes.${mode}`)}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.h2} accessibilityRole="header">
                {t('newTrip.enjoy')}
              </Text>
              <View style={styles.chips}>
                {INTERESTS.map((i) => {
                  const on = trip.interests.includes(i);
                  return (
                    <PressableScale
                      key={i}
                      haptic="selection"
                      onPress={() => set({ interests: on ? trip.interests.filter((x) => x !== i) : [...trip.interests, i] })}
                      style={[styles.interest, on && styles.interestOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      testID={`interest-${i}`}
                    >
                      <MaterialCommunityIcons name={topicIcon(i)} size={18} color={on ? colors.onAccent : colors.textSecondary} />
                      <Text style={[styles.interestText, on && styles.onAccent]}>{t(`interests.${i}`)}</Text>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={styles.h2} accessibilityRole="header">
                {t('newTrip.pace')}
              </Text>
              <View style={styles.paces} accessibilityRole="radiogroup">
                {PACES.map((p) => {
                  const on = trip.pace === p;
                  return (
                    <PressableScale
                      key={p}
                      haptic="selection"
                      onPress={() => set({ pace: p })}
                      style={[styles.pace, on && styles.paceOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      testID={`pace-${p}`}
                    >
                      <Text style={styles.paceLabel}>{t(`newTrip.paces.${p}`)}</Text>
                      <Text style={styles.paceDesc}>{t(`newTrip.paceDesc.${p}`)}</Text>
                    </PressableScale>
                  );
                })}
              </View>

              <View style={styles.h2Row}>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.budget')}
                </Text>
                <Text style={styles.muted}>
                  {t('newTrip.budgetFor', {
                    travellers: t('plan.travellers', { count: trip.travellers, n: f.n(trip.travellers) }),
                    nights: t('newTrip.nights', { count: nights, n: f.n(nights) }),
                  })}
                </Text>
              </View>
              <View style={styles.budgetCard}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetTotal} testID="budget-total">
                    {f.money(trip.budget)}
                  </Text>
                  <Stepper
                    value={null}
                    onLess={() => set({ budget: Math.max(1000, trip.budget - 1000), budgetByHand: true })}
                    onMore={() => set({ budget: trip.budget + 1000, budgetByHand: true })}
                    lessLabel={t('newTrip.lessBudget')}
                    moreLabel={t('newTrip.moreBudget')}
                    testID="budget"
                  />
                </View>
                <View style={styles.segment} accessibilityRole="radiogroup">
                  {TIERS.map((tier) => {
                    const on = !trip.budgetByHand && trip.tier === tier;
                    return (
                      <PressableScale
                        key={tier}
                        haptic="selection"
                        onPress={() => set({ tier, budgetByHand: false })}
                        style={[styles.segmentPart, on && styles.segmentOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        testID={`tier-${tier}`}
                      >
                        <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t(`newTrip.tiers.${tier}`)}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <Text style={styles.muted}>
                  {[
                    t('newTrip.each', { amount: f.money(Math.round(trip.budget / trip.travellers / 50) * 50) }),
                    hotelLine(hotels.data, hotelLevel(trip), t, f),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>

              <View style={styles.h2Row}>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.yourDay')}
                </Text>
                <Text style={styles.muted}>{t('newTrip.everyDay')}</Text>
              </View>
              <View style={styles.dayRow}>
                <Text style={styles.rowLabel}>{t('newTrip.startAround')}</Text>
                <TimeChip value={f.time(trip.dayStart)} onPress={() => setTimeField('dayStart')} label={t('newTrip.startTime')} testID="day-start" />
                <Text style={styles.rowLabel}>{t('newTrip.finishBy')}</Text>
                <TimeChip value={f.time(trip.dayEnd)} onPress={() => setTimeField('dayEnd')} label={t('newTrip.finishTime')} testID="day-end" />
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <View>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.mustDos')}
                </Text>
                <Text style={styles.hint}>{t('newTrip.mustDosHint')}</Text>
              </View>
              {places.isLoading && <ActivityIndicator color={colors.link} />}
              <MustDosEditor
                value={{ mustSees: trip.mustSees, busy: trip.busy, skip: trip.skip, avoidCrowds: trip.avoidCrowds }}
                onChange={(v) => set(v)}
                places={places.data ?? []}
                startDate={trip.start}
                days={days}
              />
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {step === 2 && (
          <View style={styles.summary} accessibilityRole="summary">
            <SummaryPart first text={t('newTrip.days', { count: days, n: f.n(days) })} onPress={() => go(0)} />
            <SummaryPart text={t('plan.travellers', { count: trip.travellers, n: f.n(trip.travellers) })} onPress={() => go(0)} />
            <SummaryPart text={f.money(trip.budget)} onPress={() => go(1)} />
            {trip.mustSees.length > 0 && <SummaryPart text={t('newTrip.mustSees', { count: trip.mustSees.length, n: f.n(trip.mustSees.length) })} />}
            {trip.busy.length > 0 && <SummaryPart text={t('newTrip.busyCount', { count: trip.busy.length, n: f.n(trip.busy.length) })} />}
          </View>
        )}
        {step < 2 ? (
          <Button label={t('newTrip.next')} onPress={next} haptic="medium" testID="new-next" />
        ) : (
          <Button label={t('newTrip.build')} icon="map-marker-path" onPress={startBuild} haptic="medium" testID="build-plan" />
        )}
        {step === 1 && (
          <PressableScale pressEffect="opacity" haptic="selection" onPress={startBuild} style={styles.buildNow} accessibilityRole="button" testID="build-now">
            <Text style={styles.link}>{t('newTrip.buildNow')}</Text>
          </PressableScale>
        )}
      </View>

      <TimeSheet
        visible={timeField !== null}
        title={timeSheet.title}
        times={timeSheet.times}
        selected={timeField ? trip[timeField] : null}
        none={timeSheet.none}
        onClose={() => setTimeField(null)}
        onSelect={(value) => {
          if (!timeField) return;
          if (timeField === 'dayStart' || timeField === 'dayEnd') {
            if (value) set({ [timeField]: value });
          } else set({ [timeField]: value });
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** Where a must-see ended up in the trip's plan (the trip includes its days). */
function findPlaced(trip: Trip, placeId: number) {
  const days = (trip as Trip & { itinerary_days?: ItineraryDay[] }).itinerary_days ?? [];
  for (const d of days) {
    const item = d.items.find((i) => i.place_id === placeId);
    if (item) return { day: d.day_number, time: item.start_time };
  }
  return null;
}

function timeSheetFor(field: TimeField | null, trip: NewTrip, t: TFunction) {
  switch (field) {
    case 'arrive':
      return { title: t('newTrip.arriveTitle'), times: ARRIVE_TIMES, none: t('newTrip.arriveNone', { time: trip.dayStart }) };
    case 'leave':
      return { title: t('newTrip.leaveTitle'), times: LEAVE_TIMES, none: t('newTrip.leaveNone', { time: trip.dayEnd }) };
    case 'dayStart':
      return { title: t('newTrip.startTime'), times: START_TIMES.filter((x) => x < trip.dayEnd), none: undefined };
    case 'dayEnd':
      return { title: t('newTrip.finishTime'), times: END_TIMES.filter((x) => x > trip.dayStart), none: undefined };
    default:
      return { title: '', times: [], none: undefined };
  }
}

/** "hotels around ৳2,800–4,200 a night", from the destination's hotels at that level. */
function hotelLine(hotels: Hotel[] | undefined, level: string, t: TFunction, f: ReturnType<typeof usePlanFormat>) {
  const prices = (hotels ?? []).filter((h) => h.category === level).map((h) => h.price_per_night);
  if (!prices.length) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const range = lo === hi ? f.money(lo) : `${f.money(lo)}–${f.money(hi)}`;
  return t(`newTrip.hotel.${level}`, { range });
}

function Stepper({
  value,
  onLess,
  onMore,
  lessLabel,
  moreLabel,
  testID,
}: {
  value: number | null;
  onLess: () => void;
  onMore: () => void;
  lessLabel: string;
  moreLabel: string;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const f = usePlanFormat();
  return (
    <View style={styles.stepper}>
      <PressableScale haptic="selection" onPress={onLess} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel={lessLabel} testID={`${testID}-less`}>
        <MaterialCommunityIcons name="minus" size={22} color={colors.textPrimary} />
      </PressableScale>
      {value !== null && (
        <Text style={styles.stepperValue} accessibilityLiveRegion="polite" testID={`${testID}-value`}>
          {f.n(value)}
        </Text>
      )}
      <PressableScale haptic="selection" onPress={onMore} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel={moreLabel} testID={`${testID}-more`}>
        <MaterialCommunityIcons name="plus" size={22} color={colors.textPrimary} />
      </PressableScale>
    </View>
  );
}

function TimeRow({ icon, label, value, onPress, testID }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.timeRow} accessibilityRole="button" accessibilityLabel={`${label} ${value}`} testID={testID}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.textSecondary} />
      <Text style={[styles.rowLabel, styles.flex]}>{label}</Text>
      <View style={styles.timeChip}>
        <Text style={styles.timeChipText}>{value}</Text>
      </View>
    </PressableScale>
  );
}

function TimeChip({ value, onPress, label, testID }: { value: string; onPress: () => void; label: string; testID: string }) {
  const styles = useStyles();
  return (
    <PressableScale haptic="selection" onPress={onPress} style={styles.timeChip} accessibilityRole="button" accessibilityLabel={`${label} ${value}`} testID={testID}>
      <Text style={styles.timeChipText}>{value}</Text>
    </PressableScale>
  );
}

function SummaryPart({ text, onPress, first }: { text: string; onPress?: () => void; first?: boolean }) {
  const styles = useStyles();
  const dot = first ? null : <Text style={styles.summaryPart}>·</Text>;
  if (!onPress) {
    return (
      <View style={styles.summaryItem}>
        {dot}
        <Text style={styles.summaryPart}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.summaryItem}>
      {dot}
      <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} hitSlop={6} accessibilityRole="button">
        <Text style={[styles.summaryPart, styles.summaryLink]}>{text}</Text>
      </PressableScale>
    </View>
  );
}

/** A simple coast drawing for a destination card (there are no destination photos yet). */
function CoastArt() {
  const { colors } = useTheme();
  return (
    <Svg width="100%" height="100%" viewBox="0 0 220 96" preserveAspectRatio="xMidYMid slice">
      <Path d="M150 0 C 140 30, 160 50, 150 96 L 220 96 L 220 0 Z" fill={colors.successBg} />
      <Path d="M20 40c10 0 10-6 20-6s10 6 20 6 10-6 20-6 10 6 20 6" stroke={colors.link} strokeWidth={2} opacity={0.6} fill="none" />
      <Path d="M40 62c10 0 10-6 20-6s10 6 20 6 10-6 20-6 10 6 20 6" stroke={colors.link} strokeWidth={2} opacity={0.4} fill="none" />
      <Circle cx={182} cy={30} r={12} stroke={colors.warning} strokeWidth={2} fill="none" />
    </Svg>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm, gap: t.spacing.sm },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  headerTitle: { ...t.type.headline, color: t.colors.textPrimary, flex: 1 },
  stepOf: { ...t.type.footnote, color: t.colors.textSecondary, paddingRight: t.spacing.sm },
  bar: { flexDirection: 'row', gap: 6, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
  barPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised },
  barPartOn: { backgroundColor: t.colors.accent },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.xxl },
  stepBody: { gap: t.spacing.md },
  h2: { ...t.type.title, color: t.colors.textPrimary },
  // Wraps with large text instead of cutting the note off
  h2Row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: t.spacing.sm, marginTop: t.spacing.md },
  hint: { ...t.type.callout, color: t.colors.textSecondary, marginTop: 4 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  error: { ...t.type.callout, color: t.colors.danger },
  loadError: { gap: t.spacing.sm, alignItems: 'flex-start' },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  onAccent: { color: t.colors.onAccent },
  // Two to a row (11 destinations since step 10)
  destScroll: { marginHorizontal: -t.spacing.lg },
  destRow: { gap: t.spacing.md, paddingHorizontal: t.spacing.lg },
  destCard: { width: DEST_CARD, backgroundColor: t.colors.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  destCardOn: { borderColor: t.colors.accent },
  destArt: { height: 76, backgroundColor: t.colors.accentSoft },
  destCheck: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' },
  destText: { padding: t.spacing.md, gap: 2 },
  destName: { ...t.type.headline, color: t.colors.textPrimary },
  unchecked: { ...t.type.caption, fontWeight: '600', color: t.colors.warning },
  sourcesNote: { ...t.type.footnote, color: t.colors.textTertiary },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, backgroundColor: t.colors.surface, borderRadius: 20, paddingHorizontal: t.spacing.lg, minHeight: 64 },
  rowLabel: { ...t.type.body, color: t.colors.textPrimary },
  group: { backgroundColor: t.colors.surface, borderRadius: 20, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: t.colors.divider, marginLeft: 54 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 60 },
  timeChip: { minHeight: 40, minWidth: 72, paddingHorizontal: t.spacing.md, borderRadius: t.radius.control, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  timeChipText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccentSoft },
  originRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 60 },
  originSearch: { padding: t.spacing.md, paddingBottom: 0 },
  modes: { flexDirection: 'row', gap: t.spacing.sm, padding: t.spacing.md },
  mode: { flex: 1, minHeight: 48, borderRadius: t.radius.control, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6 },
  modeOn: { backgroundColor: t.colors.accent },
  modeText: { ...t.type.caption, fontWeight: '600', color: t.colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.colors.surface },
  interestOn: { backgroundColor: t.colors.accent },
  interestText: { ...t.type.callout, fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
  paces: { flexDirection: 'row', gap: t.spacing.sm },
  pace: { flex: 1, minHeight: 76, borderRadius: 16, backgroundColor: t.colors.surface, padding: t.spacing.md, gap: 4, justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  paceOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  paceLabel: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  paceDesc: { ...t.type.caption, color: t.colors.textSecondary },
  budgetCard: { backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.lg, gap: t.spacing.md },
  budgetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetTotal: { fontSize: 30, fontWeight: '700', color: t.colors.textPrimary },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: t.radius.control, padding: 3 },
  segmentPart: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: t.colors.segmentThumb },
  segmentText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  segmentTextOn: { color: t.colors.textPrimary },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  stepperButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { ...t.type.headline, minWidth: 28, textAlign: 'center', color: t.colors.textPrimary },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm, backgroundColor: t.colors.bg },
  buildNow: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.lg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 6, rowGap: 2 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryPart: { ...t.type.footnote, color: t.colors.textSecondary },
  summaryLink: { color: t.colors.link, fontWeight: '600' },
}));
