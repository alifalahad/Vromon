/**
 * Which country is at a point (longitude, latitude), from the bundled shapes: what a tap or a
 * press and hold on the globe picks. Each country's box is checked first, so a tap tests the
 * rings of only a few countries.
 */

import { COUNTRIES } from '../geoData';

type Ring = number[][];
type Entry = { iso2: string; name: string; box: [number, number, number, number]; polygons: Ring[][] };

let index: Entry[] | null = null;

function build(): Entry[] {
  const out: Entry[] = [];
  for (const f of COUNTRIES.features) {
    const g = f.geometry;
    const polygons = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][];
    if (!polygons.length || !f.properties?.iso2) continue;
    const box: [number, number, number, number] = [180, 90, -180, -90];
    for (const p of polygons) {
      for (const [x, y] of p[0]) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
    out.push({ iso2: String(f.properties.iso2), name: String(f.properties.name), box, polygons });
  }
  return out;
}

// Even-odd ray casting
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, polygon: Ring[]): boolean {
  if (!inRing(x, y, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) if (inRing(x, y, polygon[h])) return false;
  return true;
}

/** The country at a point, or null over the sea. */
export function countryAt(lon: number, lat: number): { iso2: string; name: string } | null {
  index ??= build();
  for (const e of index) {
    if (lon < e.box[0] || lon > e.box[2] || lat < e.box[1] || lat > e.box[3]) continue;
    if (e.polygons.some((p) => inPolygon(lon, lat, p))) return { iso2: e.iso2, name: e.name };
  }
  return null;
}
