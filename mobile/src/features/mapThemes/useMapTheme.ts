import { useMemo } from 'react';

import { useTheme } from '../../ui/theme';
import { usePreferences } from '../preferences/store';
import { resolveMapTheme, type ResolvedMapTheme, type UserMapTheme } from './resolve';

/** The map theme to draw: `selection` (e.g. a preview draft) or the applied one, for the current appearance. */
export function useMapTheme(selection?: UserMapTheme): ResolvedMapTheme {
  const applied = usePreferences((s) => s.mapTheme);
  const { scheme } = useTheme();
  const active = selection ?? applied;
  return useMemo(() => resolveMapTheme(active, scheme), [active, scheme]);
}
