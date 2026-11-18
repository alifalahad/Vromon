/**
 * Explore with your own marks (docs/ui-refresh step 12): which districts, countries and cities you've marked,
 * the places Vromon can plan in the order Explore shows them, and the satellite picture of a country.
 * Every number here is the length of a list made from your marks or from the catalogue, never a guess.
 */

import type { Visit, VisitStatus } from '../../types';
import { COUNTRIES } from '../map/geoData';
import { beenCountries, beenDistricts } from '../map/travels';
import { statusOf } from '../map/visits';
import type { CountryCard, DistrictCard, PlanPlace } from './api';

/** The map's code for a catalogue district ("bd-district-bandarban" → "BD-bandarban"). */
export const districtCode = (slug: string) => `BD-${slug.replace(/^bd-district-/, '')}`;

export const districtStatus = (visits: readonly Visit[], slug: string): VisitStatus | null => statusOf(visits, 'district', districtCode(slug));
export const countryStatus = (visits: readonly Visit[], iso2: string): VisitStatus | null => statusOf(visits, 'country', iso2);
export const cityStatus = (visits: readonly Visit[], geonameid: number): VisitStatus | null => statusOf(visits, 'city', String(geonameid));

/** "You've been to N of 64 districts": the districts you've visited or lived in. */
export const districtsBeen = (visits: readonly Visit[]) => beenDistricts(visits).length;

/** Countries visited or lived in, by continent (the catalogue's continent of each). */
export function countriesBeenByContinent(visits: readonly Visit[], countries: readonly CountryCard[]): Map<string, number> {
  const continent = new Map(countries.map((c) => [c.iso2, c.continent]));
  const out = new Map<string, number>();
  for (const v of beenCountries(visits)) {
    const c = continent.get(v.place_code);
    if (c) out.set(c, (out.get(c) ?? 0) + 1);
  }
  return out;
}

/** A division's districts as Explore shows them: the most sights first (the first one gets the large card), then by name. */
export function districtOrder(list: readonly DistrictCard[]): DistrictCard[] {
  return [...list].sort((a, b) => b.counts.attractions - a.counts.attractions || (a.name_en ?? '').localeCompare(b.name_en ?? ''));
}

/** "Ready to plan": the places you want to go first, then the rest; each group with the most sights first. */
export function planOrder(places: readonly PlanPlace[], districts: ReadonlyMap<string, DistrictCard>, visits: readonly Visit[]): PlanPlace[] {
  const want = (p: PlanPlace) => (districtStatus(visits, p.district_slug) === 'want' ? 0 : 1);
  const sights = (p: PlanPlace) => districts.get(p.district_slug)?.counts.attractions ?? 0;
  return [...places].sort((a, b) => want(a) - want(b) || sights(b) - sights(a) || a.name.localeCompare(b.name));
}

const ESRI_EXPORT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

/**
 * Esri's World Imagery over the country itself (its largest piece of land, from the shapes in the app), in
 * the country's own shape (kept between tall and wide enough for a card) with a little room round it. The
 * card shows it cropped to its own shape. Null for a country the app has no shape for.
 */
export function countrySatellite(iso2: string): string | null {
  const feature = COUNTRIES.features.find((f) => (f.properties as { iso2?: string } | null)?.iso2 === iso2);
  const g = feature?.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // The largest piece by the size of its box (a country's islands and far territories would stretch the frame)
  const boxes = polygons.map((p) => {
    const xs = p[0].map((c) => c[0]);
    const ys = p[0].map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
  });
  const [x0, y0, x1, y1] = boxes.reduce((a, b) => ((b[2] - b[0]) * (b[3] - b[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? b : a));
  // Degrees of longitude shrink away from the equator: the shape as it is on the ground
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let w = Math.max((x1 - x0) * k, 0.05) * 1.1;
  let h = Math.max(y1 - y0, 0.05) * 1.1;
  const shape = Math.min(Math.max(w / h, 0.7), 1.6);
  if (w / h < shape) w = h * shape;
  else h = w / shape;
  const box = [cx - w / k / 2, cy - h / 2, cx + w / k / 2, cy + h / 2].map((v) => v.toFixed(3)).join(',');
  const size = shape >= 1 ? [960, Math.round(960 / shape)] : [Math.round(960 * shape), 960];
  return `${ESRI_EXPORT}?bbox=${box}&bboxSR=4326&imageSR=3857&size=${size[0]},${size[1]}&format=jpg&f=image`;
}
