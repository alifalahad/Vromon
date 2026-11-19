/**
 * "Everything you noted" (docs/ui-refresh step 19): every amount you noted for the trip, by day (the newest
 * first), with each day's total. Each note opens the sheet to be changed or deleted (with Undo); "Add what you
 * spent" notes another, on the trip and after it. Your own trip only: spending is private.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../../src/features/account/useMe';
import { AddSpentSheet, refreshSpent } from '../../../../src/features/trips/budget/AddSpentSheet';
import { notesByDay } from '../../../../src/features/trips/budget/spent';
import { NoteRow } from '../../../../src/features/trips/budget/SpentParts';
import { addDays, localToday, planPhase } from '../../../../src/features/trips/dates';
import { dayDate } from '../../../../src/features/trips/plan/timeline';
import { usePlanFormat } from '../../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../../src/services/api';
import type { Expense } from '../../../../src/types';
import { Button } from '../../../../src/ui/Button';
import { Snackbar } from '../../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../../src/ui/theme';

export default function NotedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const me = useMe();
  const today = localToday();
  const [sheet, setSheet] = useState<{ editing: Expense | null } | null>(null);
  const [snack, setSnack] = useState<{ message: string; restore?: Expense } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const expenses = useQuery({ queryKey: ['expenses', tripId], queryFn: () => tripsApi.expenses(tripId), enabled: !!tripId && mine });
  const phase = trip.data ? planPhase(trip.data.start_date, trip.data.end_date, today) : null;
  const canNote = mine && phase?.kind !== 'before' && !trip.data?.not_taken;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await expenses.refetch();
    } finally {
      setRefreshing(false);
    }
  };
  const undo = async () => {
    const restore = snack?.restore;
    setSnack(null);
    if (!restore) return;
    try {
      const { day, amount, part, note, item_id, ride } = restore;
      await tripsApi.addExpense(tripId, { day, amount, part, note, item_id, ride });
      await refreshSpent(queryClient, tripId);
      setSnack({ message: t('spent.restored') });
    } catch (e) {
      setSnack({ message: `${t('spent.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  if (!trip.data || (mine && !expenses.data)) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('spent.everything') }} />
        {expenses.isError ? <Text style={styles.muted}>{(expenses.error as Error).message}</Text> : <ActivityIndicator color={theme.colors.link} />}
      </View>
    );
  }

  const days = notesByDay(expenses.data ?? []);
  const { start_date: start, end_date: end } = trip.data;
  const dayName = (iso: string) => {
    const date = f.time(dayDate(iso, i18n.language));
    if (iso === addDays(start, -1)) return `${t('spent.dayBefore')} · ${date}`;
    if (iso === addDays(end, 1)) return `${t('spent.dayAfter')} · ${date}`;
    return iso === today ? t('spent.dayToday', { date }) : date;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('spent.everything') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.link} colors={[theme.colors.accent]} />}
        testID="spent-list"
      >
        <Text style={styles.sub}>{trip.data.title || trip.data.destination}</Text>
        {days.length === 0 ? <Text style={styles.muted}>{t('spent.listEmpty')}</Text> : null}
        {days.map((d) => (
          <View key={d.day} style={styles.section} testID={`spent-list-day-${d.day}`}>
            <View style={styles.dayHead}>
              <Text style={styles.dayName} accessibilityRole="header">
                {dayName(d.day)}
              </Text>
              <Text style={styles.dayTotal}>{t('spent.dayTotal', { amount: f.money(d.total) })}</Text>
            </View>
            <View style={styles.card}>
              {d.notes.map((e, i) => (
                <NoteRow key={e.id} e={e} parts="all" onOpen={canNote ? (x) => setSheet({ editing: x }) : undefined} last={i === d.notes.length - 1} />
              ))}
            </View>
          </View>
        ))}
        {canNote ? <Button label={t('spent.addSpent')} icon="plus" onPress={() => setSheet({ editing: null })} testID="spent-list-add" /> : null}
      </ScrollView>
      {canNote ? (
        <AddSpentSheet
          visible={!!sheet}
          tripId={tripId}
          start={start}
          end={end}
          travellers={trip.data.num_travelers}
          today={today}
          editing={sheet?.editing ?? null}
          onClose={() => setSheet(null)}
          onDone={({ message, deleted }) => {
            setSheet(null);
            setSnack({ message, restore: deleted });
          }}
        />
      ) : null}
      <Snackbar message={snack?.message ?? null} actionLabel={snack?.restore ? t('plan.undo') : undefined} onAction={undo} testID="spent-snackbar" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, gap: 12 },
  sub: { fontSize: 13.5, color: t.colors.textSecondary, paddingHorizontal: 4, minHeight: 22 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary, marginHorizontal: 4 },
  section: { gap: 8 },
  dayHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  dayName: { flexShrink: 1, fontFamily: t.type.title.fontFamily, fontSize: 17, lineHeight: 22, fontWeight: 'normal', color: t.colors.textPrimary },
  dayTotal: { fontSize: 13.5, color: t.colors.textSecondary },
  card: { paddingHorizontal: t.spacing.lg, paddingVertical: 4, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
}));
