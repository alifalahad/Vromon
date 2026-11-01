/**
 * A trip room's pinned plan (mockup 10): how many stops, when the trip is, the first
 * places by day, and Open. Tapping anywhere opens the trip.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { RoomTrip } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { localToday } from '../trips/dates';
import { usePlanFormat } from '../trips/plan/usePlanFormat';

const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / dayMs);

/** "in 36 days", "tomorrow", "day 2 of 3", "ended" */
export function planWhen(trip: Pick<RoomTrip, 'start_date' | 'end_date'>, t: TFunction, n: (v: number) => string, today = localToday()): string {
  const until = daysBetween(today, trip.start_date);
  if (until > 1) return t('chat.room.inDays', { count: until, n: n(until) });
  if (until === 1) return t('chat.room.tomorrow');
  if (today <= trip.end_date) {
    const days = daysBetween(trip.start_date, trip.end_date) + 1;
    return t('chat.room.dayOf', { day: n(1 - until), days: n(days) });
  }
  return t('chat.room.ended');
}

/** "The plan · 9 stops · in 36 days" and "Day 1 Lawachara, Tea Cabin · Day 2 Madhabpur Lake" */
export function planLines(trip: RoomTrip, t: TFunction, n: (v: number) => string) {
  const stops = trip.stops > 0 ? t('chat.room.stops', { count: trip.stops, n: n(trip.stops) }) : t('chat.room.noPlan');
  const title = [t('chat.room.plan'), stops, planWhen(trip, t, n)].join(' · ');
  const preview = trip.preview.map((d) => t('chat.room.dayPlaces', { day: n(d.day), places: d.places.join(', ') })).join(' · ');
  return { title, preview };
}

export function PlanBar({ trip, onOpen }: { trip: RoomTrip; onOpen: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const { title, preview } = planLines(trip, t, f.n);
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onOpen}
      style={styles.bar}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}`}
      accessibilityHint={t('chat.room.openPlan')}
      testID="room-plan-bar"
    >
      <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.onAccentSoft} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      <Text style={styles.open}>{t('chat.room.open')}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  text: { flex: 1, gap: 2 },
  title: { ...t.type.footnote, fontWeight: '600', color: t.colors.textPrimary },
  preview: { ...t.type.footnote, color: t.colors.textSecondary },
  open: { ...t.type.footnote, fontWeight: '600', color: t.colors.onAccentSoft },
}));
