/**
 * Trip map (Android / iOS) — react-native-maps, included in Expo Go.
 *
 * Numbered markers per activity and a dashed line per day connecting them in
 * visiting order. The lines are straight-line connections between stops, NOT
 * road routes; the caption says so.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { colors } from '../theme';
import type { ItineraryDay } from '../types';
import { dayColor, mapStops, regionFor } from '../utils/itinerary';

export function TripMap({ days, hotel }: { days: ItineraryDay[]; hotel?: { name: string; latitude?: number; longitude?: number } | null }) {
  const perDay = useMemo(() => days.map((d) => ({ day: d, stops: mapStops(d) })), [days]);
  const all = perDay.flatMap((d) => d.stops);
  const hotelPoint =
    hotel?.latitude != null && hotel?.longitude != null ? { latitude: hotel.latitude, longitude: hotel.longitude } : null;
  const region = regionFor(hotelPoint ? [...all, hotelPoint] : all);

  if (!region) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No activities with coordinates to show.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView style={styles.map} initialRegion={region}>
        {hotelPoint && <Marker coordinate={hotelPoint} title={`🏨 ${hotel?.name}`} pinColor="#94A3B8" />}
        {perDay.map(({ day, stops }) => (
          <React.Fragment key={day.id}>
            {stops.length > 1 && (
              <Polyline
                coordinates={stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude }))}
                strokeColor={dayColor(day.day_number)}
                strokeWidth={3}
                lineDashPattern={[8, 6]}
              />
            )}
            {stops.map((s) => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                title={`Day ${s.dayNumber} · ${s.order}. ${s.title}`}
                description={`Starts ${s.startTime}`}
                pinColor={dayColor(day.day_number)}
              />
            ))}
          </React.Fragment>
        ))}
      </MapView>
      <MapLegend days={days} />
    </View>
  );
}

export function MapLegend({ days }: { days: ItineraryDay[] }) {
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
        Dashed lines join stops in visiting order. They are straight lines, not road routes; travel times are estimates at 30 km/h.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  map: { width: '100%', height: 380, borderRadius: 14 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: colors.textDim },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  caption: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
});
