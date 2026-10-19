/**
 * The bottom of the plan sheet: the trip's route (cities and how you travel),
 * the traveller's must-dos (and the style the plan was built from), photos, and
 * plan feedback.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { FeedbackForm } from '../../../components/FeedbackForm';
import { placesApi } from '../../../services/api';
import type { Trip } from '../../../types';
import { Button } from '../../../ui/Button';
import { makeStyles, useTheme } from '../../../ui/theme';
import { PhotoStrip } from '../../photos/PhotoStrip';
import { useMustDoText } from '../new/useMustDoText';
import { StopList } from '../TripCard';
import { usePlanFormat } from './usePlanFormat';

export function TripDetails({ trip, ownerId, mine, hasPlan }: { trip: Trip; ownerId: string | undefined; mine: boolean; hasPlan: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const f = usePlanFormat();
  const photoTarget = useMemo(() => ({ trip_id: trip.id }), [trip.id]);
  const { colors } = useTheme();
  const text = useMustDoText();
  const pref = trip.preference;
  const cons = trip.constraints;
  const musts = cons?.must_sees ?? [];
  const busy = cons?.busy ?? [];
  const skip = cons?.excluded_places ?? [];
  const places = useQuery({
    queryKey: ['places', trip.destination],
    queryFn: () => placesApi.list({ destination: trip.destination }),
    enabled: musts.length + skip.length > 0,
  });
  const placeName = (id: number) => places.data?.find((p) => p.id === id)?.name ?? '…';

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('plan.details')}
      </Text>

      <View style={styles.block} testID="trip-route">
        <View style={styles.blockHeader}>
          <Text style={styles.blockTitle}>{t('trips.route')}</Text>
          {mine && (
            <Button
              variant="small"
              label={t('trips.editRoute')}
              icon="pencil-outline"
              onPress={() => router.push({ pathname: '/trip/route/[id]', params: { id: trip.id } })}
              testID="edit-route"
            />
          )}
        </View>
        {trip.stops?.length ? <StopList stops={trip.stops} /> : <Text style={styles.muted}>{t('trips.noStops')}</Text>}
      </View>

      {pref && (
        <View style={styles.block} testID="trip-must-dos">
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{t('mustDos.section')}</Text>
            {mine && (
              <Button
                variant="small"
                label={t('mustDos.edit')}
                icon="pencil-outline"
                onPress={() => router.push({ pathname: '/trip/must-dos/[id]', params: { id: trip.id } })}
                testID="edit-must-dos"
              />
            )}
          </View>
          {!musts.length && !busy.length && !skip.length && !pref.arrive_time && !pref.leave_time ? (
            <Text style={styles.muted}>{t('mustDos.none')}</Text>
          ) : null}
          {musts.map((m) => (
            <View key={m.place_id} style={styles.mustRow}>
              <MaterialCommunityIcons name="star-outline" size={20} color={colors.link} />
              <Text style={[styles.lineStrong, styles.flex]}>{placeName(m.place_id)}</Text>
              <Text style={styles.line}>{text.mustSeeLine(m)}</Text>
            </View>
          ))}
          {busy.map((b, i) => (
            <View key={`${b.day}-${b.start}-${i}`} style={styles.mustRow}>
              <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.textSecondary} />
              <Text style={[styles.lineStrong, styles.flex]}>{b.label || t('newTrip.busy')}</Text>
              <Text style={styles.line}>{text.busyWhen(b, trip.start_date)}</Text>
            </View>
          ))}
          {pref.arrive_time || pref.leave_time ? (
            <Text style={styles.line}>
              {[
                pref.arrive_time ? t('mustDos.arrives', { time: f.time(pref.arrive_time) }) : null,
                pref.leave_time ? t('mustDos.leaves', { time: f.time(pref.leave_time) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {skip.length > 0 && <Text style={styles.line}>{t('mustDos.skipList', { list: skip.map(placeName).join(', ') })}</Text>}
          <Text style={styles.muted}>
            {[
              pref.interests.map((i) => t(`interests.${i}`, { defaultValue: i })).join(', '),
              t(`newTrip.paces.${pref.travel_style}`, { defaultValue: pref.travel_style }),
              `${f.time(pref.preferred_start_time)}–${f.time(pref.preferred_end_time)}`,
              cons?.avoid_crowded ? t('plan.avoidCrowds') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      )}

      <PhotoStrip ownerId={ownerId} filter={photoTarget} target={photoTarget} canEdit={mine} />

      {mine && hasPlan && <FeedbackForm tripId={trip.id} />}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.spacing.lg, marginTop: t.spacing.xxl },
  heading: { ...t.type.title, color: t.colors.textPrimary },
  block: { gap: t.spacing.sm },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: t.spacing.sm },
  blockTitle: { ...t.type.headline, color: t.colors.textPrimary },
  line: { ...t.type.callout, color: t.colors.textSecondary },
  lineStrong: { ...t.type.callout, color: t.colors.textPrimary, fontWeight: '600' },
  mustRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 32 },
  flex: { flex: 1 },
  muted: { ...t.type.callout, color: t.colors.textTertiary },
}));
