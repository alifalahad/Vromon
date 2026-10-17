/**
 * Web placeholder: MapLibre Native runs on Android/iOS. Shows the draft's water
 * and land colours until the web map (maplibre-gl) arrives with the web target.
 */

import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Visit } from '../../types';
import type { ResolvedMapTheme } from './resolve';

export type PreviewContent =
  | { mode: 'map'; visits: readonly Visit[] }
  | { mode: 'friends'; mine: readonly string[]; theirs: readonly string[] };

export function ThemePreviewMap({ theme }: { theme: ResolvedMapTheme; content: PreviewContent; bounds: LngLatBounds }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.base.water }]}>
      <View style={[styles.land, { backgroundColor: theme.base.land, borderColor: theme.base.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  land: { position: 'absolute', top: '20%', left: '15%', right: '25%', bottom: '15%', borderRadius: 40, borderWidth: 1 },
});
