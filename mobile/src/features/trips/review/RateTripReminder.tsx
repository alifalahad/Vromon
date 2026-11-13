/**
 * The Trips tab's one-time "Rate your trip to Khulna?" (trip upgrades step 7, D7): from the day after a trip
 * ends, for two weeks. "Not now" is for good (kept on this phone, per trip); a trip already rated isn't asked
 * about. Never a push notification.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { tripsApi } from '../../../services/api';
import type { Trip } from '../../../types';
import { Button } from '../../../ui/Button';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePreferences } from '../../preferences/store';
import { reminderTrip } from './review';
import { reviewKey } from './TripReviewCard';

export function RateTripReminder({ trips, today }: { trips: readonly Trip[]; today: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const dismissed = usePreferences((s) => s.rateReminderDismissed);
  const dismiss = usePreferences((s) => s.dismissRateReminder);
  const trip = reminderTrip(trips, today, dismissed);
  const review = useQuery({ queryKey: reviewKey(trip?.id ?? 0), queryFn: () => tripsApi.review(trip!.id, today), enabled: !!trip, retry: false });
  // Rated already (or not this traveller's to rate): nothing to ask
  if (!trip || !review.data || review.data.review?.rating != null) return null;
  return (
    <View style={styles.card} testID="rate-reminder">
      <View style={styles.header}>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="star-outline" size={22} color={colors.link} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            {t('review.reminderTitle', { destination: trip.destination })}
          </Text>
          <Text style={styles.body}>{t('review.reminderBody')}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label={t('review.notNow')} variant="secondary" onPress={() => dismiss(trip.id)} testID="rate-reminder-dismiss" />
        <Button
          label={t('review.rate')}
          icon="star"
          onPress={() => router.push({ pathname: '/trip/review/[id]', params: { id: trip.id } })}
          testID="rate-reminder-rate"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 18, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
  text: { flex: 1, gap: 2 },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  body: { ...t.type.footnote, color: t.colors.textSecondary },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
}));
