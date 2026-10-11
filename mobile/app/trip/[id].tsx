/**
 * Vromon Mobile — Trip detail screen.
 *
 * Trip settings, itinerary generation (standard planner or CP-SAT optimizer),
 * duplicate, and feedback.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedbackForm } from '../../src/components/FeedbackForm';
import { ValidationBanner } from '../../src/components/ValidationBanner';
import { ApiError, tripsApi } from '../../src/services/api';
import { colors } from '../../src/theme';
import type { Algorithm, GenerateResult, SolverMeta } from '../../src/types';
import { confirm, notify } from '../../src/utils/dialogs';
import { formatBDT, nightsBetween } from '../../src/utils/format';
import { describeSolver, statusLabel } from '../../src/utils/itinerary';

const ALGORITHMS: { value: Algorithm; label: string; desc: string }[] = [
  { value: 'heuristic', label: 'Standard', desc: 'Fast greedy planner (instant)' },
  { value: 'cpsat', label: 'Optimized', desc: 'OR-Tools optimizer: less travel, strict hours (a few seconds)' },
];

export default function TripDetailScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const tripId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [algorithm, setAlgorithm] = useState<Algorithm>('heuristic');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [failure, setFailure] = useState<{ message: string; solver?: SolverMeta } | null>(null);

  const { data: trip, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => tripsApi.get(tripId),
    enabled: !!tripId,
  });

  const generate = useMutation({
    mutationFn: () => tripsApi.generate(tripId, algorithm),
    onMutate: () => {
      setResult(null);
      setFailure(null);
    },
    onSuccess: (res) => {
      setResult(res);
      for (const key of [['trip', tripId], ['trips'], ['itinerary', tripId], ['budget', tripId]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.detail as { solver?: SolverMeta } | undefined) : undefined;
      setFailure({ message: (err as Error).message, solver: detail?.solver });
    },
  });

  const duplicate = useMutation({
    mutationFn: () => tripsApi.duplicate(tripId),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.push({ pathname: '/trip/[id]', params: { id: copy.id } });
    },
    onError: (e) => notify('Duplicate failed', (e as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => tripsApi.delete(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.back();
    },
    onError: (e) => notify('Delete failed', (e as Error).message),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryText} />
      </View>
    );
  }
  if (isError || !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Trip not found'}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => refetch()}>
          <Text style={styles.secondaryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const pref = trip.preference;
  const cons = trip.constraints;
  const hasItinerary = trip.status === 'generated';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {created === '1' && (
        <View style={styles.savedBanner} accessibilityLiveRegion="polite">
          <Text style={styles.savedTitle}>✓ Trip saved</Text>
          <Text style={styles.savedText}>
            Trip #{trip.id} was stored on the server at {trip.created_at.replace('T', ' ').slice(0, 16)} UTC. These details
            were loaded back from the server.
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <Text style={styles.destination}>📍 {trip.destination}</Text>
        <Text style={styles.title}>{trip.title ?? `${trip.destination} trip`}</Text>
        <Text style={styles.status}>Status: {trip.status}</Text>
      </View>

      <View style={styles.grid}>
        <Info label="Dates" value={`${trip.start_date} → ${trip.end_date}`} />
        <Info label="Nights" value={String(nightsBetween(trip.start_date, trip.end_date))} />
        <Info label="Travellers" value={String(trip.num_travelers)} />
        <Info label="Budget" value={formatBDT(trip.total_budget)} />
      </View>

      {pref && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.chips}>
            {pref.interests.map((i) => <Chip key={i} label={i} />)}
            <Chip label={`🧭 ${pref.travel_style}`} />
            <Chip label={`⚡ ${pref.activity_level}`} />
            <Chip label={`🕘 ${pref.preferred_start_time}–${pref.preferred_end_time}`} />
            {cons && <Chip label={`≤ ${cons.max_activities_per_day}/day`} />}
            {cons?.avoid_crowded && <Chip label="Avoid crowds" />}
            {cons && cons.must_visit.length > 0 && <Chip label={`${cons.must_visit.length} must-visit`} />}
            {cons && cons.excluded_places.length > 0 && <Chip label={`${cons.excluded_places.length} excluded`} />}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Planner</Text>
        {ALGORITHMS.map((a) => (
          <Pressable
            key={a.value}
            onPress={() => setAlgorithm(a.value)}
            style={[styles.option, algorithm === a.value && styles.optionActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: algorithm === a.value }}
          >
            <Text style={styles.optionLabel}>{algorithm === a.value ? '◉' : '○'} {a.label}</Text>
            <Text style={styles.optionDesc}>{a.desc}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.primaryBtn, generate.isPending && styles.disabled]}
        disabled={generate.isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: generate.isPending, busy: generate.isPending }}
        onPress={() =>
          hasItinerary
            ? confirm('Replace itinerary?', 'Your current itinerary and its edits will be replaced.', 'Generate', () => generate.mutate())
            : generate.mutate()
        }
      >
        {generate.isPending ? (
          <View style={styles.inline}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.primaryText}>{algorithm === 'cpsat' ? 'Optimizing…' : 'Planning…'}</Text>
          </View>
        ) : (
          <Text style={styles.primaryText}>✨ {hasItinerary ? 'Regenerate itinerary' : 'Generate itinerary'}</Text>
        )}
      </Pressable>

      {failure && (
        <View style={styles.failure}>
          <Text style={styles.failureTitle}>Could not generate</Text>
          <Text style={styles.failureText}>{failure.message}</Text>
          {failure.solver?.diagnostics.map((d, i) => (
            <Text key={i} style={styles.failureText}>• {d}</Text>
          ))}
          {failure.solver && <Text style={styles.hint}>Change the trip’s must-visit/excluded places or daily hours, then try again. Your saved itinerary was not changed.</Text>}
          <Pressable style={styles.secondaryBtn} onPress={() => generate.mutate()} disabled={generate.isPending} accessibilityRole="button">
            <Text style={styles.secondaryText}>↻ Try again</Text>
          </Pressable>
        </View>
      )}

      {result && (
        <View style={{ gap: 8 }}>
          <Text style={styles.hint}>
            {result.replaced_previous ? 'Your previous itinerary was replaced. ' : ''}
            Generated {result.days_generated} days with the {result.meta.algorithm === 'cpsat_v1' ? 'optimizer' : 'standard planner'} · {statusLabel(result.status)}
          </Text>
          <ValidationBanner report={result.validation} extra={describeSolver(result.meta.solver)} />
          <Pressable style={styles.secondaryBtn} onPress={() => router.push({ pathname: '/itinerary/[id]', params: { id: tripId } })}>
            <Text style={styles.secondaryText}>View itinerary ({result.days_generated} days) →</Text>
          </Pressable>
        </View>
      )}

      {!result && hasItinerary && (
        <Pressable style={styles.secondaryBtn} onPress={() => router.push({ pathname: '/itinerary/[id]', params: { id: tripId } })}>
          <Text style={styles.secondaryText}>View saved itinerary →</Text>
        </Pressable>
      )}

      <View style={styles.inlineBtns}>
        <Pressable style={[styles.secondaryBtn, { flex: 1 }]} disabled={duplicate.isPending} onPress={() => duplicate.mutate()}>
          <Text style={styles.secondaryText}>{duplicate.isPending ? 'Copying…' : '⧉ Duplicate'}</Text>
        </Pressable>
        <Pressable
          style={[styles.dangerBtn, { flex: 1 }]}
          disabled={remove.isPending}
          onPress={() => confirm('Delete trip?', 'This permanently deletes the trip and its itinerary.', 'Delete', () => remove.mutate(), true)}
        >
          <Text style={styles.dangerText}>🗑 Delete</Text>
        </Pressable>
      </View>

      {hasItinerary && <FeedbackForm tripId={tripId} />}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  savedBanner: { backgroundColor: colors.successBg, borderColor: colors.success, borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  savedTitle: { color: colors.success, fontWeight: '700', fontSize: 15 },
  savedText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { color: colors.danger, textAlign: 'center' },
  header: { backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 4, borderWidth: 1, borderColor: colors.border },
  destination: { color: colors.primaryText, fontSize: 13, fontWeight: '600' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  status: { color: colors.textMuted, fontSize: 13, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  info: { flexGrow: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.border },
  infoLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#0F3460', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: '#1D4ED8' },
  chipText: { color: colors.primaryText, fontSize: 12, fontWeight: '600' },
  option: { backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 2 },
  optionActive: { borderColor: colors.primary },
  optionLabel: { color: colors.text, fontWeight: '700' },
  optionDesc: { color: colors.textDim, fontSize: 12 },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  disabled: { opacity: 0.6 },
  secondaryBtn: { backgroundColor: colors.card, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.primaryText, fontSize: 15, fontWeight: '600' },
  dangerBtn: { backgroundColor: colors.dangerBg, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  dangerText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  inlineBtns: { flexDirection: 'row', gap: 10 },
  failure: { backgroundColor: colors.dangerBg, borderRadius: 12, padding: 12, gap: 4 },
  failureTitle: { color: colors.danger, fontWeight: '800' },
  failureText: { color: colors.text, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
