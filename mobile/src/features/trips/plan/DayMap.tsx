/**
 * The trip screen's map: one day's stops as numbered pins (blue visits, amber
 * meals) joined in visiting order: along the road where we have the road line,
 * otherwise by a dashed straight line (an estimate). Tapping a pin
 * selects that stop; selecting a stop elsewhere eases the camera to it.
 * `bottomPadding` keeps pins clear of the plan sheet.
 */

import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { boundsFor } from '../../../components/TripMap';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useReduceMotion } from '../../../ui/useReduceMotion';
import { planColors } from './colors';
import { useStreetStyle } from './mapStyle';
import { localDigits } from './usePlanFormat';
import type { Coord, StopKind } from './timeline';

const FONT = ['Noto Sans Bold'];
/** Bangladesh, when a day has nothing to show */
const DEFAULT_CENTER: [number, number] = [90.35, 23.7];

export type MapPin = { id: number; n: number; kind: StopKind; coord: Coord; title: string };

export function DayMap({
  pins,
  selectedId,
  onSelect,
  fitKey,
  roadLines = {},
  topPadding,
  bottomPadding,
  accessibilityLabel,
}: {
  pins: MapPin[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Changes when the shown day changes: the camera then fits the whole day */
  fitKey: string;
  /** Road lines ([lon, lat] pairs) by "fromId>toId" */
  roadLines?: Record<string, number[][]>;
  topPadding: number;
  bottomPadding: number;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = planColors(theme);
  const reduceMotion = useReduceMotion();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const camera = useRef<CameraRef>(null);
  const mapStyle = useStreetStyle(theme.scheme);
  const padding = useMemo(() => ({ top: topPadding + 24, right: 48, bottom: bottomPadding + 24, left: 48 }), [topPadding, bottomPadding]);
  const bounds = useMemo(() => boundsFor(pins.map((p) => p.coord)), [pins]);

  // A new day: fit all of its stops
  useEffect(() => {
    if (bounds) camera.current?.fitBounds(bounds, { padding, duration: reduceMotion ? 0 : 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the day (or the sheet size) changes
  }, [fitKey, padding]);

  // A stop picked in the list: bring it into view above the sheet
  useEffect(() => {
    const pin = pins.find((p) => p.id === selectedId);
    if (pin) camera.current?.easeTo({ center: [pin.coord.longitude, pin.coord.latitude], padding, duration: reduceMotion ? 0 : 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selectedId]);

  // Each leg: the road line when we have it, otherwise a straight segment (drawn dashed)
  const [roads, line] = useMemo<[GeoJSON.FeatureCollection, GeoJSON.FeatureCollection]>(() => {
    const road: GeoJSON.Feature[] = [];
    const straight: GeoJSON.Feature[] = [];
    pins.forEach((p, i) => {
      const next = pins[i + 1];
      if (!next) return;
      const known = roadLines[`${p.id}>${next.id}`];
      const coordinates = known ?? [
        [p.coord.longitude, p.coord.latitude],
        [next.coord.longitude, next.coord.latitude],
      ];
      (known ? road : straight).push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
    });
    return [
      { type: 'FeatureCollection', features: road },
      { type: 'FeatureCollection', features: straight },
    ];
  }, [pins, roadLines]);
  const points = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        id: p.id,
        properties: {
          id: p.id,
          title: p.title,
          label: localDigits(String(p.n), lang),
          color: p.kind === 'meal' ? colors.meal : colors.visit,
          text: p.kind === 'meal' ? colors.onMeal : colors.onVisit,
          selected: p.id === selectedId ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [p.coord.longitude, p.coord.latitude] },
      })),
    }),
    [pins, selectedId, colors.meal, colors.visit, colors.onMeal, colors.onVisit, lang],
  );

  return (
    <View style={styles.wrap} accessible={false} accessibilityLabel={accessibilityLabel} testID="day-map">
      <Map style={styles.map} mapStyle={mapStyle} logo={false} compass={false} touchPitch={false} attribution attributionPosition={{ top: topPadding + 8, right: 8 }}>
        <Camera
          ref={camera}
          initialViewState={bounds ? { bounds, padding } : { center: DEFAULT_CENTER, zoom: 6 }}
        />
        <GeoJSONSource id="day-road" data={roads}>
          <Layer
            id="day-road-casing"
            type="line"
            paint={{ 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': theme.scheme === 'dark' ? 0.35 : 0.9 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="day-road"
            type="line"
            paint={{ 'line-color': colors.visit, 'line-width': 4.5 }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
        {/* Legs without road data: faint dots, so they can't be mistaken for a road */}
        <GeoJSONSource id="day-line" data={line}>
          <Layer
            id="day-line"
            type="line"
            paint={{ 'line-color': colors.visit, 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [0.1, 2.2] }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
        <GeoJSONSource
          id="day-stops"
          data={points}
          onPress={(e) => {
            const id = Number(e.nativeEvent.features[0]?.properties?.id);
            if (Number.isFinite(id)) onSelect(id);
          }}
        >
          <Layer
            id="day-stop"
            type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'selected'], 1], 18, 14],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 2],
            }}
          />
          <Layer
            id="day-stop-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-font': FONT,
              'text-size': ['case', ['==', ['get', 'selected'], 1], 15, 13],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': ['get', 'text'] }}
          />
          <Layer
            id="day-stop-name"
            type="symbol"
            filter={['==', ['get', 'selected'], 1]}
            layout={{
              'text-field': ['get', 'title'],
              'text-font': FONT,
              'text-size': 13,
              'text-anchor': 'left',
              'text-offset': [1.9, 0],
              'text-max-width': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': theme.colors.textPrimary, 'text-halo-color': theme.colors.surface, 'text-halo-width': 2 }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.colors.surfaceInset },
  map: { flex: 1 },
}));
