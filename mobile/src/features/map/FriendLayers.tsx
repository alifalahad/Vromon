/**
 * Friends on the travel map (map home step 9, mockup 4): a marker on each place
 * friends have been, with the newest friend's initials and "+N" for the rest.
 * Tap: that place's sheet, which names them. Child of <Map>, drawn on top.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import React from 'react';

import type { PlaceType } from '../../types';
import type { ResolvedBase } from '../mapThemes/resolve';
import type { FeaturePress } from './layers';
import { LABEL_FONT } from './style';

// Above the place's name, which sits on the same label point
const LIFT: [number, number] = [0, -24];

export function FriendLayers({
  data,
  base,
  onPressPlace,
}: {
  data: GeoJSON.FeatureCollection;
  base: ResolvedBase;
  onPressPlace: (placeType: PlaceType, code: string) => void;
}) {
  return (
    <GeoJSONSource
      id="friend-footprints"
      data={data}
      hitbox={{ top: 16, right: 16, bottom: 16, left: 16 }}
      onPress={(e: FeaturePress) => {
        const p = e.nativeEvent.features?.[0]?.properties;
        if (p?.place_code) onPressPlace(p.place_type as PlaceType, String(p.place_code));
      }}
    >
      <Layer
        id="friend-avatar"
        type="circle"
        paint={{ 'circle-radius': 13, 'circle-color': ['get', 'color'] as never, 'circle-stroke-width': 2, 'circle-stroke-color': base.water, 'circle-translate': LIFT }}
      />
      <Layer
        id="friend-initials"
        type="symbol"
        layout={{ 'text-field': ['get', 'initials'] as never, 'text-font': LABEL_FONT, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true }}
        paint={{ 'text-color': '#11151B', 'text-translate': LIFT }}
      />
      <Layer
        id="friend-more"
        type="symbol"
        filter={['!=', ['get', 'more'], ''] as never}
        layout={{
          'text-field': ['get', 'more'] as never,
          'text-font': LABEL_FONT,
          'text-size': 11,
          'text-offset': [1.9, 0],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{ 'text-color': base.label, 'text-halo-color': base.labelHalo, 'text-halo-width': 1.5, 'text-translate': LIFT }}
      />
    </GeoJSONSource>
  );
}
