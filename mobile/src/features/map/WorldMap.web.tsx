/**
 * Web placeholder: MapLibre Native runs on Android/iOS. The web map (maplibre-gl
 * with the same style data) arrives with the web target.
 */

import React, { forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Visit } from '../../types';
import type { ResolvedMapTheme } from '../mapThemes/resolve';
import type { MapView } from '../preferences/store';
import type { PlaceRef } from './visits';

export type PressedPlace = PlaceRef & { name: string };
export type WorldMapHandle = { recentre: () => void };

type Props = { view: MapView; visits: readonly Visit[]; theme: ResolvedMapTheme; onPressPlace: (place: PressedPlace) => void };

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap({ visits }, ref) {
  const { t } = useTranslation();
  useImperativeHandle(ref, () => ({ recentre: () => {} }));
  const countries = visits.filter((v) => v.place_type === 'country').length;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{t('map.views.countries')}: {countries}</Text>
      <Text style={styles.text}>The interactive map is available in the Android app.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { color: '#B2B2B2', fontSize: 15 },
});
