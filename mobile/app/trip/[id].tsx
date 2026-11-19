/**
 * Vromon Mobile — the trip screen (trip planner step 2).
 *
 * One screen for the whole trip: the day's stops on a map, and the plan in a
 * sheet you pull up (docs/ui-refresh step 14, frames 28–30): the trip's name and
 * where it is, the budget row, day tabs with the day's sky, the day in a line,
 * the day as a timeline (leaving where you stay, stops with their weather, rides,
 * free time, back, tonight), ways to change the plan, and "About this trip". The
 * rest (budget, rebuild, duplicate, delete) is in the ⋯ menu. A friend's trip
 * opens read-only.
 *
 * After the trip (docs/ui-refresh step 16, frame 33) the plan is kept as it was: "Your trip" with your
 * rating, the budget, "Put this trip on your map?", "Plan it again" and "Send to a friend", then each day's
 * stops with how you found them. Nothing in it changes; "This trip didn't happen" is in the ⋯ menu (D19).
 *
 * Every edit goes to the backend, which re-times the day and re-checks the trip;
 * the screen then refetches. Travel legs are still straight-line estimates.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetFooter, BottomSheetScrollView, type BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlternativesSheet, ExplanationSheet } from '../../src/components/ItemSheets';
import { isUnchecked } from '../../src/features/places/kinds';
import { AddStopSheet, type AddChoice, type AddTarget } from '../../src/features/trips/plan/AddStopSheet';
import { useMe } from '../../src/features/account/useMe';
import { useConversations } from '../../src/features/chat/queries';
import { tripCard } from '../../src/features/chat/share';
import { usePreferences } from '../../src/features/preferences/store';
import { localToday, planPhase } from '../../src/features/trips/dates';
import { MapOffer } from '../../src/features/trips/after/MapOffer';
import { PlanAgainSheet } from '../../src/features/trips/after/PlanAgainSheet';
import { againDates, placesToMark, ratingFor, recapNumbers } from '../../src/features/trips/after/recap';
import { TripRecap } from '../../src/features/trips/after/TripRecap';
import { useTripReview } from '../../src/features/trips/review/TripReviewCard';
import { refreshTrips } from '../../src/features/trips/queries';
import { useMarkVisited } from '../../src/features/trips/useMarkVisited';
import { useVisits } from '../../src/features/map/visits';
import { DayMap, type MapBase, type MapPin } from '../../src/features/trips/plan/DayMap';
import { MapOptions, TripTopBar, weatherLook } from '../../src/features/trips/plan/TripTopBar';
import { DoneRow, DragGhost, FreeRow, LandingLine, LegRow, RatedRow, StopCard, type StopWeather } from '../../src/features/trips/plan/PlanRows';
import { NowCard } from '../../src/features/trips/today/NowCard';
import {
  backAt as wayBackAt,
  dayStart,
  leaveBy,
  minuteOfDay,
  nowView,
  t2m,
  todayState,
  type Point,
} from '../../src/features/trips/today/today';
import { BudgetRow, DayLine, DayTabs, PhaseChip, RoomButton } from '../../src/features/trips/plan/PlanTop';
import { ChangePlan } from '../../src/features/trips/plan/ChangePlan';
import { AboutTrip } from '../../src/features/trips/plan/AboutTrip';
import { DropStrip } from '../../src/features/trips/plan/DropStrip';
import { ConditionChips } from '../../src/features/trips/conditions/ConditionChips';
import { dayWhen } from '../../src/features/trips/conditions/dayView';
import { isSerious, useConditionText } from '../../src/features/trips/conditions/useConditionText';
import { GettingThere } from '../../src/features/trips/plan/GettingThere';
import { LegSheet } from '../../src/features/trips/plan/LegSheet';
import { StopSheet } from '../../src/features/trips/plan/StopSheet';
import {
  backAt,
  dayCounts,
  dayDate,
  friendlyRange,
  initialDayIndex,
  leaveAt,
  orderedStops,
  planRows,
  previewMove,
  dayRulesOf,
  stopCoord,
  stopTitle,
} from '../../src/features/trips/plan/timeline';
import { UnplacedCard } from '../../src/features/trips/new/UnplacedCard';
import { buildPlan } from '../../src/features/trips/plan/build';
import { setFlash, takeFlash } from '../../src/features/trips/plan/flash';
import { useDeferredRemoval } from '../../src/features/trips/plan/useDeferredRemoval';
import { useStopDrag } from '../../src/features/trips/plan/useStopDrag';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { daySummaryText } from '../../src/features/trips/plan/daySummary';
import { BaseRow } from '../../src/features/trips/stays/BaseRow';
import { baseName, picksFromStays, staysFromPicks, type StayPick } from '../../src/features/trips/stays/stays';
import { StaysSheet } from '../../src/features/trips/stays/StaysSheet';
import { stayForNight, TonightRow } from '../../src/features/trips/stays/TonightRow';
import { DEFAULT_PLAN, slotOf, sourceOf, stayMealsOf } from '../../src/features/trips/meals/meals';
import { MealsSheet } from '../../src/features/trips/meals/MealsSheet';
import { PlacesToEatSheet } from '../../src/features/trips/meals/PlacesToEatSheet';
import { StayMealRow } from '../../src/features/trips/meals/StayMealRow';
import { adviceForDay } from '../../src/features/trips/stays/advice';
import { StayAdviceCard, StayAdviceWhy } from '../../src/features/trips/stays/StayAdviceCard';
import { ApiError, destinationsApi, placesApi, tripsApi } from '../../src/services/api';
import type {
  AdaptationType,
  DayBase,
  Destination,
  Itinerary,
  ItineraryDay,
  ItineraryItem,
  LegOptions,
  MealPlan,
  MustSee,
  StayIn,
  StaySuggestion,
  TravelMode,
  Trip,
  Unplaced,
  ValidationReport,
} from '../../src/types';
import { ActionSheet, type SheetAction } from '../../src/ui/ActionSheet';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { LineIcon } from '../../src/ui/LineIcon';
import { PressableScale } from '../../src/ui/PressableScale';
import { Snackbar } from '../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { useReduceMotion } from '../../src/ui/useReduceMotion';
import { useDevPerf } from '../../src/utils/devPerf';
import { confirm, notify } from '../../src/utils/dialogs';
import { issuesForItem } from '../../src/utils/itinerary';

const SNACK_MS = 5000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The row over the map: its top (8 under the status bar), its height (58) and a little room below it */
const TOP_ROW = 8 + 58 + 8;

