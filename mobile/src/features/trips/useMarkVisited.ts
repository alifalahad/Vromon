/**
 * "Mark visited" on a finished trip (prompt §6.8): one tap marks every stop's
 * city and country on your map; the server never downgrades "lived". "Not now"
 * (the finished trip's own offer, docs/ui-refresh step 16) answers it too: either
 * way the offer is gone from the trip and the Trips tab.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { tripsApi } from '../../services/api';
import type { Trip } from '../../types';
import { haptics } from '../../ui/haptics';
import { notify } from '../../utils/dialogs';
import { visitsKey } from '../map/visits';
import { refreshTrips, tripKeys } from './queries';

export function useMarkVisited(userId: string | undefined) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  // The answer shows at once, in the trip and in the list, while they refresh
  const answered = (trip: Trip, visited_prompt: 'marked' | 'dismissed') => {
    client.setQueryData<Trip>(tripKeys.trip(trip.id), (old) => (old ? { ...old, visited_prompt } : old));
    client.setQueryData<Trip[]>(tripKeys.list, (old) => old?.map((x) => (x.id === trip.id ? { ...x, visited_prompt } : x)));
    refreshTrips(client, trip.id);
  };

  const mark = async (trip: Trip) => {
    setBusyId(trip.id);
    try {
      const res = await tripsApi.markVisited(trip.id, true);
      haptics.success();
      if (userId) void client.invalidateQueries({ queryKey: visitsKey(userId) });
      void client.invalidateQueries({ queryKey: ['userStats'] });
      notify(t('trips.markTitle'), res.places_marked ? t('trips.marked', { count: res.places_marked }) : t('trips.markedNone'));
      answered(trip, 'marked');
    } catch (err) {
      notify(t('common.error'), err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const notNow = async (trip: Trip) => {
    setBusyId(trip.id);
    try {
      await tripsApi.markVisited(trip.id, false);
      answered(trip, 'dismissed');
    } catch (err) {
      notify(t('common.error'), err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return { mark, notNow, busyId };
}

/** Every stop of the trip is on the map already (visited or lived): "visited" is "city:<id>" / "country:<iso2>". */
export function onMap(trip: Trip, visited: ReadonlySet<string>): boolean {
  const stops = trip.stops ?? [];
  return stops.length > 0 && stops.every((s) => visited.has(s.city_geonameid ? `city:${s.city_geonameid}` : `country:${s.country_iso2}`));
}
