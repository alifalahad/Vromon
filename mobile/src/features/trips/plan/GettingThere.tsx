/**
 * Day 1 starts with getting there: the recommended way from where the trip starts, with its
 * time and fare per person. Tap for every way there, leg by leg (the Getting there screen).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import type { GettingThere as Trip } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { transportIcon } from '../transport';
import { usePlanFormat } from './usePlanFormat';

export function GettingThere({ trip, tripId }: { trip: Trip; tripId?: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const fare = t(trip.fare_per === 'vehicle' ? 'plan.gettingFareVehicle' : 'plan.gettingFarePerson', { amount: f.money(trip.fare) });
  const title = t('plan.gettingFrom', { from: trip.from, mode: t(`trips.modes.${trip.mode}`).toLowerCase() });
  const line = `${t('plan.gettingTime', { time: f.duration(trip.minutes), km: f.n(trip.km) })} · ${fare}`;
  return (
    <PressableScale
      pressEffect="opacity"
      style={styles.card}
      disabled={!tripId}
      onPress={() => tripId && router.push({ pathname: '/trip/journey/[id]', params: { id: String(tripId) } })}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}. ${t('plan.gettingAll')}`}
      testID="getting-there"
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name={transportIcon(trip.mode)} size={22} color={colors.link} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.line}>{line}</Text>
        <Text style={styles.note}>{t('plan.gettingAll')}</Text>
      </View>
      {tripId ? <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /> : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.md, borderRadius: 20, backgroundColor: t.colors.surfaceInset, alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  text: { flex: 1, gap: 2 },
  title: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  line: { ...t.type.footnote, color: t.colors.textSecondary },
  note: { ...t.type.caption, color: t.colors.textTertiary },
}));
