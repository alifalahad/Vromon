/**
 * The travel map (MapLibre Native).
 *
 * - Countries: bundled GeoJSON (works offline from first launch), filled by status.
 * - Regions / Cities: PMTiles served by the backend (needs a connection).
 * Colours come from the active map theme. Status colours are paint expressions
 * rebuilt from the visit list, so marking a place repaints one property instead
 * of reloading data, and switching a theme repaints without reloading the style.
 */

import { Camera, Layer, Map, VectorSource, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { tilesUrl } from '../../services/api';
import type { Visit } from '../../types';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapView } from '../preferences/store';
import { CountryLabels, CountryLayers, LAYER, TerrainLayer, WaterLayers, type FeaturePress } from './layers';
import { MAP_STYLE, markedCodes, statusColorExpression } from './style';
import type { PlaceRef } from './visits';

export type PressedPlace = PlaceRef & { name: string };

export type WorldMapHandle = { recentre: () => void };

const HOME: [number, number] = [90.35, 23.7]; // Bangladesh
const START_ZOOM = 1.6;

type Props = {
  view: MapView;
  visits: readonly Visit[];
  theme: ResolvedMapTheme;
  onPressPlace: (place: PressedPlace) => void;
};

function firstProps(e: FeaturePress): Record<string, unknown> | null {
  return (e.nativeEvent.features?.[0]?.properties as Record<string, unknown> | undefined) ?? null;
}

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap({ view, visits, theme, onPressPlace }, ref) {
  const camera = useRef<CameraRef>(null);
  const { base, status, outline } = theme;

  useImperativeHandle(ref, () => ({
    recentre: () => camera.current?.flyTo({ center: HOME, zoom: START_ZOOM, duration: 600 }),
  }));

  // Statuses drawn with an outline (Want to visit in the preset themes)
  const outlined = Object.keys(outline) as (keyof typeof outline)[];
  const outlineColor = outlined.length ? outline[outlined[0]] : undefined;

  const countryFill = view === 'countries' ? statusColorExpression(visits, 'country', 'iso2', base.land, status) : base.land;
  const countryOutline = view === 'countries' ? markedCodes(visits, 'country', outlined) : [];
  const regionFill = statusColorExpression(visits, 'region', 'code', base.land, status);
  const regionOutline = markedCodes(visits, 'region', outlined);
  const cityColor = statusColorExpression(visits, 'city', 'id', base.border, status);
  const cityStroke = statusColorExpression(visits, 'city', 'id', base.labelHalo, {
    visited: base.labelHalo,
    lived: base.labelHalo,
    want: base.labelHalo,
    ...outline,
  });
  const isMarkedCity = ['in', ['to-string', ['get', 'id']], ['literal', markedCodes(visits, 'city')]];
  // Region layers sit under the terrain shading when there is one, else under the borders
  const belowBorders = base.terrain ? 'terrain-hillshade' : LAYER.glow;

  return (
    <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} attribution={false} logo={false} compass={false} touchPitch={false}>
      <Camera ref={camera} initialViewState={{ center: HOME, zoom: START_ZOOM }} />

      <WaterLayers base={base} />
      <CountryLayers
        base={base}
        fill={countryFill}
        outlineCodes={countryOutline}
        outlineColor={outlineColor}
        onPress={(e) => {
          const p = firstProps(e);
          if (view === 'countries' && p?.iso2) {
            onPressPlace({ place_type: 'country', place_code: String(p.iso2), country_iso2: String(p.iso2), name: String(p.name) });
          }
        }}
      />
      <TerrainLayer base={base} />

      {view === 'regions' ? (
        <VectorSource
          id="regions"
          url={tilesUrl('regions')}
          onPress={(e: FeaturePress) => {
            const p = firstProps(e);
            if (p?.code) onPressPlace({ place_type: 'region', place_code: String(p.code), country_iso2: String(p.country), name: String(p.name) });
          }}
        >
          {/* Mounted after the map loads, so anchor below country borders and labels explicitly */}
          <Layer id="region-fill" type="fill" source-layer="regions" beforeId={belowBorders} paint={{ 'fill-color': regionFill as never }} />
          <Layer
            id="region-border"
            type="line"
            source-layer="regions"
            beforeId={belowBorders}
            paint={{ 'line-color': base.border, 'line-width': 0.5, 'line-opacity': 0.7 }}
          />
          <Layer
            id="region-status-outline"
            type="line"
            source-layer="regions"
            beforeId={belowBorders}
            layout={{ visibility: outlineColor && regionOutline.length ? 'visible' : 'none' }}
            filter={['in', ['get', 'code'], ['literal', regionOutline]] as never}
            paint={{ 'line-color': outlineColor ?? base.border, 'line-width': 1.5 }}
          />
        </VectorSource>
      ) : null}

      {view === 'cities' ? (
        <VectorSource
          id="cities"
          url={tilesUrl('cities')}
          onPress={(e: FeaturePress) => {
            const p = firstProps(e);
            if (p?.id) onPressPlace({ place_type: 'city', place_code: String(p.id), country_iso2: String(p.country), name: String(p.name) });
          }}
        >
          <Layer
            id="city-dot"
            type="circle"
            source-layer="cities"
            beforeId={LAYER.label}
            filter={['!', isMarkedCity] as never}
            paint={{ 'circle-color': base.border, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 8, 3.5] as never }}
          />
          {/* Marked cities in their own layer above the rest, so nearby dots can't cover them */}
          <Layer
            id="city-dot-marked"
            type="circle"
            source-layer="cities"
            beforeId={LAYER.label}
            filter={isMarkedCity as never}
            paint={{
              'circle-color': cityColor as never,
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 7] as never,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': cityStroke as never,
            }}
          />
        </VectorSource>
      ) : null}

      {/* Labels last so they sit on top of fills */}
      <CountryLabels base={base} />
    </Map>
  );
});
