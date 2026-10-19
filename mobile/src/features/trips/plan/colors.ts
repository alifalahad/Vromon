/**
 * Colours of the trip plan (docs/trip-planner/design-spec.md §1): blue visits,
 * amber meals (with a dark number on top), hatched-grey travel.
 */

import type { Theme } from '../../../ui/theme';

export type PlanColors = { visit: string; onVisit: string; meal: string; onMeal: string; travel: string };

export function planColors(theme: Pick<Theme, 'scheme' | 'colors'>): PlanColors {
  const dark = theme.scheme === 'dark';
  return {
    visit: theme.colors.accent,
    onVisit: '#FFFFFF',
    meal: dark ? '#F2B13C' : '#E39A2D',
    onMeal: '#1F1F1F',
    travel: theme.colors.textTertiary,
  };
}

/** The ribbon's visit colour is the lighter link blue in dark mode, as in the mockups. */
export function ribbonVisit(theme: Pick<Theme, 'scheme' | 'colors'>): string {
  return theme.scheme === 'dark' ? theme.colors.link : theme.colors.accent;
}
