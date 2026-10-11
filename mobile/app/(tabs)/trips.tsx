/**
 * Vromon Mobile — My Trips screen.
 *
 * Lists all saved trips from the backend.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

import { tripsApi } from '../../src/services/api';
import type { Trip } from '../../src/types';
import { confirm, notify } from '../../src/utils/dialogs';
import { formatBDT, nightsBetween } from '../../src/utils/format';

function statusColor(status: string) {
  switch (status) {
    case 'generated': return '#34D399';
    case 'draft': return '#FBBF24';
    default: return '#94A3B8';
  }
}

function TripCard({
  trip,
  onOpen,
  onDelete,
  onDuplicate,
}: {
  trip: Trip;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const nights = nightsBetween(trip.start_date, trip.end_date);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onOpen}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{trip.title ?? trip.destination}</Text>
        <View style={[styles.statusBadge, { borderColor: statusColor(trip.status) }]}>
          <Text style={[styles.statusText, { color: statusColor(trip.status) }]}>
            {trip.status}
          </Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>
        📅 {trip.start_date} → {trip.end_date}  •  {nights} night{nights !== 1 ? 's' : ''}
      </Text>
      {trip.total_budget ? (
        <Text style={styles.cardMeta}>💰 Budget: {formatBDT(trip.total_budget)}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable style={styles.viewBtn} onPress={onOpen}>
          <Text style={styles.viewBtnText}>View →</Text>
        </Pressable>
        <Pressable style={styles.dupBtn} onPress={onDuplicate} accessibilityLabel="Duplicate trip">
          <Text style={styles.viewBtnText}>⧉</Text>
        </Pressable>
        <Pressable
          style={styles.deleteBtn}
          accessibilityLabel="Delete trip"
          onPress={() =>
            confirm('Delete trip', `Delete "${trip.title ?? trip.destination}" and its itinerary?`, 'Delete', onDelete, true)
          }
        >
          <Text style={styles.deleteBtnText}>🗑</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: trips, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trips'],
    queryFn: tripsApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tripsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
    onError: (e) => notify('Delete failed', (e as Error).message),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => tripsApi.duplicate(id),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notify('Trip duplicated', `"${copy.title}" was created as a draft. Generate its itinerary from the trip screen.`);
    },
    onError: (e) => notify('Duplicate failed', (e as Error).message),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <Pressable
          style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
          onPress={() => router.push('/trip/new')}
          id="new-trip-btn"
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading trips…</Text>
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

      {!isLoading && !isError && (!trips || trips.length === 0) && (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            Tap “+ New” to plan your first adventure!
          </Text>
          <Pressable
            style={styles.planBtn}
            onPress={() => router.push('/trip/new')}
          >
            <Text style={styles.planBtnText}>Plan a Trip ✈️</Text>
          </Pressable>
        </View>
      )}

      {trips && trips.length > 0 && (
        <FlatList
          data={trips}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onOpen={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
              onDelete={() => deleteMutation.mutate(item.id)}
              onDuplicate={() => duplicateMutation.mutate(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#F1F5F9' },
  newBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  newBtnPressed: { backgroundColor: '#2563EB' },
  newBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  loadingText: { color: '#94A3B8', marginTop: 8 },
  errorEmoji: { fontSize: 40 },
  errorText: { color: '#F87171', textAlign: 'center', fontSize: 14 },
  retryBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  retryText: { color: '#60A5FA', fontWeight: '600' },
  emptyEmoji: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptyText: { color: '#64748B', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  planBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 8,
  },
  planBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  cardPressed: { backgroundColor: '#243347', transform: [{ scale: 0.98 }] },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F1F5F9', flex: 1 },
  statusBadge: {
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardMeta: { fontSize: 13, color: '#94A3B8' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  viewBtn: {
    flex: 1,
    backgroundColor: '#0F3460',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewBtnText: { color: '#60A5FA', fontWeight: '600', fontSize: 14 },
  dupBtn: {
    backgroundColor: '#0F3460',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#3D1A1A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteBtnText: { fontSize: 16 },
});
