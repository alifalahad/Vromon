/**
 * Trip map — web fallback. react-native-maps has no web support, so on web we
 * list each day's stops with coordinates and an OpenStreetMap link instead.
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import type { ItineraryDay } from '../types';
import { dayColor, mapStops } from '../utils/itinerary';
import { MapLegendText } from './MapLegendText';

export function TripMap({ days }: { days: ItineraryDay[]; hotel?: unknown }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.notice}>The interactive map is available in the Android/iOS app. Stops in visiting order:</Text>
      {days.map((day) => (
        <View key={day.id} style={styles.day}>
          <Text style={[styles.dayTitle, { color: dayColor(day.day_number) }]}>Day {day.day_number}</Text>
          {mapStops(day).map((s) => (
            <Pressable
              key={s.id}
              onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=15/${s.latitude}/${s.longitude}`)}
            >
              <Text style={styles.stop}>
                {s.order}. {s.title} · {s.startTime} · {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} ↗
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
      <MapLegendText />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  notice: { color: colors.textMuted, fontSize: 13 },
  day: { gap: 4 },
  dayTitle: { fontWeight: '700' },
  stop: { color: colors.primaryText, fontSize: 13 },
});
