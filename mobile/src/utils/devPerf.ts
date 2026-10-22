/**
 * Timing a screen (trip planner step 11): from the screen's first render to when
 * it shows its content, logged as "[perf] trip screen: 412 ms (cache)". Only in
 * development builds, or a release build made with EXPO_PUBLIC_PERF_LOG=1 to
 * measure it (`adb logcat -s ReactNativeJS`). Normal release builds log nothing.
 */

import { useEffect, useRef, useState } from 'react';

const ON = __DEV__ || process.env.EXPO_PUBLIC_PERF_LOG === '1';

export function useDevPerf(label: string, ready: boolean, fromCache: boolean) {
  const [started] = useState(() => Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (!ON || done.current || !ready) return;
    done.current = true;
    console.log(`[perf] ${label}: ${Date.now() - started} ms (${fromCache ? 'cache' : 'network'})`);
  }, [label, ready, fromCache, started]);
}
