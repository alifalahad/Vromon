/**
 * Day 1 starts with getting there (docs/ui-refresh step 14, frame 29): "Getting there: Dhaka → Cox's Bazar",
 * "Bus · about 9 h 30 · ≈ ৳1,205 each": the recommended way from where the trip starts, with its time and
 * fare. Tap for every way there, leg by leg (the Getting there screen).
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
  const title = t('plan.gettingThereTo', { from: trip.from, to: trip.to });
  const line = t('plan.gettingLine', { mode: t(`trips.modes.${trip.mode}`), time: f.duration(trip.minutes), fare });
  return (
    <PressableScale
      pressEffect="opacity"
      style={styles.card}
      disabled={!tripId}
      onPress={() => tripId && router.push({ pathname: '/trip/journey/[id]', params: { id: String(tripId) } })}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}, ${f.distance(trip.km)} km`}
      accessibilityHint={tripId ? t('plan.gettingAll') : undefined}
      testID="getting-there"
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name={transportIcon(trip.mode)} size={22} color={colors.link} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.line}>{line}</Text>
      </View>
      {tripId ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} /> : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentTint },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  line: { fontSize: 13, color: t.colors.textSecondary },
}));
