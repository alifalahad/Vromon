/**
 * The whole trip's cost (trip planner step 7; redesigned in docs/ui-refresh step 18, frame 37), from
 * GET /trips/{id}/budget. First what the plan costs and whether it fits (≈ when a part is a guess), with
 * "Change" for the budget; then where it goes (the five parts as one bar and its key; a part that isn't known
 * says why, never "৳0"); by day; the ways to save, each applied in one tap with Undo; the AI estimate. A
 * friend's trip is read-only.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { AIBudgetCard } from '../../../src/features/trips/budget/AIBudgetCard';
import { BudgetHero, ByDay, SaveCard, WhereItGoes } from '../../../src/features/trips/budget/BudgetParts';
import { saveAmount, saveSub, saveTitle } from '../../../src/features/trips/budget/budgetView';
import { ChangeBudgetSheet } from '../../../src/features/trips/budget/ChangeBudgetSheet';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { BudgetSave, Itinerary, SaveAction, SaveResult } from '../../../src/types';
import { haptics } from '../../../src/ui/haptics';
import { Snackbar } from '../../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { useReduceMotion } from '../../../src/ui/useReduceMotion';

export default function TripBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const queryClient = useQueryClient();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ message: string; undo?: SaveAction } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);

  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const budget = useQuery({ queryKey: ['budget', tripId], queryFn: () => tripsApi.budget(tripId), enabled: !!tripId });
  const mine = !!trip.data && !!me.data && (!trip.data.user_id || trip.data.user_id === me.data.id);
  const data = budget.data;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await budget.refetch();
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
  const undo = () => {
    if (!snack?.undo) return;
    const action = snack.undo;
    setSnack(null);
    run('undo', action, t('budget.undone'), false);
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

  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: t('budget.title') }} />
        {budget.isError ? <Text style={styles.muted}>{(budget.error as Error).message}</Text> : <ActivityIndicator color={theme.colors.link} />}
      </View>
    );
  }

  const nights = data.nights;
  const days = data.by_day.length || (trip.data?.num_days ?? 0);
  const destination = trip.data?.destination ?? '';
  const sub = [
    destination || null,
    t('budget.travellers', { count: data.num_travelers, n: f.n(data.num_travelers) }),
    t('budget.days', { count: days, n: f.n(days) }),
    t('budget.nights', { count: nights, n: f.n(nights) }),
  ]
    .filter(Boolean)
    .join(' · ');
  const layout = reduceMotion ? undefined : LinearTransition.duration(220);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('budget.title') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.link} colors={[theme.colors.accent]} />}
      >
        <Text style={styles.sub}>{sub}</Text>

        <BudgetHero b={data} onChange={mine ? () => setChanging(true) : undefined} />

        <WhereItGoes b={data} />

        {data.by_day.length > 0 ? (
          <>
            <Text style={styles.h2} accessibilityRole="header">
              {t('budget.byDay')}
            </Text>
            <ByDay days={data.by_day} />
          </>
        ) : null}

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

        <Text style={styles.footnote}>{t('budget.footnote')}</Text>
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
      <Snackbar message={snack?.message ?? null} actionLabel={snack?.undo ? t('plan.undo') : undefined} onAction={undo} testID="budget-snackbar" />
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
