/**
 * Trip map (Android / iOS) — MapLibre, the app's one map engine.
 *
 * Streets come from OpenFreeMap (OpenStreetMap data, no key; MapLibre shows the
 * attribution). Numbered markers per activity and a dashed line per day join them
 * in visiting order. The lines are straight-line connections between stops,
 * NOT road routes; the caption says so. Tap a marker to see what it is.
 */

import { Camera, GeoJSONSource, Layer, Map, type LngLatBounds } from '@maplibre/maplibre-react-native';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { makeStyles, useTheme } from '../ui/theme';
import type { ItineraryDay } from '../types';
import { dayColor, mapStops, type MapStop } from '../utils/itinerary';

const STREETS = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
const FONT = ['Noto Sans Regular'];
const HOTEL_COLOR = '#7A7A7A';

type Hotel = { name: string; latitude?: number; longitude?: number } | null | undefined;
type Point = { latitude: number; longitude: number };

/** [west, south, east, north] around the points, with a margin; null without points. */
export function boundsFor(points: Point[]): LngLatBounds | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const pad = (lo: number, hi: number) => Math.max((hi - lo) * 0.15, 0.005);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return [w - pad(w, e), s - pad(s, n), e + pad(w, e), n + pad(s, n)];
}

export function TripMap({ days, hotel }: { days: ItineraryDay[]; hotel?: Hotel }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);

  const perDay = useMemo(() => days.map((d) => ({ day: d, stops: mapStops(d) })), [days]);
  const [hotelLat, hotelLon] = [hotel?.latitude, hotel?.longitude];
  const hotelPoint = useMemo(() => (hotelLat != null && hotelLon != null ? { latitude: hotelLat, longitude: hotelLon } : null), [hotelLat, hotelLon]);
  const all: Point[] = perDay.flatMap((d) => d.stops);
  const bounds = boundsFor(hotelPoint ? [...all, hotelPoint] : all);

  const lines = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: perDay
        .filter(({ stops }) => stops.length > 1)
        .map(({ day, stops }) => ({
          type: 'Feature',
          properties: { color: dayColor(day.day_number) },
          geometry: { type: 'LineString', coordinates: stops.map((s) => [s.longitude, s.latitude]) },
        })),
    }),
    [perDay],
  );
  const markers = useMemo<GeoJSON.FeatureCollection>(() => {
    const stopFeature = (s: MapStop, color: string): GeoJSON.Feature => ({
      type: 'Feature',
      id: `stop-${s.id}`,
      properties: { color, label: String(s.order), info: `Day ${s.dayNumber} · ${s.order}. ${s.title} · starts ${s.startTime}` },
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
    });
    const features = perDay.flatMap(({ day, stops }) => stops.map((s) => stopFeature(s, dayColor(day.day_number))));
    if (hotelPoint) {
      features.unshift({
        type: 'Feature',
        id: 'hotel',
        properties: { color: HOTEL_COLOR, label: 'H', info: `Hotel · ${hotel?.name ?? ''}` },
        geometry: { type: 'Point', coordinates: [hotelPoint.longitude, hotelPoint.latitude] },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [hotel?.name, hotelPoint, perDay]);

  if (!bounds) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No activities with coordinates to show.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <Map style={styles.map} mapStyle={STREETS[scheme]} logo={false} compass={false} touchPitch={false} attribution attributionPosition={{ bottom: 6, right: 6 }}>
          <Camera initialViewState={{ bounds, padding: { top: 40, right: 40, bottom: 40, left: 40 } }} />
          <GeoJSONSource id="trip-lines" data={lines}>
            <Layer id="trip-line" type="line" paint={{ 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] }} layout={{ 'line-cap': 'round' }} />
          </GeoJSONSource>
          <GeoJSONSource
            id="trip-stops"
            data={markers}
            onPress={(e) => {
              const info = e.nativeEvent.features[0]?.properties?.info;
              setPicked(typeof info === 'string' ? info : null);
            }}
          >
            <Layer id="trip-stop" type="circle" paint={{ 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
            <Layer
              id="trip-stop-label"
              type="symbol"
              layout={{ 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }}
              paint={{ 'text-color': '#FFFFFF' }}
            />
          </GeoJSONSource>
        </Map>
      </View>
      <Text style={[styles.picked, !picked && { color: colors.textTertiary }]} accessibilityLiveRegion="polite" testID="trip-map-picked">
        {picked ?? 'Tap a numbered marker to see the stop.'}
      </Text>
      <MapLegend days={days} />
    </View>
  );
}

export function MapLegend({ days }: { days: ItineraryDay[] }) {
  const styles = useStyles();
  return (
    <View style={styles.legend}>
      <View style={styles.legendRow}>
        {days.map((d) => (
          <View key={d.id} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: dayColor(d.day_number) }]} />
            <Text style={styles.legendText}>Day {d.day_number}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        Dashed lines join stops in visiting order. They are straight lines, not road routes; travel times are estimates at 30 km/h. Map data ©
        OpenStreetMap contributors, tiles by OpenFreeMap.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 10 },
  mapBox: { height: 380, borderRadius: 14, overflow: 'hidden', backgroundColor: t.colors.surface },
  map: { flex: 1 },
  picked: { ...t.type.callout, color: t.colors.textPrimary, minHeight: 22 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: t.colors.textTertiary },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: t.colors.textSecondary, fontSize: 12 },
  caption: { color: t.colors.textTertiary, fontSize: 11, lineHeight: 16 },
}));
