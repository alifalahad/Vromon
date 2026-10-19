/**
 * "Mark visited" on a finished trip (prompt §6.8): one tap marks every stop's
 * city and country on your map; the server never downgrades "lived".
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { tripsApi } from '../../services/api';
import type { Trip } from '../../types';
import { haptics } from '../../ui/haptics';
import { notify } from '../../utils/dialogs';
import { visitsKey } from '../map/visits';
import { refreshTrips } from './queries';

export function useMarkVisited(userId: string | undefined) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const mark = async (trip: Trip) => {
    setBusyId(trip.id);
    try {
      const res = await tripsApi.markVisited(trip.id, true);
      haptics.success();
      if (userId) void client.invalidateQueries({ queryKey: visitsKey(userId) });
      void client.invalidateQueries({ queryKey: ['userStats'] });
      notify(t('trips.markTitle'), res.places_marked ? t('trips.marked', { count: res.places_marked }) : t('trips.markedNone'));
      refreshTrips(client, trip.id);
    } catch (err) {
      notify(t('common.error'), err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return { mark, busyId };
}

/** Every stop of the trip is on the map already (visited or lived): "visited" is "city:<id>" / "country:<iso2>". */
export function onMap(trip: Trip, visited: ReadonlySet<string>): boolean {
  const stops = trip.stops ?? [];
  return stops.length > 0 && stops.every((s) => visited.has(s.city_geonameid ? `city:${s.city_geonameid}` : `country:${s.country_iso2}`));
}
