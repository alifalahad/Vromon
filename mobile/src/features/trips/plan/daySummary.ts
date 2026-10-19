/**
 * The day in a line ("Beach morning, nature afternoon, sunset at Inani Beach"),
 * from the parts the server works out (step 7). A fixed template in both
 * languages, no AI: the same plan always reads the same way.
 */

import type { TFunction } from 'i18next';

import type { DayPart } from '../../../types';

export function daySummaryText(parts: DayPart[] | undefined, t: TFunction): string | null {
  if (!parts) return null;
  if (!parts.length) return t('daySummary.free');
  const words = parts.map((p) => {
    // "Sunset Boat Ride" already says when; "sunset at Inani Beach" otherwise
    if (p.part === 'sunset') return /sunset/i.test(p.place) ? p.place : t('daySummary.sunset', { place: p.place });
    const what = t(`daySummary.what.${p.what}`, { defaultValue: p.what });
    return t(`daySummary.${p.part}`, { what });
  });
  const line = words.join(t('daySummary.sep'));
  return line.charAt(0).toUpperCase() + line.slice(1);
}
