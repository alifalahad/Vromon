/**
 * Friend comparison map (07-theme-friends-compare-rustic.jpg): In common, only
 * You, only the friend, in the viewer's theme, for Countries, Regions or Cities.
 * Pan and zoom freely; nothing is editable.
 */

import { Camera, Layer, Map, VectorSource } from '@maplibre/maplibre-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { tilesUrl } from '../../services/api';
import type { CompareView } from '../../types';
import { CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers } from '../map/layers';
import { compareColorExpression, MAP_STYLE } from '../map/style';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapView } from '../preferences/store';

const codes = (v: CompareView) => ({
  mine: [...v.in_common, ...v.only_me].map((p) => p.code),
  theirs: [...v.in_common, ...v.only_them].map((p) => p.code),
});

export function CompareMap({
  theme,
  view,
  data,
  center,
}: {
  theme: ResolvedMapTheme;
  view: MapView;
  data: CompareView;
  center: [number, number];
}) {
  const { base, compare } = theme;
  const { mine, theirs } = codes(data);
  const countryFill = view === 'countries' ? compareColorExpression(mine, theirs, 'country', 'iso2', base.land, compare) : base.land;
  const below = base.terrain ? 'terrain-hillshade' : LAYER.glow;

  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} attribution={false} logo={false} compass={false} touchPitch={false} touchRotate={false}>
      <Camera initialViewState={{ center, zoom: 1.4 }} />
      <WaterLayers base={base} />
      <CountryLayers base={base} fill={countryFill} />
      <TerrainLayer base={base} />
      {view === 'regions' ? (
        <VectorSource id="regions" url={tilesUrl('regions')}>
          <Layer
            id="region-fill"
            type="fill"
            source-layer="regions"
            beforeId={below}
            paint={{ 'fill-color': compareColorExpression(mine, theirs, 'region', 'code', base.land, compare) as never }}
          />
          <Layer id="region-border" type="line" source-layer="regions" beforeId={below} paint={{ 'line-color': base.border, 'line-width': 0.5, 'line-opacity': 0.7 }} />
        </VectorSource>
      ) : null}
      {view === 'cities' ? (
        <VectorSource id="cities" url={tilesUrl('cities')}>
          <Layer
            id="city-dot-compared"
            type="circle"
            source-layer="cities"
            beforeId={LAYER.label}
            filter={['in', ['to-string', ['get', 'id']], ['literal', [...new Set([...mine, ...theirs])]]] as never}
            paint={{
              'circle-color': compareColorExpression(mine, theirs, 'city', 'id', base.border, compare) as never,
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 7] as never,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': base.labelHalo,
            }}
          />
        </VectorSource>
      ) : null}
      <CountryLabels base={base} />
    </Map>
  );
}
