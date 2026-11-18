/**
 * Colours of the trip plan (docs/trip-planner/design-spec.md §1): blue visits,
 * amber meals (with a dark number on top), hatched-grey travel. The stay (docs/trip-upgrades,
 * step 2): a dark pin with a light bed or house in light mode, the other way round in dark mode.
 * "Not checked" (step 6): a soft amber badge on places from outside Vromon's checked data.
 * The timeline (docs/ui-refresh step 14, frame 29): the rides' dotted line, free time's dashed outline,
 * and the sun in the weather.
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
  dotted: string;
  dash: string;
  sun: string;
};

export function planColors(theme: Pick<Theme, 'scheme' | 'colors'>): PlanColors {
  const dark = theme.scheme === 'dark';
  return {
    visit: theme.colors.accent,
    onVisit: '#FFFFFF',
    // The frames' orange (docs/ui-refresh step 14, frame 29), on the map pins too
    meal: dark ? '#F2B13C' : '#F08E35',
    onMeal: dark ? '#1F1F1F' : '#3B1E00',
    travel: theme.colors.textTertiary,
    stay: dark ? '#E8EAED' : '#3C4043',
    onStay: dark ? '#202124' : '#FFFFFF',
    unchecked: dark ? '#3D2E12' : '#FFF1D6',
    onUnchecked: dark ? '#FFD58A' : '#7A4500',
    dotted: dark ? '#55657D' : '#B4BFCE',
    dash: dark ? '#46556B' : '#C3CCD9',
    // The frames' marigold sun has a darker edge on white; one colour here, dark enough to see (3:1 on
    // the day tabs' grey and the sheet)
    sun: dark ? '#FFB547' : '#B86E00',
  };
}
