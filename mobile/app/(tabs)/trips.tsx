/**
 * Vromon Mobile — Trips tab (trip planner step 8, the "Trips tab" mockup).
 *
 * Large title, the next trip (the one you're on, else the soonest) as a card
 * with its countdown, weather and "Open plan", the stats card, then the other
 * trips: Upcoming / On now / Past, as compact cards. A finished trip shows its
 * photos and "Mark visited" (or "On your map"). No trips: "Plan your first trip".
 * "+ Plan a trip" opens the new-trip flow, which returns here when it's saved.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useScrollToTop } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, Text, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { useVisits } from '../../src/features/map/visits';
import { usePhotos } from '../../src/features/photos/queries';
import { addDays, groupTrips, localToday } from '../../src/features/trips/dates';
import { NextTripCard } from '../../src/features/trips/NextTripCard';
import { useTrips, useTripStats } from '../../src/features/trips/queries';
import { StatsCard } from '../../src/features/trips/StatsCard';
import { TripCard } from '../../src/features/trips/TripCard';
import { onMap, useMarkVisited } from '../../src/features/trips/useMarkVisited';
import type { Photo, Trip } from '../../src/types';
import { Button } from '../../src/ui/Button';
import { Fab } from '../../src/ui/Fab';
import { LargeTitle } from '../../src/ui/LargeTitle';
import { makeStyles, useTheme } from '../../src/ui/theme';

const NO_PHOTOS: Photo[] = [];

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
  const visits = useVisits(me.data?.id);
  const photos = usePhotos(me.data?.id, {});
  const marking = useMarkVisited(me.data?.id);
  const visited = useMemo(
    () => new Set((visits.data ?? []).filter((v) => v.status !== 'want').map((v) => `${v.place_type}:${v.place_code}`)),
    [visits.data],
  );
  const photosByTrip = useMemo(() => {
    const by = new Map<number, Photo[]>();
    for (const p of photos.data ?? []) if (p.trip_id != null) by.set(p.trip_id, [...(by.get(p.trip_id) ?? []), p]);
    return by;
  }, [photos.data]);

  // The next trip: the one you're on, else the soonest upcoming; the rest are listed below it
  const all = groupTrips(trips.data ?? [], today);
  const next = all.find((s) => s.phase === 'ongoing')?.data[0] ?? all.find((s) => s.phase === 'upcoming')?.data[0];
  const sections = all.map((s) => ({ ...s, data: s.data.filter((trip) => trip !== next) })).filter((s) => s.data.length);
  const hasTrips = (trips.data?.length ?? 0) > 0;
  const open = (trip: Trip) => router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
  // On the trip (or the evening before it starts), the next trip opens on Today mode
  const openNext = (trip: Trip) =>
    trip.status !== 'draft' && trip.start_date <= addDays(today, 1) && trip.end_date >= today
      ? router.push({ pathname: '/trip/today/[id]', params: { id: trip.id } })
      : open(trip);

  const refresh = () => {
    void trips.refetch();
    void stats.refetch();
    void photos.refetch();
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
            {next ? <NextTripCard trip={next} today={today} onOpen={() => openNext(next)} /> : null}
            {hasTrips ? <StatsCard stats={stats.data} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle} accessibilityRole="header" testID={`section-${section.phase}`}>
            {section.phase === 'ongoing' ? t('trips.onNow') : t(`trips.${section.phase}`)}
          </Text>
        )}
        renderItem={({ item }) => {
          const past = item.end_date < today;
          return (
            <TripCard
              trip={item}
              today={today}
              onPress={() => open(item)}
              photos={photosByTrip.get(item.id) ?? NO_PHOTOS}
              onMap={past && visits.data ? onMap(item, visited) : undefined}
              onMark={past && visits.data && (item.stops?.length ?? 0) > 0 ? () => marking.mark(item) : undefined}
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
              <Text style={styles.firstTitle} accessibilityRole="header">{t('trips.firstTitle')}</Text>
              <Text style={styles.muted}>{t('trips.firstBody')}</Text>
              <Button label={t('trips.planTrip')} icon="plus" onPress={() => router.push('/trip/new')} testID="plan-first-trip" />
            </View>
          )
        }
      />
      <Fab onPress={() => router.push('/trip/new')} label={t('trips.planTrip')} accessibilityLabel={t('trips.planTrip')} testID="plan-trip-fab" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  list: { paddingBottom: 120 },
  header: { gap: t.spacing.lg + 6, paddingBottom: t.spacing.xs },
  sectionTitle: { ...t.type.headline, fontSize: 20, color: t.colors.textPrimary, paddingHorizontal: t.spacing.lg + 4, paddingTop: t.spacing.xl, paddingBottom: t.spacing.md },
  separator: { height: 10 },
  center: { alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, paddingHorizontal: 32, paddingTop: 48 },
  muted: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
  errorText: { ...t.type.callout, color: t.colors.danger, textAlign: 'center' },
  first: { marginHorizontal: t.spacing.lg, marginTop: t.spacing.md, padding: t.spacing.xl, borderRadius: 24, backgroundColor: t.colors.surface, alignItems: 'center', gap: t.spacing.md },
  firstIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  firstTitle: { ...t.type.headline, fontSize: 22, color: t.colors.textPrimary, textAlign: 'center' },
}));
