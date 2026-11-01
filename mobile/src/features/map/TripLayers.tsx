/**
 * Trip layers on the travel map (map home step 5): trails of finished trips,
 * the dashed arc and pin of the coming trip, the names of the places Vromon can
 * plan (tap: that destination), and a single pulse on Want-list places when the map
 * opens. Children of <Map>, anchored under the country labels.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import React, { useEffect, useState } from 'react';

import type { ResolvedBase } from '../mapThemes/resolve';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { LAYER, type FeaturePress } from './layers';
import { DISTRICTS_FROM, LABEL_FONT, PLACE_NAME_SIZE, placeNamePaint } from './style';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type TripLayerData = {
  trails: GeoJSON.FeatureCollection;
  upcomingLine: GeoJSON.FeatureCollection;
  upcomingPin: GeoJSON.FeatureCollection;
  destinations: GeoJSON.FeatureCollection;
  wants: GeoJSON.FeatureCollection;
};

export function TripLayers({
  data,
  show,
  base,
  dark,
  onPressDestination,
}: {
  data: TripLayerData;
  show: { trails: boolean; plannable: boolean };
  base: ResolvedBase;
  dark: boolean;
  onPressDestination: (id: number) => void;
}) {
  const trail = dark ? '#F7C8A4' : '#B5501A';
  const blue = dark ? '#8AB4F8' : '#2563D9';
  return (
    <>
      <GeoJSONSource id="trip-trails" data={show.trails ? data.trails : EMPTY}>
        <Layer
          id="trip-trail"
          type="line"
          beforeId={LAYER.label}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': trail, 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2.2] as never }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="trip-upcoming-line" data={data.upcomingLine}>
        <Layer
          id="trip-upcoming"
          type="line"
          beforeId={LAYER.label}
          layout={{ 'line-cap': 'round' }}
          paint={{ 'line-color': blue, 'line-width': 2, 'line-dasharray': [1, 2.5] }}
        />
      </GeoJSONSource>

      <GeoJSONSource
        id="destinations"
        data={show.plannable ? data.destinations : EMPTY}
        hitbox={{ top: 10, right: 10, bottom: 10, left: 10 }}
        onPress={(e: FeaturePress) => {
          const id = e.nativeEvent.features?.[0]?.properties?.id;
          if (id != null) onPressDestination(Number(id));
        }}
      >
        {/* Their names, from the zoom where districts appear, looking exactly like district names
            (a district with the same name isn't labelled twice). On top (no anchor): a tap goes to
            the topmost pressable source, and these must win over the region under them */}
        <Layer
          id="destination-name"
          type="symbol"
          minzoom={DISTRICTS_FROM}
          layout={{
            'text-field': ['get', 'name'] as never,
            'text-font': LABEL_FONT,
            'text-size': PLACE_NAME_SIZE as never,
            'text-max-width': 7,
            'text-padding': 4,
          }}
          paint={placeNamePaint(base)}
        />
      </GeoJSONSource>

      <GeoJSONSource id="trip-upcoming-pin" data={data.upcomingPin}>
        <Layer id="trip-upcoming-halo" type="circle" paint={{ 'circle-radius': 16, 'circle-color': blue, 'circle-opacity': 0.18 }} />
        <Layer
          id="trip-upcoming-dot"
          type="circle"
          paint={{ 'circle-radius': 7, 'circle-color': blue, 'circle-stroke-width': 2, 'circle-stroke-color': base.labelHalo }}
        />
        <Layer
          id="trip-upcoming-label"
          type="symbol"
          layout={{
            'text-field': ['get', 'name'] as never,
            'text-font': LABEL_FONT,
            'text-size': 13,
            'text-offset': [0, -1.6],
            'text-anchor': 'bottom',
            'text-allow-overlap': true,
          }}
          paint={{ 'text-color': base.label, 'text-halo-color': base.labelHalo, 'text-halo-width': 1.5 }}
        />
      </GeoJSONSource>

      <WantPulse wants={data.wants} color={blue} />
    </>
  );
}

/** One pulse on the Want-list places when the map opens (none with reduced motion). */
function WantPulse({ wants, color }: { wants: GeoJSON.FeatureCollection; color: string }) {
  const reduceMotion = useReduceMotion();
  const [t, setT] = useState(reduceMotion ? 1 : 0);
  const count = wants.features.length;
  useEffect(() => {
    if (reduceMotion || count === 0) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / 1200);
      setT(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, count]);
  if (t >= 1 || count === 0) return null;
  return (
    <GeoJSONSource id="want-pulse" data={wants}>
      <Layer
        id="want-pulse-ring"
        type="circle"
        beforeId={LAYER.label}
        paint={{ 'circle-radius': 6 + 26 * t, 'circle-color': color, 'circle-opacity': 0.35 * (1 - t), 'circle-stroke-width': 1.5, 'circle-stroke-color': color, 'circle-stroke-opacity': 0.6 * (1 - t) }}
      />
    </GeoJSONSource>
  );
}
