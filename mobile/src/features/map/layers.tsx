/**
 * Base-map layers shared by the travel map and the Map Theme preview: water
 * (plain or patterned), countries with borders, glow and status outlines, terrain
 * shading, and country labels. Children of <Map>, in this order.
 *
 * Every layer that a theme can switch on or off stays mounted and toggles its
 * `visibility`: a layer mounted later lands on top of the stack unless anchored,
 * and anchoring to a layer that doesn't exist yet fails. Terrain is the exception
 * (it needs its own source) and is anchored below the borders.
 */

import { GeoJSONSource, Images, Layer, RasterDEMSource } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import React from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { WATER_PATTERNS } from '../mapThemes/assets.generated';
import type { ResolvedBase } from '../mapThemes/resolve';
import { COUNTRIES, COUNTRY_LABELS, oceanMask } from './geoData';
import { LABEL_FONT } from './style';


// Terrain for styles with hillshade (Odyssey): AWS Open Data terrain tiles (Terrarium encoding).
// Needs a connection; without one the style shows flat colours. Attribution: docs/data-sources.md.
const TERRAIN_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];

const ANY_PATTERN = Object.keys(WATER_PATTERNS)[0];

export type FeaturePress = NativeSyntheticEvent<{ features: GeoJSON.Feature[] }>;
type Paint = ExpressionSpecification | string;

const shown = (on: boolean) => ({ visibility: on ? ('visible' as const) : ('none' as const) });

/** Layer ids other layers anchor to. */
export const LAYER = { countryFill: 'country-fill', glow: 'country-border-glow', border: 'country-border', label: 'country-label' } as const;

export function WaterLayers({ base }: { base: ResolvedBase }) {
  return (
    <>
      <Images images={WATER_PATTERNS} />
      <Layer id="water" type="background" paint={{ 'background-color': base.water }} />
      <Layer
        id="water-pattern"
        type="background"
        layout={shown(!!base.patternImage)}
        paint={{ 'background-pattern': base.patternImage ?? ANY_PATTERN }}
      />
    </>
  );
}

export function CountryLayers({
  base,
  fill,
  outlineCodes = [],
  outlineColor,
  onPress,
}: {
  base: ResolvedBase;
  fill: Paint;
  /** Countries drawn with a status outline (presets' Want to visit) */
  outlineCodes?: readonly string[];
  outlineColor?: string;
  onPress?: (e: FeaturePress) => void;
}) {
  const borderWidth = ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2] as never;
  return (
    <GeoJSONSource id="countries" data={COUNTRIES} onPress={onPress}>
      <Layer id={LAYER.countryFill} type="fill" paint={{ 'fill-color': fill as never, 'fill-antialias': true }} />
      <Layer
        id={LAYER.glow}
        type="line"
        layout={shown(!!base.borderGlow)}
        paint={{ 'line-color': base.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 7] as never, 'line-blur': 4, 'line-opacity': 0.55 }}
      />
      <Layer id={LAYER.border} type="line" paint={{ 'line-color': base.border, 'line-width': borderWidth }} />
      <Layer
        id="country-status-outline"
        type="line"
        layout={shown(!!outlineColor && outlineCodes.length > 0)}
        filter={['in', ['get', 'iso2'], ['literal', [...outlineCodes]]] as never}
        paint={{ 'line-color': outlineColor ?? base.border, 'line-width': 1.5 }}
      />
    </GeoJSONSource>
  );
}

/**
 * Hillshade over the fills, below the borders (Odyssey), with the sea painted back
 * over it: the elevation tiles include the sea floor, and the reference keeps water flat.
 */
export function TerrainLayer({ base }: { base: ResolvedBase }) {
  if (!base.terrain) return null;
  return (
    <>
      <RasterDEMSource id="terrain" tiles={TERRAIN_TILES} tileSize={256} encoding="terrarium" maxzoom={12}>
        <Layer
          id="terrain-hillshade"
          type="hillshade"
          beforeId={LAYER.glow}
          // No hillshade colours: MapLibre RN 11.5's Android style factory reads them as
          // arrays and crashes on a colour value. The defaults (black shadow, white
          // highlight) at a low exaggeration read as soft relief. Fainter when zoomed out,
          // where the elevation tiles are coarse and the shading would smear.
          paint={{ 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 1, 0.1, 3, 0.22, 5, 0.3] as never }}
        />
      </RasterDEMSource>
      <GeoJSONSource id="terrain-sea" data={oceanMask()}>
        <Layer id="terrain-sea-fill" type="fill" beforeId={LAYER.glow} paint={{ 'fill-color': base.water, 'fill-antialias': false }} />
      </GeoJSONSource>
    </>
  );
}

/** Country names, English (MapLibre can't shape Bengali script). */
export function CountryLabels({
  base,
  sizeScale = 1,
  labelLead = 3,
}: {
  base: ResolvedBase;
  sizeScale?: number;
  /** How many zoom levels before Natural Earth's MIN_LABEL a country gets its label */
  labelLead?: number;
}) {
  return (
    <GeoJSONSource id="country-labels" data={COUNTRY_LABELS}>
      <Layer
        id={LAYER.label}
        type="symbol"
        // Small countries appear as you zoom in (Natural Earth's MIN_LABEL, shifted `labelLead`
        // levels earlier; MapLibre's collision detection drops what doesn't fit)
        filter={['<=', ['coalesce', ['get', 'min_label'], 5], ['+', ['zoom'], labelLead]] as never}
        layout={{
          'text-field': ['get', 'name'] as never,
          'text-font': LABEL_FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9 * sizeScale, 5, 14 * sizeScale] as never,
          'text-max-width': 7,
        }}
        paint={{ 'text-color': base.label, 'text-halo-color': base.labelHalo, 'text-halo-width': 1.2 }}
      />
    </GeoJSONSource>
  );
}
