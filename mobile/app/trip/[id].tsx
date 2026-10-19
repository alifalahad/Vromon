/**
 * Vromon Mobile — the trip screen (trip planner step 2).
 *
 * One screen for the whole trip: the day's stops on a map, and the plan in a
 * sheet you pull up: day tabs, the day ribbon, stop cards with travel legs and
 * free time, ways to change the plan, and the trip's details (route,
 * preferences, photos, feedback). The rest (edit route, budget, rebuild,
 * duplicate, delete) is in the ⋯ menu. A friend's trip opens read-only.
 *
 * Every edit goes to the backend, which re-times the day and re-checks the trip;
 * the screen then refetches. Travel legs are still straight-line estimates.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlternativesSheet, ExplanationSheet } from '../../src/components/ItemSheets';
import { AddStopSheet, type AddTarget } from '../../src/features/trips/plan/AddStopSheet';
import { useMe } from '../../src/features/account/useMe';
import { addDays, localToday } from '../../src/features/trips/dates';
import { DayMap, type MapPin } from '../../src/features/trips/plan/DayMap';
import { DayRibbon } from '../../src/features/trips/plan/DayRibbon';
import { FreeRow, LegRow, StopCard } from '../../src/features/trips/plan/PlanRows';
import { ConditionChips } from '../../src/features/trips/conditions/ConditionChips';
import { isSerious, useConditionText } from '../../src/features/trips/conditions/useConditionText';
import { GettingThere } from '../../src/features/trips/plan/GettingThere';
import { LegSheet } from '../../src/features/trips/plan/LegSheet';
import { StopSheet } from '../../src/features/trips/plan/StopSheet';
import {
  dayParts,
  dayWindow,
  friendlyRange,
  fromMinutes,
  initialDayIndex,
  orderedStops,
  planRows,
  previewMove,
  dayRulesOf,
  ribbonSegments,
  stopCoord,
  stopTitle,
  toMinutes,
} from '../../src/features/trips/plan/timeline';
import { UnplacedCard } from '../../src/features/trips/new/UnplacedCard';
import { buildPlan } from '../../src/features/trips/plan/build';
import { takeFlash } from '../../src/features/trips/plan/flash';
import { TripDetails } from '../../src/features/trips/plan/TripDetails';
import { useDeferredRemoval } from '../../src/features/trips/plan/useDeferredRemoval';
import { useStopDrag } from '../../src/features/trips/plan/useStopDrag';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { daySummaryText } from '../../src/features/trips/plan/daySummary';
import { ApiError, tripsApi } from '../../src/services/api';
import type { AdaptationType, Itinerary, ItineraryDay, ItineraryItem, LegOptions, MustSee, Place, TravelMode, Unplaced, ValidationReport } from '../../src/types';
import { ActionSheet, type SheetAction } from '../../src/ui/ActionSheet';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { Snackbar } from '../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { useDevPerf } from '../../src/utils/devPerf';
import { confirm, notify } from '../../src/utils/dialogs';
import { issuesForItem } from '../../src/utils/itinerary';

const SNACK_MS = 5000;
const TAB_WIDTH = 96;
const TAB_GAP = 8;
const CHANGES: { type: AdaptationType; key: 'relax' | 'cheaper' | 'quieter' | 'fuller' }[] = [
  { type: 'relax', key: 'relax' },
  { type: 'reduce_budget', key: 'cheaper' },
  { type: 'avoid_crowds', key: 'quieter' },
  { type: 'energise', key: 'fuller' },
];

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function TripScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const me = useMe();
  const f = usePlanFormat();

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const itinerary = useQuery({ queryKey: ['itinerary', tripId], queryFn: () => tripsApi.getItinerary(tripId), enabled: !!tripId });
  const days = useMemo(() => itinerary.data?.days ?? [], [itinerary.data]);
  const hasPlan = days.length > 0;
  // Step 11: "opens in under a second from the cache", measured in development builds
  useDevPerf('trip screen', hasPlan, itinerary.isFetchedAfterMount === false);
  // On the trip, or the evening before it starts: Today mode
  const onTrip = hasPlan && !!trip.data && trip.data.start_date <= addDays(localToday(), 1) && trip.data.end_date >= localToday();
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: hasPlan });

  // A friend's trip is read-only; until the owner is known, nothing is editable
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const today = localToday();
  const openToday = () => router.push({ pathname: '/trip/today/[id]', params: { id: tripId } });

  const [dayChoice, setDayChoice] = useState<number | null>(null);
  const dayIndex = Math.min(dayChoice ?? initialDayIndex(days, today), Math.max(0, days.length - 1));
  const day: ItineraryDay | undefined = days[dayIndex];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetItem, setSheetItem] = useState<ItineraryItem | null>(null);
  const [why, setWhy] = useState<ItineraryItem | null>(null);
  const [replacing, setReplacing] = useState<ItineraryItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fitCount, setFitCount] = useState(0);
  const [snack, setSnack] = useState<{ message: string; undo?: () => void } | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [dropped, setDropped] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    queryClient.removeQueries({ queryKey: ['alternatives', tripId] });
    await Promise.all(
      [['itinerary', tripId], ['budget', tripId], ['trip', tripId], ['trips']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
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
      // Nothing may show the deleted trip again (Today mode may be under this screen)
      for (const key of ['trip', 'itinerary', 'budget', 'conditions']) queryClient.removeQueries({ queryKey: [key, tripId] });
      router.dismissTo('/trips');
    },
    onError: failed(t('plan.deleteFailed')),
  });
  const busy = build.isPending || adapt.isPending || regenerateDay.isPending;

  const rows = useMemo(() => (day ? planRows(day, removal.hidden) : []), [day, removal.hidden]);
  const pins = useMemo<MapPin[]>(
    () =>
      rows.flatMap((r) => {
        if (r.kind !== 'stop') return [];
        const coord = stopCoord(r.item);
        return coord ? [{ id: r.item.id, n: r.n, kind: r.stopKind, coord, title: stopTitle(r.item) }] : [];
      }),
    [rows],
  );
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
  const [refreshingConditions, setRefreshingConditions] = useState(false);
  const refreshConditions = async () => {
    setRefreshingConditions(true);
    try {
      queryClient.setQueryData(['conditions', tripId], await tripsApi.conditions(tripId, true));
    } catch {
      setSnack({ message: t('conditions.refreshFailed') });
    } finally {
      setRefreshingConditions(false);
    }
  };

  // Road lines for the map, a day at a time (kept on the server); legs without one are drawn straight
  const stopOrder = pins.map((p) => p.id).join(',');
  const route = useQuery({
    queryKey: ['dayRoute', tripId, day?.id, stopOrder],
    queryFn: () => tripsApi.dayRoute(tripId, day!.id),
    enabled: !!day && pins.length > 1,
    staleTime: Infinity,
  });
  const roadLines = useMemo(
    () => Object.fromEntries((route.data?.legs ?? []).flatMap((l) => (l.line ? [[`${l.from_item_id}>${l.to_item_id}`, l.line]] : []))),
    [route.data],
  );

  // Sheet: about half the screen over the map, or pulled up to just below the buttons
  const sheetLow = Math.round(height * 0.46);
  const sheetHigh = height - insets.top - 72;
  const snapPoints = useMemo(() => [sheetLow, sheetHigh], [sheetLow, sheetHigh]);
  const sheet = useRef<BottomSheet>(null);
  const rowsTop = useRef(0);
  const rowY = useRef<Record<number, number>>({});

  const scrollToStop = (itemId: number) => {
    const y = rowY.current[itemId];
    if (y != null) drag.scrollTo(rowsTop.current + y - 12);
  };
  // A pin opens that stop's details over the map (the list can't scroll while the sheet is half open)
  const pickFromMap = (itemId: number) => {
    const row = rows.find((r) => r.kind === 'stop' && r.item.id === itemId);
    if (row?.kind !== 'stop') return;
    haptics.selection();
    setSelectedId(itemId);
    setSheetItem(row.item);
  };
  // The ribbon pulls the plan up and scrolls to the stop at that time
  const pickTime = (minutes: number) => {
    const stops = rows.filter((r) => r.kind === 'stop');
    const hit =
      stops.find((r) => toMinutes(r.item.start_time) <= minutes && minutes < toMinutes(r.item.end_time)) ??
      [...stops].sort((a, b) => Math.abs(toMinutes(a.item.start_time) - minutes) - Math.abs(toMinutes(b.item.start_time) - minutes))[0];
    if (hit?.kind !== 'stop') return;
    haptics.selection();
    setSelectedId(hit.item.id);
    sheet.current?.snapToIndex(1);
    setTimeout(() => scrollToStop(hit.item.id), 350);
  };
  // The snackbar sits in the sheet's footer so its Undo button gets taps
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <Snackbar inline message={snack?.message ?? null} actionLabel={snack?.undo ? t('plan.undo') : undefined} onAction={snack?.undo} testID="trip-snackbar" />
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
    for (const queryKey of [['budget', tripId], ['trip', tripId], ['trips']]) queryClient.invalidateQueries({ queryKey });
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
      putDays(await tripsApi.reorderDay(tripId, d.id, preview.map((i) => i.id)));
      setSnack({
        message: t('plan.movedStop', { name: stopTitle(before[from]) }),
        undo: () => {
          setSnack(null);
          restoreOrder(d.id, before.map((i) => i.id));
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
  const setPinned = async (item: ItineraryItem, pinned: boolean) => {
    try {
      putDays(await tripsApi.updateItem(tripId, item.id, { pinned }));
      setSnack({ message: t(pinned ? 'plan.pinnedOn' : 'plan.pinnedOff', { name: stopTitle(item) }) });
    } catch (e) {
      notify(t('plan.saveFailed'), errorText(e), 'error');
    }
  };
  const addPlace = async (place: Place, target: AddTarget) => {
    try {
      const res = await tripsApi.addItem(tripId, target.dayId, place.id, target.position);
      putDays(res);
      const added = res.day.items.find((i) => i.place_id === place.id);
      setSnack({
        message: t('plan.addedStop', { name: place.name }),
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
      notify(t('plan.addFailed'), errorText(e), 'error');
    }
  };

  const stopIds = useMemo(() => rows.flatMap((r) => (r.kind === 'stop' ? [r.item.id] : [])), [rows]);
  const drag = useStopDrag({
    stopIds,
    enabled: mine && !busy,
    screenHeight: height,
    sheetHeights: [sheetLow, sheetHigh],
    bottomInset: insets.bottom,
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
      !(v.code === 'MUST_VISIT_MISSING' && mine && unplaced.length > 0),
  );
  const stopCount = rows.filter((r) => r.kind === 'stop').length;
  const hasLegs = rows.some((r) => r.kind === 'leg');
  const window = day ? dayWindow(day, data.preference?.preferred_start_time, data.preference?.preferred_end_time) : null;
  const used = budget.data && budget.data.total_budget > 0 ? budget.data.estimated_total / budget.data.total_budget : null;

  // The day's rows; while a stop is dragged, a line shows where it would land and the times preview the change
  function renderRows(d: ItineraryDay) {
    const stops = orderedStops(d, removal.hidden);
    const out: React.ReactNode[] = [];
    const line = (key: string) => <View key={key} style={styles.dropLine} testID="drop-line" />;
    let seen = 0;
    for (const r of rows) {
      if (r.kind === 'leg') {
        out.push(
          <LegRow
            key={r.key}
            minutes={r.minutes}
            km={r.km}
            mode={r.mode}
            fare={r.fare}
            note={
              dayConditions?.legs[String(r.itemId)]
                ? t('conditions.slowLeg', {
                    from: f.time(dayConditions.legs[String(r.itemId)].from),
                    to: f.time(dayConditions.legs[String(r.itemId)].to),
                    extra: f.n(dayConditions.legs[String(r.itemId)].extra),
                  })
                : undefined
            }
            onPress={mine && !busy ? () => setLegItem(r.itemId) : undefined}
          />,
        );
        continue;
      }
      if (r.kind === 'free') {
        const before = stops.findIndex((i) => `f${i.id}` === r.key);
        out.push(
          <FreeRow
            key={r.key}
            start={r.start}
            minutes={r.minutes}
            onAdd={
              mine && !busy && before >= 0
                ? () => setAddTarget({ dayId: d.id, position: before + 1, nearItemId: stops[before].id })
                : undefined
            }
          />,
        );
        continue;
      }
      const item = r.item;
      const index = stops.findIndex((i) => i.id === item.id);
      const isDragged = dragging?.itemId === item.id;
      if (dragging && !isDragged && dragging.to !== dragging.from && seen === dragging.to) out.push(line(`line-${r.key}`));
      if (!isDragged) seen += 1;
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
          removable={mine && item.item_type === 'activity' && !busy}
          onLayoutRow={(y, h) => {
            rowY.current[item.id] = y;
            drag.setRow(item.id, y, h);
          }}
          drag={mine && !busy && !item.pinned ? gestures[item.id] : undefined}
          dragging={isDragged}
          translateY={drag.translateY}
          previewStart={previewStarts?.[item.id]}
          glide={dropped !== item.id && !isDragged}
          move={
            mine && !busy
              ? {
                  earlier: index > 0 ? () => reorder(d, item.id, index - 1) : undefined,
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
        />,
      );
    }
    if (dragging && dragging.to !== dragging.from && seen === dragging.to) out.push(line('line-end'));
    return out;
  }

  const actions: SheetAction[] = [];
  if (onTrip) actions.push({ key: 'today', label: t('today.open'), icon: 'calendar-today', onPress: openToday });
  if (mine) {
    actions.push({ key: 'route', label: t('trips.editRoute'), icon: 'map-marker-path', onPress: () => router.push({ pathname: '/trip/route/[id]', params: { id: tripId } }) });
    if (hasPlan) {
      actions.push({ key: 'budget', label: t('plan.budget'), icon: 'wallet-outline', onPress: () => router.push({ pathname: '/trip/budget/[id]', params: { id: tripId } }) });
      actions.push({
        key: 'rebuild',
        label: t('plan.rebuild'),
        icon: 'refresh',
        onPress: () => confirm(t('plan.rebuildTitle'), t('plan.rebuildBody'), t('plan.rebuildOk'), () => build.mutate()),
      });
    }
    actions.push({ key: 'duplicate', label: t('plan.duplicate'), icon: 'content-copy', onPress: () => duplicate.mutate() });
    actions.push({
      key: 'delete',
      label: t('plan.deleteTrip'),
      icon: 'trash-can-outline',
      danger: true,
      onPress: () => confirm(t('plan.deleteTitle'), t('plan.deleteBody'), t('plan.deleteOk'), () => remove.mutate(), true),
    });
  }

  return (
    <View style={styles.screen}>
      <DayMap
        pins={pins}
        selectedId={selectedId}
        onSelect={pickFromMap}
        fitKey={`${day?.id ?? 'none'}-${fitCount}`}
        roadLines={roadLines}
        topPadding={insets.top + 56}
        bottomPadding={sheetLow}
        accessibilityLabel={t('plan.mapLabel', { n: f.n(day?.day_number ?? 1) })}
      />

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} testID="trip-back" />
        {conditions.data?.fetched_at ? (
          <View style={styles.updatedPill}>
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={openConditions}
              style={styles.updatedOpen}
              accessibilityRole="button"
              accessibilityLabel={`${t('conditions.title')}: ${t('conditions.updated', { age: conditionText.age(conditions.data.fetched_at) })}`}
              testID="conditions-pill"
            >
              <View style={[styles.liveDot, conditions.data.stale && styles.staleDot]} />
              <Text style={styles.updatedText} numberOfLines={1}>
                {conditions.data.stale ? t('conditions.offlinePill', { age: conditionText.age(conditions.data.fetched_at) }) : t('conditions.updated', { age: conditionText.age(conditions.data.fetched_at) })}
              </Text>
            </PressableScale>
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={refreshConditions}
              disabled={refreshingConditions}
              style={styles.updatedRefresh}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('conditions.refresh')}
              accessibilityState={{ busy: refreshingConditions }}
              testID="conditions-refresh-pill"
            >
              {refreshingConditions ? (
                <ActivityIndicator size="small" color={theme.colors.link} />
              ) : (
                <MaterialCommunityIcons name="refresh" size={20} color={theme.colors.link} />
              )}
            </PressableScale>
          </View>
        ) : null}
        <View style={styles.topRight} pointerEvents="box-none">
          {pins.length > 1 && <RoundButton icon="arrow-expand-all" label={t('plan.showDay')} onPress={() => setFitCount((c) => c + 1)} testID="trip-fit" />}
          {mine && <RoundButton icon="dots-vertical" label={t('plan.more')} onPress={() => setMenuOpen(true)} testID="trip-menu" />}
        </View>
      </View>

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
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header" testID="trip-title">
                {data.destination}
              </Text>
              <Text style={styles.subtitle}>
                {friendlyRange(data.start_date, data.end_date, i18n.language, today)} · {t('plan.travellers', { count: data.num_travelers, n: f.n(data.num_travelers) })}
              </Text>
              {onTrip ? (
                <PressableScale
                  haptic="selection"
                  onPress={openToday}
                  style={styles.todayPill}
                  accessibilityRole="button"
                  testID="open-today"
                >
                  <MaterialCommunityIcons name="calendar-today" size={18} color={theme.colors.onAccent} />
                  <Text style={styles.todayPillText}>{t('today.open')}</Text>
                </PressableScale>
              ) : null}
            </View>
            {budget.data && used != null && (
              <PressableScale
                pressEffect="opacity"
                onPress={() => router.push({ pathname: '/trip/budget/[id]', params: { id: tripId } })}
                accessibilityLabel={t('plan.budgetA11y', { spent: f.money(budget.data.estimated_total), total: f.money(budget.data.total_budget) })}
                style={styles.budget}
                testID="trip-budget"
              >
                <Text style={styles.budgetText} maxFontSizeMultiplier={1.4}>
                  {f.money(budget.data.estimated_total)} <Text style={styles.budgetOf}>/ {f.money(budget.data.total_budget)}</Text>
                </Text>
                <View style={styles.meter}>
                  <View
                    style={[
                      styles.meterFill,
                      {
                        width: `${Math.round(Math.min(1, used) * 100)}%`,
                        // Amber before it goes over (within 10%, or the estimates could take it over)
                        backgroundColor:
                          budget.data.status === 'over' || used > 1
                            ? theme.colors.danger
                            : budget.data.status === 'close' || used >= 0.9
                              ? theme.colors.warning
                              : theme.colors.success,
                      },
                    ]}
                  />
                </View>
              </PressableScale>
            )}
          </View>

          {!hasPlan ? (
            <View style={styles.empty} testID="plan-empty">
              <Text style={styles.emptyTitle}>{mine ? t('plan.buildTitle') : t('plan.notPlanned')}</Text>
              {mine && <Text style={styles.muted}>{t('plan.buildBody')}</Text>}
              {mine && (
                <Button label={build.isPending ? t('plan.building') : t('plan.build')} icon="map-marker-path" loading={build.isPending} onPress={() => build.mutate()} testID="build-plan" />
              )}
            </View>
          ) : (
            day && (
              <>
                <DayTabs days={days} index={dayIndex} locale={i18n.language} onPick={(i) => { setDayChoice(i); setSelectedId(null); }} />

                <View style={styles.daySummary}>
                  {(daySummaryText(day.summary, t) ?? day.theme) ? (
                    <Text style={styles.dayTheme} testID="day-summary">
                      {daySummaryText(day.summary, t) ?? day.theme}
                    </Text>
                  ) : null}
                  <Text style={styles.dayStats} testID="day-stats">
                    {[
                      t('plan.stops', { count: stopCount, n: f.n(stopCount) }),
                      day.total_cost ? t('plan.perPerson', { amount: f.money(day.total_cost) }) : null,
                      day.total_travel_time > 0 ? t('plan.travelAbout', { time: f.duration(day.total_travel_time) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>

                {dayConditions && <ConditionChips day={dayConditions} onOpen={openConditions} />}

                {window && stopCount > 0 && (
                  <DayRibbon
                    segments={ribbonSegments(day, removal.hidden)}
                    window={window}
                    onPickTime={pickTime}
                    accessibilityLabel={`${t('plan.day', { n: f.n(day.day_number) })}, ${f.time(fromMinutes(window.start))}–${f.time(fromMinutes(window.end))}: ${t('plan.stops', { count: stopCount, n: f.n(stopCount) })}`}
                  />
                )}

                {dayIndex === 0 && itinerary.data?.getting_there ? <GettingThere trip={itinerary.data.getting_there} /> : null}

                {mine &&
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

                {dayProblems.length > 0 && (
                  <View style={styles.problems}>
                    <Text style={styles.problemsTitle}>{t('plan.needsAttention')}</Text>
                    {dayProblems.map((v, i) => (
                      <View key={i} style={styles.problem}>
                        <MaterialCommunityIcons name="alert-outline" size={18} color={v.severity === 'hard' ? theme.colors.danger : theme.colors.warning} />
                        <Text style={styles.problemText}>{v.message}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View
                  ref={attachRows}
                  collapsable={false}
                  onLayout={(e) => (rowsTop.current = e.nativeEvent.layout.y)}
                  style={styles.rows}
                  testID="plan-rows"
                >
                  {stopCount === 0 && <Text style={styles.muted}>{t('plan.emptyDay')}</Text>}
                  {renderRows(day)}
                </View>
                {mine && stopCount > 0 && (
                  <Button
                    variant="secondary"
                    icon="plus"
                    label={t('plan.addStop')}
                    disabled={busy}
                    onPress={() => {
                      const stops = orderedStops(day);
                      const lastActivity = [...stops].reverse().find((i) => i.item_type === 'activity');
                      // At the end of the day, but before dinner when the day ends with it
                      const last = stops[stops.length - 1];
                      const beforeDinner = last?.item_type === 'meal' && last.title.startsWith('Dinner');
                      setAddTarget({ dayId: day.id, position: beforeDinner ? stops.length - 1 : stops.length, nearItemId: lastActivity?.id });
                    }}
                    testID="add-stop"
                  />
                )}
                {hasLegs && <Text style={styles.note}>{t('plan.straightLine')}</Text>}

                {mine && (
                  <View style={styles.change}>
                    <Text style={styles.changeTitle}>{t('plan.changeAll')}</Text>
                    <Text style={styles.note}>{t('plan.changeAllHint')}</Text>
                    <View style={styles.chips}>
                      {CHANGES.map((c) => (
                        <PressableScale
                          key={c.type}
                          haptic="medium"
                          disabled={busy}
                          onPress={() => adapt.mutate(c.type)}
                          style={[styles.chip, busy && styles.disabled]}
                          testID={`change-${c.type}`}
                        >
                          <Text style={styles.chipText}>{t(`plan.${c.key}`)}</Text>
                        </PressableScale>
                      ))}
                    </View>
                    <Button
                      variant="secondary"
                      icon="lightbulb-on-outline"
                      label={t('plan.newIdeas')}
                      disabled={busy}
                      onPress={() =>
                        confirm(t('plan.newIdeasTitle'), t('plan.newIdeasBody', { n: f.n(day.day_number) }), t('plan.newIdeasOk'), () => regenerateDay.mutate(day.id))
                      }
                      testID="new-ideas"
                    />
                  </View>
                )}
              </>
            )
          )}

          <TripDetails trip={data} ownerId={data.user_id ?? me.data?.id} mine={mine} hasPlan={hasPlan} />
        </BottomSheetScrollView>
      </BottomSheet>

      {dragging && days.length > 1 && (
        <View pointerEvents="none" style={[styles.dropBar, { top: insets.top + 8 }]} testID="drop-days">
          <Text style={styles.dropBarText}>{t('plan.dropOnDay')}</Text>
          <View style={styles.dropChips}>
            {days
              .filter((x) => x.id !== day?.id)
              .map((x) => (
                <DropChip key={x.id} label={t('plan.day', { n: f.n(x.day_number) })} onRect={(r) => drag.setChip(x.id, r)} />
              ))}
          </View>
        </View>
      )}

      <StopSheet
        item={sheetItem}
        issues={sheetItem ? issuesForItem(report, sheetItem.id) : []}
        editable={mine && !busy}
        onClose={() => setSheetItem(null)}
        onExplain={setWhy}
        onSwap={setReplacing}
        onRemove={removeStop}
        otherDays={days.filter((x) => x.id !== day?.id)}
        onSetDuration={setDuration}
        onSetPinned={setPinned}
        onMoveDay={(item, dayId) => {
          if (day) moveToDay(item, day, dayId);
        }}
      />
      <AddStopSheet tripId={tripId} destination={data.destination} target={addTarget} onClose={() => setAddTarget(null)} onAdd={addPlace} />
      <LegSheet tripId={tripId} itemId={legItem} onClose={() => setLegItem(null)} onPick={setTravelMode} />
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
    </View>
  );
}

function DayTabs({ days, index, locale, onPick }: { days: ItineraryDay[]; index: number; locale: string; onPick: (i: number) => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const scrollable = days.length > 3;
  // The chosen day stays in view (also when it's picked from elsewhere)
  const strip = useRef<GHScrollView>(null);
  useEffect(() => {
    if (scrollable) strip.current?.scrollTo({ x: Math.max(0, index * (TAB_WIDTH + TAB_GAP) - TAB_WIDTH), animated: true });
  }, [index, scrollable]);
  const tabs = days.map((d, i) => {
    const on = i === index;
    const parts = d.day_date ? dayParts(d.day_date, locale) : null;
    return (
      <PressableScale
        key={d.id}
        haptic="selection"
        onPress={() => onPick(i)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={[styles.tab, scrollable ? styles.tabFixed : styles.tabFlex, on && styles.tabOn]}
        testID={`day-tab-${d.day_number}`}
      >
        <Text style={[styles.tabTitle, on && styles.tabTextOn]} maxFontSizeMultiplier={1.4}>
          {t('plan.day', { n: f.n(d.day_number) })}
        </Text>
        {parts ? (
          <Text style={[styles.tabSub, on && styles.tabTextOn]} maxFontSizeMultiplier={1.4}>
            {parts.weekday} {parts.day}
          </Text>
        ) : null}
      </PressableScale>
    );
  });
  // The gesture handler's scroll view: inside the plan sheet, a plain one loses the sideways swipe to the sheet
  return scrollable ? (
    <GHScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist" testID="day-tabs">
      {tabs}
    </GHScrollView>
  ) : (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs}
    </View>
  );
}

/** A day chip in the drop bar; reports where it is on screen so a drop can be matched to it */
function DropChip({ label, onRect }: { label: string; onRect: (r: { x: number; y: number; width: number; height: number } | null) => void }) {
  const styles = useStyles();
  const ref = useRef<View>(null);
  const report = useRef(onRect);
  useEffect(() => {
    report.current = onRect;
  });
  useEffect(() => () => report.current(null), []);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={styles.dropChip}
      onLayout={() => ref.current?.measureInWindow((x, y, width, height) => report.current({ x, y, width, height }))}
    >
      <Text style={styles.dropChipText}>{label}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={styles.round} testID={testID}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.textPrimary} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => {
  const sheetBg = t.scheme === 'dark' ? t.colors.bg : t.colors.surface;
  return {
    screen: { flex: 1, backgroundColor: t.colors.bg },
    center: { flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    errorText: { ...t.type.headline, color: t.colors.danger, textAlign: 'center' },
    muted: { ...t.type.callout, color: t.colors.textSecondary },
    note: { ...t.type.footnote, color: t.colors.textTertiary, marginTop: t.spacing.sm },
    topBar: { position: 'absolute', left: t.spacing.md, right: t.spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    updatedOpen: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, height: 36 },
    updatedRefresh: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    updatedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingLeft: 12,
      paddingRight: 4,
      borderRadius: 999,
      backgroundColor: t.colors.surface,
      shadowColor: t.colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      flexShrink: 1,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.success },
    staleDot: { backgroundColor: t.colors.warning },
    updatedText: { ...t.type.footnote, color: t.colors.textSecondary },
    topRight: { flexDirection: 'row', gap: t.spacing.sm },
    round: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surface,
      shadowColor: t.colors.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    sheet: { backgroundColor: sheetBg, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
    handle: { backgroundColor: t.colors.textTertiary, width: 40 },
    sheetBody: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, gap: t.spacing.md },
    readOnly: { backgroundColor: t.colors.accentSoft, borderRadius: 14, padding: t.spacing.md },
    readOnlyText: { ...t.type.callout, color: t.colors.textPrimary },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md, paddingHorizontal: t.spacing.xs },
    headerText: { flex: 1, minWidth: 0, gap: 2 },
    title: { fontSize: 24, fontWeight: '700', color: t.colors.textPrimary },
    subtitle: { ...t.type.callout, color: t.colors.textSecondary },
    budget: { alignItems: 'flex-end', gap: 6, paddingTop: 4, minHeight: 48, justifyContent: 'center' },
    todayPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.colors.accent },
    todayPillText: { ...t.type.callout, fontSize: 14, fontWeight: '700', color: t.colors.onAccent },
    budgetText: { fontSize: 14, fontWeight: '700', color: t.colors.textPrimary },
    budgetOf: { fontWeight: '400', color: t.colors.textSecondary },
    meter: { width: 110, height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceInset, overflow: 'hidden' },
    meterFill: { height: 6, borderRadius: 3 },
    empty: { gap: t.spacing.md, paddingVertical: t.spacing.lg },
    emptyTitle: { ...t.type.title, color: t.colors.textPrimary },
    tabs: { flexDirection: 'row', gap: TAB_GAP },
    tab: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.spacing.sm, backgroundColor: t.colors.surfaceInset },
    tabFlex: { flex: 1 },
    tabFixed: { width: TAB_WIDTH },
    tabOn: { backgroundColor: t.colors.accent },
    tabTitle: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
    tabSub: { fontSize: 12, color: t.colors.textSecondary },
    tabTextOn: { color: t.colors.onAccent },
    daySummary: { gap: 2, paddingHorizontal: t.spacing.xs },
    dayTheme: { ...t.type.headline, color: t.colors.textPrimary },
    dayStats: { ...t.type.footnote, color: t.colors.textSecondary },
    busy: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    problems: { gap: 6, padding: t.spacing.md, borderRadius: 16, backgroundColor: t.colors.dangerBg },
    problemsTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textPrimary },
    problem: { flexDirection: 'row', gap: t.spacing.sm },
    problemText: { flex: 1, ...t.type.footnote, color: t.colors.textPrimary },
    rows: { gap: 0 },
    change: { gap: t.spacing.sm, marginTop: t.spacing.lg },
    changeTitle: { ...t.type.headline, color: t.colors.textPrimary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginVertical: t.spacing.xs },
    chip: { minHeight: 44, paddingHorizontal: t.spacing.lg, borderRadius: 999, justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
    chipText: { ...t.type.callout, color: t.colors.textPrimary },
    disabled: { opacity: 0.5 },
    dropLine: { height: 4, borderRadius: 2, marginLeft: 62, marginVertical: 2, backgroundColor: t.colors.accent },
    dropBar: {
      position: 'absolute',
      left: t.spacing.md,
      right: t.spacing.md,
      padding: t.spacing.md,
      gap: t.spacing.sm,
      borderRadius: 20,
      backgroundColor: t.colors.surface,
      shadowColor: t.colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 24,
      zIndex: 50,
    },
    dropBarText: { ...t.type.footnote, color: t.colors.textSecondary, textAlign: 'center' },
    dropChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: t.spacing.sm },
    dropChip: { minHeight: 52, minWidth: 96, paddingHorizontal: t.spacing.lg, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    dropChipText: { fontSize: 15, fontWeight: '700', color: t.colors.link },
  };
});
