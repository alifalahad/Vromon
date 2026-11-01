/**
 * Friends' places as map data (map home step 9): one marker per place, at its
 * label point, showing the newest friend's initials and how many more.
 * Only countries and the bundled home regions have label points in the app.
 */

import type { FriendFootprint } from '../../types';
import { initials } from '../../ui/Avatar';
import { countryLabelPoint, HOME_REGIONS } from './geoData';

// Light pastels with dark initials (>= 7:1); the same friend always gets the same one
export const FRIEND_COLORS = ['#9FD9C8', '#F2B8D2', '#C9B8F5', '#F5D59B', '#A9CBF5'];

export function friendColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FRIEND_COLORS[h % FRIEND_COLORS.length];
}

export function footprintsGeoJSON(footprints: readonly FriendFootprint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const fp of footprints) {
    const point =
      fp.place_type === 'country'
        ? countryLabelPoint(fp.place_code)
        : fp.place_type === 'region'
          ? HOME_REGIONS.features.find((f) => f.properties.code === fp.place_code)?.properties.label
          : undefined;
    const first = fp.friends[0];
    if (!point || !first) continue;
    features.push({
      type: 'Feature',
      properties: {
        place_type: fp.place_type,
        place_code: fp.place_code,
        initials: initials(first.display_name || first.username),
        color: friendColor(first.id),
        more: fp.count > 1 ? `+${fp.count - 1}` : '',
      },
      geometry: { type: 'Point', coordinates: point },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** The friends who've been to a place (for its sheet). */
export function friendsAt(footprints: readonly FriendFootprint[] | undefined, placeType: string, code: string) {
  const fp = footprints?.find((f) => f.place_type === placeType && f.place_code === code);
  return (fp?.friends ?? []).map((f) => ({ id: f.id, name: f.display_name || f.username, username: f.username }));
}
