/**
 * Good 👍 and Bad 👎 when chosen (trip upgrades step 7): a green and a red fill with text that reads on it
 * (AA, checked in contrast.test.ts), in light and dark.
 */

import type { Theme } from '../../../ui/theme';

export type ReviewColors = { good: string; onGood: string; bad: string; onBad: string };

export function reviewColors(theme: Pick<Theme, 'scheme'>): ReviewColors {
  const dark = theme.scheme === 'dark';
  return {
    good: dark ? '#173B22' : '#E3F5E8',
    onGood: dark ? '#8FE0A6' : '#1B6B33',
    bad: dark ? '#45191B' : '#FDE7E7',
    onBad: dark ? '#FFB3B0' : '#A1262B',
  };
}
