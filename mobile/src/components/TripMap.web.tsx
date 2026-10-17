/**
 * Trip map — web fallback. MapLibre Native has no web build here, so on web we
 * list each day's stops with coordinates and an OpenStreetMap link instead.
 */

import React from 'react';
import { Linking, Text, View } from 'react-native';

import { PressableScale } from '../ui/PressableScale';
import { makeStyles } from '../ui/theme';
import type { ItineraryDay } from '../types';
import { dayColor, mapStops } from '../utils/itinerary';
import { MapLegendText } from './MapLegendText';

export function TripMap({ days }: { days: ItineraryDay[]; hotel?: unknown }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <Text style={styles.notice}>The interactive map is available in the Android/iOS app. Stops in visiting order:</Text>
      {days.map((day) => (
        <View key={day.id} style={styles.day}>
          <Text style={[styles.dayTitle, { color: dayColor(day.day_number) }]}>Day {day.day_number}</Text>
          {mapStops(day).map((s) => (
            <PressableScale
              key={s.id}
              onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=15/${s.latitude}/${s.longitude}`)}
            >
              <Text style={styles.stop}>
                {s.order}. {s.title} · {s.startTime} · {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} ↗
              </Text>
            </PressableScale>
          ))}
        </View>
      ))}
      <MapLegendText />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: 12 },
  notice: { color: t.colors.textSecondary, fontSize: 13 },
  day: { gap: 4 },
  dayTitle: { fontWeight: '700' },
  stop: { color: t.colors.link, fontSize: 13 },
}));
