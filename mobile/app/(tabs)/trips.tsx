/**
 * Vromon Mobile — Trips tab (10-trips-tab.jpg).
 *
 * Large title, the stats card (completed trips only), the "mark as visited?"
 * offer for a finished trip, then Upcoming / Ongoing / Past. The + FAB opens the
 * Plan-a-Trip wizard, which returns here when the trip is saved.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useScrollToTop } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, Text, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { useVisits } from '../../src/features/map/visits';
import { groupTrips, localToday, tripToMarkVisited } from '../../src/features/trips/dates';
import { MarkVisitedBanner } from '../../src/features/trips/MarkVisitedBanner';
import { useTrips, useTripStats } from '../../src/features/trips/queries';
import { StatsCard } from '../../src/features/trips/StatsCard';
import { TripCard } from '../../src/features/trips/TripCard';
import type { Trip } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { Fab } from '../../src/ui/Fab';
import { LargeTitle } from '../../src/ui/LargeTitle';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function TripsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const listRef = useRef<SectionList<Trip>>(null);
  useScrollToTop(listRef);

  const today = localToday();
  const me = useMe();
  const trips = useTrips();
  const stats = useTripStats(undefined, today);
  const sections = groupTrips(trips.data ?? [], today);
  const visits = useVisits(me.data?.id);
  const visited = useMemo(
    () => new Set((visits.data ?? []).filter((v) => v.status !== 'want').map((v) => `${v.place_type}:${v.place_code}`)),
    [visits.data],
  );
  // Wait for the map's visits, so a trip with nothing new to mark doesn't flash the offer
  const toMark = visits.data ? tripToMarkVisited(trips.data ?? [], today, visited) : undefined;

  const refresh = () => {
    void trips.refetch();
    void stats.refetch();
  };

  return (
    <View style={styles.container}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshing={trips.isRefetching}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <LargeTitle title={t('trips.title')} />
            <StatsCard stats={stats.data} />
            {toMark ? <MarkVisitedBanner trip={toMark} userId={me.data?.id} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle} accessibilityRole="header" testID={`section-${section.phase}`}>
            {t(`trips.${section.phase}`)}
          </Text>
        )}
        renderItem={({ item }) => <TripCard trip={item} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })} />}
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
          ) : (
            <View style={styles.center} testID="trips-empty">
              <MaterialCommunityIcons name="bag-suitcase-outline" size={56} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>{t('trips.emptyTitle')}</Text>
              <Text style={styles.muted}>{t('trips.emptyBody')}</Text>
            </View>
          )
        }
      />
      <Fab onPress={() => router.push('/trip/new')} accessibilityLabel={t('trips.planTrip')} testID="plan-trip-fab" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  list: { paddingBottom: 120 },
  header: { gap: t.spacing.lg + 2, paddingBottom: t.spacing.sm },
  sectionTitle: { ...t.type.title, fontSize: 26, color: t.colors.textPrimary, paddingHorizontal: t.spacing.lg + 2, paddingTop: t.spacing.xxl, paddingBottom: t.spacing.md },
  separator: { height: t.spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, paddingHorizontal: 32, paddingTop: 48 },
  muted: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  errorText: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  emptyTitle: { ...t.type.headline, fontSize: 20, color: t.colors.textPrimary },
}));
