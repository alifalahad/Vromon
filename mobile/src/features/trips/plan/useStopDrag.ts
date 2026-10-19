/**
 * Drag and drop for the plan's stops (trip planner step 3).
 *
 * Press and hold a stop to lift it, then drag: the card follows the finger, a
 * line shows where it will land, and the times preview the new order. Near the
 * top or bottom of the plan the list scrolls. Dropping on another day's chip
 * (shown while dragging) moves the stop to that day.
 *
 * Positions come from the rows' layout inside the scroll content plus the rows
 * container's place on screen, measured when the drag starts.
 */

import type { BottomSheetScrollViewMethods } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '../../../ui/haptics';

type Rect = { x: number; y: number; width: number; height: number };

export type DragState = { itemId: number; from: number; to: number } | null;

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
  onReorder: (itemId: number, to: number) => void;
  onMoveToDay: (itemId: number, dayId: number) => void;
}) {
  const [drag, setDrag] = useState<DragState>(null);
  const translateY = useSharedValue(0);
  const rows = useRef<Record<number, { y: number; height: number }>>({});
  const rowsNode = useRef<View | null>(null);
  const scrollNode = useRef<BottomSheetScrollViewMethods | null>(null);
  const rowsTop = useRef(0);
  const chips = useRef<Record<number, Rect>>({});
  const scrollY = useRef(0);
  const sheetIndex = useRef(0);
  const live = useRef({ startScroll: 0, fingerY: 0, translation: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<DragState>(null);
  const endedAt = useRef(0);
  // The latest props, for the gesture's JS handlers
  const latest = useRef({ stopIds, onReorder, onMoveToDay, screenHeight, sheetHeights, bottomInset });
  useEffect(() => {
    latest.current = { stopIds, onReorder, onMoveToDay, screenHeight, sheetHeights, bottomInset };
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
      const r = rows.current[id];
      if (r && fingerY > rowsTop.current + r.y + r.height / 2 - shift) to += 1;
    }
    return to;
  };

  const updateRef = useRef<(fingerY: number, translation: number) => void>(() => {});
  useEffect(() => {
    updateRef.current = (fingerY, translation) => {
      const d = dragRef.current;
      if (!d) return;
      lastEvent.current = Date.now();
      live.current.fingerY = fingerY;
      live.current.translation = translation;
      translateY.set(translation + (scrollY.current - live.current.startScroll));
      const to = targetFor(fingerY, d.itemId);
      if (to !== d.to) {
        haptics.selection();
        dragRef.current = { ...d, to };
        setDrag(dragRef.current);
      }
      // Scroll the plan while the finger is near its top or bottom edge
      const { screenHeight: h, sheetHeights: [low, high], bottomInset: inset } = latest.current;
      const top = h - (sheetIndex.current === 1 ? high : low) + 40;
      const bottom = h - inset - 24;
      const dir = fingerY > bottom - EDGE ? 1 : fingerY < top + EDGE ? -1 : 0;
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
        updateRef.current(live.current.fingerY, live.current.translation);
      }, 16);
    };
  });

  const update = useCallback((fingerY: number, translation: number) => updateRef.current(fingerY, translation), []);

  const begin = useCallback(
    (itemId: number) => {
      const from = latest.current.stopIds.indexOf(itemId);
      if (from < 0) return;
      live.current = { startScroll: scrollY.current, fingerY: 0, translation: 0 };
      translateY.set(0);
      rowsNode.current?.measureInWindow((_x, y) => {
        rowsTop.current = y;
      });
      haptics.medium();
      lastEvent.current = Date.now();
      dragRef.current = { itemId, from, to: from };
      setDrag(dragRef.current);
    },
    [translateY],
  );

  const end = useCallback(
    (x: number, y: number) => {
      stopAutoScroll();
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      translateY.set(0);
      endedAt.current = Date.now();
      if (!d) return;
      const day = Object.entries(chips.current).find(([, r]) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
      if (day) {
        haptics.success();
        latest.current.onMoveToDay(d.itemId, Number(day[0]));
      } else if (d.to !== d.from) {
        haptics.success();
        latest.current.onReorder(d.itemId, d.to);
      }
    },
    [translateY],
  );

  const cancel = useCallback(() => {
    if (!dragRef.current) return;
    stopAutoScroll();
    dragRef.current = null;
    setDrag(null);
    translateY.set(0);
  }, [translateY]);

  // Safety net: a drag whose gesture went quiet for a long time (lost by the system) is cancelled
  useEffect(() => {
    if (!drag) return;
    const id = setInterval(() => {
      if (Date.now() - lastEvent.current > WATCHDOG_MS) cancel();
    }, 1000);
    return () => clearInterval(id);
  }, [drag, cancel]);

  /** The gesture for one stop card: press and hold, then drag. */
  const gestureFor = useCallback(
    (itemId: number): GestureType =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          scheduleOnRN(begin, itemId);
        })
        .onUpdate((e) => {
          scheduleOnRN(update, e.absoluteY, e.translationY);
        })
        .onEnd((e) => {
          scheduleOnRN(end, e.absoluteX, e.absoluteY);
        })
        .onFinalize((_e, success) => {
          if (!success) scheduleOnRN(cancel);
        }),
    [begin, cancel, enabled, end, update],
  );

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
      /** A day chip's place on screen (shown while dragging) */
      setChip: (dayId: number, rect: Rect | null) => {
        if (rect) chips.current[dayId] = rect;
        else delete chips.current[dayId];
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

  return { drag, translateY, ...handlers };
}
