/**
 * The Map Theme screen's live preview: a non-interactive map drawing the draft
 * theme with the same layers as the travel map, either the user's statuses
 * (Map) or a comparison with a friend (Friends). Picking a card repaints it.
 */

import { Camera, Map, type LngLatBounds } from '@maplibre/maplibre-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { Visit } from '../../types';
import { CountryLabels, CountryLayers, TerrainLayer, WaterLayers } from '../map/layers';
import { compareColorExpression, MAP_STYLE, markedCodes, statusColorExpression } from '../map/style';
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
      {/* Fewer, larger labels than the travel map, as in 03–07 */}
      <CountryLabels base={base} sizeScale={1.15} labelLead={1.5} />
    </Map>
  );
}
