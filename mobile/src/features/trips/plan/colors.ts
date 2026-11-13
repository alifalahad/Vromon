/**
 * Colours of the trip plan (docs/trip-planner/design-spec.md §1): blue visits,
 * amber meals (with a dark number on top), hatched-grey travel. The stay (docs/trip-upgrades,
 * step 2): a dark pin with a light bed or house in light mode, the other way round in dark mode.
 * "Not checked" (step 6): a soft amber badge on places from outside Vromon's checked data.
 */

import type { Theme } from '../../../ui/theme';

export type PlanColors = {
  visit: string;
  onVisit: string;
  meal: string;
  onMeal: string;
  travel: string;
  stay: string;
  onStay: string;
  unchecked: string;
  onUnchecked: string;
};

export function planColors(theme: Pick<Theme, 'scheme' | 'colors'>): PlanColors {
  const dark = theme.scheme === 'dark';
  return {
    visit: theme.colors.accent,
    onVisit: '#FFFFFF',
    meal: dark ? '#F2B13C' : '#E39A2D',
    onMeal: '#1F1F1F',
    travel: theme.colors.textTertiary,
    stay: dark ? '#E8EAED' : '#3C4043',
    onStay: dark ? '#202124' : '#FFFFFF',
    unchecked: dark ? '#3D2E12' : '#FFF1D6',
    onUnchecked: dark ? '#FFD58A' : '#7A4500',
  };
}

/** The ribbon's visit colour is the lighter link blue in dark mode, as in the mockups. */
export function ribbonVisit(theme: Pick<Theme, 'scheme' | 'colors'>): string {
  return theme.scheme === 'dark' ? theme.colors.link : theme.colors.accent;
}
