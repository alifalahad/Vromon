/**
 * Vromon Mobile — Trips tab (rebuilt in docs/ui-refresh step 9, frames 15, 16 and 21).
 *
 * A fixed header ("Trips", "New trip") that the list scrolls under, with a hairline once something is
 * under it. Then the next trip (the one you're on, else the soonest) as the hero card, one line of
 * numbers that opens "Your trips so far", the "Rate your trip" card when a finished trip waits for it,
 * and the other trips: On now / Upcoming / With friends / Past. Nothing covers anything (D9).
 * No trips: "Plan your first trip".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useScrollToTop } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, Text, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { useVisits } from '../../src/features/map/visits';
import { groupTrips, localToday, tripPhase } from '../../src/features/trips/dates';
import { NextTripCard } from '../../src/features/trips/NextTripCard';
import { RateTripReminder } from '../../src/features/trips/review/RateTripReminder';
import { useTrips, useTripStats } from '../../src/features/trips/queries';
import { TripRow } from '../../src/features/trips/TripCard';
import { TripNumbers } from '../../src/features/trips/TripNumbers';
import { onMap, useMarkVisited } from '../../src/features/trips/useMarkVisited';
import { roomsApi } from '../../src/services/api';
import type { Trip } from '../../src/types';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { HeaderPill, TabHeader } from '../../src/ui/TabHeader';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function TripsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const listRef = useRef<SectionList<Trip>>(null);
  useScrollToTop(listRef);
  const [scrolled, setScrolled] = useState(false);

  const today = localToday();
  const me = useMe();
  const trips = useTrips();
  // Friends' trips you joined to plan together (friends-chat step 7), not yet over
  const joined = useQuery({ queryKey: ['joinedTrips'], queryFn: () => roomsApi.joined(), enabled: !!me.data });
  const stats = useTripStats(undefined, today);
  const visits = useVisits(me.data?.id);
  const marking = useMarkVisited(me.data?.id);
  const visited = useMemo(() => new Set((visits.data ?? []).filter((v) => v.status !== 'want').map((v) => `${v.place_type}:${v.place_code}`)), [visits.data]);

  // The next trip: the one you're on, else the soonest upcoming; the rest are listed below it
  const all = groupTrips(trips.data ?? [], today);
  const next = all.find((s) => s.phase === 'ongoing')?.data[0] ?? all.find((s) => s.phase === 'upcoming')?.data[0];
  const withFriends = (joined.data ?? []).filter((trip) => tripPhase(trip.start_date, trip.end_date, today) !== 'past');
  const mineSections = all.map((s) => ({ ...s, data: s.data.filter((trip) => trip !== next) })).filter((s) => s.data.length);
  // "With friends" goes before past trips
  const sections: { phase: string; data: Trip[] }[] = [
    ...mineSections.filter((s) => s.phase !== 'past'),
    ...(withFriends.length ? [{ phase: 'withFriends', data: withFriends }] : []),
    ...mineSections.filter((s) => s.phase === 'past'),
  ];
  const hasTrips = (trips.data?.length ?? 0) > 0 || withFriends.length > 0;
  const open = (trip: Trip) => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });

  const refresh = () => {
    void trips.refetch();
    void joined.refetch();
    void stats.refetch();
  };

  return (
    <View style={styles.container}>
      <TabHeader
        title={t('trips.title')}
        scrolled={scrolled}
        actions={<HeaderPill label={t('trips.newTrip')} onPress={() => router.push('/trip/new')} testID="plan-trip-fab" />}
        account={<AccountButton testID="account-button-trips" />}
        testID="trips-header"
      />
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshing={trips.isRefetching}
        onRefresh={refresh}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 2)}
        scrollEventThrottle={32}
        testID="trips-list"
        ListHeaderComponent={
          hasTrips ? (
            <View style={styles.header}>
              {next ? <NextTripCard trip={next} today={today} /> : null}
              <TripNumbers stats={stats.data} onPress={() => router.push('/stats/trips')} />
              <RateTripReminder trips={[...(trips.data ?? []), ...(joined.data ?? [])]} today={today} />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle} accessibilityRole="header" testID={`section-${section.phase}`}>
            {section.phase === 'ongoing' ? t('trips.onNow') : t(`trips.${section.phase}`)}
          </Text>
        )}
        renderItem={({ item }) => {
          const past = tripPhase(item.start_date, item.end_date, today) === 'past';
          const theirs = !!me.data && !!item.user_id && item.user_id !== me.data.id;
          return (
            <TripRow
              trip={item}
              today={today}
              onPress={() => open(item)}
              onMap={past && !theirs && visits.data ? onMap(item, visited) : undefined}
              onMark={past && !theirs && visits.data && (item.stops?.length ?? 0) > 0 ? () => marking.mark(item) : undefined}
              marking={marking.busyId === item.id}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          trips.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.link} />
            </View>
          ) : trips.isError ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{trips.error instanceof Error ? trips.error.message : t('common.error')}</Text>
              <Button variant="secondary" label={t('common.retry')} onPress={refresh} />
            </View>
          ) : hasTrips ? null : (
            <View style={styles.first} testID="trips-empty">
              <View style={styles.firstIcon}>
                <MaterialCommunityIcons name="map-marker-path" size={32} color={colors.link} />
              </View>
              <Text style={styles.firstTitle} accessibilityRole="header">
                {t('trips.firstTitle')}
              </Text>
              <Text style={styles.muted}>{t('trips.firstBody')}</Text>
              <Button label={t('trips.planTrip')} icon="plus" onPress={() => router.push('/trip/new')} testID="plan-first-trip" />
            </View>
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  list: { paddingTop: t.spacing.xs, paddingBottom: t.spacing.xxl },
  header: { gap: t.spacing.md },
  sectionTitle: {
    fontFamily: t.type.title.fontFamily,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 'normal',
    color: t.colors.textPrimary,
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.lg + 2,
    paddingBottom: 10,
  },
  separator: { height: t.spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, paddingHorizontal: 32, paddingTop: 48 },
  muted: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  errorText: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  first: {
    marginHorizontal: t.spacing.lg,
    marginTop: t.spacing.md,
    padding: t.spacing.xl,
    borderRadius: 24,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    gap: t.spacing.md,
  },
  firstIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  firstTitle: { ...t.type.headline, fontSize: 22, color: t.colors.textPrimary, textAlign: 'center' },
}));
