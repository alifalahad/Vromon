/**
 * Vromon Mobile — Home / Explore screen.
 *
 * Shows destinations from the backend with a "Plan a Trip" CTA. Tapping a
 * destination opens its places (app/destination/[id].tsx).
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { destinationsApi } from '../../src/services/api';
import type { Destination } from '../../src/types';

function DestinationCard({
  item,
  onPress,
}: {
  item: Destination;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.place_count ?? 0} places. Browse places`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>📍</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardCountry}>{item.country}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.place_count ?? 0} places</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function ExploreScreen() {
  const router = useRouter();

  const { data: destinations, isLoading, isError, error, refetch } =
    useQuery({
      queryKey: ['destinations'],
      queryFn: destinationsApi.list,
    });

  return (
    <View style={styles.container}>
      {/* Hero header */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Vromon 🌿</Text>
        <Text style={styles.heroSubtitle}>
          AI-powered travel planning for Bangladesh
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.planBtn,
            pressed && styles.planBtnPressed,
          ]}
          onPress={() => router.push('/trip/new')}
          id="plan-trip-btn"
        >
          <Text style={styles.planBtnText}>✈️  Plan a Trip</Text>
        </Pressable>
      </View>

      {/* Section title */}
      <Text style={styles.sectionTitle}>Popular Destinations</Text>

      {/* States */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading destinations…</Text>
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !isError && destinations?.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No destinations found.</Text>
        </View>
      )}

      {destinations && destinations.length > 0 && (
        <FlatList
          data={destinations}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DestinationCard
              item={item}
              onPress={() =>
                router.push({ pathname: '/destination/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  hero: {
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 20,
    lineHeight: 20,
  },
  planBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
  },
  planBtnPressed: {
    backgroundColor: '#2563EB',
    transform: [{ scale: 0.97 }],
  },
  planBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
  errorEmoji: { fontSize: 40 },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
    marginTop: 4,
  },
  retryText: { color: '#60A5FA', fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 14 },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardPressed: {
    backgroundColor: '#243347',
    transform: [{ scale: 0.98 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  cardEmoji: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  cardCountry: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#0F3460',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  badgeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
});
