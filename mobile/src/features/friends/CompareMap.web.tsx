/** Web placeholder: MapLibre Native runs on Android/iOS (the web map arrives with the web target). */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { CompareView } from '../../types';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapView } from '../preferences/store';

export function CompareMap({ theme }: { theme: ResolvedMapTheme; view: MapView; data: CompareView; center: [number, number] }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.base.water }]} />;
}
