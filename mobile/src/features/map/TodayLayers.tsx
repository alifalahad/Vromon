/**
 * Today's route on the travel map (map home step 7, mockup 3): legs done (solid
 * sunset), the next one (dotted blue), the rest (dotted grey); numbered pins
 * (done, the next with its name and time, later); and you, when location is on.
 * Children of <Map>, drawn on top.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import React from 'react';

import type { ResolvedBase } from '../mapThemes/resolve';
import type { Point } from '../trips/today/today';
import { LABEL_FONT } from './style';

const SUNSET = '#F08A4B';
// The day's route is street-scale: zoomed out it would only clutter the map
const MIN_ZOOM = 7;

export function TodayLayers({
  legs,
  pins,
  here,
  base,
  dark,
}: {
  legs: GeoJSON.FeatureCollection;
  pins: GeoJSON.FeatureCollection;
  here: Point | null;
  base: ResolvedBase;
  dark: boolean;
}) {
  const blue = dark ? '#8AB4F8' : '#2563D9';
  const grey = dark ? '#8C93A0' : '#6B7280';
  const me: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: here ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [here.lon, here.lat] } }] : [],
  };
  return (
    <>
      <GeoJSONSource id="today-legs" data={legs}>
        <Layer
          id="today-leg-done"
          type="line"
          minzoom={MIN_ZOOM}
          filter={['==', ['get', 'kind'], 'done'] as never}
          layout={{ 'line-cap': 'round' }}
          paint={{ 'line-color': SUNSET, 'line-width': 3, 'line-opacity': 0.85 }}
        />
        <Layer
          id="today-leg-next"
          type="line"
          minzoom={MIN_ZOOM}
          filter={['==', ['get', 'kind'], 'next'] as never}
          layout={{ 'line-cap': 'round' }}
          paint={{ 'line-color': blue, 'line-width': 3.2, 'line-dasharray': [0.2, 2.2] }}
        />
        <Layer
          id="today-leg-later"
          type="line"
          minzoom={MIN_ZOOM}
          filter={['==', ['get', 'kind'], 'later'] as never}
          layout={{ 'line-cap': 'round' }}
          paint={{ 'line-color': grey, 'line-width': 2, 'line-dasharray': [0.2, 2.2], 'line-opacity': 0.85 }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="today-pins" data={pins}>
        <Layer
          id="today-pin"
          type="circle"
          minzoom={MIN_ZOOM}
          paint={{
            'circle-radius': ['match', ['get', 'kind'], 'next', 13, 11] as never,
            'circle-color': ['match', ['get', 'kind'], 'done', SUNSET, 'next', '#FFFFFF', base.land] as never,
            'circle-stroke-width': ['match', ['get', 'kind'], 'next', 4, 1.5] as never,
            'circle-stroke-color': ['match', ['get', 'kind'], 'next', 'rgba(255,255,255,0.25)', 'done', SUNSET, grey] as never,
          }}
        />
        <Layer
          id="today-pin-number"
          type="symbol"
          minzoom={MIN_ZOOM}
          layout={{ 'text-field': ['get', 'n'] as never, 'text-font': LABEL_FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }}
          paint={{ 'text-color': ['match', ['get', 'kind'], 'done', '#3A1606', 'next', '#11151B', base.label] as never }}
        />
        <Layer
          id="today-pin-label"
          type="symbol"
          minzoom={MIN_ZOOM}
          filter={['==', ['get', 'kind'], 'next'] as never}
          layout={{ 'text-field': ['get', 'label'] as never, 'text-font': LABEL_FONT, 'text-size': 13, 'text-offset': [0, -1.8], 'text-anchor': 'bottom', 'text-allow-overlap': true }}
          paint={{ 'text-color': base.label, 'text-halo-color': base.labelHalo, 'text-halo-width': 1.6 }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="today-me" data={me}>
        <Layer id="today-me-halo" type="circle" minzoom={MIN_ZOOM} paint={{ 'circle-radius': 22, 'circle-color': blue, 'circle-opacity': 0.18 }} />
        <Layer id="today-me-dot" type="circle" minzoom={MIN_ZOOM} paint={{ 'circle-radius': 8, 'circle-color': blue, 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
      </GeoJSONSource>
    </>
  );
}
