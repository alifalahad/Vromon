/**
 * Vromon Mobile — getting there, door to door (GET /trips/{id}/journey).
 *
 * How you like to travel (any of plane / train / bus / car / launch, or "Suggest by my budget"),
 * then every way there, the recommended one first: each as its legs (a CNG to the station, the
 * train with its timetable, the CNG on), its total time and fare per person, and what is an
 * estimate. Trains show the other departures of the day. Changing the choice asks again.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { tripsApi } from '../../../src/services/api';
import type { JourneyLeg, JourneyMode, JourneyOption, TripJourney } from '../../../src/types';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const ICONS: Record<string, Icon> = { plane: 'airplane', train: 'train', bus: 'bus', car: 'car', cng: 'rickshaw', launch: 'ferry' };
const CHOICES: JourneyMode[] = ['plane', 'train', 'bus', 'car', 'launch'];

export default function JourneyScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['journey', tripId], queryFn: () => tripsApi.journey(tripId), enabled: !!tripId });
  const save = useMutation({
    mutationFn: (modes: JourneyMode[]) => tripsApi.setJourneyPreferences(tripId, { transport_modes: modes, transport_by_budget: modes.length === 0 }),
    onSuccess: (data: TripJourney) => {
      queryClient.setQueryData(['journey', tripId], data);
      for (const key of [['itinerary', tripId], ['budget', tripId]]) queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const chosen = q.data?.preferences.transport_modes ?? [];
  const toggle = (m: JourneyMode) => save.mutate(chosen.includes(m) ? chosen.filter((x) => x !== m) : [...chosen, m]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('journey.title') }} />
      {q.isLoading ? <ActivityIndicator color={colors.link} style={styles.loading} /> : null}
      {q.error ? <Text style={styles.error}>{t('journey.noStart')}</Text> : null}
      {q.data ? (
        <ScrollView contentContainerStyle={styles.body} testID="journey-screen">
          <Text style={styles.route}>
            {q.data.from} → {q.data.to}
          </Text>

          <Text style={styles.section}>{t('newTrip.howTravel')}</Text>
          <View style={styles.choices}>
            {CHOICES.map((m) => {
              const on = chosen.includes(m);
              return (
                <PressableScale
                  key={m}
                  haptic="selection"
                  onPress={() => toggle(m)}
                  disabled={save.isPending}
                  style={[styles.choice, on && styles.choiceOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  testID={`journey-mode-${m}`}
                >
                  <MaterialCommunityIcons name={ICONS[m]} size={18} color={on ? colors.onAccent : colors.textSecondary} />
                  <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{t(`newTrip.travelModes.${m}`)}</Text>
                </PressableScale>
              );
            })}
            <PressableScale
              haptic="selection"
              onPress={() => save.mutate([])}
              disabled={save.isPending}
              style={[styles.choice, chosen.length === 0 && styles.choiceOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen.length === 0 }}
              testID="journey-mode-budget"
            >
              <MaterialCommunityIcons name="cash-multiple" size={18} color={chosen.length === 0 ? colors.onAccent : colors.textSecondary} />
              <Text style={[styles.choiceText, chosen.length === 0 && styles.choiceTextOn]}>{t('newTrip.byBudget')}</Text>
            </PressableScale>
          </View>
          {save.isPending ? <ActivityIndicator color={colors.link} /> : null}

          {q.data.options.map((o) => (
            <OptionCard key={o.mode} option={o} />
          ))}
          {q.data.missing.length ? <Text style={styles.note}>{t('journey.noLaunch')}</Text> : null}
          <Text style={styles.note}>{t('journey.honesty')}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function OptionCard({ option }: { option: JourneyOption }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (
    <View style={[styles.card, option.recommended && styles.cardBest]} testID={`journey-option-${option.mode}`}>
      <View style={styles.cardHead}>
        <View style={styles.modeIcon}>
          <MaterialCommunityIcons name={ICONS[option.mode]} size={24} color={colors.link} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{t(`newTrip.travelModes.${option.mode}`)}</Text>
          <Text style={styles.cardLine}>
            {f.duration(option.minutes)} · {t('journey.perPerson', { amount: f.money(option.cost_per_person) })}
          </Text>
        </View>
        {option.recommended ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('journey.best')}</Text>
          </View>
        ) : null}
      </View>
      {option.recommended && option.reason ? <Text style={styles.reason}>{option.reason}</Text> : null}
      <View style={styles.legs}>
        {option.legs.map((l, i) => (
          <LegRow key={i} leg={l} last={i === option.legs.length - 1} />
        ))}
      </View>
      {option.alternatives.length ? (
        <View style={styles.alts}>
          <Text style={styles.altsTitle}>{t('journey.otherTrains')}</Text>
          {option.alternatives.map((a) => (
            <Text key={`${a.train}-${a.depart}`} style={styles.alt}>
              {a.depart} → {a.arrive} · {a.train}
              {a.off_day ? ` · ${t('journey.offDay', { day: a.off_day })}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {option.note ? <Text style={styles.note}>{option.note}</Text> : null}
    </View>
  );
}

function LegRow({ leg, last }: { leg: JourneyLeg; last: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const fare =
    leg.fare != null
      ? `${t(leg.fare_per === 'vehicle' ? 'plan.gettingFareVehicle' : 'plan.gettingFarePerson', { amount: f.money(leg.fare) })}${leg.fare_kind === 'estimate' ? ` (${t('journey.estimate')})` : ''}`
      : null;
  return (
    <View style={styles.leg}>
      <View style={styles.rail}>
        <MaterialCommunityIcons name={ICONS[leg.mode] ?? 'map-marker'} size={18} color={colors.textSecondary} />
        {!last ? <View style={styles.railLine} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.legTitle}>
          {leg.from} → {leg.to}
        </Text>
        {leg.depart ? (
          <Text style={styles.legTime}>
            {leg.depart} → {leg.arrive}
          </Text>
        ) : null}
        {leg.detail ? <Text style={styles.legDetail}>{leg.detail}</Text> : null}
        <Text style={styles.legMeta}>
          {f.duration(leg.minutes)} · {f.n(Math.round(leg.km))} km{fare ? ` · ${fare}` : ''}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  loading: { marginTop: 32 },
  error: { ...t.type.callout, color: t.colors.textSecondary, padding: 24, textAlign: 'center' },
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  flex: { flex: 1, gap: 2 },
  route: { ...t.type.title, color: t.colors.textPrimary },
  section: { ...t.type.headline, color: t.colors.textPrimary, marginTop: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: t.colors.surface,
  },
  choiceOn: { backgroundColor: t.colors.accent },
  choiceText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  choiceTextOn: { color: t.colors.onAccent },
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: t.colors.divider },
  cardBest: { borderColor: t.colors.accent, borderWidth: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  cardTitle: { ...t.type.headline, color: t.colors.textPrimary },
  cardLine: { ...t.type.footnote, color: t.colors.textSecondary },
  badge: { backgroundColor: t.colors.accentStrong, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { ...t.type.caption, fontWeight: '700', color: t.colors.onAccent },
  reason: { ...t.type.footnote, color: t.colors.link, fontWeight: '600' },
  legs: { gap: 0 },
  leg: { flexDirection: 'row', gap: 12, minHeight: 56 },
  rail: { width: 24, alignItems: 'center' },
  railLine: { flex: 1, width: 2, backgroundColor: t.colors.divider, marginVertical: 4 },
  legTitle: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  legTime: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  legDetail: { ...t.type.footnote, color: t.colors.textSecondary },
  legMeta: { ...t.type.caption, color: t.colors.textTertiary, marginBottom: 10 },
  alts: { gap: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: t.colors.divider },
  altsTitle: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary, marginTop: 8 },
  alt: { ...t.type.footnote, color: t.colors.textPrimary },
  note: { ...t.type.caption, color: t.colors.textTertiary },
}));
