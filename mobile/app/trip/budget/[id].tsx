/**
 * The whole trip's cost (trip planner step 7; redesigned in docs/ui-refresh steps 18 and 19, frames 37–40), from
 * GET /trips/{id}/budget. Before the trip: what the plan costs and whether it fits (≈ when a part is a guess), with
 * "Change" for the budget; where it goes; by day; the ways to save, each applied in one tap with Undo; the AI
 * estimate. On the trip (frame 38): what you noted you spent so far against your budget and what's still to come;
 * today; each part against its plan; by day; "Add what you spent". After it (frame 40): what it cost against your
 * budget and the plan. With nothing noted, the plan's numbers, said to be the plan's, never "৳0 spent". A friend's
 * trip is read-only, and what its owner spent is theirs alone.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { AddSpentSheet, refreshSpent } from '../../../src/features/trips/budget/AddSpentSheet';
import { AIBudgetCard } from '../../../src/features/trips/budget/AIBudgetCard';
import { BudgetHero, ByDay, SaveCard, WhereItGoes } from '../../../src/features/trips/budget/BudgetParts';
import { saveAmount, saveSub, saveTitle } from '../../../src/features/trips/budget/budgetView';
import { ChangeBudgetSheet } from '../../../src/features/trips/budget/ChangeBudgetSheet';
import { biggest, dayRows, hasNotes, shortRange } from '../../../src/features/trips/budget/spent';
import {
  BiggestCosts,
  ByPlanHero,
  CostHero,
  NotedRow,
  PartsAgainstPlan,
  PlanTable,
  SpentByDay,
  SpentHero,
  TodayCard,
} from '../../../src/features/trips/budget/SpentParts';
import { localToday, planPhase } from '../../../src/features/trips/dates';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { BudgetSave, Expense, Itinerary, SaveAction, SaveResult } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { Snackbar } from '../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { useReduceMotion } from '../../../src/ui/useReduceMotion';

export default function TripBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ message: string; undo?: SaveAction; restore?: Expense } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  // "Add what you spent", or a note opened to be changed
  const [sheet, setSheet] = useState<{ editing: Expense | null } | null>(null);
  const today = localToday();

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: !!tripId });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const data = budget.data;
  const phase = trip.data ? planPhase(trip.data.start_date, trip.data.end_date, today) : null;
  const started = phase?.kind === 'on' || phase?.kind === 'after';
  // A trip that didn't happen has nothing to note
  const canNote = mine && started && !trip.data?.not_taken;
  const noted = mine && started && hasNotes(data);
  const expenses = useQuery({ queryKey: ['expenses', tripId], queryFn: () => tripsApi.expenses(tripId), enabled: !!tripId && noted });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([budget.refetch(), noted ? expenses.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  // The server's answer goes straight into the caches; the rest of the trip refreshes
  const landed = (res: SaveResult) => {
    queryClient.setQueryData(['budget', tripId], res.budget);
    queryClient.setQueryData<Itinerary>(['itinerary', tripId], (old) =>
      old ? { ...old, days: old.days.map((d) => res.days.find((c) => c.id === d.id) ?? d), validation: res.validation } : old,
    );
    for (const queryKey of [['itinerary', tripId], ['trip', tripId], ['trips'], ['conditions', tripId], ['dayRoute'], ['stays', tripId], ['staySuggestions', tripId]]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const run = async (key: string, action: SaveAction, message: string, undoable: boolean) => {
    setBusy(key);
    try {
      const res = await tripsApi.saveBudget(tripId, action);
      landed(res);
      haptics.success();
      setSnack({ message, undo: undoable && res.undo ? res.undo : undefined });
    } catch (e) {
      haptics.error();
      setSnack({ message: `${t('budget.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };
  const done = (s: BudgetSave) =>
    s.key === 'stay'
      ? t('stayAdvice.switched', { hotel: s.detail.hotel.name })
      : s.key === 'skip'
        ? t('budget.appliedSkip', { name: s.detail.title })
        : t('budget.appliedRickshaw');
  // A deleted note comes back as it was; a way to save is undone on the server
  const undo = async () => {
    const restore = snack?.restore;
    const action = snack?.undo;
    setSnack(null);
    if (restore) {
      try {
        const { day, amount, part, note, item_id, ride } = restore;
        await tripsApi.addExpense(tripId, { day, amount, part, note, item_id, ride });
        await refreshSpent(queryClient, tripId);
        setSnack({ message: t('spent.restored') });
      } catch (e) {
        setSnack({ message: `${t('spent.failed')}: ${e instanceof Error ? e.message : String(e)}` });
      }
    } else if (action) {
      run('undo', action, t('budget.undone'), false);
    }
  };

  // "Change": the budget through the trip's PATCH, then the numbers again
  const changeBudget = async (taka: number) => {
    setSavingBudget(true);
    try {
      await tripsApi.update(tripId, { total_budget: taka });
      haptics.success();
      setChanging(false);
      await Promise.all([['budget', tripId], ['trip', tripId], ['trips']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      setSnack({ message: t('aiBudget.applied', { amount: f.money(taka) }) });
    } catch (e) {
      haptics.error();
      setSnack({ message: `${t('budget.failed')}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSavingBudget(false);
    }
  };

  if (!data || !trip.data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('budget.title') }} />
        {budget.isError ? <Text style={styles.muted}>{(budget.error as Error).message}</Text> : <ActivityIndicator color={theme.colors.link} />}
      </View>
    );
  }

  const nights = data.nights;
  const days = data.by_day.length || (trip.data.num_days ?? 0);
  const destination = trip.data.destination ?? '';
  const travellers = t('budget.travellers', { count: data.num_travelers, n: f.n(data.num_travelers) });
  // Frame 38: "Cox's Bazar · day 2 of 3 · 2 travellers"; frame 40: "Cox's Bazar · 20–22 Nov · 2 travellers"
  const sub = (
    phase?.kind === 'on'
      ? [destination, t('spent.dayOf', { day: f.n(phase.day), of: f.n(phase.of) }), travellers]
      : phase?.kind === 'after'
        ? [destination, f.time(shortRange(trip.data.start_date, trip.data.end_date, i18n.language, today)), travellers]
        : [destination, travellers, t('budget.days', { count: days, n: f.n(days) }), t('budget.nights', { count: nights, n: f.n(nights) })]
  )
    .filter(Boolean)
    .join(' · ');
  const layout = reduceMotion ? undefined : LinearTransition.duration(220);
  const add = canNote ? () => setSheet({ editing: null }) : undefined;
  const open = canNote ? (e: Expense) => setSheet({ editing: e }) : undefined;
  const notes = expenses.data ?? [];
  const openList = () => router.push({ pathname: '/trip/budget/noted/[id]', params: { id: tripId } });

  // Before the trip, or a trip under way or over with nothing noted: the plan's numbers
  const planView = (
    <>
      {phase?.kind === 'after' && mine ? (
        <ByPlanHero b={data} onAdd={add} />
      ) : (
        <BudgetHero b={data} onChange={mine ? () => setChanging(true) : undefined} onAdd={phase?.kind === 'on' ? add : undefined} />
      )}

      <WhereItGoes b={data} />

      {data.by_day.length > 0 ? (
        <>
          <Text style={styles.h2} accessibilityRole="header">
            {t('budget.byDay')}
          </Text>
          <ByDay days={data.by_day} />
        </>
      ) : null}

      {/* Ways to save and the AI estimate are for before the trip */}
      {started ? null : (
        <>
          <Text style={styles.h2} accessibilityRole="header">
            {t('budget.saves')}
          </Text>
          {data.saves.length === 0 ? (
            <Text style={styles.muted}>{t('budget.noSaves')}</Text>
          ) : (
            data.saves.map((s) => {
              const title = saveTitle(s, destination, nights, t, f);
              return (
                <Animated.View
                  key={`${s.key}-${JSON.stringify(s.action)}`}
                  entering={reduceMotion ? undefined : FadeIn.duration(220)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(160)}
                  layout={layout}
                >
                  <SaveCard
                    saveKey={s.key}
                    title={title}
                    sub={saveSub(s, t, f)}
                    saving={saveAmount(s, t, f)}
                    busy={busy === s.key}
                    disabled={busy !== null}
                    onApply={mine ? () => run(s.key, s.action, done(s), true) : undefined}
                  />
                </Animated.View>
              );
            })
          )}

          {/* What Gemini suggests from Vromon's prices; it can become the budget */}
          <AIBudgetCard tripId={tripId} mine={mine} currentBudget={data.total_budget} onApplied={(message) => setSnack({ message })} />
        </>
      )}

      <Text style={styles.footnote}>{t('budget.footnote')}</Text>
    </>
  );

  // On the trip, with what you noted (frame 38)
  const onTripView = (
    <>
      <SpentHero b={data} />
      <TodayCard b={data} today={today} notes={notes} onAdd={add} onOpen={open} />
      <Text style={styles.h2} accessibilityRole="header">
        {t('spent.ofPlanned')}
      </Text>
      <PartsAgainstPlan b={data} />
      <Text style={styles.h2} accessibilityRole="header">
        {t('budget.byDay')}
      </Text>
      <SpentByDay rows={dayRows(data, today)} />
      <NotedRow count={data.spent?.count ?? 0} onPress={openList} />
      <Text style={styles.footnote}>{t('spent.footnote')}</Text>
    </>
  );

  // After the trip, with what you noted (frame 40)
  const top = biggest(notes);
  const afterView = (
    <>
      <CostHero b={data} />
      <PlanTable b={data} />
      <Text style={styles.h2} accessibilityRole="header">
        {t('budget.byDay')}
      </Text>
      <SpentByDay rows={dayRows(data, today)} />
      {top.length ? (
        <>
          <Text style={styles.h2} accessibilityRole="header">
            {t('spent.biggest')}
          </Text>
          <BiggestCosts notes={top} onOpen={open} />
        </>
      ) : null}
      <NotedRow count={data.spent?.count ?? 0} onPress={openList} />
      <Text style={styles.footnote}>{t('spent.footnote')}</Text>
    </>
  );

  // Which of the three it shows: a new one starts at the top (the last note deleted, Budget is the plan again)
  const view = noted && phase?.kind === 'on' ? 'on' : noted && phase?.kind === 'after' ? 'after' : 'plan';
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('budget.title') }} />
      <ScrollView
        key={view}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.link} colors={[theme.colors.accent]} />}
      >
        <Text style={styles.sub}>{sub}</Text>
        {view === 'on' ? onTripView : view === 'after' ? afterView : planView}
      </ScrollView>
      <ChangeBudgetSheet
        visible={changing}
        budget={data.total_budget}
        travellers={data.num_travelers}
        days={days}
        busy={savingBudget}
        onClose={() => setChanging(false)}
        onSave={changeBudget}
      />
      <AddSpentSheet
        visible={!!sheet}
        tripId={tripId}
        start={trip.data.start_date}
        end={trip.data.end_date}
        travellers={data.num_travelers}
        today={today}
        editing={sheet?.editing ?? null}
        onClose={() => setSheet(null)}
        onDone={({ message, deleted }) => {
          setSheet(null);
          setSnack({ message, restore: deleted });
        }}
      />
      <Snackbar
        message={snack?.message ?? null}
        actionLabel={snack?.undo || snack?.restore ? t('plan.undo') : undefined}
        onAction={undo}
        testID="budget-snackbar"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs, gap: 12 },
  sub: { fontSize: 13.5, color: t.colors.textSecondary, paddingHorizontal: 4, minHeight: 22 },
  muted: { ...t.type.footnote, color: t.colors.textSecondary, marginHorizontal: 4 },
  h2: { fontFamily: t.type.title.fontFamily, fontSize: 19, lineHeight: 24, fontWeight: 'normal', color: t.colors.textPrimary, marginTop: 10, marginHorizontal: 4 },
  footnote: { fontSize: 12.5, lineHeight: 18, color: t.colors.textSecondary, marginTop: 4, marginHorizontal: 4 },
}));
