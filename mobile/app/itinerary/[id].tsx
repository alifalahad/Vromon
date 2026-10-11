/**
 * Vromon Mobile — Itinerary screen.
 *
 * Trip overview, dated day tabs + chronological timeline, map, and budget.
 * Validation problems are shown on the banner and on the affected activity;
 * placeholder prices are labelled as unknown, never as real costs. Every edit (remove,
 * replace, regenerate a day, adapt, regenerate all) goes to the backend, which
 * recomputes the day and re-validates the whole trip; the screen then refetches.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BudgetPanel } from '../../src/components/BudgetPanel';
import { AlternativesSheet, ExplanationSheet } from '../../src/components/ItemSheets';
import { TripMap } from '../../src/components/TripMap';
import { ValidationBanner } from '../../src/components/ValidationBanner';
import { ADAPTATIONS } from '../../src/constants/trip';
import { tripsApi } from '../../src/services/api';
import { colors } from '../../src/theme';
import type { AdaptationType, Algorithm, Itinerary, ItineraryDay, ItineraryItem, ValidationReport, Violation } from '../../src/types';
import { confirm, notify } from '../../src/utils/dialogs';
import { formatBDT, formatMinutes, percent, plural } from '../../src/utils/format';
import { dayTabLabel, issuesForItem, itemCostLabel, orderedItems, statusLabel } from '../../src/utils/itinerary';

type Tab = { kind: 'day'; index: number } | { kind: 'map' } | { kind: 'budget' };

function useRefreshTrip(tripId: number) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [['itinerary', tripId], ['budget', tripId], ['trip', tripId], ['trips']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    queryClient.removeQueries({ queryKey: ['alternatives', tripId] });
  };
}

const ISSUE_COLORS: Record<Violation['severity'], string> = { hard: colors.danger, soft: colors.warning, info: colors.textMuted };
const ISSUE_ICONS: Record<Violation['severity'], string> = { hard: '⛔', soft: '⚠️', info: 'ℹ︎' };

function ActivityRow({
  item,
  issues,
  busy,
  onWhy,
  onReplace,
  onRemove,
}: {
  item: ItineraryItem;
  issues: Violation[];
  busy: boolean;
  onWhy: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const isActivity = item.item_type === 'activity';
  const accent = isActivity ? colors.primary : '#F59E0B';
  return (
    <View style={styles.row} testID={`item-${item.id}`}>
      <View style={styles.timeCol}>
        <Text style={[styles.time, { color: accent }]}>{item.start_time}</Text>
        <View style={[styles.connector, { backgroundColor: accent + '33' }]} />
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.emoji}>{isActivity ? '🗺️' : '🍽️'}</Text>
          <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.cost, (!item.cost || item.cost_source === 'placeholder') && styles.free]}>{itemCostLabel(item)}</Text>
        </View>
        {item.category ? <Text style={styles.category}>{item.category}</Text> : null}
        <Text style={styles.meta}>
          {item.start_time}–{item.end_time} · {formatMinutes(item.duration_minutes)}
          {item.place?.opening_time ? ` · open ${item.place.opening_time}–${item.place.closing_time}` : ''}
        </Text>
        {isActivity && item.recommendation_score > 0 && (
          <Text style={styles.match}>Match {percent(item.recommendation_score)}{item.recommendation_reasons[0] ? ` · ${item.recommendation_reasons[0]}` : ''}</Text>
        )}
        {item.notes ? <Text style={styles.notes}>💡 Best time: {item.notes}</Text> : null}
        {issues.map((v, i) => (
          <Text key={i} style={[styles.issue, { color: ISSUE_COLORS[v.severity] }]}>
            {ISSUE_ICONS[v.severity]} {v.message}
          </Text>
        ))}
        {item.travel_time_to_next > 0 && (
          <Text style={styles.travel}>
            🚗 ~{formatMinutes(item.travel_time_to_next)} ({item.distance_to_next.toFixed(1)} km straight-line) to next stop
          </Text>
        )}
        {isActivity && (
          <View style={styles.actions}>
            <SmallBtn label="Why?" onPress={onWhy} disabled={busy} />
            <SmallBtn label="Replace" onPress={onReplace} disabled={busy} />
            <SmallBtn label="Remove" onPress={onRemove} disabled={busy} danger />
          </View>
        )}
      </View>
    </View>
  );
}

function SmallBtn({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallBtn, danger && styles.smallBtnDanger, disabled && styles.disabled]}
      accessibilityRole="button"
    >
      <Text style={[styles.smallBtnText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

function DayView({
  tripId,
  day,
  report,
  onChanged,
}: {
  tripId: number;
  day: ItineraryDay;
  report: ValidationReport | null;
  onChanged: (message: string) => void;
}) {
  const [why, setWhy] = useState<ItineraryItem | null>(null);
  const [replacing, setReplacing] = useState<ItineraryItem | null>(null);

  const regenerateDay = useMutation({
    mutationFn: () => tripsApi.regenerateDay(tripId, day.id),
    onSuccess: (res) => onChanged(`Day ${day.day_number}: ${res.message}`),
    onError: (e) => notify('Could not regenerate day', (e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (itemId: number) => tripsApi.removeItem(tripId, itemId),
    onSuccess: (res) => onChanged(res.message),
    onError: (e) => notify('Could not remove', (e as Error).message),
  });
  const busy = regenerateDay.isPending || remove.isPending;
  const items = orderedItems(day);
  const activities = items.filter((i) => i.item_type === 'activity').length;

  return (
    <>
      <View style={styles.dayHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayTitle} accessibilityRole="header">Day {day.day_number}</Text>
          <Text style={styles.dayMeta}>
            {day.day_date ?? ''}{day.theme ? ` · ${day.theme}` : ''}
          </Text>
        </View>
        <Pressable
          style={[styles.outlineBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() =>
            confirm('New ideas for this day?', 'Day ' + day.day_number + ' will be rebuilt with different places. Must-visit places stay. Other days are not changed.', 'Regenerate', () => regenerateDay.mutate())
          }
        >
          {regenerateDay.isPending ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={styles.outlineBtnText}>↻ Regenerate day</Text>}
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat value={String(activities)} label="Activities" />
        <Stat value={formatBDT(day.total_cost)} label="Per person" />
        <Stat value={formatMinutes(day.total_travel_time)} label="Travel (est.)" />
      </View>

      {activities === 0 && (
        <Text style={styles.emptyDay}>
          No activities are scheduled for this day: no remaining eligible place fits it.{items.length ? ' Only meals are planned.' : ''}
        </Text>
      )}
      {items.length > 0 &&
        items.map((item) => (
          <ActivityRow
            key={item.id}
            item={item}
            issues={issuesForItem(report, item.id)}
            busy={busy}
            onWhy={() => setWhy(item)}
            onReplace={() => setReplacing(item)}
            onRemove={() =>
              confirm('Remove activity', `Remove "${item.title}" from day ${day.day_number}?`, 'Remove', () => remove.mutate(item.id), true)
            }
          />
        ))}

      {why && <ExplanationSheet tripId={tripId} item={why} onClose={() => setWhy(null)} />}
      {replacing && (
        <AlternativesSheet
          tripId={tripId}
          item={replacing}
          onClose={() => setReplacing(null)}
          onReplaced={(msg) => {
            setReplacing(null);
            onChanged(msg);
          }}
        />
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const router = useRouter();
  const refresh = useRefreshTrip(tripId);
  const [tab, setTab] = useState<Tab>({ kind: 'day', index: 0 });
  const [showAdapt, setShowAdapt] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: itinerary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['itinerary', tripId],
    queryFn: () => tripsApi.getItinerary(tripId),
    enabled: !!tripId,
  });

  const onChanged = (msg: string) => {
    setMessage(msg);
    refresh();
  };

  const adapt = useMutation({
    mutationFn: (type: AdaptationType) => tripsApi.adapt(tripId, type),
    onSuccess: (res) => {
      setShowAdapt(false);
      const detail = res.changes.map((c) => `Day ${c.day_number}: ${c.action} ${c.title}`).join('\n');
      onChanged(res.message);
      if (detail) notify('Itinerary adapted', detail);
    },
    onError: (e) => notify('Adaptation failed', (e as Error).message),
  });

  const regenerate = useMutation({
    mutationFn: (algorithm: Algorithm) => tripsApi.regenerate(tripId, algorithm),
    onSuccess: (res) => {
      setTab({ kind: 'day', index: 0 });
      onChanged(`Regenerated with the ${res.meta.algorithm === 'cpsat_v1' ? 'optimizer' : 'standard planner'}`);
    },
    onError: (e) => notify('Regeneration failed', (e as Error).message),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryText} />
        <Text style={styles.muted}>Loading itinerary…</Text>
      </View>
    );
  }

  if (isError || !itinerary) {
    return (
      <View style={styles.center}>
        <Text style={styles.bigEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Could not load itinerary'}</Text>
        <Pressable style={styles.outlineBtn} onPress={() => refetch()}>
          <Text style={styles.outlineBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const days = itinerary.days ?? [];
  if (days.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.bigEmoji}>🗓️</Text>
        <Text style={styles.title}>No itinerary yet</Text>
        <Text style={styles.muted}>Generate one from the trip screen first.</Text>
        <Pressable style={styles.outlineBtn} onPress={() => router.back()}>
          <Text style={styles.outlineBtnText}>← Back to trip</Text>
        </Pressable>
      </View>
    );
  }

  const dayIndex = tab.kind === 'day' ? Math.min(tab.index, days.length - 1) : -1;
  const busy = adapt.isPending || regenerate.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle} numberOfLines={1}>📍 {itinerary.destination}</Text>
        <Pressable style={[styles.outlineBtn, busy && styles.disabled]} disabled={busy} onPress={() => setShowAdapt((v) => !v)}>
          <Text style={styles.outlineBtnText}>⚡ Adapt</Text>
        </Pressable>
        <Pressable
          style={[styles.outlineBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() =>
            confirm('Regenerate all days?', 'The whole itinerary will be replaced. Use the optimizer from the trip screen if you want it.', 'Regenerate', () => regenerate.mutate('heuristic'))
          }
        >
          {regenerate.isPending ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={styles.outlineBtnText}>↺ Redo</Text>}
        </Pressable>
      </View>

      {showAdapt && (
        <View style={styles.adaptPanel}>
          {ADAPTATIONS.map((a) => (
            <Pressable key={a.type} style={[styles.adaptOption, busy && styles.disabled]} disabled={busy} onPress={() => adapt.mutate(a.type)}>
              <Text style={styles.adaptLabel}>{a.emoji} {a.label}</Text>
              <Text style={styles.adaptDesc}>{a.desc}</Text>
            </Pressable>
          ))}
          {adapt.isPending && <ActivityIndicator color={colors.primaryText} />}
          <Text style={styles.adaptNote}>Must-visit places are never removed.</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {days.map((d, i) => (
          <TabBtn key={d.id} label={dayTabLabel(d)} active={dayIndex === i} onPress={() => setTab({ kind: 'day', index: i })} />
        ))}
        <TabBtn label="🗺 Map" active={tab.kind === 'map'} onPress={() => setTab({ kind: 'map' })} />
        <TabBtn label="💰 Budget" active={tab.kind === 'budget'} onPress={() => setTab({ kind: 'budget' })} />
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {message && (
          <Pressable onPress={() => setMessage(null)} style={styles.message}>
            <Text style={styles.messageText}>✔ {message}</Text>
          </Pressable>
        )}
        <Overview itinerary={itinerary} onBudget={() => setTab({ kind: 'budget' })} />
        <ValidationBanner report={itinerary.validation} />

        {tab.kind === 'day' && <DayView tripId={tripId} day={days[dayIndex]} report={itinerary.validation} onChanged={onChanged} />}
        {tab.kind === 'map' && <TripMap days={days} hotel={itinerary.hotel} />}
        {tab.kind === 'budget' && <BudgetPanel tripId={tripId} />}
      </ScrollView>
    </View>
  );
}

function Overview({ itinerary, onBudget }: { itinerary: Itinerary; onBudget: () => void }) {
  const items = itinerary.days.flatMap((d) => d.items);
  const placeholders = items.filter((i) => i.cost_source === 'placeholder').length;
  const tone = itinerary.status === 'invalid' ? colors.danger : itinerary.status === 'valid' ? colors.success : colors.warning;
  return (
    <View style={styles.overview}>
      <View style={styles.overviewTop}>
        <Text style={styles.overviewDates}>
          {itinerary.start_date} → {itinerary.end_date} · {plural(itinerary.num_days, 'day')}
        </Text>
        <Text style={[styles.statusChip, { color: tone, borderColor: tone }]}>{statusLabel(itinerary.status)}</Text>
      </View>
      <Pressable onPress={onBudget} accessibilityRole="button" accessibilityLabel="Open budget breakdown">
        <Text style={styles.overviewCost}>
          ≈ {formatBDT(itinerary.estimated_cost)} per person for activities and meals
          {placeholders ? ` (includes ${plural(placeholders, 'placeholder meal price')})` : ''} · budget {formatBDT(itinerary.total_budget)} for the group ›
        </Text>
      </Pressable>
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  bigEmoji: { fontSize: 44 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.textMuted, textAlign: 'center' },
  errorText: { color: colors.danger, textAlign: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.card },
  toolbarTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 },
  outlineBtn: { backgroundColor: colors.card, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  outlineBtnText: { color: colors.primaryText, fontWeight: '600', fontSize: 13 },
  disabled: { opacity: 0.5 },
  adaptPanel: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.card },
  adaptOption: { backgroundColor: colors.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  adaptLabel: { color: colors.text, fontWeight: '700' },
  adaptDesc: { color: colors.textDim, fontSize: 12 },
  adaptNote: { color: colors.textDim, fontSize: 11 },
  tabs: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.card },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.card },
  tabActive: { backgroundColor: '#1D4ED8' },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  message: { backgroundColor: colors.successBg, borderRadius: 10, padding: 10 },
  messageText: { color: colors.success, fontSize: 13 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  dayMeta: { color: colors.primaryText, fontSize: 13 },
  stats: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 14 },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: '600' },
  emptyDay: { color: colors.warning, backgroundColor: colors.warningBg, borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 18 },
  overview: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  overviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overviewDates: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 },
  statusChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  overviewCost: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  category: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  issue: { fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 10 },
  timeCol: { alignItems: 'center', width: 48, paddingTop: 14 },
  time: { fontSize: 11, fontWeight: '700' },
  connector: { flex: 1, width: 2, marginTop: 4, minHeight: 24 },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 5, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 16 },
  name: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 14 },
  cost: { color: colors.success, fontWeight: '700', fontSize: 12 },
  free: { color: colors.textDim },
  meta: { color: colors.textDim, fontSize: 11 },
  match: { color: colors.primaryText, fontSize: 11 },
  notes: { color: '#6EE7B7', fontSize: 11 },
  travel: { color: '#A78BFA', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4, justifyContent: 'flex-end' },
  smallBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#0F3460' },
  smallBtnDanger: { backgroundColor: colors.dangerBg },
  smallBtnText: { color: colors.primaryText, fontSize: 11, fontWeight: '600' },
});
