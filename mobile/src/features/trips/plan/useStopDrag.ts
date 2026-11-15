/**
 * Drag and drop for the plan's stops (trip planner step 3; redrawn in docs/ui-refresh step 8).
 *
 * Press and hold a stop to lift it, then drag. A copy of the card follows the finger over everything
 * (the plan sheet, the map), so it stays in sight wherever it goes. Its place in the list stays as an
 * outline, a line shows where it would land with the time it would get, and near the top or bottom of
 * the plan the list scrolls. Dropping on a day in the strip at the top (DropStrip) moves it to that day.
 *
 * The rows' places are taken when the drag starts (the rows' layout inside the scroll content plus the
 * rows container's place on screen), so the landing line moving the rows doesn't move the target.
 */

import type { BottomSheetScrollViewMethods } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '../../../ui/haptics';

export type DragState = { itemId: number; from: number; to: number } | null;

/** The strip of days at the top, as the drag sees it (DropStrip) */
export type DropTarget = {
  /** The finger moved; true while it's on the strip (the list's own scrolling and landing line wait) */
  move: (x: number, y: number) => boolean;
  /** The day a release here would move the stop to, if any */
  dayAt: (x: number, y: number) => number | null;
  /** The finger left the strip */
  leave: () => void;
};

const EDGE = 72;
const MAX_STEP = 10;
const LONG_PRESS_MS = 350;
const WATCHDOG_MS = 8000;

