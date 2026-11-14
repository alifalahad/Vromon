/**
 * A small picture of your map in a theme's or a style's colours (docs/ui-refresh step 3, frames 6
 * and 7), drawn the way the frames draw it: the home country fills most of the picture, its
 * divisions in your own marks (Visited, Lived, Want; a sample when you've marked nothing at home),
 * fine seams between them, the neighbours as plain land with thin borders, and a crisp outline
 * round the home country. Drawn on the phone from the bundled shapes, so it follows light and dark
 * and every theme without image files.
 *
 * Everything is one SVG, so every edge is smoothed the same way. The rounded corners are not a clip
 * (Android draws an SVG clip with hard steps): the picture's ground colour is painted over
 * everything outside the rounded rectangle, and that edge is smooth. Then a 1px hairline, or, for
 * the chosen one, a gap and a 2.5px ring (the frames' `0 0 0 2.5px <ground>, 0 0 0 5px <blue>`).
 * The ring needs RING of room round the picture; that room is part of the layout, so choosing
 * never moves anything. Themes and styles sit in rows you swipe (rowThumbSize).
 */

import React, { useId, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import type { Visit, VisitStatus } from '../../types';
import { COUNTRIES, HOME_REGIONS } from '../map/geoData';
import { countryBounds } from '../map/home';
import { luminance, mix } from './color';
import type { ResolvedMapTheme } from './resolve';

/** The picture in the frames: 78 × 56 with 14 corners. Narrower screens get a smaller one (thumbSize). */
export const THUMB = { width: 78, height: 56, radius: 14 } as const;
/** How far the chosen ring reaches past the picture: a 2.5 gap, then the 2.5 ring */
export const RING = 5;

/** Pictures in a row you swipe sit this far apart (frames 6–7) */
export const THUMB_GAP = 12;

/**
 * The picture size for a row you swipe that starts `viewport` from the screen's right edge: about
 * three and a half pictures in view on any phone, so the cut one says there's more.
 */
export function rowThumbSize(viewport: number): { width: number; height: number } {
  const w = Math.round(Math.min(120, Math.max(THUMB.width, (viewport + THUMB_GAP) / 3.5 - THUMB_GAP)));
  return { width: w, height: Math.round((w * THUMB.height) / THUMB.width) };
}

/** Marks by place: a home division's code ("BD-C"), or the home country's ISO code when it has none */
export type HomeMarks = Readonly<Record<string, VisitStatus>>;

/** What frames 6 and 7 show (test account A's marks), for someone who has marked nothing at home */
const SAMPLE: Record<string, HomeMarks> = { BD: { 'BD-D': 'visited', 'BD-E': 'visited', 'BD-H': 'lived' } };

/** Your marks in your home country, as the pictures show them. */
export function homeMarks(visits: readonly Visit[], home: string): HomeMarks {
  const regions = visits.filter((v) => v.place_type === 'region' && v.place_code.startsWith(`${home}-`));
  if (regions.length) return Object.fromEntries(regions.map((v) => [v.place_code, v.status]));
  const country = visits.find((v) => v.place_type === 'country' && v.place_code === home);
  if (country) {
    // The whole country marked: every division in its status
    const codes = HOME_REGIONS.features.filter((f) => f.properties.country === home).map((f) => f.properties.code);
    return Object.fromEntries([home, ...codes].map((code) => [code, country.status]));
  }
  return SAMPLE[home] ?? { [home]: 'visited' };
}

type Figure = {
  /** Every other country near home, one path */
  land: string;
  /** Home's divisions (or home itself when its divisions aren't in the app) */
  parts: { code: string; d: string }[];
  /** Home's outline */
  outline: string;
};

const figures = new Map<string, Figure>();

/** Polygons' outer rings, in THUMB's pixels (frames 6–7's crop: home fills ~80% of the height). */
function figureOf(home: string): Figure {
  const hit = figures.get(home);
  if (hit) return hit;
  const [w, s, e, n] = countryBounds(home) ?? [88.0, 20.6, 92.7, 26.6];
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  // Pixels per degree of latitude: the country fills 80% of the height or 62% of the width, but a
  // tiny country isn't blown up past a 4° tall view
  const scale = Math.min((THUMB.width * 0.62) / Math.max((e - w) * k, 1e-6), (THUMB.height * 0.8) / Math.max(n - s, 1e-6), THUMB.height / 4);
  const cLon = (w + e) / 2;
  const cLat = (s + n) / 2 - 0.09 * (n - s); // a little more sea below, as in frame 6
  // Points beyond this margin are pulled in to it: the fill inside the picture stays the same, and
  // the paths stay short (frames 6–7 do the same)
  const M = 24;
  const px = (lon: number) => Math.min(THUMB.width + M, Math.max(-M, THUMB.width / 2 + (lon - cLon) * k * scale));
  const py = (lat: number) => Math.min(THUMB.height + M, Math.max(-M, THUMB.height / 2 - (lat - cLat) * scale));
  const near = (ring: number[][]) => ring.some(([x, y]) => Math.abs((x - cLon) * k * scale) < THUMB.width && Math.abs((y - cLat) * scale) < THUMB.height);

  const pathOf = (geometry: GeoJSON.Geometry): string => {
    const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []) as number[][][][];
    let d = '';
    for (const polygon of polygons) {
      const ring = polygon[0];
      if (!near(ring)) continue;
      let last = '';
      let first = true;
      for (const [x, y] of ring) {
        const p = `${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
        if (p === last) continue; // closer than a tenth of a pixel, or both pulled to the same place
        d += `${first ? 'M' : 'L'}${p}`;
        last = p;
        first = false;
      }
      if (!first) d += 'Z';
    }
    return d;
  };

  let land = '';
  let outline = '';
  for (const f of COUNTRIES.features) {
    const d = pathOf(f.geometry);
    if (f.properties?.iso2 === home) outline += d;
    else land += d;
  }
  const regions = HOME_REGIONS.features.filter((f) => f.properties.country === home);
  const parts = regions.length ? regions.map((f) => ({ code: f.properties.code, d: pathOf(f.geometry) })) : [{ code: home, d: outline }];
  const figure = { land, parts, outline };
  figures.set(home, figure);
  return figure;
}

/** A rounded rectangle as a path (for the ground painted round the picture) */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

export function MapThumb({
  home,
  look,
  marks,
  width = THUMB.width,
  height = THUMB.height,
  selected = false,
  ring,
  hairline,
  ground,
}: {
  home: string;
  /** The theme, or your colours on a style */
  look: ResolvedMapTheme;
  marks: HomeMarks;
  /** The picture's size, without the room for the ring */
  width?: number;
  height?: number;
  /** The chosen one: a gap, then a ring in `ring` */
  selected?: boolean;
  ring: string;
  /** The thin line round a picture that isn't chosen */
  hairline: string;
  /** The colour the picture sits on: it's painted round the rounded corners and shows in the gap */
  ground: string;
}) {
  const figure = useMemo(() => figureOf(home), [home]);
  // The water pattern's id lives in this SVG only, but stays unique anyway
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const { base, status, outline } = look;
  // Lines a little stronger than the land, toward the label colour (frames 6–7); Glow keeps its own
  const line = base.borderGlow ? base.border : mix(base.land, base.label, luminance(base.land) > 0.4 ? 0.3 : 0.18);
  const fillOf = (s?: VisitStatus) => (s ? status[s] : base.land);
  const k = width / THUMB.width;
  const r = Math.round(THUMB.radius * k * 2) / 2;
  const W = width + 2 * RING;
  const H = height + 2 * RING;
  return (
    <View style={{ width: W, height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={W} height={H}>
        {base.pattern ? (
          <Defs>
            <Pattern id={`water${id}`} patternUnits="userSpaceOnUse" x={0} y={0} width={4} height={4}>
              {base.pattern === 'hatch' ? (
                <Path d="M-1 1L1 -1M0 4L4 0M3 5L5 3" stroke={line} strokeWidth={0.5} />
              ) : (
                <Circle cx={2} cy={2} r={0.55} fill={line} />
              )}
            </Pattern>
          </Defs>
        ) : null}
        <G transform={`translate(${RING} ${RING}) scale(${k} ${height / THUMB.height})`}>
          <Rect x={0} y={0} width={THUMB.width} height={THUMB.height} fill={base.water} />
          {base.pattern ? <Rect x={0} y={0} width={THUMB.width} height={THUMB.height} fill={`url(#water${id})`} /> : null}
          <Path d={figure.land} fill={base.land} stroke={line} strokeWidth={0.4} strokeLinejoin="round" />
          {figure.parts.map((p) => {
            const s = marks[p.code];
            const wantRing = s === 'want' && outline.want;
            return (
              <Path
                key={p.code}
                d={p.d}
                fill={fillOf(s)}
                // Seams in the land colour, so marked divisions read as separate pieces
                stroke={wantRing ? outline.want : base.land}
                strokeWidth={wantRing ? 0.8 : 0.35}
                strokeLinejoin="round"
              />
            );
          })}
          <Path d={figure.outline} fill="none" stroke={line} strokeWidth={0.45} strokeLinejoin="round" />
        </G>
        {/* The ground round the rounded picture, then the hairline or the ring */}
        <Path d={`M0 0H${W}V${H}H0Z${roundRect(RING, RING, width, height, r)}`} fill={ground} fillRule="evenodd" />
        {selected ? (
          // 2.5 of gap, then the ring from 2.5 to 5 past the picture (its middle at 3.75)
          <Rect x={RING - 3.75} y={RING - 3.75} width={width + 7.5} height={height + 7.5} rx={r + 3.75} ry={r + 3.75} fill="none" stroke={ring} strokeWidth={2.5} />
        ) : (
          <Rect x={RING - 0.5} y={RING - 0.5} width={width + 1} height={height + 1} rx={r + 0.5} ry={r + 0.5} fill="none" stroke={hairline} strokeWidth={1} />
        )}
      </Svg>
    </View>
  );
}
