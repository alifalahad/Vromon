/**
 * The 3D view's extra layers, under whatever else the map shows: shaded relief from open
 * elevation data (AWS Terrain Tiles, Terrarium encoding) and buildings raised to their
 * height from OpenFreeMap's OpenStreetMap tiles (from zoom 14). Neither needs a key.
 *
 * They're always mounted and hidden in 2D (`visibility`), so turning 3D on keeps them below
 * the route and pins instead of on top, and no tiles are fetched while they're hidden.
 * Put this first among the map's sources. `PITCH_3D` is the camera tilt that goes with it.
 */

import { Layer, RasterDEMSource, VectorSource } from '@maplibre/maplibre-react-native';
import React from 'react';

export const PITCH_3D = 60;
export const CREDIT_3D = 'Terrain: Mapzen / AWS Terrain Tiles · Buildings: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors';
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';

/** `beforeId`: the layer to go under (the style's first label, so names stay on top). */
export function Relief3D({ on, dark = false, beforeId }: { on: boolean; dark?: boolean; beforeId?: string }) {
  const visibility = on ? 'visible' : 'none';
  return (
    <>
      <RasterDEMSource id="relief-dem" tiles={[DEM_TILES]} encoding="terrarium" tileSize={256} maxzoom={14} attribution={CREDIT_3D}>
        <Layer
          id="relief-shade"
          type="hillshade"
          beforeId={beforeId}
          layout={{ visibility }}
          // Default colours: this MapLibre build reads hillshade colours as lists (several light
          // directions) and crashes on a single colour
          paint={{ 'hillshade-exaggeration': 0.65 }}
        />
      </RasterDEMSource>
      <VectorSource id="relief-osm" url={OPENFREEMAP}>
        <Layer
          id="relief-buildings"
          type="fill-extrusion"
          beforeId={beforeId}
          source-layer="building"
          minzoom={14}
          layout={{ visibility }}
          paint={{
            'fill-extrusion-color': dark ? '#5B6270' : '#D9D3C7',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.88,
          }}
        />
      </VectorSource>
    </>
  );
}
