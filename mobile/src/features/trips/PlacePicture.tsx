/**
 * A picture of where a trip goes (docs/ui-refresh step 9, frames 15 and 17): the land and sea around the
 * place, drawn on the phone from the shapes in the app (the world's countries, Bangladesh's 64
 * districts), in the Default map's colours, with a dot on the place. No image files and no network.
 *
 * The window is `span` degrees of longitude wide, with the place at `at` (fractions of the width and
 * height). Only the shapes near the window are drawn, and their points are pulled in to a margin round
 * it, so the paths stay short. Paths are kept per window, so a list of trips draws each place once.
 */

import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../ui/theme';
import { COUNTRIES, HOME_DISTRICT_AREAS } from '../map/geoData';
import { mix } from '../mapThemes/color';
import { DEFAULT_USER_MAP_THEME, resolveMapTheme } from '../mapThemes/resolve';

const BASE = resolveMapTheme(DEFAULT_USER_MAP_THEME, 'light').base;
const SEAM = mix(BASE.land, BASE.label, 0.22);
const MARGIN = 12;

type Figure = { land: string; districts: string };
const figures = new Map<string, Figure>();

function figureOf(lon: number, lat: number, width: number, height: number, span: number, at: readonly [number, number]): Figure {
  const key = [lon.toFixed(3), lat.toFixed(3), width, height, span, at[0], at[1]].join(':');
  const hit = figures.get(key);
  if (hit) return hit;
  const k = Math.cos((lat * Math.PI) / 180);
  // Pixels per degree of latitude
  const scale = width / (span * k);
  const x0 = at[0] * width;
  const y0 = at[1] * height;
  const px = (x: number) => Math.min(width + MARGIN, Math.max(-MARGIN, x0 + (x - lon) * k * scale));
  const py = (y: number) => Math.min(height + MARGIN, Math.max(-MARGIN, y0 - (y - lat) * scale));
  const inside = (ring: number[][]) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      const sx = x0 + (x - lon) * k * scale;
      const sy = y0 - (y - lat) * scale;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
    return maxX >= 0 && minX <= width && maxY >= 0 && minY <= height;
  };
  const pathOf = (geometry: GeoJSON.Geometry): string => {
    const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []) as number[][][][];
    let d = '';
    for (const polygon of polygons) {
      const ring = polygon[0];
      if (!ring || !inside(ring)) continue;
      let last = '';
      let first = true;
      for (const [x, y] of ring) {
        const p = `${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
        if (p === last) continue;
        d += `${first ? 'M' : 'L'}${p}`;
        last = p;
        first = false;
      }
      if (!first) d += 'Z';
    }
    return d;
  };
  let land = '';
  for (const f of COUNTRIES.features) land += pathOf(f.geometry);
  // Inside Bangladesh, its districts: they show the coast and the rivers' mouths more finely, and their seams
  let districts = '';
  for (const f of HOME_DISTRICT_AREAS.features) districts += pathOf(f.geometry);
  const figure = { land, districts };
  figures.set(key, figure);
  return figure;
}

export function PlacePicture({
  lon,
  lat,
  width,
  height,
  span = 2.4,
  at = [0.5, 0.5],
  dot = 'blue',
  fadeTo,
  style,
  testID,
}: {
  lon: number;
  lat: number;
  width: number;
  height: number;
  /** Degrees of longitude across the picture */
  span?: number;
  /** Where the place is in the picture, as fractions of its width and height */
  at?: readonly [number, number];
  /** The next trip's marigold dot with its glow, or a plain blue one */
  dot?: 'marigold' | 'blue';
  /** The colour the picture fades into at its bottom (the hero card under it) */
  fadeTo?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const figure = useMemo(() => figureOf(lon, lat, width, height, span, at), [lon, lat, width, height, span, at]);
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const cx = at[0] * width;
  const cy = at[1] * height;
  return (
    <View style={[{ width, height }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Svg width={width} height={height}>
        {fadeTo ? (
          <Defs>
            <LinearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.35" stopColor={fadeTo} stopOpacity={0} />
              <Stop offset="1" stopColor={fadeTo} stopOpacity={1} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Rect x={0} y={0} width={width} height={height} fill={BASE.water} />
        <Path d={figure.land} fill={BASE.land} stroke={SEAM} strokeWidth={0.6} strokeLinejoin="round" />
        {figure.districts ? <Path d={figure.districts} fill={BASE.land} stroke={SEAM} strokeWidth={0.5} strokeLinejoin="round" /> : null}
        {fadeTo ? <Rect x={0} y={0} width={width} height={height} fill={`url(#fade${id})`} /> : null}
        {dot === 'marigold' ? (
          <>
            <Circle cx={cx} cy={cy} r={13} fill={colors.highlight} fillOpacity={0.28} />
            <Circle cx={cx} cy={cy} r={7.25} fill={colors.onHero} />
            <Circle cx={cx} cy={cy} r={6} fill={colors.highlight} />
          </>
        ) : (
          <>
            <Circle cx={cx} cy={cy} r={7.25} fill={colors.onHero} />
            <Circle cx={cx} cy={cy} r={6} fill={colors.accent} />
          </>
        )}
      </Svg>
    </View>
  );
}

/** Where a trip goes, for its picture: its last stop with a place on the map */
export function tripPoint(stops: readonly { lat?: number | null; lon?: number | null }[] | undefined): { lon: number; lat: number } | null {
  const s = [...(stops ?? [])].reverse().find((x) => x.lat != null && x.lon != null);
  return s ? { lon: s.lon!, lat: s.lat! } : null;
}
