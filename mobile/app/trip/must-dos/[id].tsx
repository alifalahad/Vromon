/**
 * Change a trip's must-dos: must-sees with their day and time, busy times,
 * places to skip, and the arrival and leaving times. Saving re-plans only the
 * days that need it (the server decides which); the trip screen says which.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { durationDays } from '../../../src/features/trips/dates';
import { MustDosEditor, type MustDos } from '../../../src/features/trips/new/MustDosEditor';
import { ARRIVE_TIMES, LEAVE_TIMES } from '../../../src/features/trips/new/newTrip';
import { useMustDoText } from '../../../src/features/trips/new/useMustDoText';
import { setFlash } from '../../../src/features/trips/plan/flash';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { placesApi, tripsApi } from '../../../src/services/api';
import type { Trip } from '../../../src/types';
import { Button } from '../../../src/ui/Button';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { TimeSheet } from '../../../src/ui/TimeSheet';

export default function MustDosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const styles = useStyles();
  const { colors } = useTheme();
  if (!trip.data) {
    return (
      <View style={[styles.container, styles.center]}>
        {trip.isError ? <Text style={styles.error}>{(trip.error as Error).message}</Text> : <ActivityIndicator color={colors.link} />}
      </View>
    );
  }
  return <Editor trip={trip.data} />;
}

function Editor({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useMustDoText();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const cons = trip.constraints;
  const pref = trip.preference;
  const [value, setValue] = useState<MustDos>({
    mustSees: cons?.must_sees ?? [],
    busy: cons?.busy ?? [],
    skip: cons?.excluded_places ?? [],
    avoidCrowds: cons?.avoid_crowded ?? false,
  });
  const [arrive, setArrive] = useState<string | null>(pref?.arrive_time ?? null);
  const [leave, setLeave] = useState<string | null>(pref?.leave_time ?? null);
  const [sheet, setSheet] = useState<'arrive' | 'leave' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const places = useQuery({ queryKey: ['places', trip.destination], queryFn: () => placesApi.list({ destination: trip.destination }) });
  const days = durationDays(trip.start_date, trip.end_date);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await tripsApi.updateMustDos(trip.id, {
        must_sees: value.mustSees,
        busy: value.busy,
        excluded_places: value.skip,
        arrive_time: arrive,
        leave_time: leave,
      });
      haptics.success();
      const n = res.replanned_days.length;
      setFlash(
        trip.id,
        n
          ? t('mustDos.replanned', { count: n, days: res.replanned_days.map((d) => f.n(d)).join(', ') })
          : t('mustDos.saved'),
      );
      await Promise.all(
        [['trip', trip.id], ['itinerary', trip.id], ['budget', trip.id], ['trips']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      router.back();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.h3} accessibilityRole="header">
          {t('mustDos.firstLast')}
        </Text>
        <View style={styles.group}>
          <TimeRow
            icon="airplane-landing"
            label={t('newTrip.arriving', { date: text.shortDate(trip.start_date) })}
            value={arrive ? f.time(arrive) : t('newTrip.morning')}
            onPress={() => setSheet('arrive')}
            testID="md-arrive"
          />
          <View style={styles.divider} />
          <TimeRow
            icon="airplane-takeoff"
            label={t('newTrip.leaving', { date: text.shortDate(trip.end_date) })}
            value={leave ? f.time(leave) : t('newTrip.evening')}
            onPress={() => setSheet('leave')}
            testID="md-leave"
          />
        </View>
        <View style={styles.gap} />
        <MustDosEditor value={value} onChange={setValue} places={places.data ?? []} startDate={trip.start_date} days={days} showCrowds={false} />
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {t('mustDos.saveFailed')}: {error}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('common.save')} onPress={save} loading={saving} disabled={saving} haptic="medium" testID="md-save" />
      </View>
      <TimeSheet
        visible={sheet !== null}
        title={sheet === 'leave' ? t('newTrip.leaveTitle') : t('newTrip.arriveTitle')}
        times={sheet === 'leave' ? LEAVE_TIMES : ARRIVE_TIMES}
        selected={sheet === 'leave' ? leave : arrive}
        none={
          sheet === 'leave'
            ? t('newTrip.leaveNone', { time: f.time(pref?.preferred_end_time ?? '20:00') })
            : t('newTrip.arriveNone', { time: f.time(pref?.preferred_start_time ?? '09:00') })
        }
        onClose={() => setSheet(null)}
        onSelect={(v) => (sheet === 'leave' ? setLeave(v) : setArrive(v))}
      />
    </View>
  );
}

function TimeRow({ icon, label, value, onPress, testID }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale pressEffect="opacity" haptic="selection" onPress={onPress} style={styles.timeRow} accessibilityRole="button" accessibilityLabel={`${label} ${value}`} testID={testID}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.timeChip}>
        <Text style={styles.timeChipText}>{value}</Text>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
  h3: { ...t.type.headline, color: t.colors.textPrimary, marginBottom: t.spacing.sm },
  gap: { height: t.spacing.xl },
  group: { backgroundColor: t.colors.surface, borderRadius: 20, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: t.colors.divider, marginLeft: 54 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 60 },
  rowLabel: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  timeChip: { minHeight: 40, minWidth: 72, paddingHorizontal: t.spacing.md, borderRadius: t.radius.control, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  timeChipText: { ...t.type.callout, fontWeight: '700', color: t.colors.onAccentSoft },
  error: { ...t.type.callout, color: t.colors.danger, marginTop: t.spacing.lg },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, backgroundColor: t.colors.bg },
}));
