/**
 * Trip screen map — web fallback. MapLibre Native has no web build here, so the
 * web shows a plain panel; the plan sheet below lists every stop.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { makeStyles } from '../../../ui/theme';
import type { Coord, StopKind } from './timeline';

export type MapPin = { id: number; n: number; kind: StopKind; coord: Coord; title: string };

export function DayMap({ pins }: { pins: MapPin[]; selectedId: number | null; onSelect: (id: number) => void; fitKey: string; topPadding: number; bottomPadding: number; accessibilityLabel: string }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID="day-map">
      <Text style={styles.text}>The map is available in the Android and iOS app ({pins.length} stops).</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center', padding: 32 },
  text: { color: t.colors.textSecondary, textAlign: 'center' },
}));
