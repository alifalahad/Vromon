/** Web placeholder: MapLibre Native runs on Android/iOS (the web map arrives with the web target). */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Compare } from '../../types';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapLevel } from '../map/levels';

export function CompareMap({ theme }: { theme: ResolvedMapTheme; data: Compare; center: [number, number]; onLevelChange?: (level: MapLevel) => void }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.base.water }]} />;
}
