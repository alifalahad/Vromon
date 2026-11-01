/**
 * Share one of your trips in a chat (the share sheet's Trip tile): tap a trip and its
 * card goes into the chat (docs/friends-chat-plan.md, step 4).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { sendCard, tripCard } from '../../../src/features/chat/share';
import { formatRange, groupTrips, localToday } from '../../../src/features/trips/dates';
import { useTrips } from '../../../src/features/trips/queries';
import { destinationsApi } from '../../../src/services/api';
import type { Trip } from '../../../src/types';
import { Button } from '../../../src/ui/Button';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

export default function ShareTripScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const { chat } = useLocalSearchParams<{ chat: string }>();
  const me = useMe().data;
  const trips = useTrips();
  const destinations = useQuery({ queryKey: ['destinations'], queryFn: destinationsApi.list });
  const mine = (trips.data ?? []).filter((trip) => !trip.user_id || trip.user_id === me?.id);
  const sections = groupTrips(mine, localToday());

  const share = (trip: Trip) => {
    if (!me) return;
    sendCard(client, me.id, Number(chat), tripCard(trip, { id: me.id, name: me.display_name || me.username || '' }, destinations.data));
    router.back();
  };

  if (trips.data && !mine.length) {
    return (
      <View style={[styles.screen, styles.empty]} testID="share-no-trips">
        <MaterialCommunityIcons name="bag-suitcase-outline" size={44} color={colors.textTertiary} />
        <Text style={styles.emptyText}>{t('chat.share.noTrips')}</Text>
        <Button label={t('chat.cards.place.planTrip')} variant="secondary" onPress={() => router.replace('/trip/new')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {sections.map((section) => (
        <View key={section.phase}>
          <Text style={styles.section} accessibilityRole="header">
            {section.phase === 'ongoing' ? t('trips.onNow') : t(`trips.${section.phase}`)}
          </Text>
          {section.data.map((trip) => (
            <PressableScale
              key={trip.id}
              pressEffect="opacity"
              haptic="light"
              onPress={() => share(trip)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={t('chat.share.shareTrip', { trip: `${trip.destination}, ${formatRange(trip.start_date, trip.end_date, i18n.language)}` })}
              testID={`share-pick-trip-${trip.id}`}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons name="bag-suitcase-outline" size={22} color={colors.onAccentSoft} />
              </View>
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>
                  {trip.destination}
                </Text>
                <Text style={styles.line}>{formatRange(trip.start_date, trip.end_date, i18n.language)}</Text>
              </View>
              <MaterialCommunityIcons name="send-outline" size={20} color={colors.textSecondary} />
            </PressableScale>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  empty: { alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl },
  emptyText: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  section: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, textTransform: 'uppercase', paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg, paddingBottom: t.spacing.sm },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { ...t.type.body, color: t.colors.textPrimary },
  line: { ...t.type.footnote, color: t.colors.textSecondary },
}));
