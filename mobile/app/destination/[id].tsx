/**
 * Vromon Mobile — Destination screen.
 *
 * Lists the destination's places from the backend (GET /destinations/{id} and
 * /destinations/{id}/places) with a category filter, and starts trip planning there.
 * Opened from the wizard's "Where to?" step (`from=wizard`), it is browse-only:
 * going back returns to the wizard.
 */

import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';

import { filterByCategory, formatEntryCost, placeCategories } from '../../src/features/places';
import { destinationsApi } from '../../src/services/api';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import type { Place } from '../../src/types';

export default function DestinationScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const destinationId = Number(id);
  const router = useRouter();
  const [category, setCategory] = useState<string | null>(null);

  const destination = useQuery({
    queryKey: ['destination', destinationId],
    queryFn: () => destinationsApi.get(destinationId),
    enabled: !!destinationId,
  });
  const places = useQuery({
    queryKey: ['destination-places', destinationId],
    queryFn: () => destinationsApi.places(destinationId),
    enabled: !!destinationId,
  });

  if (destination.isLoading || places.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={styles.muted}>Loading places…</Text>
      </View>
    );
  }

  const failed = destination.error ?? places.error;
  if (failed || !destination.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{failed instanceof Error ? failed.message : 'Destination not found'}</Text>
        <PressableScale
          style={styles.retryBtn}
          accessibilityRole="button"
          onPress={() => {
            destination.refetch();
            places.refetch();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  const dest = destination.data;
  const all = places.data ?? [];
  const shown = filterByCategory(all, category);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: dest.name }} />
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={places.isRefetching}
        onRefresh={() => places.refetch()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.title}>📍 {dest.name}</Text>
            <Text style={styles.muted}>{dest.country}</Text>
            {dest.description ? <Text style={styles.desc}>{dest.description}</Text> : null}
            {from !== 'wizard' && (
              <PressableScale
                haptic="medium"
                style={styles.planBtn}
                onPress={() => router.push({ pathname: '/trip/new', params: { destination: dest.name } })}
              >
                <Text style={styles.planBtnText}>✈️  Plan a trip to {dest.name}</Text>
              </PressableScale>
            )}

            <Text style={styles.sectionTitle}>
              {all.length} place{all.length === 1 ? '' : 's'}
            </Text>
            {all.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {[null, ...placeCategories(all)].map((c) => (
                  <PressableScale
                    key={c ?? 'all'}
                    haptic="selection"
                    style={[styles.filter, category === c && styles.filterOn]}
                    onPress={() => setCategory(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === c }}
                  >
                    <Text style={[styles.filterText, category === c && styles.filterTextOn]}>{c ?? 'All'}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.muted, styles.empty]}>
            {all.length === 0 ? 'No places have been added for this destination yet.' : 'No places in this category.'}
          </Text>
        }
        ListFooterComponent={
          all.length > 0 ? (
            <Text style={styles.footnote}>Ratings, prices and hours come from the Vromon database (sample data, not independently verified).</Text>
          ) : null
        }
        renderItem={({ item }) => <PlaceCard place={item} />}
      />
    </View>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{place.name}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{place.category}</Text>
        </View>
      </View>
      {place.description ? (
        <Text style={styles.desc} numberOfLines={3}>
          {place.description}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        {place.rating != null && place.rating_known !== false && <Text style={styles.meta}>⭐ {place.rating.toFixed(1)}</Text>}
        <Text style={styles.meta}>💰 {formatEntryCost(place)}</Text>
        {place.hours_known !== false && place.opening_time && place.closing_time && (
          <Text style={styles.meta}>
            🕘 {place.opening_time}–{place.closing_time}
          </Text>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: t.colors.bg },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  headerBlock: { gap: 8, marginBottom: 4 },
  title: { color: t.colors.textPrimary, fontSize: 24, fontWeight: '800' },
  muted: { color: t.colors.textSecondary, fontSize: 13 },
  desc: { color: t.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  planBtn: { backgroundColor: t.colors.accent, paddingVertical: 14, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  planBtnText: { color: t.colors.onAccent, fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: t.colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 12 },
  filters: { gap: 8, paddingVertical: 4 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface },
  filterOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  filterText: { color: t.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  filterTextOn: { color: t.colors.onAccent },
  empty: { textAlign: 'center', paddingVertical: 24 },
  footnote: { color: t.colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 8 },
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { color: t.colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { backgroundColor: t.colors.accentSoft, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20 },
  badgeText: { color: t.colors.onAccentSoft, fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  meta: { color: t.colors.textSecondary, fontSize: 12 },
  errorEmoji: { fontSize: 40 },
  errorText: { color: t.colors.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: t.colors.accent, backgroundColor: t.colors.surface },
  retryText: { color: t.colors.link, fontWeight: '600' },
}));