export function useStopDrag({
  stopIds,
  enabled,
  screenHeight,
  sheetHeights,
  bottomInset,
  onLift,
  onReorder,
  onMoveToDay,
}: {
  /** Every stop of the day, in order */
  stopIds: number[];
  enabled: boolean;
  screenHeight: number;
  /** The sheet's heights at its two snap points */
  sheetHeights: [number, number];
  bottomInset: number;
  /** A stop was lifted */
  onLift?: () => void;
  onReorder: (itemId: number, to: number) => void;
  onMoveToDay: (itemId: number, dayId: number) => void;
}) {
  const [drag, setDrag] = useState<DragState>(null);
  // The copy that follows the finger: its place on screen and width
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostWidth = useSharedValue(0);
  const grab = useSharedValue({ x: 0, y: 0, left: 0 });
  const rows = useRef<Record<number, { y: number; height: number }>>({});
  const taken = useRef<Record<number, { y: number; height: number }>>({});
  const cardWidth = useRef(0);
  const rowsNode = useRef<View | null>(null);
  const scrollNode = useRef<BottomSheetScrollViewMethods | null>(null);
  const strip = useRef<DropTarget | null>(null);
  const rowsTop = useRef(0);
  const scrollY = useRef(0);
  const sheetIndex = useRef(0);
  const live = useRef({ startScroll: 0, fingerX: 0, fingerY: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<DragState>(null);
  const endedAt = useRef(0);
  // The latest props, for the gesture's JS handlers
  const latest = useRef({ stopIds, onLift, onReorder, onMoveToDay, screenHeight, sheetHeights, bottomInset });
  useEffect(() => {
    latest.current = { stopIds, onLift, onReorder, onMoveToDay, screenHeight, sheetHeights, bottomInset };
  });

  const lastEvent = useRef(0);
  const speed = useRef(2);
  const stopAutoScroll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopAutoScroll, []);

  /** Where the stop would land for a finger at `fingerY` (an index in the list without it). */
  const targetFor = (fingerY: number, itemId: number) => {
    const shift = scrollY.current - live.current.startScroll;
    let to = 0;
    for (const id of latest.current.stopIds) {
      if (id === itemId) continue;
      const r = taken.current[id];
      if (r && fingerY > rowsTop.current + r.y + r.height / 2 - shift) to += 1;
    }
    return to;
  };

  const updateRef = useRef<(fingerX: number, fingerY: number) => void>(() => {});
  useEffect(() => {
    updateRef.current = (fingerX, fingerY) => {
      const d = dragRef.current;
      if (!d) return;
      lastEvent.current = Date.now();
      live.current.fingerX = fingerX;
      live.current.fingerY = fingerY;
      // On the strip of days: the list stays as it is
      if (strip.current?.move(fingerX, fingerY)) {
        stopAutoScroll();
        if (d.to !== d.from) {
          dragRef.current = { ...d, to: d.from };
          setDrag(dragRef.current);
        }
        return;
      }
      const to = targetFor(fingerY, d.itemId);
      if (to !== d.to) {
        haptics.selection();
        dragRef.current = { ...d, to };
        setDrag(dragRef.current);
      }
      // Scroll the plan while the finger is near its top or bottom edge (not while it's on its way up to the strip)
      const { screenHeight: h, sheetHeights: [low, high], bottomInset: inset } = latest.current;
      const top = h - (sheetIndex.current === 1 ? high : low) + 40;
      const bottom = h - inset - 24;
      const dir = fingerY > bottom - EDGE ? 1 : fingerY < top + EDGE && fingerY > top - 2 * EDGE ? -1 : 0;
      if (!dir) {
        stopAutoScroll();
        return;
      }
      // Slow at the edge of the zone, faster the deeper the finger goes
      const depth = dir > 0 ? fingerY - (bottom - EDGE) : top + EDGE - fingerY;
      speed.current = Math.max(2, Math.round((Math.min(depth, EDGE) / EDGE) * MAX_STEP));
      if (timer.current) return;
      let lastY = -1;
      let stuck = 0;
      timer.current = setInterval(() => {
        // The real position comes back through onScroll; stop when it no longer changes (the end)
        const now = scrollY.current;
        stuck = now === lastY ? stuck + 1 : 0;
        lastY = now;
        if (stuck > 3 || (dir < 0 && now <= 0)) {
          stopAutoScroll();
          return;
        }
        scrollNode.current?.scrollTo({ y: Math.max(0, now + dir * speed.current), animated: false });
        updateRef.current(live.current.fingerX, live.current.fingerY);
      }, 16);
    };
  });

  const update = useCallback((fingerX: number, fingerY: number) => updateRef.current(fingerX, fingerY), []);

  const begin = useCallback(
    (itemId: number) => {
      const from = latest.current.stopIds.indexOf(itemId);
      if (from < 0) return;
      live.current = { startScroll: scrollY.current, fingerX: 0, fingerY: 0 };
      taken.current = { ...rows.current };
      ghostWidth.set(cardWidth.current);
      rowsNode.current?.measureInWindow((_x, y) => {
        rowsTop.current = y;
      });
      haptics.medium();
      lastEvent.current = Date.now();
      dragRef.current = { itemId, from, to: from };
      setDrag(dragRef.current);
      latest.current.onLift?.();
    },
    [ghostWidth],
  );

  const end = useCallback((x: number, y: number) => {
    stopAutoScroll();
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    endedAt.current = Date.now();
    if (!d) return;
    const dayId = strip.current?.dayAt(x, y) ?? null;
    if (dayId != null) {
      haptics.success();
      latest.current.onMoveToDay(d.itemId, dayId);
    } else if (d.to !== d.from) {
      haptics.success();
      latest.current.onReorder(d.itemId, d.to);
    }
  }, []);

  const cancel = useCallback(() => {
    if (!dragRef.current) return;
    stopAutoScroll();
    dragRef.current = null;
    setDrag(null);
  }, []);

  // Safety net: a drag whose gesture went quiet for a long time (lost by the system) is cancelled
  useEffect(() => {
    if (!drag) return;
    const id = setInterval(() => {
      if (Date.now() - lastEvent.current > WATCHDOG_MS) cancel();
    }, 1000);
    return () => clearInterval(id);
  }, [drag, cancel]);

  /** The gesture for one stop card: press and hold, then drag. The copy follows the finger on the UI thread. */
  const gestureFor = useCallback(
    (itemId: number): GestureType =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart((e) => {
          // Where the finger holds the card, so the copy stays under it
          grab.set({ x: e.x, y: e.y, left: e.absoluteX - e.x });
          ghostX.set(e.absoluteX - e.x);
          ghostY.set(e.absoluteY - e.y);
          scheduleOnRN(begin, itemId);
        })
        .onUpdate((e) => {
          const g = grab.get();
          ghostX.set(g.left + e.translationX);
          ghostY.set(e.absoluteY - g.y);
          scheduleOnRN(update, e.absoluteX, e.absoluteY);
        })
        .onEnd((e) => {
          scheduleOnRN(end, e.absoluteX, e.absoluteY);
        })
        .onFinalize((_e, success) => {
          if (!success) scheduleOnRN(cancel);
        }),
    [begin, cancel, enabled, end, ghostX, ghostY, grab, update],
  );

  /** The strip of days hands itself over while it's shown */
  const attachStrip = useCallback((target: DropTarget | null) => {
    strip.current = target;
  }, []);

  const handlers = useMemo(
    () => ({
      gestureFor,
      /** Callback ref for the rows container */
      attachRows: (node: View | null) => {
        rowsNode.current = node;
      },
      /** Callback ref for the plan's scroll view */
      attachScroll: (node: BottomSheetScrollViewMethods | null) => {
        scrollNode.current = node;
      },
      scrollTo: (y: number, animated = true) => {
        scrollNode.current?.scrollTo({ y: Math.max(0, y), animated });
      },
      /** Row layout inside the rows container (y, height) */
      setRow: (itemId: number, y: number, height: number) => {
        rows.current[itemId] = { y, height };
      },
      /** A stop card's width (the copy that follows the finger is as wide) */
      setCardWidth: (width: number) => {
        cardWidth.current = width;
      },
      onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      },
      onSheetChange: (index: number) => {
        sheetIndex.current = index;
      },
      /** True right after a drop, so the card's own tap doesn't open its details */
      justDropped: () => Date.now() - endedAt.current < 400,
    }),
    [gestureFor],
  );

  return { drag, ghost: { x: ghostX, y: ghostY, width: ghostWidth }, attachStrip, ...handlers };
}
