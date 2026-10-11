/**
 * Budget breakdown from GET /trips/{id}/budget (computed by the backend from the
 * saved itinerary). Separates costs backed by real records ("known") from placeholder
 * prices, and lists everything that is NOT included instead of guessing.
 */

import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { tripsApi } from '../services/api';
import { colors } from '../theme';
import { formatBDT } from '../utils/format';

export function BudgetPanel({ tripId }: { tripId: number }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['budget', tripId],
    queryFn: () => tripsApi.budget(tripId),
  });

  if (isLoading) return <ActivityIndicator color={colors.primaryText} />;
  if (isError || !data) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={styles.error}>{error instanceof Error ? error.message : 'Could not load budget'}</Text>
        <Pressable style={styles.retry} onPress={() => refetch()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const used = data.total_budget > 0 ? Math.min(1, data.estimated_total / data.total_budget) : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>💰 Budget breakdown</Text>
      <Text style={styles.sub}>
        {data.num_travelers} traveller{data.num_travelers > 1 ? 's' : ''} · {data.nights} night{data.nights !== 1 ? 's' : ''}
      </Text>

      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${Math.round(used * 100)}%`, backgroundColor: data.over_budget ? colors.danger : colors.success }]} />
      </View>

      <Row label="Activities" value={formatBDT(data.categories.activities)} />
      <Row label="Meals" value={formatBDT(data.categories.meals)} />
      <Row
        label={data.hotel ? `Hotel · ${data.hotel.name}` : 'Accommodation'}
        value={data.hotel ? formatBDT(data.categories.accommodation) : 'No hotel data'}
      />
      <Row label="Local transport" value="Not estimated" muted />
      <View style={styles.divider} />
      <Row label="Known total (from data)" value={formatBDT(data.known_total)} bold />
      {data.placeholder_meals > 0 && (
        <Row label={`+ ${data.placeholder_meals} meal(s) without price data (placeholder)`} value={`≈ ${formatBDT(data.placeholder_total)}`} muted />
      )}
      {data.placeholder_meals > 0 && <Row label="Estimated total" value={formatBDT(data.estimated_total)} bold />}
      <Row label="Your budget" value={formatBDT(data.total_budget)} />
      <Row
        label={data.over_budget ? 'Over budget by' : 'Remaining'}
        value={formatBDT(Math.abs(data.remaining))}
        bold
        color={data.over_budget ? colors.danger : colors.success}
      />

      <Text style={styles.section}>Per day (for the group)</Text>
      {data.per_day.map((d) => (
        <Row key={d.day_number} label={`Day ${d.day_number}`} value={formatBDT(d.total_for_group)} />
      ))}
      {data.free_activities > 0 && (
        <Text style={styles.note}>{data.free_activities} activit{data.free_activities > 1 ? 'ies are' : 'y is'} free according to the data.</Text>
      )}

      {data.incomplete_reasons.length > 0 && (
        <>
          <Text style={styles.section}>This total is incomplete</Text>
          {data.incomplete_reasons.map((r, i) => (
            <Text key={`r${i}`} style={styles.incomplete}>• {r}</Text>
          ))}
        </>
      )}

      <Text style={styles.section}>Assumptions</Text>
      {data.assumptions.map((a, i) => (
        <Text key={i} style={styles.note}>• {a}</Text>
      ))}
    </View>
  );
}

function Row({ label, value, bold, muted, color }: { label: string; value: string; bold?: boolean; muted?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold, muted && styles.muted]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, muted && styles.muted, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.cardAlt, borderRadius: 16, padding: 18, gap: 8, borderWidth: 1, borderColor: '#1D4ED8' },
  title: { color: colors.primaryText, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.card, overflow: 'hidden', marginBottom: 6 },
  meterFill: { height: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.textMuted, fontSize: 14, flex: 1 },
  value: { color: colors.textMuted, fontSize: 14 },
  bold: { color: colors.text, fontWeight: '800' },
  muted: { color: colors.textDim, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: '#1E3A5F', marginVertical: 4 },
  section: { color: colors.text, fontWeight: '700', marginTop: 10 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger },
  incomplete: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.primary },
  retryText: { color: colors.primaryText, fontWeight: '600' },
});
