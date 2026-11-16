/**
 * A hotel in the stays sheet (docs/ui-refresh step 11): what sort of place it is and how far from the centre,
 * with its price when known, so a hotel without a price still says something true about itself instead of
 * "Standard · Price not known" on every row. Priced hotels first (cheapest first), then rated ones, then the
 * rest nearest the centre first.
 */

import type { Hotel } from '../../../types';
import type { PlanFormat } from '../plan/usePlanFormat';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Resort · ৳3,500 a night · 1.2 km from the centre", or "Rest house · 0.8 km from the centre · Price not known" */
export function hotelLine(h: Hotel, t: T, f: PlanFormat): string {
  const priced = h.price_known !== false;
  // The sort of place; a demo hotel (no kind) keeps its level
  const what = h.kind
    ? t(`stays.kind.${h.kind}`, { defaultValue: t('stays.kind.hotel') })
    : h.category
      ? t(`stays.level.${h.category}`, { defaultValue: h.category })
      : null;
  const where = h.km_from_centre == null ? null : h.km_from_centre < 0.3 ? t('stays.inCentre') : t('stays.fromCentre', { km: f.km(h.km_from_centre) });
  return [what, priced ? t('stays.perNight', { amount: f.money(h.price_per_night) }) : null, where, priced ? null : t('stays.priceUnknown')]
    .filter(Boolean)
    .join(' · ');
}

/** Priced hotels first, cheapest first; then rated ones, best first; then the rest, nearest the centre first */
export function sortHotels(hotels: readonly Hotel[]): Hotel[] {
  const rank = (h: Hotel) => (h.price_known !== false ? 0 : h.rating_known ? 1 : 2);
  return [...hotels].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.price_per_night - b.price_per_night;
    if (ra === 1) return (b.rating ?? 0) - (a.rating ?? 0);
    return (a.km_from_centre ?? Infinity) - (b.km_from_centre ?? Infinity);
  });
}
