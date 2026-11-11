/**
 * Esri's satellite imagery as a layer of the street map, under the labels: on, it fades in
 * over the map's own drawing (OpenStreetMap's names stay on top); off, it fades out. One map,
 * no style reload, so the switch is smooth. Put it first among the map's sources.
 */

import { Layer, RasterSource } from '@maplibre/maplibre-react-native';
import React from 'react';

import { ANCHORS, ESRI_IMAGERY, ESRI_IMAGERY_CREDIT, SATELLITE_FADE_MS } from './mapStyle';

export function SatelliteLayer({ on, scheme }: { on: boolean; scheme: 'light' | 'dark' }) {
  return (
    <RasterSource id="esri-imagery" tiles={[ESRI_IMAGERY]} tileSize={256} maxzoom={19} attribution={ESRI_IMAGERY_CREDIT}>
      <Layer
        id="esri-imagery"
        type="raster"
        beforeId={ANCHORS[scheme].satellite}
        paint={{
          'raster-opacity': on ? 1 : 0,
          'raster-opacity-transition': { duration: SATELLITE_FADE_MS, delay: 0 },
          'raster-fade-duration': 200,
        }}
      />
    </RasterSource>
  );
}
