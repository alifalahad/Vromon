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
import * as Location from 'expo-location';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { useVisits } from '../../src/features/map/visits';
import { usePreferences } from '../../src/features/preferences/store';
import { CitySearch } from '../../src/features/trips/CitySearch';
import { formatRange, localToday } from '../../src/features/trips/dates';
import { DestinationSearch } from '../../src/features/trips/new/DestinationSearch';
import { canLocate, LocatorMap } from '../../src/features/trips/new/LocatorMap';
import { destinationName } from '../../src/features/trips/new/whereSearch';
import { homeRegionName } from '../../src/features/map/geoData';
import { resolveLanguage } from '../../src/i18n';
import { BudgetCard } from '../../src/features/trips/new/BudgetCard';
import { Building, type BuildPhase } from '../../src/features/trips/new/Building';
import { currencyFor, formatMoney, fromTaka, roundShown } from '../../src/features/trips/new/currency';
import { InterestsRow, InterestsSheet } from '../../src/features/trips/new/InterestsSheet';
import { MustDosEditor } from '../../src/features/trips/new/MustDosEditor';
import {
  addMustSee,
  ARRIVE_TIMES,
  defaultNewTrip,
  END_TIMES,
  hotelLevel,
  LEAVE_TIMES,
  MAX_STOPS,
  MAX_TRAVELLERS,
  MIN_STOPS,
  minutesPerStop,
  paceOf,
  START_TIMES,
  toPayload,
  tripLength,
  update,
  whereWhenError,
  type NewTrip,
} from '../../src/features/trips/new/newTrip';
import { DateRangeFields } from '../../src/features/trips/new/DateRangeFields';
import { useMustDoText } from '../../src/features/trips/new/useMustDoText';
import { buildPlan } from '../../src/features/trips/plan/build';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { refreshTrips } from '../../src/features/trips/queries';
import { destinationsApi, fxApi, placesApi, roomsApi, tripsApi } from '../../src/services/api';
import type { Hotel, ItineraryDay, JourneyMode, MustSee, Trip, Unplaced } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { StepSlider } from '../../src/ui/StepSlider';
import { TimeSheet } from '../../src/ui/TimeSheet';
import { useReduceMotion } from '../../src/ui/useReduceMotion';

// How you like to travel there: pick any (Vromon tries them first), or none for a suggestion by budget
const MODES: { mode: JourneyMode; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { mode: 'plane', icon: 'airplane' },
  { mode: 'train', icon: 'train' },
  { mode: 'bus', icon: 'bus' },
  { mode: 'car', icon: 'car' },
  { mode: 'launch', icon: 'ferry' },
];

