/**
 * Map styling as MapLibre style data.
 *
 * Colours come from the active map theme (features/mapThemes). The style itself
 * holds only the glyphs: every layer is a React child of <Map>, so switching a
 * theme updates paint properties instead of reloading the style. Status colours
 * are `match` expressions over feature codes, rebuilt from the visit list;
 * marking a place updates one paint property, never the GeoJSON (prompt §9).
 */

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import type { PlaceType, Visit, VisitStatus } from '../../types';

export const STATUS_ORDER: VisitStatus[] = ['visited', 'want', 'lived'];

// Development glyphs (MapLibre's demo server). Self-hosted before release (Phase 8).
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
export const LABEL_FONT = ['Noto Sans Regular'];

/** Glyphs only: sources and layers are React children of <Map>. */
export const MAP_STYLE: StyleSpecification = { version: 8, glyphs: GLYPHS, sources: {}, layers: [] };

type CodeKey = { type: PlaceType; property: string };

// City ids are numbers in the tiles; compare as strings
const keyExpression = ({ type, property }: CodeKey): ExpressionSpecification =>
  type === 'city' ? ['to-string', ['get', property]] : ['get', property];

/** `match` over feature codes, or the plain fallback when there is nothing to match. */
export function matchExpression(pairs: [code: string, value: string][], key: CodeKey, fallback: string): ExpressionSpecification | string {
  if (pairs.length === 0) return fallback; // a match needs at least one pair
  return ['match', keyExpression(key), ...pairs.flat(), fallback] as unknown as ExpressionSpecification;
}

/**
 * Fill colour for a layer of `type` features keyed by `property`:
 * visited/want/lived get their colour, everything else the fallback (land).
 */
export function statusColorExpression(
  visits: readonly Visit[],
  type: PlaceType,
  property: string,
  fallback: string,
  colors: Record<VisitStatus, string>,
): ExpressionSpecification | string {
  const pairs = visits.filter((v) => v.place_type === type).map((v): [string, string] => [v.place_code, colors[v.status]]);
  return matchExpression(pairs, { type, property }, fallback);
}

/** Friend comparison fill: In common, only You, only the friend. */
export function compareColorExpression(
  mine: readonly string[],
  theirs: readonly string[],
  type: PlaceType,
  property: string,
  fallback: string,
  colors: { you: string; friend: string; inCommon: string },
): ExpressionSpecification | string {
  const theirSet = new Set(theirs);
  const mineSet = new Set(mine);
  const pairs: [string, string][] = [
    ...mine.map((c): [string, string] => [c, theirSet.has(c) ? colors.inCommon : colors.you]),
    ...theirs.filter((c) => !mineSet.has(c)).map((c): [string, string] => [c, colors.friend]),
  ];
  return matchExpression(pairs, { type, property }, fallback);
}

/** Codes of `type` places, optionally only those with one of `statuses`. */
export function markedCodes(visits: readonly Visit[], type: PlaceType, statuses?: readonly VisitStatus[]): string[] {
  return visits.filter((v) => v.place_type === type && (!statuses || statuses.includes(v.status))).map((v) => v.place_code);
}

/** Statuses the user has used (the legend shows only when there is more than one). */
export function usedStatuses(visits: readonly Visit[]): VisitStatus[] {
  const used = new Set(visits.map((v) => v.status));
  return STATUS_ORDER.filter((s) => used.has(s));
}