export default function TripScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  // `at` and `date` set the clock for checking a trip day, in development builds only (as on Today)
  const params = useLocalSearchParams<{ id: string; at?: string; date?: string }>();
  const { id } = params;
  const tripId = Number(id);
  const me = useMe();
  const f = usePlanFormat();

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const itinerary = useQuery({ queryKey: ['itinerary', tripId], queryFn: () => tripsApi.getItinerary(tripId), enabled: !!tripId });
  const days = useMemo(() => itinerary.data?.days ?? [], [itinerary.data]);
  const hasPlan = days.length > 0;
  // Step 11: "opens in under a second from the cache", measured in development builds
  useDevPerf('trip screen', hasPlan, itinerary.isFetchedAfterMount === false);
  // The phone's clock: on the trip the plan follows the day (docs/ui-refresh step 15)
  const [clock, setClock] = useState(() => new Date());
  const today = (__DEV__ && params.date) || localToday(clock);
  const nowMin = __DEV__ && params.at ? t2m(params.at) : minuteOfDay(clock);
  // Where the trip is: one rule for it (dates.ts, the same as the server's)
  const phase = trip.data ? planPhase(trip.data.start_date, trip.data.end_date, today) : null;
  // Today opens on the trip, and from the evening before it starts ("Starts tomorrow")
  const todayOpen = hasPlan && !!phase && (phase.kind === 'on' || (phase.kind === 'before' && phase.days <= 1));
  useEffect(() => {
    if (!todayOpen) return;
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [todayOpen]);
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: hasPlan });

  // A friend's trip is read-only; until the owner is known, nothing is editable
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  // The trip's room, once someone was invited (friends-chat step 7), with what's unread
  const room = useConversations(!!me.data).data?.find((c) => c.kind === 'trip' && c.trip_id === tripId) ?? null;
  const openToday = () => router.push({ pathname: '/trip/today/[id]', params: { id: tripId } });
  // After the trip (docs/ui-refresh step 16): kept as it was, nothing changes by accident (D21). The owner and
  // the trip room's members went on it: "Your trip" with their own rating, unless the owner said it didn't happen (D19)
  const after = phase?.kind === 'after';
  const notTaken = after && !!trip.data?.not_taken;
  const canEdit = mine && !after;
  const went = mine || !!room;
  const recap = after && went && !notTaken;
  // (a trip that didn't happen keeps its ratings, unseen: a query that's off still holds its last answer)
  const review = useTripReview(tripId, recap && hasPlan).data;
  const ratings = recap ? review : undefined;
  const visits = useVisits(after && mine ? me.data?.id : undefined);
  const visited = useMemo(
    () => (visits.data ? new Set(visits.data.filter((v) => v.status !== 'want').map((v) => `${v.place_type}:${v.place_code}`)) : null),
    [visits.data],
  );
  // What "Mark visited" would put on the map that isn't there yet (nothing: no offer)
  const mapPlaces = after && mine && trip.data ? placesToMark(trip.data, visited) : [];
  const marking = useMarkVisited(me.data?.id);
  const [againOpen, setAgainOpen] = useState(false);
  // The copy opens once the dates sheet has gone (a sheet left open would stay over the next screen)
  const madeCopy = useRef<Trip | null>(null);

  const [dayChoice, setDayChoice] = useState<number | null>(null);
  const dayIndex = Math.min(dayChoice ?? initialDayIndex(days, today), Math.max(0, days.length - 1));
  const day: ItineraryDay | undefined = days[dayIndex];
  // Today's tab while the trip is on: what's done, on now and next, and when to leave (today.ts, as on Today)
  const live = phase?.kind === 'on' && !!day && day.day_date === today;
  const tripHotel = itinerary.data?.hotel;
  const hotelPoint = useMemo<Point | null>(
    () => (tripHotel?.latitude != null && tripHotel.longitude != null ? { lat: tripHotel.latitude, lon: tripHotel.longitude } : null),
    [tripHotel],
  );
  const liveState = useMemo(() => (live && day ? todayState(day, nowMin) : null), [live, day, nowMin]);
  const liveLeave = useMemo(() => (liveState && day ? leaveBy(liveState, dayStart(day, hotelPoint), null, day.start_leg) : null), [liveState, day, hotelPoint]);
  const liveBack = live ? wayBackAt(day) : null;
  const liveView = liveState ? nowView(liveState, liveLeave, nowMin, liveBack) : null;
  /** Finished today (it can't change any more) */
  const isDone = (item: ItineraryItem) => !!liveState && t2m(item.end_time) <= nowMin;
  /** Done or on now: it stays where it is */
  const isFixed = (item: ItineraryItem) => isDone(item) || liveState?.current?.id === item.id;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetItem, setSheetItem] = useState<ItineraryItem | null>(null);
  const [why, setWhy] = useState<ItineraryItem | null>(null);
  const [replacing, setReplacing] = useState<ItineraryItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Full map: the plan sheet steps aside and the map takes the whole screen
  const [fullMap, setFullMap] = useState(false);
  // The map options panel, and what it sets (docs/ui-refresh step 7)
  const [layersOpen, setLayersOpen] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [is3d, setIs3d] = useState(false);
  // Without a back arrow, the phone's back first closes the panel, then leaves Full map, then the screen
  useEffect(() => {
    if (!layersOpen && !fullMap) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (layersOpen) setLayersOpen(false);
      else setFullMap(false);
      return true;
    });
    return () => sub.remove();
  }, [layersOpen, fullMap]);
  const [fitCount, setFitCount] = useState(0);
  const [snack, setSnack] = useState<{ message: string; undo?: () => void } | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [dropped, setDropped] = useState<number | null>(null);
  // "Press and hold a stop to move it": once, the first time a plan of yours opens (docs/ui-refresh step 8)
  const [hintFirst] = useState(() => !usePreferences.getState().dragHintSeen);
  const [hintClosed, setHintClosed] = useState(false);
  const setDragHintSeen = usePreferences((s) => s.setDragHintSeen);
  const reduceMotion = useReduceMotion();
  const [pickingStays, setPickingStays] = useState(false);
  // Meals (trip upgrades step 3): the whole trip's or this day's; places to eat for a meal
  const [mealsFor, setMealsFor] = useState<'trip' | 'day' | null>(null);
  const [eatFor, setEatFor] = useState<ItineraryItem | null>(null);

  const refresh = useCallback(async () => {
    queryClient.removeQueries({ queryKey: ['alternatives', tripId] });
    // (the stay advisor's suggestions follow every change: step 4; the weather at each stop's hour, and the
    // days themselves after a rebuild, follow it too: step 14)
    await Promise.all(
      [['itinerary', tripId], ['budget', tripId], ['trip', tripId], ['trips'], ['staySuggestions', tripId], ['conditions', tripId]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient, tripId]);

  const removal = useDeferredRemoval(tripId, refresh, (e) => notify(t('plan.removeFailed'), errorText(e), 'error'));

  // The snackbar goes away by itself
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), SNACK_MS);
    return () => clearTimeout(timer);
  }, [snack]);

  // A message left by another screen (the must-dos, after saving)
  useFocusEffect(
    useCallback(() => {
      const message = takeFlash(tripId);
      if (message) setSnack({ message });
    }, [tripId]),
  );

  // A must-see that doesn't fit: the traveller's choice, then only the days that need it are re-planned
  const [fixing, setFixing] = useState<number | null>(null);
  const fixMustSee = async (u: Unplaced, rule: MustSee | null) => {
    const current = trip.data?.constraints?.must_sees ?? [];
    const next = rule ? current.map((m) => (m.place_id === u.place_id ? rule : m)) : current.filter((m) => m.place_id !== u.place_id);
    setFixing(u.place_id);
    try {
      const res = await tripsApi.updateMustDos(tripId, { must_sees: next });
      haptics.success();
      const n = res.replanned_days.length;
      setSnack({
        message: !rule
          ? t('mustDos.leftOut', { name: u.name })
          : res.unplaced.some((x) => x.place_id === u.place_id)
            ? t('mustDos.stillNoFit', { name: u.name })
            : n
              ? t('mustDos.replanned', { count: n, days: res.replanned_days.map((d) => f.n(d)).join(', ') })
              : t('mustDos.placed', { name: u.name }),
      });
      await refresh();
    } catch (e) {
      notify(t('mustDos.saveFailed'), errorText(e), 'error');
    } finally {
      setFixing(null);
    }
  };

  const done = (message: string) => {
    haptics.success();
    setSnack({ message });
    refresh();
  };
  const failed = (title: string) => (e: unknown) => notify(title, errorText(e), 'error');

  const build = useMutation({
    mutationFn: () => buildPlan(tripId, hasPlan),
    onSuccess: () => {
      haptics.success();
      setDayChoice(0);
      setSelectedId(null);
      refresh();
    },
    onError: (e) => {
      const solver = e instanceof ApiError ? (e.detail as { solver?: { diagnostics?: string[] } } | undefined)?.solver : undefined;
      notify(t('plan.buildFailed'), [errorText(e), ...(solver?.diagnostics ?? [])].join('\n'), 'error');
    },
  });
  const adapt = useMutation({
    mutationFn: (type: AdaptationType) => tripsApi.adapt(tripId, type),
    onSuccess: (res) => done(res.message),
    onError: failed(t('plan.changeFailed')),
  });
  const regenerateDay = useMutation({
    mutationFn: (dayId: number) => tripsApi.regenerateDay(tripId, dayId),
    onSuccess: (res) => done(res.message),
    onError: failed(t('plan.changeFailed')),
  });
  const duplicate = useMutation({
    mutationFn: () => tripsApi.duplicate(tripId),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.push({ pathname: '/trip/[id]', params: { id: copy.id } });
    },
    onError: failed(t('plan.duplicateFailed')),
  });
  const remove = useMutation({
    mutationFn: () => tripsApi.delete(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      // Nothing may show the deleted trip again (Today mode may be under this screen). Its rating too: on SQLite
      // (development, the friends' server) the next new trip can get the same id, and showed it (step 16)
      for (const key of ['trip', 'itinerary', 'budget', 'conditions', 'review', 'stays', 'staySuggestions', 'dayRoute', 'leg', 'alternatives', 'suggestions'])
        queryClient.removeQueries({ queryKey: [key, tripId] });
      router.dismissTo('/trips');
    },
    onError: failed(t('plan.deleteFailed')),
  });
  // "Plan it again" (step 16, D21): a copy for new dates, yours or (as a trip-room member) a copy of the owner's
  const again = useMutation({
    mutationFn: (range: { start: string; end: string }) =>
      (mine ? tripsApi.duplicate : tripsApi.copy)(tripId, { start_date: range.start, end_date: range.end }, today),
    onSuccess: (copy) => {
      refreshTrips(queryClient);
      setFlash(copy.id, t('after.againReady', { range: friendlyRange(copy.start_date, copy.end_date, i18n.language, today) }));
      madeCopy.current = copy;
      setAgainOpen(false);
    },
    onError: failed(t('after.againFailed')),
  });
  // "This trip didn't happen" and back (D19): out of your numbers, not offered for rating or the map
  const setNotTaken = useMutation({
    mutationFn: (value: boolean) => tripsApi.setNotTaken(tripId, value, today),
    onSuccess: (updated, value) => {
      queryClient.setQueryData<Trip>(['trip', tripId], (old) => (old ? { ...old, not_taken: updated.not_taken } : updated));
      refreshTrips(queryClient, tripId);
      queryClient.invalidateQueries({ queryKey: ['review', tripId] });
      haptics.success();
      setSnack(value ? { message: t('after.notTakenDone'), undo: () => setNotTaken.mutate(false) } : { message: t('after.didHappenDone') });
    },
    onError: failed(t('after.notTakenFailed')),
  });

  // Where the traveller stays (docs/trip-upgrades, step 2): only the owner sees and changes the stays
  const stays = useQuery({ queryKey: ['stays', tripId], queryFn: () => tripsApi.stays(tripId), enabled: hasPlan && mine });
  // The destination's hotels and centre, for the stays sheet (only once it opens)
  const destinations = useQuery({ queryKey: ['destinations'], queryFn: () => destinationsApi.list(), enabled: pickingStays, staleTime: 10 * 60_000 });
  const destination = destinations.data?.find((d) => d.name === trip.data?.destination) ?? null;
  const saveStays = useMutation({
    mutationFn: (stayIns: NonNullable<ReturnType<typeof staysFromPicks>>) => tripsApi.setStays(tripId, stayIns),
    onSuccess: (res) => {
      setPickingStays(false);
      queryClient.setQueryData(['stays', tripId], { trip_id: res.trip_id, nights: res.nights, chosen: res.chosen, stays: res.stays });
      queryClient.removeQueries({ queryKey: ['dayRoute', tripId] });
      const change = Math.round(res.budget.change);
      done(change === 0 ? t('stays.saved') : t(change < 0 ? 'stays.savedLess' : 'stays.savedMore', { amount: f.money(Math.abs(change)) }));
    },
    onError: failed(t('stays.saveFailed')),
  });
  const saveMeals = useMutation({
    mutationFn: ({ scope, plan, dayId }: { scope: 'trip' | 'day'; plan: MealPlan | null; dayId: number }) =>
      scope === 'trip' ? tripsApi.setMeals(tripId, plan ?? DEFAULT_PLAN) : tripsApi.setDayMeals(tripId, dayId, plan),
    onSuccess: (res) => {
      setMealsFor(null);
      queryClient.removeQueries({ queryKey: ['dayRoute', tripId] });
      const change = Math.round(res.budget.change);
      done(change === 0 ? t('meals.saved') : t(change < 0 ? 'meals.savedLess' : 'meals.savedMore', { amount: f.money(Math.abs(change)) }));
    },
    onError: failed(t('meals.saveFailed')),
  });
  const eatAt = useMutation({
    mutationFn: ({ itemId, restaurantId }: { itemId: number; restaurantId: number; name: string }) => tripsApi.eatAt(tripId, itemId, restaurantId),
    onSuccess: (_res, { name }) => {
      setEatFor(null);
      queryClient.removeQueries({ queryKey: ['dayRoute', tripId] });
      done(t('meals.nowAt', { name }));
    },
    onError: failed(t('meals.saveFailed')),
  });

  // The stay advisor (step 4): "sleep somewhere else for nights a-b?", above the day it starts on
  const advice = useQuery({ queryKey: ['staySuggestions', tripId], queryFn: () => tripsApi.staySuggestions(tripId), enabled: hasPlan && mine });
  const [adviceBusy, setAdviceBusy] = useState<{ id: number; key: 'switch' | 'notNow' | 'dismiss' } | null>(null);
  const [whyFor, setWhyFor] = useState<StaySuggestion | null>(null);
  const putStays = (stayIns: StayIn[]) => {
    queryClient.removeQueries({ queryKey: ['dayRoute', tripId] });
    queryClient.invalidateQueries({ queryKey: ['stays', tripId] });
    return refresh();
  };
  const answerAdvice = async (s: StaySuggestion, key: 'switch' | 'notNow' | 'dismiss') => {
    setAdviceBusy({ id: s.id, key });
    try {
      if (key === 'switch') {
        const res = await tripsApi.acceptStaySuggestion(tripId, s.id);
        haptics.success();
        await putStays(res.undo.stays);
        setSnack({
          message: t('stayAdvice.switched', { hotel: s.hotel.name }),
          undo: async () => {
            setSnack(null);
            try {
              await tripsApi.setStays(tripId, res.undo.stays);
              await putStays(res.undo.stays);
              setSnack({ message: t('stayAdvice.undone') });
            } catch (e) {
              notify(t('stays.saveFailed'), errorText(e), 'error');
            }
          },
        });
      } else {
        const res = key === 'notNow' ? await tripsApi.notNowStaySuggestion(tripId, s.id) : await tripsApi.dismissStaySuggestion(tripId, s.id);
        queryClient.setQueryData(['staySuggestions', tripId], res);
        queryClient.invalidateQueries({ queryKey: ['budget', tripId] });
        setSnack({ message: t(key === 'notNow' ? 'stayAdvice.notNowDone' : 'stayAdvice.dismissedDone') });
      }
    } catch (e) {
      notify(t('stayAdvice.failed'), errorText(e), 'error');
    } finally {
      setAdviceBusy(null);
    }
  };

  const pickStays = (picks: StayPick[]) => {
    const stayIns = staysFromPicks(picks);
    if (stayIns) saveStays.mutate(stayIns);
    else setPickingStays(false);
  };

  const busy = build.isPending || adapt.isPending || regenerateDay.isPending || saveStays.isPending;

  const rows = useMemo(() => (day ? planRows(day, removal.hidden) : []), [day, removal.hidden]);
  const pins = useMemo<MapPin[]>(
    () =>
      rows.flatMap((r) => {
        if (r.kind !== 'stop') return [];
        const coord = stopCoord(r.item);
        // Visited today: a quieter pin (docs/ui-refresh step 15)
        const done = live && t2m(r.item.end_time) <= nowMin;
        return coord ? [{ id: r.item.id, n: r.n, kind: r.stopKind, coord, title: stopTitle(r.item), unchecked: isUnchecked(r.item.place), done }] : [];
      }),
    [rows, live, nowMin],
  );
  // "Put a pin on the map" opens at the stop before the free time, else at the day's first stop
  const addCenter = useMemo(() => {
    const items = days.find((d) => d.id === addTarget?.dayId)?.items ?? [];
    const near = items.find((i) => i.id === addTarget?.nearItemId);
    const coord = (near && stopCoord(near)) ?? items.map(stopCoord).find(Boolean);
    return coord ? { lat: coord.latitude, lon: coord.longitude } : null;
  }, [days, addTarget]);
  // The stay on the map: where the day starts and ends (not a stand-in at the destination's centre)
  const mapBase = useCallback(
    (b: DayBase | null | undefined): MapBase | null =>
      b && !b.estimate && b.latitude != null && b.longitude != null && pins.length
        ? { kind: b.kind, coord: { latitude: b.latitude, longitude: b.longitude }, name: baseName(b, t) ?? '' }
        : null,
    [pins.length, t],
  );
  const startBase = useMemo(() => mapBase(day?.start_base), [mapBase, day?.start_base]);
  const endBase = useMemo(() => mapBase(day?.end_base), [mapBase, day?.end_base]);

  // Live conditions: weather, sea, sun and usual traffic (refreshed every 10 minutes while open)
  const conditions = useQuery({
    queryKey: ['conditions', tripId],
    queryFn: () => tripsApi.conditions(tripId),
    enabled: hasPlan,
    refetchInterval: 10 * 60_000,
  });
  const conditionText = useConditionText();
  const dayConditions = conditions.data?.days.find((d) => d.day_id === day?.id);
  const openConditions = () => router.push({ pathname: '/trip/conditions/[id]', params: { id: tripId, day: day?.day_number ?? 1 } });

  // Road lines for the map, a day at a time (kept on the server); legs without one are drawn straight.
  // A day whose route is missing a leg (routing was down, or still working) is asked again every 30 s
  const stopOrder = pins.map((p) => p.id).join(',');
  const route = useQuery({
    queryKey: ['dayRoute', tripId, day?.id, stopOrder],
    queryFn: () => tripsApi.dayRoute(tripId, day!.id),
    enabled: !!day && pins.length > 1,
    staleTime: (q) => (routeComplete(q.state.data) ? Infinity : 0),
    refetchInterval: (q) => (q.state.data && !routeComplete(q.state.data) ? 30_000 : false),
  });
  const roadLines = useMemo(
    () => Object.fromEntries((route.data?.legs ?? []).flatMap((l) => (l.line && !l.kind ? [[`${l.from_item_id}>${l.to_item_id}`, l.line]] : []))),
    [route.data],
  );
  // From the stay and back to it, along the road when we have it
  const baseLines = useMemo(
    () => ({
      from: route.data?.legs.find((l) => l.kind === 'from_base')?.line ?? null,
      to: route.data?.legs.find((l) => l.kind === 'to_base')?.line ?? null,
    }),
    [route.data],
  );
  // Legs with no road: road to the ghat, across the water, road on
  const crossings = useMemo(
    () => Object.fromEntries((route.data?.legs ?? []).flatMap((l) => (l.segments ? [[`${l.from_item_id}>${l.to_item_id}`, l.segments]] : []))),
    [route.data],
  );

  // Sheet: about half the screen over the map, or pulled up to just below the buttons
  const sheetLow = Math.round(height * 0.46);
  const sheetHigh = height - insets.top - 72;
  const snapPoints = useMemo(() => [sheetLow, sheetHigh], [sheetLow, sheetHigh]);
  const sheet = useRef<BottomSheet>(null);
  // The plan sheet slides in once this screen has finished sliding in. Opened from a link (or Today's
  // "Full plan") over another trip, its first animation could run while the screen was still being swapped
  // in and never be drawn: the sheet thought it was open, but nothing showed (found on the phone, step 6).
  const navigation = useNavigation();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const done = () => setSettled(true);
    // The native stack's own event (Expo Router doesn't export its type)
    const stack = navigation as unknown as {
      addListener: (event: 'transitionEnd', cb: (e: { data?: { closing?: boolean } }) => void) => () => void;
    };
    const unsubscribe = stack.addListener('transitionEnd', (e) => {
      if (!e.data?.closing) done();
    });
    // No transition to wait for (the first screen, or animations off): a moment is enough
    const fallback = setTimeout(done, 700);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigation]);
  // A pin opens that stop's details over the map (the list can't scroll while the sheet is half open)
  const pickFromMap = (itemId: number) => {
    const row = rows.find((r) => r.kind === 'stop' && r.item.id === itemId);
    if (row?.kind !== 'stop') return;
    haptics.selection();
    setSelectedId(itemId);
    setSheetItem(row.item);
  };
  // The snackbar sits in the sheet's footer so its Undo button gets taps
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <Snackbar
          inline
          message={snack?.message ?? null}
          actionLabel={snack?.undo ? t('plan.undo') : undefined}
          onAction={snack?.undo}
          testID="trip-snackbar"
        />
      </BottomSheetFooter>
    ),
    [snack, t],
  );

  const removeStop = (item: ItineraryItem) => {
    haptics.warning();
    removal.remove(item.id);
    if (selectedId === item.id) setSelectedId(null);
    setSnack({
      message: t('plan.removed', { name: stopTitle(item) }),
      undo: () => {
        removal.undo(item.id);
        setSnack(null);
      },
    });
  };

  // Rearranging: the server re-times the day, and its answer goes straight into the cache
  const putDays = (res: { day?: ItineraryDay; days?: ItineraryDay[]; validation: ValidationReport }) => {
    const changed = res.days ?? (res.day ? [res.day] : []);
    queryClient.setQueryData<Itinerary>(['itinerary', tripId], (old) =>
      old ? { ...old, days: old.days.map((d) => changed.find((c) => c.id === d.id) ?? d), validation: res.validation } : old,
    );
    for (const queryKey of [['budget', tripId], ['trip', tripId], ['trips'], ['staySuggestions', tripId], ['conditions', tripId]]) queryClient.invalidateQueries({ queryKey });
    queryClient.removeQueries({ queryKey: ['alternatives', tripId] });
    queryClient.removeQueries({ queryKey: ['suggestions', tripId] });
  };

  const restoreOrder = async (dayId: number, ids: number[]) => {
    try {
      putDays(await tripsApi.reorderDay(tripId, dayId, ids));
      setSnack({ message: t('plan.undoneOrder') });
    } catch (e) {
      notify(t('plan.moveFailed'), errorText(e), 'error');
    }
  };
  /** Move a stop to position `to` of its day: shown at once, confirmed by the server */
  const reorder = async (d: ItineraryDay, itemId: number, to: number) => {
    const before = orderedStops(d);
    const from = before.findIndex((i) => i.id === itemId);
    if (from < 0 || to === from || to < 0 || to >= before.length) return;
    const preview = previewMove(d, itemId, to, dayRulesOf(trip.data, d.day_number));
    const snapshot = queryClient.getQueryData<Itinerary>(['itinerary', tripId]);
    queryClient.setQueryData<Itinerary>(['itinerary', tripId], (old) =>
      old ? { ...old, days: old.days.map((x) => (x.id === d.id ? { ...x, items: preview } : x)) } : old,
    );
    try {
      putDays(
        await tripsApi.reorderDay(
          tripId,
          d.id,
          preview.map((i) => i.id),
        ),
      );
      setSnack({
        message: t('plan.movedStop', { name: stopTitle(before[from]) }),
        undo: () => {
          setSnack(null);
          restoreOrder(
            d.id,
            before.map((i) => i.id),
          );
        },
      });
    } catch (e) {
      queryClient.setQueryData(['itinerary', tripId], snapshot);
      notify(t('plan.moveFailed'), errorText(e), 'error');
    }
  };
  const moveToDay = async (item: ItineraryItem, fromDay: ItineraryDay, dayId: number) => {
    const position = orderedStops(fromDay).findIndex((i) => i.id === item.id);
    const target = days.find((x) => x.id === dayId);
    try {
      putDays(await tripsApi.moveItem(tripId, item.id, dayId));
      if (selectedId === item.id) setSelectedId(null);
      setSnack({
        message: t('plan.movedToDay', { name: stopTitle(item), n: f.n(target?.day_number ?? 0) }),
        undo: async () => {
          setSnack(null);
          try {
            putDays(await tripsApi.moveItem(tripId, item.id, fromDay.id, position));
          } catch (e) {
            notify(t('plan.moveFailed'), errorText(e), 'error');
          }
        },
      });
    } catch (e) {
      notify(t('plan.moveFailed'), errorText(e), 'error');
    }
  };
  const setDuration = async (item: ItineraryItem, minutes: number) => {
    try {
      putDays(await tripsApi.updateItem(tripId, item.id, { duration_minutes: minutes }));
      setSnack({ message: t('plan.stayChanged', { name: stopTitle(item), time: f.duration(minutes) }) });
    } catch (e) {
      notify(t('plan.saveFailed'), errorText(e), 'error');
    }
  };
  // How to get to the next stop (a leg's sheet); the day is re-timed by the server
  const [legItem, setLegItem] = useState<number | null>(null);
  const setTravelMode = async (itemId: number, mode: TravelMode | null, leg: LegOptions) => {
    try {
      putDays(await tripsApi.updateItem(tripId, itemId, { travel_mode: mode }));
      queryClient.removeQueries({ queryKey: ['leg', tripId] });
      setSnack({
        message: mode ? t('plan.legChanged', { mode: t(`plan.modes.${mode}`), to: leg.to }) : t('plan.legReset', { to: leg.to }),
      });
    } catch (e) {
      notify(t('plan.saveFailed'), errorText(e), 'error');
    }
  };
  // "Suggest this place to Vromon": your own stop goes to the data team's review (trip upgrades step 6)
  const suggestPlace = async (item: ItineraryItem) => {
    if (!item.place) return;
    try {
      const res = await placesApi.suggest(item.place.id);
      setSnack({ message: t(res.already ? 'search.alreadySuggested' : 'search.suggested') });
    } catch (e) {
      notify(t('search.suggestFailed'), errorText(e), 'error');
    }
  };
  const setPinned = async (item: ItineraryItem, pinned: boolean) => {
    try {
      putDays(await tripsApi.updateItem(tripId, item.id, { pinned }));
      setSnack({ message: t(pinned ? 'plan.pinnedOn' : 'plan.pinnedOff', { name: stopTitle(item) }) });
    } catch (e) {
      notify(t('plan.saveFailed'), errorText(e), 'error');
    }
  };
  // Vromon's place, or (trip upgrades step 6) any search result or a named pin: the server makes it your own stop
  const addPlace = async (choice: AddChoice, target: AddTarget) => {
    // A place from outside Vromon's list first gets its roads to the day's other stops: a few seconds
    if (!('place_id' in choice.ref)) setSnack({ message: t('search.adding', { name: choice.name }) });
    try {
      const before = new Set(days.find((d) => d.id === target.dayId)?.items.map((i) => i.id) ?? []);
      const res =
        'place_id' in choice.ref
          ? await tripsApi.addItem(tripId, target.dayId, choice.ref.place_id, target.position)
          : await tripsApi.addStop(tripId, target.dayId, choice.ref, target.position);
      putDays(res);
      const added = res.day.items.find((i) => !before.has(i.id) && i.item_type === 'activity');
      setSnack({
        message: t('plan.addedStop', { name: choice.name }),
        undo: added
          ? async () => {
              setSnack(null);
              try {
                await tripsApi.removeItem(tripId, added.id);
                refresh();
              } catch (e) {
                notify(t('plan.removeFailed'), errorText(e), 'error');
              }
            }
          : undefined,
      });
    } catch (e) {
      setSnack(null);
      notify(t('plan.addFailed'), errorText(e), 'error');
    }
  };

  const stopIds = useMemo(() => rows.flatMap((r) => (r.kind === 'stop' ? [r.item.id] : [])), [rows]);
  // On the trip: the stops done or on now stay first (docs/ui-refresh step 15)
  const stopRows = rows.filter((r): r is Extract<typeof r, { kind: 'stop' }> => r.kind === 'stop');
  const fixedCount = liveState ? stopRows.filter((r) => t2m(r.item.end_time) <= nowMin || liveState.current?.id === r.item.id).length : 0;
  const drag = useStopDrag({
    stopIds,
    minIndex: fixedCount,
    enabled: canEdit && !busy,
    screenHeight: height,
    sheetHeights: [sheetLow, sheetHigh],
    bottomInset: insets.bottom,
    onLift: () => setHintClosed(true),
    onReorder: (itemId, to) => {
      // The dropped card is already where it lands: only the others glide
      setDropped(itemId);
      setTimeout(() => setDropped((cur) => (cur === itemId ? null : cur)), 400);
      if (day) reorder(day, itemId, to);
    },
    onMoveToDay: (itemId, dayId) => {
      const item = day?.items.find((i) => i.id === itemId);
      if (item && day) moveToDay(item, day, dayId);
    },
  });
  const { gestureFor, attachScroll, attachRows } = drag;
  const gestures = useMemo(() => Object.fromEntries(stopIds.map((sid) => [sid, gestureFor(sid)])), [stopIds, gestureFor]);
  const dragging = drag.drag;
  const draggedRow = dragging ? rows.find((r): r is Extract<typeof r, { kind: 'stop' }> => r.kind === 'stop' && r.item.id === dragging.itemId) : undefined;
  const showHint = hintFirst && !hintClosed && canEdit && !busy && rows.some((r) => r.kind === 'stop' && !r.item.pinned) && (stopIds.length > 1 || days.length > 1);
  // Seen once it shows: it stays for this visit, until closed or a stop is lifted
  useEffect(() => {
    if (showHint) setDragHintSeen();
  }, [showHint, setDragHintSeen]);
  const previewStarts = useMemo(() => {
    if (!dragging || !day || dragging.to === dragging.from) return null;
    return Object.fromEntries(previewMove(day, dragging.itemId, dragging.to, dayRulesOf(trip.data, day.day_number)).map((i) => [i.id, i.start_time]));
  }, [dragging, day, trip.data]);

  if (trip.isLoading || (itinerary.isLoading && !itinerary.data)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }
  // Cached data stays on screen when a refresh fails; the error shows only with nothing to show
  if (!trip.data || (!itinerary.data && itinerary.isError)) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('plan.loadFailed')}</Text>
        <Text style={styles.muted}>{errorText(trip.error ?? itinerary.error)}</Text>
        <Button
          variant="secondary"
          label={t('common.retry')}
          onPress={() => {
            trip.refetch();
            itinerary.refetch();
          }}
        />
      </View>
    );
  }

  const data = trip.data;
  const report: ValidationReport | null = itinerary.data?.validation ?? null;
  const unplaced = itinerary.data?.unplaced ?? [];
  const dayProblems = (report?.violations ?? []).filter(
    (v) =>
      v.severity !== 'info' &&
      v.item_id == null &&
      (v.day_number == null || v.day_number === day?.day_number) &&
      // a missing must-see has its own card, with the choices
      !(v.code === 'MUST_VISIT_MISSING' && canEdit && unplaced.length > 0),
  );
  const stopCount = rows.filter((r) => r.kind === 'stop').length;
  const hasLegs = rows.some((r) => r.kind === 'leg');
  const counts = dayCounts(rows);
  // The day's money is Budget's "By day" for it: the same number on both screens
  const byDay = day ? budget.data?.by_day?.find((b) => b.day_number === day.day_number) : undefined;
  // Where the plan's times come from, under "About this trip"
  const timesNote = rows.some((r) => r.kind === 'leg' && r.source === 'road') ? t('plan.roadsNote') : hasLegs ? t('plan.straightLine') : null;
  // The weather in the hour each stop starts, when the forecast reaches the day
  const weatherFor = (item: ItineraryItem): StopWeather | null => {
    const w = dayConditions?.in_forecast ? dayConditions.items[String(item.id)] : undefined;
    if (!w || w.code == null || !dayConditions) return null;
    return { ...w, night: item.start_time >= dayConditions.sunset || item.start_time < dayConditions.sunrise };
  };
  // "Your must-do at sunset": a place the traveller must see, with when they wanted it
  const mustDoFor = (item: ItineraryItem): string | null => {
    const m = item.item_type === 'activity' && item.place ? data.constraints?.must_sees?.find((x) => x.place_id === item.place!.id) : undefined;
    if (!m) return null;
    const when = m.at ? t('mustDos.wantedAt', { time: f.time(m.at) }) : m.when ? t(`mustDos.wanted.${m.when}`) : null;
    return when ? t('plan.mustDoWhen', { when }) : t('plan.mustDo');
  };
  const sheetRow = sheetItem ? rows.find((r): r is Extract<typeof r, { kind: 'stop' }> => r.kind === 'stop' && r.item.id === sheetItem.id) : undefined;

  // The day's rows; while a stop is dragged, a line shows where it would land and the times preview the change
  function renderRows(d: ItineraryDay) {
    // After the trip (frame 33): each stop with how you found it, or "Rate"; rides and free time aren't shown
    if (after) {
      return rows.flatMap((r) => {
        if (r.kind !== 'stop') return [];
        const thing = ratingFor(ratings?.items, r.item.id);
        return [
          <RatedRow
            key={r.key}
            item={r.item}
            n={r.n}
            kind={r.stopKind}
            verdict={thing?.verdict}
            comment={thing?.comment}
            onPress={() => {
              setSelectedId(r.item.id);
              setSheetItem(r.item);
            }}
            onRate={thing && !thing.verdict ? () => router.push({ pathname: '/trip/review/[id]', params: { id: tripId, item: thing.key } }) : undefined}
          />,
        ];
      });
    }
    const stops = orderedStops(d, removal.hidden);
    const out: React.ReactNode[] = [];
    // Where it would land, with the time it would get there
    const line = (key: string) => <LandingLine key={key} time={dragging ? previewStarts?.[dragging.itemId] : undefined} />;
    const dim = !!dragging;
    let seen = 0;
    // On the trip: the stop each ride goes to (the next stop row after it)
    const goesTo = (i: number) => rows.slice(i + 1).find((x): x is Extract<typeof x, { kind: 'stop' }> => x.kind === 'stop')?.item;
    rows.forEach((r, i) => {
      if (r.kind === 'leg') {
        const to = goesTo(i);
        // A ride already taken (to a stop done or on now) is left out
        if (liveState && to && isFixed(to)) return;
        out.push(
          <LegRow
            key={r.key}
            minutes={r.minutes}
            km={r.km}
            mode={r.mode}
            fare={r.fare}
            crossing={r.crossing}
            dimmed={dim}
            leaveAt={liveLeave && to && liveState?.next?.id === to.id ? liveLeave.at : null}
            note={
              dayConditions?.legs[String(r.itemId)]
                ? t('conditions.slowLeg', {
                    from: f.time(dayConditions.legs[String(r.itemId)].from),
                    to: f.time(dayConditions.legs[String(r.itemId)].to),
                    extra: f.n(dayConditions.legs[String(r.itemId)].extra),
                  })
                : undefined
            }
            onPress={canEdit && !busy ? () => setLegItem(r.itemId) : undefined}
          />,
        );
        return;
      }
      if (r.kind === 'free') {
        // Free time that's over is left out
        if (liveState && t2m(r.start) + r.minutes <= nowMin) return;
        const before = stops.findIndex((x) => `f${x.id}` === r.key);
        out.push(
          <FreeRow
            key={r.key}
            start={r.start}
            minutes={r.minutes}
            dimmed={dim}
            onAdd={canEdit && !busy && before >= 0 ? () => setAddTarget({ dayId: d.id, position: before + 1, nearItemId: stops[before].id }) : undefined}
          />,
        );
        return;
      }
      const item = r.item;
      const index = stops.findIndex((x) => x.id === item.id);
      const isDragged = dragging?.itemId === item.id;
      if (dragging && !isDragged && dragging.to !== dragging.from && seen === dragging.to) out.push(line(`line-${r.key}`));
      if (!isDragged) seen += 1;
      // Done today: a short row with a tick (frame 31); it still opens its details
      if (isDone(item)) {
        out.push(
          <DoneRow
            key={r.key}
            item={item}
            dimmed={dim}
            onPress={() => {
              setSelectedId(item.id);
              setSheetItem(item);
            }}
          />,
        );
        return;
      }
      const fixed = isFixed(item);
      const status = liveState?.current?.id === item.id ? ('now' as const) : liveState?.next?.id === item.id ? ('next' as const) : null;
      out.push(
        <StopCard
          key={r.key}
          item={item}
          n={r.n}
          kind={r.stopKind}
          issues={[
            ...issuesForItem(report, item.id),
            ...(dayConditions?.warnings ?? [])
              .filter((w) => w.item_id === item.id && !w.kept)
              .map((w) => ({ severity: isSerious(w) ? ('hard' as const) : ('soft' as const), code: w.code, message: conditionText.title(w) })),
          ]}
          selected={selectedId === item.id}
          removable={canEdit && item.item_type === 'activity' && !busy && !fixed}
          onLayoutRow={(y, h) => {
            drag.setRow(item.id, y, h);
          }}
          onCardWidth={drag.setCardWidth}
          drag={canEdit && !busy && !item.pinned && !fixed ? gestures[item.id] : undefined}
          dragging={isDragged}
          dimmed={dim && !isDragged}
          previewStart={previewStarts?.[item.id]}
          glide={dropped !== item.id && !isDragged}
          move={
            canEdit && !busy && !fixed
              ? {
                  earlier: index > fixedCount ? () => reorder(d, item.id, index - 1) : undefined,
                  later: index < stops.length - 1 ? () => reorder(d, item.id, index + 1) : undefined,
                  toDay:
                    days.length > 1
                      ? () => {
                          setSelectedId(item.id);
                          setSheetItem(item);
                        }
                      : undefined,
                }
              : undefined
          }
          onPress={() => {
            if (drag.justDropped()) return;
            setSelectedId(item.id);
            setSheetItem(item);
          }}
          onRemove={() => removeStop(item)}
          onEatNearby={sourceOf(item) === 'own' ? () => setEatFor(item) : undefined}
          weather={weatherFor(item)}
          mustDo={mustDoFor(item)}
          status={status}
        />,
      );
    });
    if (dragging && dragging.to !== dragging.from && seen === dragging.to) out.push(line('line-end'));
    return out;
  }

  // A copy of the trip as a card, into friends' chats (friends-chat step 4, mockup 9)
  const profile = me.data;
  const sendToFriend =
    mine && profile
      ? () => {
          // The destinations, if loaded, give the card its locator map at once; the server adds it anyway
          const card = tripCard(
            data,
            { id: profile.id, name: profile.display_name || profile.username || '' },
            queryClient.getQueryData<Destination[]>(['destinations']),
          );
          router.push({ pathname: '/share/send', params: { card: JSON.stringify(card) } });
        }
      : null;
  const budgetAction: SheetAction = {
    key: 'budget',
    label: t('plan.budget'),
    icon: 'wallet-outline',
    onPress: () => router.push({ pathname: '/trip/budget/[id]', params: { id: tripId } }),
  };
  const deleteAction: SheetAction = {
    key: 'delete',
    label: t('plan.deleteTrip'),
    icon: 'trash-can-outline',
    danger: true,
    onPress: () => confirm(t('plan.deleteTitle'), t('plan.deleteBody'), t('plan.deleteOk'), () => remove.mutate(), true),
  };
  const actions: SheetAction[] = [];
  if (after) {
    // A finished trip (step 16): nothing that changes the plan; "Plan it again" makes a copy that can change
    if (mine) {
      if (hasPlan) actions.push(budgetAction);
      if (sendToFriend) actions.push({ key: 'send', label: t('chat.share.sendToFriend'), icon: 'send-outline', onPress: sendToFriend });
      actions.push({ key: 'again', label: t('after.again'), icon: 'content-copy', onPress: () => setAgainOpen(true) });
      actions.push(
        notTaken
          ? { key: 'didHappen', label: t('after.didHappen'), icon: 'calendar-check-outline', onPress: () => setNotTaken.mutate(false) }
          : {
              key: 'notTaken',
              label: t('after.notTaken'),
              icon: 'calendar-remove-outline',
              onPress: () => confirm(t('after.notTakenTitle'), t('after.notTakenBody'), t('after.notTakenOk'), () => setNotTaken.mutate(true)),
            },
      );
      actions.push(deleteAction);
    }
  }
  if (todayOpen) actions.push({ key: 'today', label: t('today.open'), icon: 'calendar-today', onPress: openToday });
  // Meals (step 3): this day's, or the whole trip's
  if (canEdit && day) {
    actions.push({ key: 'mealsDay', label: t('meals.today'), icon: 'silverware-fork-knife', onPress: () => setMealsFor('day') });
    actions.push({ key: 'mealsTrip', label: t('meals.wholeTrip'), icon: 'silverware-variant', onPress: () => setMealsFor('trip') });
  }
  // Planning together (friends-chat step 7): invite friends to the trip's room
  if (canEdit) {
    actions.push({
      key: 'together',
      label: room ? t('tripRoom.inviteMore') : t('tripRoom.title'),
      icon: 'account-group-outline',
      onPress: () => router.push({ pathname: '/trip/invite/[id]', params: { id: String(tripId) } }),
    });
  }
  if (canEdit) {
    actions.push({
      key: 'route',
      label: t('trips.editRoute'),
      icon: 'map-marker-path',
      onPress: () => router.push({ pathname: '/trip/route/[id]', params: { id: tripId } }),
    });
    if (hasPlan) {
      actions.push(budgetAction);
      actions.push({
        key: 'rebuild',
        label: t('plan.rebuild'),
        icon: 'refresh',
        onPress: () => confirm(t('plan.rebuildTitle'), t('plan.rebuildBody'), t('plan.rebuildOk'), () => build.mutate()),
      });
    }
    actions.push({ key: 'duplicate', label: t('plan.duplicate'), icon: 'content-copy', onPress: () => duplicate.mutate() });
    if (sendToFriend) actions.push({ key: 'send', label: t('chat.share.sendToFriend'), icon: 'send-outline', onPress: sendToFriend });
    actions.push(deleteAction);
  }

  return (
    <View style={styles.screen}>
      <DayMap
        pins={pins}
        selectedId={selectedId}
        onSelect={pickFromMap}
        fitKey={`${day?.id ?? 'none'}-${fitCount}`}
        roadLines={roadLines}
        crossings={crossings}
        start={startBase}
        end={endBase}
        baseLines={baseLines}
        topPadding={insets.top + TOP_ROW}
        bottomPadding={fullMap ? insets.bottom + 96 : sheetLow}
        accessibilityLabel={t('plan.mapLabel', { n: f.n(day?.day_number ?? 1) })}
        satellite={satellite}
        is3d={is3d}
      />

      {/* The row over the map (docs/ui-refresh step 7): weather, map options, Full map, ⋮; no back arrow */}
      <TripTopBar
        top={insets.top + 8}
        look={weatherLook(dayConditions, conditions.data, clock.getTime(), { today, minute: nowMin })}
        dayNumber={day?.day_number ?? 1}
        layersOpen={layersOpen}
        onWeather={openConditions}
        onLayers={() => setLayersOpen((o) => !o)}
        onFullMap={pins.length > 0 && !fullMap ? () => setFullMap(true) : undefined}
        onMore={mine ? () => setMenuOpen(true) : undefined}
      />
      {fullMap ? (
        <PressableScale
          haptic="selection"
          onPress={() => setFullMap(false)}
          style={[styles.showPlan, { bottom: insets.bottom + 24 }]}
          accessibilityLabel={t('plan.showPlan')}
          testID="trip-show-plan"
        >
          <MaterialCommunityIcons name="format-list-bulleted" size={20} color={theme.colors.onAccent} />
          <Text style={styles.showPlanText}>{t('plan.showPlan')}</Text>
        </PressableScale>
      ) : null}

      {layersOpen ? (
        <MapOptions
          top={insets.top + TOP_ROW + 2}
          satellite={satellite}
          is3d={is3d}
          onSatellite={setSatellite}
          on3d={setIs3d}
          onShowDay={
            pins.length > 1
              ? () => {
                  setLayersOpen(false);
                  setFitCount((c) => c + 1);
                }
              : undefined
          }
          onClose={() => setLayersOpen(false)}
        />
      ) : null}

      {fullMap || !settled ? null : (
      <BottomSheet
        ref={sheet}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        footerComponent={renderFooter}
        onChange={drag.onSheetChange}
        keyboardBehavior="extend"
        android_keyboardInputMode="adjustResize"
        accessibilityLabel={t('plan.sheet')}
      >
        <BottomSheetScrollView
          ref={attachScroll}
          onScroll={drag.onScroll}
          contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 96 }]}
          testID="plan-sheet"
        >
          {!mine && me.data && (
            <View style={styles.readOnly}>
              <Text style={styles.readOnlyText}>{t('trips.readOnly')}</Text>
            </View>
          )}

          <View style={styles.header}>
            {/* At large text the chip and the room go under the name: a one-word name broke mid-word beside them (step 16) */}
            <View style={[styles.titleRow, fontScale >= 1.3 && styles.titleRowStacked]}>
              <Text style={[styles.title, fontScale >= 1.3 && styles.titleStacked]} accessibilityRole="header" testID="trip-title">
                {data.destination}
              </Text>
              <View style={styles.titleSide}>
                <PhaseChip start={data.start_date} end={data.end_date} today={today} notTaken={notTaken} />
                {room ? <RoomButton unread={room.unread_count} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(room.id) } })} /> : null}
              </View>
            </View>
            <Text style={styles.subtitle}>
              {/* On the trip, today's date (frame 31: "Sat 21 Nov · 2 travellers") */}
              {phase?.kind === 'on' ? f.time(dayDate(today, i18n.language)) : friendlyRange(data.start_date, data.end_date, i18n.language, today)} ·{' '}
              {t('plan.travellers', { count: data.num_travelers, n: f.n(data.num_travelers) })}
            </Text>
            {/* Today: from the Now card on today's tab, else here */}
            {todayOpen && !live ? (
              <PressableScale haptic="selection" onPress={openToday} style={styles.todayPill} accessibilityRole="button" testID="open-today">
                <MaterialCommunityIcons name="calendar-today" size={18} color={theme.colors.onAccent} />
                <Text style={styles.todayPillText}>{t('today.open')}</Text>
              </PressableScale>
            ) : null}
          </View>

          {/* After the trip (frame 33): "Your trip" with your rating, above the budget */}
          {recap ? <TripRecap tripId={tripId} numbers={recapNumbers(data, days)} /> : null}

          {budget.data ? <BudgetRow data={budget.data} onPress={() => router.push({ pathname: '/trip/budget/[id]', params: { id: tripId } })} /> : null}

          {/* "Put this trip on your map?" while it's unanswered, and with something to mark */}
          {after && mine && !notTaken && !data.visited_prompt && mapPlaces.length > 0 ? (
            <MapOffer places={mapPlaces} busy={marking.busyId === tripId} onMark={() => marking.mark(data)} onNotNow={() => marking.notNow(data)} />
          ) : null}

          {after && went ? (
            // One under the other at large text (each fits on a line there)
            <View style={[styles.afterActions, fontScale >= 1.3 && styles.afterActionsStacked]}>
              <PressableScale
                haptic="selection"
                onPress={() => setAgainOpen(true)}
                style={[styles.afterButton, styles.againButton]}
                accessibilityRole="button"
                testID="plan-again"
              >
                <Text style={styles.againText}>{t('after.again')}</Text>
              </PressableScale>
              {sendToFriend ? (
                <PressableScale haptic="selection" onPress={sendToFriend} style={[styles.afterButton, styles.sendButton]} accessibilityRole="button" testID="send-trip">
                  <Text style={styles.sendText}>{t('chat.share.sendToFriend')}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}

          {!hasPlan ? (
            <View style={styles.empty} testID="plan-empty">
              <Text style={styles.emptyTitle}>{after ? t('after.noPlan') : mine ? t('plan.buildTitle') : t('plan.notPlanned')}</Text>
              {canEdit && <Text style={styles.muted}>{t('plan.buildBody')}</Text>}
              {canEdit && (
                <Button
                  label={build.isPending ? t('plan.building') : t('plan.build')}
                  icon="map-marker-path"
                  loading={build.isPending}
                  onPress={() => build.mutate()}
                  testID="build-plan"
                />
              )}
            </View>
          ) : (
            day && (
              <>
                <DayTabs
                  days={days}
                  index={dayIndex}
                  conditions={conditions.data?.days}
                  today={phase?.kind === 'on' ? today : null}
                  onPick={(i) => {
                    setDayChoice(i);
                    setSelectedId(null);
                  }}
                />

                {(after ? [] : adviceForDay(advice.data?.suggestions, day.day_number)).map((s) => (
                  <StayAdviceCard
                    key={s.id}
                    suggestion={s}
                    destination={data.destination}
                    canAnswer={canEdit}
                    busy={adviceBusy?.id === s.id ? adviceBusy.key : null}
                    onSwitch={() => answerAdvice(s, 'switch')}
                    onNotNow={() => answerAdvice(s, 'notNow')}
                    onDismiss={() => answerAdvice(s, 'dismiss')}
                    onWhy={() => setWhyFor(s)}
                  />
                ))}

                {/* Today's tab on the trip: the Now card in place of the day's line and chips (frame 31) */}
                {live && liveState ? (
                  <NowCard
                    variant="plan"
                    view={liveView}
                    now={nowMin}
                    next={liveState.next}
                    leave={liveLeave}
                    back={
                      liveBack
                        ? {
                            at: liveBack.at,
                            minutes: liveBack.minutes,
                            place: baseName(day.end_base, t),
                            point: day.end_base?.latitude != null && day.end_base.longitude != null ? { lat: day.end_base.latitude, lon: day.end_base.longitude } : null,
                          }
                        : null
                    }
                    onToday={openToday}
                    testID="plan-now"
                  />
                ) : (
                  <>
                    <DayLine
                      title={daySummaryText(day.summary, t) ?? day.theme ?? null}
                      places={counts.places}
                      meals={counts.meals}
                      money={byDay ? { amount: byDay.amount, estimate: byDay.estimate } : null}
                      travellers={data.num_travelers}
                      // After the trip the road is in "Your trip" (frame 33: the day's places and meals, and its money)
                      roadMinutes={after ? 0 : day.total_travel_time}
                    />
                    {dayConditions && !after && dayWhen(dayConditions, today) !== 'past' && <ConditionChips day={dayConditions} onOpen={openConditions} />}
                  </>
                )}

                {after ? null : dayIndex === 0 && itinerary.data?.getting_there ? (
                  <GettingThere trip={itinerary.data.getting_there} tripId={tripId} />
                ) : dayIndex === 0 && itinerary.data ? (
                  // No start given (or no way found): said plainly, so the plan's times and costs aren't misread
                  <Text style={styles.dayStats} testID="getting-there-not-counted">
                    {t('plan.gettingThereNotCounted')}
                  </Text>
                ) : null}

                {canEdit &&
                  unplaced.map((u) => (
                    <UnplacedCard
                      key={u.place_id}
                      unplaced={u}
                      days={days.length}
                      busy={fixing === u.place_id}
                      onChoose={(rule) => fixMustSee(u, rule)}
                      testID={`unplaced-${u.place_id}`}
                    />
                  ))}

                {busy && (
                  <View style={styles.busy}>
                    <ActivityIndicator color={theme.colors.link} />
                    <Text style={styles.muted}>{t('plan.building')}</Text>
                  </View>
                )}

                {!after && dayProblems.length > 0 && (
                  <View style={styles.problems}>
                    <Text style={styles.problemsTitle}>{t('plan.needsAttention')}</Text>
                    {dayProblems.map((v, i) => (
                      <React.Fragment key={i}>
                        <View style={styles.problem}>
                          <MaterialCommunityIcons name="alert-outline" size={18} color={v.severity === 'hard' ? theme.colors.danger : theme.colors.warning} />
                          <Text style={styles.problemText}>{v.message}</Text>
                        </View>
                        {/* Back at the stay too late: a fresh plan for the day ends in time */}
                        {canEdit && v.code === 'BACK_LATE' ? (
                          <Button
                            variant="secondary"
                            icon="refresh"
                            label={t('stays.replanDay')}
                            disabled={busy}
                            onPress={() => regenerateDay.mutate(day.id)}
                            testID="replan-back-late"
                          />
                        ) : null}
                      </React.Fragment>
                    ))}
                  </View>
                )}

                {showHint ? (
                  <View style={styles.hint} testID="drag-hint">
                    <LineIcon name="grip" size={22} color={theme.colors.link} />
                    <View style={styles.hintText}>
                      <Text style={styles.hintTitle}>{t('plan.dragHintTitle')}</Text>
                      {days.length > 1 ? <Text style={styles.hintSub}>{t('plan.dragHintDays')}</Text> : null}
                    </View>
                    <PressableScale
                      pressEffect="opacity"
                      onPress={() => setHintClosed(true)}
                      style={styles.hintClose}
                      accessibilityRole="button"
                      accessibilityLabel={t('plan.dragHintClose')}
                      testID="drag-hint-close"
                    >
                      <LineIcon name="close" size={20} color={theme.colors.textSecondary} />
                    </PressableScale>
                  </View>
                ) : null}

                <View ref={attachRows} collapsable={false} style={styles.rows} testID="plan-rows">
                  {stopCount === 0 && <Text style={styles.muted}>{t('plan.emptyDay')}</Text>}
                  {/* Breakfast where you stay comes before leaving, dinner there after getting back */}
                  {after ? null : (
                  <View style={dragging ? styles.dimmed : undefined}>
                    {/* On the trip, a meal where you stay that's over is a "Done" row, and once you've left, "From …" goes */}
                    {stayMealsOf(day).breakfast && isDone(stayMealsOf(day).breakfast!) ? (
                      <DoneRow item={stayMealsOf(day).breakfast!} />
                    ) : (
                      <StayMealRow item={stayMealsOf(day).breakfast} />
                    )}
                    {stopCount > 0 && !stopRows.some((r) => isFixed(r.item)) && <BaseRow way="from" base={day.start_base} leg={day.start_leg} at={leaveAt(day)} />}
                  </View>
                  )}
                  {renderRows(day)}
                  {after ? null : (
                  <View style={dragging ? styles.dimmed : undefined}>
                    {stopCount > 0 && <BaseRow way="back" base={day.end_base} leg={day.return_leg} at={backAt(day)} />}
                    {stayMealsOf(day).dinner && isDone(stayMealsOf(day).dinner!) ? (
                      <DoneRow item={stayMealsOf(day).dinner!} />
                    ) : (
                      <StayMealRow item={stayMealsOf(day).dinner} />
                    )}
                  </View>
                  )}
                </View>

                {/* Where you sleep tonight; on the last day, where you leave from. After the trip, the plan is kept as it was */}
                {after ? (
                  <Text style={styles.keptNote} testID="plan-kept">
                    {went ? t('after.kept') : t('after.keptOnly')}
                  </Text>
                ) : (
                  <TonightRow
                    day={day}
                    lastDay={dayIndex === days.length - 1}
                    stay={mine ? stayForNight(stays.data?.stays, day.day_number) : null}
                    onChange={canEdit && days.length > 1 ? () => setPickingStays(true) : undefined}
                  />
                )}

                {canEdit && stopCount > 0 && (
                  <PressableScale
                    haptic="selection"
                    disabled={busy}
                    onPress={() => {
                      const stops = orderedStops(day);
                      const lastActivity = [...stops].reverse().find((i) => i.item_type === 'activity');
                      // At the end of the day, but before dinner when the day ends with it
                      const last = stops[stops.length - 1];
                      const beforeDinner = !!last && slotOf(last) === 'Dinner';
                      setAddTarget({ dayId: day.id, position: beforeDinner ? stops.length - 1 : stops.length, nearItemId: lastActivity?.id });
                    }}
                    style={[styles.addStop, busy && styles.disabled]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    testID="add-stop"
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={theme.colors.link} />
                    <Text style={styles.addStopText}>{t('plan.addStop')}</Text>
                  </PressableScale>
                )}

                {canEdit && (
                  <ChangePlan
                    dayNumber={day.day_number}
                    busy={busy}
                    onChange={(type) => adapt.mutate(type)}
                    onNewIdeas={() =>
                      confirm(t('plan.newIdeasTitle'), t('plan.newIdeasBody', { n: f.n(day.day_number) }), t('plan.newIdeasOk'), () => regenerateDay.mutate(day.id))
                    }
                  />
                )}
              </>
            )
          )}

          <AboutTrip
            trip={data}
            ownerId={data.user_id ?? me.data?.id}
            mine={mine}
            hasPlan={hasPlan}
            // "How was your trip?" here while it's on; after it, "Your trip" at the top has it (step 16)
            went={went && phase?.kind === 'on'}
            locked={after}
            stays={mine ? stays.data : null}
            room={room}
            onStays={canEdit && (stays.data?.nights ?? 0) > 0 ? () => setPickingStays(true) : undefined}
            onMeals={canEdit && day ? () => setMealsFor('trip') : undefined}
            note={hasPlan ? timesNote : null}
          />
        </BottomSheetScrollView>
      </BottomSheet>
      )}

      {/* The stop being dragged, over everything but the strip of days */}
      {draggedRow ? (
        <DragGhost item={draggedRow.item} n={draggedRow.n} kind={draggedRow.stopKind} x={drag.ghost.x} y={drag.ghost.y} width={drag.ghost.width} still={reduceMotion} />
      ) : null}
      {dragging && day && days.length > 1 && <DropStrip top={insets.top + 8} days={days} currentId={day.id} attach={drag.attachStrip} />}

      <StopSheet
        item={sheetItem}
        issues={sheetItem ? issuesForItem(report, sheetItem.id) : []}
        // A stop done today can't be changed any more, nor any stop once the trip is over
        editable={canEdit && !busy && !(sheetItem && isDone(sheetItem))}
        onClose={() => setSheetItem(null)}
        onExplain={setWhy}
        onSwap={setReplacing}
        onRemove={removeStop}
        days={days}
        currentDayId={day?.id}
        onSetDuration={setDuration}
        onSetPinned={setPinned}
        onMoveDay={(item, dayId) => {
          if (day) moveToDay(item, day, dayId);
        }}
        onSuggest={suggestPlace}
        n={sheetRow?.n}
        weather={sheetItem ? weatherFor(sheetItem) : null}
        travellers={data.num_travelers}
      />
      <AddStopSheet
        tripId={tripId}
        destination={data.destination}
        target={addTarget}
        center={addCenter}
        onClose={() => setAddTarget(null)}
        onAdd={addPlace}
      />
      <LegSheet tripId={tripId} itemId={legItem} onClose={() => setLegItem(null)} onPick={setTravelMode} />
      {mine && day ? (
        <MealsSheet
          visible={mealsFor != null}
          title={mealsFor === 'day' ? t('meals.dayTitle', { n: f.n(day.day_number) }) : t('meals.title')}
          plan={mealsFor === 'day' ? (day.meals ?? null) : (data.preference?.meals ?? null)}
          tripPlan={mealsFor === 'day' ? (data.preference?.meals ?? null) : undefined}
          currency={data.currency}
          askCost={mealsFor !== 'day'}
          stayBreakfast={mealsFor === 'trip' ? days.length > 1 : !(day.day_number === 1 && !!data.preference?.arrive_time)}
          stayDinner={mealsFor === 'trip' ? days.length > 1 : day.day_number < days.length}
          saving={saveMeals.isPending}
          onClose={() => setMealsFor(null)}
          onSave={(plan) => saveMeals.mutate({ scope: mealsFor ?? 'trip', plan, dayId: day.id })}
        />
      ) : null}
      <StayAdviceWhy suggestion={whyFor} destination={data.destination} onClose={() => setWhyFor(null)} />
      <PlacesToEatSheet
        tripId={tripId}
        item={eatFor}
        canPick={canEdit}
        busy={eatAt.isPending}
        onClose={() => setEatFor(null)}
        onPick={(restaurantId, name) => eatFor && eatAt.mutate({ itemId: eatFor.id, restaurantId, name })}
      />
      {mine && stays.data ? (
        <StaysSheet
          visible={pickingStays}
          nights={stays.data.nights}
          startDate={data.start_date}
          destination={destination}
          picks={picksFromStays(stays.data.stays, stays.data.nights)}
          allowAuto={false}
          saving={saveStays.isPending}
          onClose={() => setPickingStays(false)}
          onSave={pickStays}
        />
      ) : null}
      {why && <ExplanationSheet tripId={tripId} item={why} onClose={() => setWhy(null)} />}
      {replacing && (
        <AlternativesSheet
          tripId={tripId}
          item={replacing}
          onClose={() => setReplacing(null)}
          onReplaced={(msg) => {
            setReplacing(null);
            done(msg);
          }}
        />
      )}
      <ActionSheet visible={menuOpen} title={t('plan.menuTitle')} actions={actions} onClose={() => setMenuOpen(false)} />
      <PlanAgainSheet
        visible={againOpen}
        first={againDates(data, today)}
        busy={again.isPending}
        onClose={() => {
          setAgainOpen(false);
          const copy = madeCopy.current;
          madeCopy.current = null;
          if (copy) router.push({ pathname: '/trip/[id]', params: { id: copy.id } });
        }}
        onMake={(range) => again.mutate(range)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const sheetBg = t.scheme === 'dark' ? t.colors.bg : t.colors.surface;
  return {
    screen: { flex: 1, backgroundColor: t.colors.bg },
    center: { flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    errorText: { ...t.type.headline, color: t.colors.danger, textAlign: 'center' },
    muted: { ...t.type.callout, color: t.colors.textSecondary },
    showPlan: {
      position: 'absolute',
      alignSelf: 'center',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 22,
      borderRadius: 26,
      backgroundColor: t.colors.accentStrong,
      elevation: 6,
    },
    showPlanText: { ...t.type.headline, color: t.colors.onAccent },
    sheet: { backgroundColor: sheetBg, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
    handle: { backgroundColor: t.colors.textTertiary, width: 40 },
    sheetBody: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, gap: t.spacing.md },
    readOnly: { backgroundColor: t.colors.accentSoft, borderRadius: 14, padding: t.spacing.md },
    // After the trip (frame 33): "Plan it again" on the blue tint, "Send to a friend" on the inset; the note under the day
    afterActions: { flexDirection: 'row', gap: t.spacing.sm },
    afterActionsStacked: { flexDirection: 'column' },
    afterButton: { flexGrow: 1, flexBasis: 0, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.spacing.md },
    againButton: { backgroundColor: t.colors.accentTint },
    againText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccentSoft, textAlign: 'center' },
    sendButton: { backgroundColor: t.colors.surfaceInset },
    sendText: { fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary, textAlign: 'center' },
    keptNote: { fontSize: 13, lineHeight: 19, color: t.colors.textSecondary, paddingHorizontal: t.spacing.xs },
    readOnlyText: { ...t.type.callout, color: t.colors.textPrimary },
    // Frame 29: the name in Anek 28 with where the trip is beside it, then the dates and travellers
    header: { gap: 2, paddingHorizontal: t.spacing.xs },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    titleRowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
    title: { ...t.type.title, flex: 1, minWidth: 0, fontSize: 28, lineHeight: 32, color: t.colors.textPrimary },
    titleStacked: { flex: 0, alignSelf: 'stretch' },
    titleSide: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, flexShrink: 0 },
    subtitle: { fontSize: 14, color: t.colors.textSecondary },
    todayPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      marginTop: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: t.colors.accent,
    },
    todayPillText: { ...t.type.callout, fontSize: 14, fontWeight: '700', color: t.colors.onAccent },
    empty: { gap: t.spacing.md, paddingVertical: t.spacing.lg },
    emptyTitle: { ...t.type.title, color: t.colors.textPrimary },
    dayStats: { ...t.type.footnote, color: t.colors.textSecondary },
    busy: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    problems: { gap: 6, padding: t.spacing.md, borderRadius: 16, backgroundColor: t.colors.dangerBg },
    problemsTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textPrimary },
    problem: { flexDirection: 'row', gap: t.spacing.sm },
    problemText: { flex: 1, ...t.type.footnote, color: t.colors.textPrimary },
    rows: { gap: 2 },
    addStop: {
      minHeight: 50,
      borderRadius: 25,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.accentTint,
    },
    addStopText: { fontSize: 15.5, fontWeight: '500', color: t.colors.link },
    disabled: { opacity: 0.5 },
    dimmed: { opacity: 0.42 },
    hint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingLeft: t.spacing.md + 2,
      borderRadius: 18,
      backgroundColor: t.colors.accentTint,
    },
    hintText: { flex: 1, paddingVertical: t.spacing.md, gap: 2 },
    hintTitle: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
    hintSub: { ...t.type.footnote, color: t.colors.textSecondary },
    hintClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  };
});

/** Every leg between stops has its road line, or its boat crossing (the way from and back to the stay may be drawn straight) */
function routeComplete(route: { legs: { line: unknown; segments?: unknown; kind?: string }[] } | undefined): boolean {
  return !!route && route.legs.every((l) => l.kind || l.line || l.segments);
}
