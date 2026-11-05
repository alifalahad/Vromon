/**
 * A district in 3D: Esri's satellite imagery (or the street map), the camera tilted, relief
 * shaded from elevation data, the district raised as a glass block with everything outside it
 * dimmed, and its attractions as pins. Buttons switch satellite / map and 3D / 2D; in 3D two
 * fingers tilt and turn the map. Tapping a pin names it.
 */

import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { PITCH_3D, Relief3D } from '../trips/plan/Map3D';
import { ESRI_CREDIT, useStreetStyle } from '../trips/plan/mapStyle';
import type { Attraction } from './api';

const FONT = ['Noto Sans Bold'];
const WORLD: GeoJSON.Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

export function DistrictMap({
  geometry,
  bbox,
  attractions,
  height,
  topInset,
  accessibilityLabel,
}: {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  bbox: [number, number, number, number] | null;
  attractions: Attraction[];
  height: number;
  topInset: number;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReduceMotion();
  const camera = useRef<CameraRef>(null);
  const [satellite, setSatellite] = useState(true);
  const [is3d, setIs3d] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const mapStyle = useStreetStyle(theme.scheme, satellite, i18n.language);
  const padding = useMemo(() => ({ top: topInset + 64, right: 24, bottom: 24, left: 24 }), [topInset]);

  // The district, and the world with the district cut out (to dim what's outside it)
  const [district, mask] = useMemo<[GeoJSON.FeatureCollection, GeoJSON.FeatureCollection]>(() => {
    if (!geometry) return [{ type: 'FeatureCollection', features: [] }, { type: 'FeatureCollection', features: [] }];
    const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
    return [
      { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] },
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ...rings] } }],
      },
    ];
  }, [geometry]);
  const pins = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: attractions
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => ({
          type: 'Feature',
          properties: { slug: a.slug, name: (i18n.language === 'bn' ? a.name_bn : a.name_en) || a.name_en || a.name_bn || '', on: a.slug === picked ? 1 : 0 },
          geometry: { type: 'Point', coordinates: [a.longitude as number, a.latitude as number] },
        })),
    }),
    [attractions, picked, i18n.language],
  );

  const tilted = useRef(false);
  useEffect(() => {
    if (!tilted.current) {
      tilted.current = true;
      return;
    }
    if (bbox) camera.current?.fitBounds(bbox, { padding, pitch: is3d ? PITCH_3D : 0, bearing: 0, duration: reduceMotion ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the switch changes
  }, [is3d]);

  const lineColor = satellite ? '#FFFFFF' : theme.colors.accent;
  return (
    <View style={[styles.wrap, { height }]} accessible={false} accessibilityLabel={accessibilityLabel} testID="district-map">
      <Map style={styles.map} mapStyle={mapStyle} logo={false} compass={is3d} touchPitch={is3d} attribution attributionPosition={{ bottom: 8, right: 8 }}>
        <Camera ref={camera} initialViewState={bbox ? { bounds: bbox, padding, pitch: PITCH_3D } : { center: [90.35, 23.7], zoom: 6 }} />
        <Relief3D on={is3d} dark={theme.scheme === 'dark' && !satellite} />
        <GeoJSONSource id="district-mask" data={mask}>
          <Layer id="district-mask" type="fill" paint={{ 'fill-color': '#000000', 'fill-opacity': satellite ? 0.45 : 0.25 }} />
        </GeoJSONSource>
        <GeoJSONSource id="district" data={district}>
          <Layer
            id="district-block"
            type="fill-extrusion"
            layout={{ visibility: is3d ? 'visible' : 'none' }}
            paint={{ 'fill-extrusion-color': theme.colors.accent, 'fill-extrusion-height': 2500, 'fill-extrusion-opacity': 0.22 }}
          />
          <Layer id="district-line" type="line" paint={{ 'line-color': lineColor, 'line-width': 3 }} layout={{ 'line-join': 'round' }} />
        </GeoJSONSource>
        <GeoJSONSource
          id="district-pins"
          data={pins}
          onPress={(e) => setPicked(String(e.nativeEvent.features[0]?.properties?.slug ?? '') || null)}
        >
          <Layer
            id="district-pin"
            type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'on'], 1], 9, 6],
              'circle-color': '#F2B13C',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="district-pin-name"
            type="symbol"
            filter={['==', ['get', 'on'], 1]}
            layout={{ 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 13, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 12 }}
            paint={{ 'text-color': '#FFFFFF', 'text-halo-color': '#000000', 'text-halo-width': 1.5 }}
          />
        </GeoJSONSource>
      </Map>
      <View style={styles.toggles}>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => setSatellite((s) => !s)}
          style={styles.toggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: satellite }}
          accessibilityLabel={t('plan.mapSatellite')}
          hitSlop={8}
          testID="district-satellite-toggle"
        >
          <Text style={styles.toggleText}>{satellite ? t('plan.mapStreets') : t('plan.mapSatellite')}</Text>
        </PressableScale>
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => setIs3d((v) => !v)}
          style={styles.toggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: is3d }}
          accessibilityLabel={t('plan.map3d')}
          hitSlop={8}
          testID="district-3d-toggle"
        >
          <Text style={styles.toggleText}>{is3d ? '2D' : '3D'}</Text>
        </PressableScale>
      </View>
      <Text style={styles.credit} accessibilityElementsHidden importantForAccessibility="no">
        {ESRI_CREDIT}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { width: '100%', backgroundColor: t.colors.surfaceInset },
  map: { flex: 1 },
  toggles: { position: 'absolute', right: 12, bottom: 44, flexDirection: 'row', gap: 8 },
  toggle: {
    minHeight: 44,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    elevation: 3,
  },
  toggleText: { color: t.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  credit: { position: 'absolute', left: 8, bottom: 8, fontSize: 10, color: '#333333', backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 4 },
}));
