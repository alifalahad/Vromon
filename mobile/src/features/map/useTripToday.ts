/**
 * Today on a trip, for the map (dock and today's route, map home steps 4 and 7):
 * the same day, stops and "leave by" as Today mode, from the same helpers, so
 * the map never disagrees with the Today screen. Ticks every 30 s.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { tripsApi } from '../../services/api';
import type { ItineraryDay, Trip } from '../../types';
import { localToday } from '../trips/dates';
import { dayFor, leaveBy, minuteOfDay, todayState, type LeaveBy, type Point, type TodayState } from '../trips/today/today';

export type TripToday = {
  day: ItineraryDay | null;
  state: TodayState | null;
  leave: LeaveBy | null;
  /** Minutes until "leave by" (negative: you should have left) */
  leaveIn: number | null;
  hotel: Point | null;
  now: number;
  loading: boolean;
};

export function useTripToday(trip: Trip | null, here: Point | null = null): TripToday {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (!trip) return;
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, [trip]);

  const itinerary = useQuery({
    queryKey: ['itinerary', trip?.id],
    queryFn: () => tripsApi.getItinerary(trip!.id),
    enabled: !!trip && trip.status !== 'draft',
  });

  const today = localToday(clock);
  const now = minuteOfDay(clock);
  const day = itinerary.data ? dayFor(itinerary.data.days, today) : null;
  const state = useMemo(() => (day ? todayState(day, now) : null), [day, now]);
  const hotel: Point | null =
    itinerary.data?.hotel?.latitude != null && itinerary.data.hotel.longitude != null
      ? { lat: itinerary.data.hotel.latitude, lon: itinerary.data.hotel.longitude }
      : null;
  const leave = state ? leaveBy(state, hotel, here) : null;
  return { day, state, leave, leaveIn: leave ? leave.atMin - now : null, hotel, now, loading: itinerary.isLoading };
}
