/**
 * Timing a screen (trip planner step 11): from the screen's first render to when
 * it shows its content, logged as "[perf] trip screen: 412 ms (cache)". Only in
 * development builds, or a release build made with EXPO_PUBLIC_PERF_LOG=1 to
 * measure it (`adb logcat -s ReactNativeJS`). Normal release builds log nothing.
 *
 * Friends and chat step 10 adds scrolling (`useScrollPerf`) and one-off lines (`perfLog`),
 * such as how long a page of older messages took.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export const PERF_ON = __DEV__ || process.env.EXPO_PUBLIC_PERF_LOG === '1';

export function perfLog(text: string) {
  if (PERF_ON) console.log(`[perf] ${text}`);
}

/** Runs `work`, and logs how long it took when that's longer than a frame (16 ms). */
export function timed<T>(label: string, work: () => T, size?: (result: T) => number): T {
  if (!PERF_ON) return work();
  const started = Date.now();
  const result = work();
  const ms = Date.now() - started;
  if (ms > 16) console.log(`[perf] ${label}: ${size ? `${size(result)} in ` : ''}${ms} ms`);
  return result;
}

export function useDevPerf(label: string, ready: boolean, fromCache: boolean) {
  const [started] = useState(() => Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (!PERF_ON || done.current || !ready) return;
    done.current = true;
    console.log(`[perf] ${label}: ${Date.now() - started} ms (${fromCache ? 'cache' : 'network'})`);
  }, [label, ready, fromCache, started]);
}

// A scroll has ended when nothing has moved for this long (its momentum included)
const SETTLED_MS = 300;
// A frame this long means about three frames were dropped at 60 Hz
const SLOW_FRAME_MS = 50;

type ScrollRun = { start: number; lastFrame: number; lastMove: number; frames: number; longest: number; slow: number };
type ScrollHandlers = {
  onScrollBeginDrag?: () => void;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
};

/**
 * Frames while a list scrolls, from the first drag until it settles, logged as
 * "[perf] chat scroll: 58 fps over 2.1 s, longest frame 41 ms, 0 over 50 ms".
 * It counts JavaScript frames (requestAnimationFrame): a long one is when new rows
 * were being drawn, and the list may have shown blank space. Nothing when logging is off.
 */
export function useScrollPerf(label: string): ScrollHandlers {
  const run = useRef<ScrollRun | null>(null);
  return useMemo(() => {
    if (!PERF_ON) return {};
    const frame = (now: number) => {
      const r = run.current;
      if (!r) return;
      const gap = now - r.lastFrame;
      r.frames += 1;
      r.longest = Math.max(r.longest, gap);
      if (gap > SLOW_FRAME_MS) r.slow += 1;
      r.lastFrame = now;
      if (now - r.lastMove > SETTLED_MS) {
        const seconds = (r.lastMove - r.start) / 1000;
        run.current = null;
        if (seconds > 0.2) {
          const fps = Math.round(r.frames / ((now - r.start) / 1000));
          console.log(`[perf] ${label}: ${fps} fps over ${seconds.toFixed(1)} s, longest frame ${Math.round(r.longest)} ms, ${r.slow} over ${SLOW_FRAME_MS} ms`);
        }
        return;
      }
      requestAnimationFrame(frame);
    };
    const moved = () => {
      const now = performance.now();
      if (run.current) {
        run.current.lastMove = now;
        return;
      }
      run.current = { start: now, lastFrame: now, lastMove: now, frames: 0, longest: 0, slow: 0 };
      requestAnimationFrame(frame);
    };
    return { onScrollBeginDrag: moved, onScroll: moved, scrollEventThrottle: 16 };
  }, [label]);
}
