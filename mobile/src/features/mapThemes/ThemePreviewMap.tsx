/**
 * The Map Theme screen's live preview: a non-interactive map drawing the draft
 * theme with the same layers as the travel map, either the user's statuses
 * (Map: countries, and the home country's divisions when they're in the app) or a
 * comparison with a friend. Picking a theme, colours or a style repaints it.
 */

import { Camera, GeoJSONSource, Layer, Map, type LngLatBounds } from '@maplibre/maplibre-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { Visit } from '../../types';
import { HOME_REGION_BORDERS, HOME_REGION_LABELS, HOME_REGIONS } from '../map/geoData';
import { CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers } from '../map/layers';
import { compareColorExpression, LABEL_FONT, MAP_STYLE, markedCodes, statusColorExpression } from '../map/style';
import type { ResolvedMapTheme } from './resolve';

export type PreviewContent =
  | { mode: 'map'; visits: readonly Visit[] }
  | { mode: 'friends'; mine: readonly string[]; theirs: readonly string[] };

export function ThemePreviewMap({ theme, content, bounds }: { theme: ResolvedMapTheme; content: PreviewContent; bounds: LngLatBounds }) {
  const { base } = theme;
  const outlined = Object.keys(theme.outline) as (keyof typeof theme.outline)[];
  const fill =
    content.mode === 'map'
      ? statusColorExpression(content.visits, 'country', 'iso2', base.land, theme.status)
      : compareColorExpression(content.mine, content.theirs, 'country', 'iso2', base.land, theme.compare);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      attribution={false}
      logo={false}
      compass={false}
      dragPan={false}
      touchZoom={false}
      doubleTapZoom={false}
      doubleTapHoldZoom={false}
      touchRotate={false}
      touchPitch={false}
    >
      <Camera bounds={bounds} duration={0} />
      <WaterLayers base={base} />
      <CountryLayers
        base={base}
        fill={fill}
        outlineCodes={content.mode === 'map' ? markedCodes(content.visits, 'country', outlined) : []}
        outlineColor={outlined.length ? theme.outline[outlined[0]] : undefined}
      />
      <TerrainLayer base={base} />
      {/* The home country's divisions in their status colours (docs/ui-refresh step 3), with the
          lines and names the travel map draws at this zoom (WorldMap's home-region-border and
          home-region-label) */}
      {content.mode === 'map' && content.visits.some((v) => v.place_type === 'region') ? (
        <GeoJSONSource id="preview-regions" data={HOME_REGIONS}>
          <Layer
            id="preview-region-fill"
            type="fill"
            beforeId={LAYER.border}
            paint={{ 'fill-color': statusColorExpression(content.visits, 'region', 'code', 'rgba(0,0,0,0)', theme.status) as never }}
          />
        </GeoJSONSource>
      ) : null}
      {content.mode === 'map' ? (
        <GeoJSONSource id="preview-region-borders" data={HOME_REGION_BORDERS}>
          <Layer id="preview-region-line" type="line" beforeId={LAYER.border} layout={{ 'line-join': 'round' }} paint={{ 'line-color': base.border, 'line-width': 0.6 }} />
        </GeoJSONSource>
      ) : null}
      {content.mode === 'map' ? (
        <GeoJSONSource id="preview-region-labels" data={HOME_REGION_LABELS}>
          <Layer
            id="preview-region-label"
            type="symbol"
            minzoom={4.3}
            layout={{
              'text-field': ['get', 'name'] as never,
              'text-font': LABEL_FONT,
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.15,
              'text-size': 9.5,
            }}
            paint={{ 'text-color': base.label, 'text-halo-color': base.labelHalo, 'text-halo-width': 1.2, 'text-halo-blur': 0.5 }}
          />
        </GeoJSONSource>
      ) : null}
      {/* Fewer, larger labels than the travel map, as in 03–07 */}
      <CountryLabels base={base} sizeScale={1.15} labelLead={1.5} />
    </Map>
  );
}
