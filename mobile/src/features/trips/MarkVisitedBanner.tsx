/**
 * "Mark these places as visited on your map?" (prompt §6.8), shown on the Trips
 * tab for the most recent finished trip that hasn't been answered. One tap marks
 * every stop's city and country; the server never downgrades "lived".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { tripsApi } from '../../services/api';
import type { Trip } from '../../types';
import { Button } from '../../ui/Button';
import { haptics } from '../../ui/haptics';
import { makeStyles, useTheme } from '../../ui/theme';
import { notify } from '../../utils/dialogs';
import { visitsKey } from '../map/visits';
import { refreshTrips } from './queries';
import { stopName } from './TripCard';

export function MarkVisitedBanner({ trip, userId }: { trip: Trip; userId: string | undefined }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const places = (trip.stops ?? []).map(stopName).join(' · ');

  const answer = async (mark: boolean) => {
    setBusy(mark ? 'yes' : 'no');
    try {
      const res = await tripsApi.markVisited(trip.id, mark);
      if (mark) {
        haptics.success();
        if (userId) void client.invalidateQueries({ queryKey: visitsKey(userId) });
        void client.invalidateQueries({ queryKey: ['userStats'] });
        notify(t('trips.markTitle'), res.places_marked ? t('trips.marked', { count: res.places_marked }) : t('trips.markedNone'));
      }
      refreshTrips(client, trip.id);
    } catch (err) {
      notify(t('common.error'), err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} testID="mark-visited">
      <View style={styles.header}>
        <MaterialCommunityIcons name="map-marker-check-outline" size={26} color={colors.success} />
        <Text style={styles.title}>{t('trips.markTitle')}</Text>
      </View>
      <Text style={styles.body}>{t('trips.markBody', { places })}</Text>
      <View style={styles.buttons}>
        <Button variant="secondary" label={t('trips.markNo')} onPress={() => answer(false)} loading={busy === 'no'} disabled={!!busy} style={styles.button} testID="mark-visited-no" />
        <Button label={t('trips.markYes')} onPress={() => answer(true)} loading={busy === 'yes'} disabled={!!busy} style={styles.button} testID="mark-visited-yes" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing.lg + 2, backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.xl, gap: t.spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  title: { ...t.type.headline, color: t.colors.textPrimary },
  body: { ...t.type.body, color: t.colors.textSecondary },
  buttons: { flexDirection: 'row', gap: t.spacing.md },
  button: { flex: 1 },
}));