type TimeField = 'arrive' | 'leave' | 'dayStart' | 'dayEnd';
type Build = { phase: BuildPhase; tripId: number | null; unplaced: Unplaced[]; applying: number | null; resolved: string[]; error: string | null };

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
  // `mustSee` (with `mustSeeName`): a place card's "Add to a trip" when you have no trip there yet
  // `invite` (user ids, comma-separated): a trip idea's "Plan this trip" invites everyone who's in (friends-chat step 7)
  const params = useLocalSearchParams<{ destination?: string; mustSee?: string; mustSeeName?: string; invite?: string }>();
  const [trip, setTrip] = useState<NewTrip>(() => {
    const start = defaultNewTrip(new Date(), params.destination ?? '');
    return params.mustSee && params.destination ? addMustSee(start, Number(params.mustSee)) : start;
  });
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);
  const [showError, setShowError] = useState(false);
  const [timeField, setTimeField] = useState<TimeField | null>(null);
  const [pickingInterests, setPickingInterests] = useState(false);
  // While typing (dates, a city), the footer steps aside so what's typed and the calendar under it fit
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [build, setBuild] = useState<Build | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const reveal = useMemo(() => ({ scrollRef, innerRef }), []);

  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const destination = destinations.data?.find((d) => d.name === trip.destination);
  // "Where to?" search: every attraction too ("Ratargul" finds Sylhet), and the Want list
  const [searching, setSearching] = useState(false);
  const [mustSeeAdded, setMustSeeAdded] = useState<string | null>(params.mustSee && params.destination ? (params.mustSeeName ?? null) : null);
  const allPlaces = useQuery({ queryKey: ['places', 'all'], queryFn: () => placesApi.list(), staleTime: 10 * 60_000 });
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const addRecent = usePreferences((s) => s.addRecentDestination);
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
  // Amounts in the trip's currency (the budget is kept in taka): today's rate, or taka until it's known
  const fx = useQuery({ queryKey: ['fx-rates'], queryFn: () => fxApi.rates(), staleTime: 60 * 60_000, enabled: trip.currency !== 'BDT' });
  const money = (taka: number) => {
    const v = fromTaka(taka, trip.currency, fx.data?.rates);
    return v === null ? f.money(taka) : formatMoney(roundShown(v, trip.currency), trip.currency, i18n.language);
  };
  // Getting there from where you are: the phone's location once (asked for, never kept in the background)
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const locateMe = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocateError(t('newTrip.locationDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ origin: { here: true, lat: pos.coords.latitude, lon: pos.coords.longitude, label: t('newTrip.yourLocation') } });
    } catch {
      setLocateError(t('newTrip.locationFailed'));
    } finally {
      setLocating(false);
    }
  };
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
        const invite = (params.invite ?? '').split(',').filter(Boolean);
        // The plan matters more than the invites: a failed invite can be sent again from the trip
        if (invite.length) await roomsApi.invite(id, invite).catch(() => undefined);
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
    const mustSees = rule ? trip.mustSees.map((m) => (m.place_id === u.place_id ? rule : m)) : trip.mustSees.filter((m) => m.place_id !== u.place_id);
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
        ? t('newTrip.stepFill', {
            what: trip.interests
              .slice(0, 3)
              .map((i) => t(`interests.${i}`))
              .join(', '),
          })
        : t('newTrip.stepFillAny'),
    );
    out.push(t('newTrip.stepBudget', { amount: money(trip.budget) }));
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

      <ScrollView
        ref={scrollRef}
        innerViewRef={innerRef as React.RefObject<View>}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
              {/* One search field (it was a sideways row of every destination): the chosen one shows
                  as a card; either opens the full-screen search */}
              {destination ? (
                <PressableScale
                  haptic="selection"
                  onPress={() => setSearching(true)}
                  style={styles.destChosen}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    destinationName(destination.name, lang),
                    destination.region_code ? t('newTrip.search.inDivision', { division: homeRegionName(destination.region_code, lang) }) : null,
                    t('newTrip.placesCount', { count: destination.place_count ?? 0, n: f.n(destination.place_count ?? 0) }),
                    destination.checked === false ? t('newTrip.notChecked') : null,
                    t('newTrip.change'),
                  ]
                    .filter(Boolean)
                    .join('. ')}
                  testID="destination-chosen"
                >
                  <View style={styles.destThumb}>
                    {canLocate(destination.latitude, destination.longitude) ? (
                      <LocatorMap lat={destination.latitude!} lon={destination.longitude!} region={destination.region_code} size={64} />
                    ) : (
                      <MaterialCommunityIcons name="map-marker-outline" size={28} color={colors.link} />
                    )}
                  </View>
                  <View style={styles.destText}>
                    <Text style={styles.destName} numberOfLines={1}>
                      {destinationName(destination.name, lang)}
                    </Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {[
                        destination.region_code ? t('newTrip.search.inDivision', { division: homeRegionName(destination.region_code, lang) }) : null,
                        t('newTrip.placesCount', { count: destination.place_count ?? 0, n: f.n(destination.place_count ?? 0) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {destination.checked === false ? <Text style={styles.unchecked}>{t('newTrip.notChecked')}</Text> : null}
                  </View>
                  <Text style={styles.link}>{t('newTrip.change')}</Text>
                </PressableScale>
              ) : (
                <PressableScale
                  pressEffect="opacity"
                  haptic="selection"
                  onPress={() => setSearching(true)}
                  style={[styles.destSearch, showError && problem === 'destination' && styles.destSearchError]}
                  accessibilityRole="search"
                  accessibilityLabel={t('newTrip.search.label')}
                  testID="destination-search"
                >
                  <MaterialCommunityIcons name="magnify" size={24} color={colors.textSecondary} />
                  <Text style={styles.destSearchText} numberOfLines={1}>
                    {t('newTrip.search.placeholder')}
                  </Text>
                </PressableScale>
              )}
              {mustSeeAdded ? (
                <View style={styles.addedRow}>
                  <MaterialCommunityIcons name="star-check-outline" size={18} color={colors.success} />
                  <Text style={styles.added}>{t('newTrip.search.mustSeeAdded', { place: mustSeeAdded })}</Text>
                </View>
              ) : null}
              {destination?.checked === false ? <Text style={styles.sourcesNote}>{t('newTrip.sourcesNote')}</Text> : null}
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
              <DateRangeFields start={trip.start} end={trip.end} onChange={(r) => set(r)} reveal={reveal} />
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
                    <MaterialCommunityIcons name={'here' in trip.origin ? 'crosshairs-gps' : 'map-marker-outline'} size={24} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, styles.flex]}>{t('newTrip.from', { place: trip.origin.label })}</Text>
                    <PressableScale
                      pressEffect="opacity"
                      haptic="selection"
                      onPress={() => set({ origin: null })}
                      hitSlop={8}
                      accessibilityRole="button"
                      testID="origin-clear"
                    >
                      <Text style={styles.link}>{t('newTrip.change')}</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <View style={styles.originSearch}>
                    <PressableScale
                      haptic="selection"
                      onPress={locateMe}
                      disabled={locating}
                      style={styles.hereButton}
                      accessibilityRole="button"
                      testID="origin-here"
                    >
                      {locating ? (
                        <ActivityIndicator color={colors.link} />
                      ) : (
                        <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.link} />
                      )}
                      <Text style={styles.hereText}>{t('newTrip.fromHere')}</Text>
                    </PressableScale>
                    {locateError ? <Text style={styles.locateError}>{locateError}</Text> : null}
                    <CitySearch
                      label={t('newTrip.fromWhere')}
                      reveal={reveal}
                      testID="origin-search"
                      onPick={(city, country) => set({ origin: { city_geonameid: city.geonameid, label: `${city.name}, ${country}` } })}
                    />
                  </View>
                )}
                <View style={styles.divider} />
                <Text style={styles.modesTitle}>{t('newTrip.howTravel')}</Text>
                <Text style={styles.modesHint}>{t('newTrip.howTravelHint')}</Text>
                <View style={styles.modes}>
                  {MODES.map(({ mode, icon }) => {
                    const on = trip.modes.includes(mode);
                    return (
                      <PressableScale
                        key={mode}
                        haptic="selection"
                        onPress={() => set({ modes: on ? trip.modes.filter((m) => m !== mode) : [...trip.modes, mode] })}
                        style={[styles.mode, on && styles.modeOn]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={t(`newTrip.travelModes.${mode}`)}
                        testID={`mode-${mode}`}
                      >
                        <MaterialCommunityIcons name={icon} size={20} color={on ? colors.onAccent : colors.textSecondary} />
                        <Text style={[styles.modeText, on && styles.onAccent]} numberOfLines={1}>
                          {t(`newTrip.travelModes.${mode}`)}
                        </Text>
                      </PressableScale>
                    );
                  })}
                  <PressableScale
                    haptic="selection"
                    onPress={() => set({ modes: [] })}
                    style={[styles.mode, styles.modeWide, trip.modes.length === 0 && styles.modeOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: trip.modes.length === 0 }}
                    testID="mode-budget"
                  >
                    <MaterialCommunityIcons name="cash-multiple" size={20} color={trip.modes.length === 0 ? colors.onAccent : colors.textSecondary} />
                    <Text style={[styles.modeText, trip.modes.length === 0 && styles.onAccent]} numberOfLines={1}>
                      {t('newTrip.byBudget')}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.h2} accessibilityRole="header">
                {t('newTrip.enjoy')}
              </Text>
              {/* One row (it was every interest as a chip); the sheet has them in groups */}
              <InterestsRow value={trip.interests} onPress={() => setPickingInterests(true)} />

              <View style={styles.h2Row}>
                <Text style={styles.h2} accessibilityRole="header">
                  {t('newTrip.pace')}
                </Text>
                <Text style={styles.muted}>{t(`newTrip.paces.${paceOf(trip.stops)}`)}</Text>
              </View>
              {/* A slider of stops a day (it was three cards), and what such a day is like */}
              <View style={styles.paceCard}>
                <Text style={styles.paceBig} testID="pace-value">
                  {t('newTrip.stopsADay', { count: trip.stops, n: f.n(trip.stops) })}
                </Text>
                <StepSlider
                  min={MIN_STOPS}
                  max={MAX_STOPS}
                  value={trip.stops}
                  onChange={(stops) => set({ stops })}
                  label={t('newTrip.pace')}
                  valueText={t('newTrip.stopsADay', { count: trip.stops, n: f.n(trip.stops) })}
                  stepLabel={(n) => f.n(n)}
                  testID="pace-slider"
                />
                <View style={styles.paceLine}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.paceText, styles.flex]}>
                    {t('newTrip.pacePerStop', { time: f.duration(minutesPerStop(trip.stops, trip.dayStart, trip.dayEnd)) })}
                  </Text>
                </View>
                <View style={styles.paceLine}>
                  <MaterialCommunityIcons name={paceIcon(trip.stops)} size={18} color={colors.textSecondary} />
                  <Text style={[styles.paceText, styles.flex]}>
                    {t(`newTrip.paceFeel.${paceOf(trip.stops)}`, { end: f.time(trip.dayEnd) })}
                  </Text>
                </View>
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
              <BudgetCard
                budget={trip.budget}
                tier={trip.tier}
                byHand={trip.budgetByHand}
                travellers={trip.travellers}
                currency={trip.currency}
                hotelText={hotelLine(hotels.data, hotelLevel(trip), t, f)}
                onBudget={(budget) => set({ budget, budgetByHand: true })}
                onTier={(tier) => set({ tier, budgetByHand: false })}
                onCurrency={(currency) => set({ currency, currencyByHand: true })}
              />

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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }, keyboardUp && styles.footerAway]}>
        {step === 2 && (
          <View style={styles.summary} accessibilityRole="summary">
            <SummaryPart first text={t('newTrip.days', { count: days, n: f.n(days) })} onPress={() => go(0)} />
            <SummaryPart text={t('plan.travellers', { count: trip.travellers, n: f.n(trip.travellers) })} onPress={() => go(0)} />
            <SummaryPart text={money(trip.budget)} onPress={() => go(1)} />
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
      <InterestsSheet
        visible={pickingInterests}
        value={trip.interests}
        onChange={(interests) => set({ interests })}
        onClose={() => setPickingInterests(false)}
      />
      {searching && destinations.data ? (
        <DestinationSearch
          destinations={destinations.data}
          places={allPlaces.data ?? []}
          visits={visits}
          selected={trip.destination}
          today={localToday()}
          onClose={() => setSearching(false)}
          onPick={(d, placeId) => {
            const place = placeId != null ? allPlaces.data?.find((p) => p.id === placeId) : undefined;
            setTrip((cur) => {
              const next = update(
                cur,
                d.name === cur.destination
                  ? {}
                  : { destination: d.name, mustSees: [], skip: [], ...(cur.currencyByHand ? {} : { currency: currencyFor(d.country_iso2) }) },
              );
              return place ? addMustSee(next, place.id) : next;
            });
            setMustSeeAdded(place ? place.name : null);
            addRecent(d.name);
            setSearching(false);
            haptics.success();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** An icon for how the day feels at this many stops */
function paceIcon(stops: number): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  return stops <= 3 ? 'coffee-outline' : stops <= 5 ? 'walk' : 'run-fast';
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
  // A hotel without a listed price comes as 0: it says nothing about the range
  const prices = (hotels ?? []).filter((h) => h.category === level && h.price_per_night > 0).map((h) => h.price_per_night);
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
      <PressableScale
        haptic="selection"
        onPress={onLess}
        style={styles.stepperButton}
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        testID={`${testID}-less`}
      >
        <MaterialCommunityIcons name="minus" size={22} color={colors.textPrimary} />
      </PressableScale>
      {value !== null && (
        <Text style={styles.stepperValue} accessibilityLiveRegion="polite" testID={`${testID}-value`}>
          {f.n(value)}
        </Text>
      )}
      <PressableScale
        haptic="selection"
        onPress={onMore}
        style={styles.stepperButton}
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        testID={`${testID}-more`}
      >
        <MaterialCommunityIcons name="plus" size={22} color={colors.textPrimary} />
      </PressableScale>
    </View>
  );
}

function TimeRow({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={styles.timeRow}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      testID={testID}
    >
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
    <PressableScale
      haptic="selection"
      onPress={onPress}
      style={styles.timeChip}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      testID={testID}
    >
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
  // "Where to?": a search field, or the chosen destination as a card
  destSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 56,
    paddingHorizontal: t.spacing.lg,
    borderRadius: 28,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  destSearchError: { borderColor: t.colors.danger },
  destSearchText: { ...t.type.body, color: t.colors.textTertiary, flex: 1 },
  destChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.sm,
    paddingRight: t.spacing.lg,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.accent,
  },
  destThumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceInset,
  },
  destText: { flex: 1, gap: 2 },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  added: { ...t.type.footnote, color: t.colors.textSecondary, flex: 1 },
  destName: { ...t.type.headline, color: t.colors.textPrimary },
  unchecked: { ...t.type.caption, fontWeight: '600', color: t.colors.warning },
  sourcesNote: { ...t.type.footnote, color: t.colors.textTertiary },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    backgroundColor: t.colors.surface,
    borderRadius: 20,
    paddingHorizontal: t.spacing.lg,
    minHeight: 64,
  },
  rowLabel: { ...t.type.body, color: t.colors.textPrimary },
  group: { backgroundColor: t.colors.surface, borderRadius: 20, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: t.colors.divider, marginLeft: 54 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 60 },
  timeChip: {
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccentSoft },
  originRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 60 },
  originSearch: { padding: t.spacing.md, paddingBottom: 0 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, padding: t.spacing.md, paddingTop: t.spacing.sm },
  modesTitle: { ...t.type.headline, color: t.colors.textPrimary, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md },
  modesHint: { ...t.type.footnote, color: t.colors.textSecondary, paddingHorizontal: t.spacing.lg, marginTop: 2 },
  modeWide: { flexBasis: '100%' },
  hereButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: t.spacing.md,
    borderRadius: 24,
    backgroundColor: t.colors.accentSoft,
    marginBottom: t.spacing.sm,
  },
  hereText: { ...t.type.callout, fontWeight: '700', color: t.colors.link },
  locateError: { ...t.type.footnote, color: t.colors.danger, marginBottom: t.spacing.sm },
  mode: {
    flex: 1,
    minHeight: 48,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  modeOn: { backgroundColor: t.colors.accent },
  modeText: { ...t.type.caption, fontWeight: '600', color: t.colors.textSecondary },
  paceCard: { backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.lg, gap: t.spacing.sm },
  paceBig: { ...t.type.headline, fontSize: 20, color: t.colors.textPrimary },
  paceLine: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm },
  paceText: { ...t.type.callout, color: t.colors.textSecondary },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.surface,
    borderRadius: 20,
    padding: t.spacing.lg,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  stepperButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { ...t.type.headline, minWidth: 28, textAlign: 'center', color: t.colors.textPrimary },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm, backgroundColor: t.colors.bg },
  footerAway: { display: 'none' },
  buildNow: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: t.spacing.lg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 6, rowGap: 2 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryPart: { ...t.type.footnote, color: t.colors.textSecondary },
  summaryLink: { color: t.colors.link, fontWeight: '600' },
}));
