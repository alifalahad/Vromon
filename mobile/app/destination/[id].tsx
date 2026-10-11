/**
 * Vromon Mobile — Destination screen.
 *
 * Lists the destination's places from the backend (GET /destinations/{id} and
 * /destinations/{id}/places) with a category filter, and starts trip planning there.
 */

import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { filterByCategory, formatEntryCost, placeCategories } from '../../src/features/places';
import { destinationsApi } from '../../src/services/api';
import { colors } from '../../src/theme';
import type { Place } from '../../src/types';

export default function DestinationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        <ActivityIndicator size="large" color={colors.primaryText} />
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
        <Pressable
          style={styles.retryBtn}
          accessibilityRole="button"
          onPress={() => {
            destination.refetch();
            places.refetch();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
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
            <Pressable
              style={({ pressed }) => [styles.planBtn, pressed && styles.planBtnPressed]}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/trip/new', params: { destination: dest.name } })}
            >
              <Text style={styles.planBtnText}>✈️  Plan a trip to {dest.name}</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>
              {all.length} place{all.length === 1 ? '' : 's'}
            </Text>
            {all.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {[null, ...placeCategories(all)].map((c) => (
                  <Pressable
                    key={c ?? 'all'}
                    style={[styles.filter, category === c && styles.filterOn]}
                    onPress={() => setCategory(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === c }}
                  >
                    <Text style={[styles.filterText, category === c && styles.filterTextOn]}>{c ?? 'All'}</Text>
                  </Pressable>
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
        {place.rating != null && <Text style={styles.meta}>⭐ {place.rating.toFixed(1)}</Text>}
        <Text style={styles.meta}>💰 {formatEntryCost(place)}</Text>
        {place.opening_time && place.closing_time && (
          <Text style={styles.meta}>
            🕘 {place.opening_time}–{place.closing_time}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: colors.bg },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  headerBlock: { gap: 8, marginBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 13 },
  desc: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  planBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  planBtnPressed: { backgroundColor: '#2563EB' },
  planBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 12 },
  filters: { gap: 8, paddingVertical: 4 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterTextOn: { color: '#fff' },
  empty: { textAlign: 'center', paddingVertical: 24 },
  footnote: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { backgroundColor: '#0F3460', paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20 },
  badgeText: { color: colors.primaryText, fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  meta: { color: colors.textMuted, fontSize: 12 },
  errorEmoji: { fontSize: 40 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  retryText: { color: colors.primaryText, fontWeight: '600' },
});
