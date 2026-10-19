/**
 * Timing a screen in development builds only (trip planner step 11): from the
 * screen's first render to when it shows its content, logged as
 * "[perf] trip screen: 412 ms (cache)". Does nothing in release builds.
 */

import { useEffect, useRef, useState } from 'react';

export function useDevPerf(label: string, ready: boolean, fromCache: boolean) {
  const [started] = useState(() => Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (!__DEV__ || done.current || !ready) return;
    done.current = true;
    console.log(`[perf] ${label}: ${Date.now() - started} ms (${fromCache ? 'cache' : 'network'})`);
  }, [label, ready, fromCache, started]);
}
