/**
 * Bottom sheets for one itinerary activity:
 *  - ExplanationSheet: grounded "Why this place?" (Phase 8 RAG endpoint)
 *  - AlternativesSheet: places that fit the same time slot, to replace it
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, ragApi, tripsApi } from '../services/api';
import { colors } from '../theme';
import type { ItineraryItem } from '../types';
import { formatBDT, percent } from '../utils/format';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function ExplanationSheet({ tripId, item, onClose }: { tripId: number; item: ItineraryItem; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['explanation', tripId, item.id],
    queryFn: () => ragApi.explainItem(tripId, item.id),
    retry: false,
    staleTime: Infinity,
  });
  const notConfigured = error instanceof ApiError && error.status === 503;

  return (
    <Sheet title={`Why ${item.title}?`} onClose={onClose}>
      <Text style={styles.section}>From the planner</Text>
      <Text style={styles.text}>Match score {percent(item.recommendation_score)}</Text>
      {item.recommendation_reasons.map((r, i) => (
        <Text key={i} style={styles.text}>• {r}</Text>
      ))}

      <Text style={styles.section}>AI explanation (sourced)</Text>
      {isLoading && <ActivityIndicator color={colors.primaryText} />}
      {notConfigured && (
        <Text style={styles.muted}>AI explanations are not enabled on the server (no LLM key configured). The ranking reasons above still apply.</Text>
      )}
      {error && !notConfigured && <Text style={styles.error}>{(error as Error).message}</Text>}
      {data?.status === 'insufficient_evidence' && (
        <Text style={styles.muted}>Not enough source information to explain this place. {data.warnings[0] ?? ''}</Text>
      )}
      {data?.status === 'answered' && (
        <>
          {data.claims.map((c, i) => (
            <Text key={i} style={styles.text}>
              {c.text} <Text style={styles.cite}>[{c.source_labels.join(', ')}]</Text>
            </Text>
          ))}
          <Text style={styles.section}>Sources</Text>
          {data.sources.map((s) => (
            <View key={s.label} style={styles.source}>
              <Text style={styles.sourceTitle}>[{s.label}] {s.title} · {s.source_type}</Text>
              <Text style={styles.snippet}>{s.snippet}</Text>
            </View>
          ))}
          {data.warnings.length > 0 && <Text style={styles.muted}>{data.warnings.join(' ')}</Text>}
        </>
      )}
    </Sheet>
  );
}

export function AlternativesSheet({
  tripId,
  item,
  onClose,
  onReplaced,
}: {
  tripId: number;
  item: ItineraryItem;
  onClose: () => void;
  onReplaced: (message: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['alternatives', tripId, item.id],
    queryFn: () => tripsApi.alternatives(tripId, item.id),
    retry: false,
  });
  const replace = useMutation({
    mutationFn: (placeId: number) => tripsApi.replaceItem(tripId, item.id, placeId),
    onSuccess: (res) => onReplaced(res.message),
  });

  return (
    <Sheet title={`Replace ${item.title}`} onClose={onClose}>
      <Text style={styles.muted}>
        Places that fit the {item.start_time}–{item.end_time} slot: open at that time, short enough for the gap, not excluded and not already in your trip.
      </Text>
      {isLoading && <ActivityIndicator color={colors.primaryText} />}
      {error && <Text style={styles.error}>{(error as Error).message}</Text>}
      {data?.is_must_visit && <Text style={styles.error}>This is a must-visit place and cannot be replaced.</Text>}
      {data && !data.is_must_visit && data.alternatives.length === 0 && (
        <Text style={styles.muted}>No other place fits this time slot.</Text>
      )}
      {data?.alternatives.map((alt) => (
        <Pressable
          key={alt.place.id}
          style={styles.alt}
          disabled={replace.isPending || data.is_must_visit}
          onPress={() => replace.mutate(alt.place.id)}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.altTitle}>{alt.place.name}</Text>
            <Text style={styles.altMeta}>
              {alt.start_time}–{alt.end_time} · {alt.place.category} · {alt.place.estimated_cost ? formatBDT(alt.place.estimated_cost) : 'Free'} · match {percent(alt.recommendation_score)}
            </Text>
            {alt.recommendation_reasons[0] ? <Text style={styles.altReason}>{alt.recommendation_reasons[0]}</Text> : null}
          </View>
          <Text style={styles.use}>Use</Text>
        </Pressable>
      ))}
      {replace.isPending && <ActivityIndicator color={colors.primaryText} />}
      {replace.isError && <Text style={styles.error}>{(replace.error as Error).message}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a' },
  sheet: { maxHeight: '80%', backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.card, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  close: { color: colors.textMuted, fontSize: 18 },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  section: { color: colors.primaryText, fontWeight: '700', marginTop: 8 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
  cite: { color: colors.primaryText, fontSize: 12 },
  source: { backgroundColor: colors.card, borderRadius: 10, padding: 10, gap: 4 },
  sourceTitle: { color: colors.text, fontWeight: '600', fontSize: 12 },
  snippet: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  altTitle: { color: colors.text, fontWeight: '700' },
  altMeta: { color: colors.textMuted, fontSize: 12 },
  altReason: { color: colors.textDim, fontSize: 11, fontStyle: 'italic' },
  use: { color: colors.primaryText, fontWeight: '700' },
});
