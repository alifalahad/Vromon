/**
 * Friend comparison map (07-theme-friends-compare-rustic.jpg): In common, only
 * You, only the friend, in the viewer's theme. Like the home map, the zoom decides what it shows
 * (map/levels.ts): countries zoomed out, regions closer in, cities closest; `onLevelChange` lets
 * the screen's lists follow. Pan and zoom freely; nothing is editable. `snapshot()` takes a
 * picture of it, for the poster.
 */

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Camera, Layer, Map, VectorSource, type MapRef } from '@maplibre/maplibre-react-native';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { tilesUrl } from '../../services/api';
import type { Compare, CompareView } from '../../types';
import { CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers } from '../map/layers';
import { CITIES_FROM, fadeInFrom, GLOBE_UNTIL, levelAt, REGIONS_FROM, type MapLevel } from '../map/levels';
import { compareColorExpression, MAP_STYLE } from '../map/style';
import type { ResolvedMapTheme } from '../mapThemes/resolve';

const codes = (v: CompareView) => ({
  mine: [...v.in_common, ...v.only_me].map((p) => p.code),
  theirs: [...v.in_common, ...v.only_them].map((p) => p.code),
});

export type CompareMapHandle = { snapshot: () => Promise<string | null> };

export const CompareMap = forwardRef<CompareMapHandle, {
  theme: ResolvedMapTheme;
  data: Compare;
  center: [number, number];
  onLevelChange?: (level: MapLevel) => void;
}>(function CompareMap({ theme, data, center, onLevelChange }, ref) {
  const mapRef = useRef<MapRef>(null);
  const level = useRef<MapLevel | null>(null);
  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      const uri = await mapRef.current?.createStaticMapImage({ output: 'file' });
      if (!uri) return null;
      return uri.startsWith('/') ? `file://${uri}` : uri;
    },
  }));
  const { base, compare } = theme;
  const countries = codes(data.countries);
  const regions = codes(data.regions);
  const cities = codes(data.cities);
  // The countries' colours fade out as the regions come in
  const countryFill = [
    'interpolate',
    ['linear'],
    ['zoom'],
    GLOBE_UNTIL,
    compareColorExpression(countries.mine, countries.theirs, 'country', 'iso2', base.land, compare),
    REGIONS_FROM,
    base.land,
  ] as unknown as ExpressionSpecification;
  const below = base.terrain ? 'terrain-hillshade' : LAYER.glow;
  const compared = [...new Set([...cities.mine, ...cities.theirs])];

  return (
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      attribution={false}
      logo={false}
      compass={false}
      touchPitch={false}
      touchRotate={false}
      onRegionDidChange={(e) => {
        const now = levelAt(e.nativeEvent.zoom);
        if (now !== level.current) {
          level.current = now;
          onLevelChange?.(now);
        }
      }}
    >
      <Camera initialViewState={{ center, zoom: 1.4 }} />
      <WaterLayers base={base} />
      <CountryLayers base={base} fill={countryFill} />
      <TerrainLayer base={base} />
      <VectorSource id="regions" url={tilesUrl('regions')}>
        <Layer
          id="region-fill"
          type="fill"
          source-layer="regions"
          beforeId={below}
          minzoom={REGIONS_FROM - 0.6}
          filter={['in', ['get', 'code'], ['literal', [...new Set([...regions.mine, ...regions.theirs])]]] as never}
          paint={{ 'fill-color': compareColorExpression(regions.mine, regions.theirs, 'region', 'code', base.land, compare) as never, 'fill-opacity': fadeInFrom(REGIONS_FROM) }}
        />
        <Layer
          id="region-border"
          type="line"
          source-layer="regions"
          beforeId={below}
          minzoom={REGIONS_FROM - 0.6}
          paint={{ 'line-color': base.border, 'line-width': 0.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], REGIONS_FROM - 0.6, 0, REGIONS_FROM, 0.7] as never }}
        />
      </VectorSource>
      <VectorSource id="cities" url={tilesUrl('cities')}>
        <Layer
          id="city-dot-compared"
          type="circle"
          source-layer="cities"
          beforeId={LAYER.label}
          minzoom={REGIONS_FROM - 0.6}
          filter={['in', ['to-string', ['get', 'id']], ['literal', compared]] as never}
          paint={{
            'circle-color': compareColorExpression(cities.mine, cities.theirs, 'city', 'id', base.border, compare) as never,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, CITIES_FROM, 7] as never,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': base.labelHalo,
          }}
        />
      </VectorSource>
      <CountryLabels base={base} />
    </Map>
  );
});
