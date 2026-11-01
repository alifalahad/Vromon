/**
 * Where a destination is, at a glance: the home country's divisions, its own one
 * filled, and a dot. Stands in for a photo on the chosen destination (there are
 * no destination photos yet), drawn from the bundled divisions so it works offline.
 */

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../../../ui/theme';
import { HOME_REGIONS } from '../../map/geoData';

type Shape = { code: string; d: string };

const PAD = 5;

// West, south, east, north of the divisions, and how much a degree of longitude shrinks there
const [W, S, E, N] = HOME_REGIONS.features.reduce(
  ([w, s, e, n], f) => {
    const g = f.geometry;
    for (const ring of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat()) {
      for (const [x, y] of ring) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    }
    return [w, s, e, n];
  },
  [Infinity, Infinity, -Infinity, -Infinity],
);
const K = Math.cos((((S + N) / 2) * Math.PI) / 180);

function projector(size: number) {
  const w = (E - W) * K;
  const h = N - S;
  const scale = (size - 2 * PAD) / Math.max(w, h);
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  return (lon: number, lat: number): [number, number] => [ox + (lon - W) * K * scale, oy + (N - lat) * scale];
}

const cache = new Map<number, Shape[]>();

/** The divisions as SVG paths for a square of `size`, a point per half pixel or so. */
function shapes(size: number): Shape[] {
  const hit = cache.get(size);
  if (hit) return hit;
  const at = projector(size);
  const out = HOME_REGIONS.features.map((f) => {
    const g = f.geometry;
    const rings = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
    const d = rings
      .map((ring) => {
        const kept: [number, number][] = [];
        for (const [lon, lat] of ring) {
          const p = at(lon, lat);
          const last = kept[kept.length - 1];
          if (!last || Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= 0.5) kept.push(p);
        }
        return kept.length >= 3 ? `M${kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z` : '';
      })
      .join('');
    return { code: f.properties.code, d };
  });
  cache.set(size, out);
  return out;
}

/** Whether a place is inside the drawn country's box (other countries have no locator yet). */
export const canLocate = (lat?: number | null, lon?: number | null) =>
  lat != null && lon != null && lon >= W && lon <= E && lat >= S && lat <= N;

export function LocatorMap({ lat, lon, region, size }: { lat: number; lon: number; region?: string | null; size: number }) {
  const { colors } = useTheme();
  const [x, y] = projector(size)(lon, lat);
  return (
    <Svg width={size} height={size} accessible={false}>
      {shapes(size).map((s) => (
        <Path
          key={s.code}
          d={s.d}
          fill={s.code === region ? colors.accent : colors.textTertiary}
          fillOpacity={s.code === region ? 1 : 0.4}
          stroke={colors.surfaceInset}
          strokeWidth={0.6}
        />
      ))}
      <Circle cx={x} cy={y} r={3.5} fill={colors.onAccent} stroke={colors.accentStrong} strokeWidth={1.5} />
    </Svg>
  );
}
