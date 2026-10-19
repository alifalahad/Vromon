/**
 * Keeps a trip's reminders in step with its plan and forecast while the app is
 * open: "leave in 10 minutes" for every stop from today on, and the evening-before
 * weather note. Only what's switched on in Today mode is scheduled.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { Itinerary, TripConditions } from '../../../types';
import { useConditionText } from '../conditions/useConditionText';
import { usePlanFormat } from '../plan/usePlanFormat';
import { at, cancelReminders, eveningBefore, LEAVE_EARLY_MIN, replaceReminders, type Reminder } from './reminders';
import { useTodaySettings } from './settings';
import { leaveTimes, t2m, type Point } from './today';

const SERIOUS = new Set(['storm', 'rain', 'wind', 'rough_sea']);

export function useTripReminders(tripId: number, itinerary: Itinerary | undefined, conditions: TripConditions | undefined, today: string) {
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const { leaveReminders, weatherReminders } = useTodaySettings();
  const hotel: Point | null =
    itinerary?.hotel?.latitude != null && itinerary.hotel.longitude != null ? { lat: itinerary.hotel.latitude, lon: itinerary.hotel.longitude } : null;

  // Leave in 10 minutes
  useEffect(() => {
    if (!itinerary) return;
    if (!leaveReminders) {
      void cancelReminders(tripId, 'trip-leave');
      return;
    }
    const reminders: Reminder[] = itinerary.days
      .filter((d) => d.day_date && d.day_date >= today)
      .flatMap((d) =>
        leaveTimes(d, hotel).map(({ item, leave }) => ({
          at: at(d.day_date!, t2m(leave.at) - LEAVE_EARLY_MIN),
          title: t('today.remindLeaveTitle', { place: item.title }),
          body: t('today.remindLeaveBody', {
            leave: f.time(leave.at),
            mode: t(`plan.modes.${leave.mode}`),
            time: f.duration(leave.minutes + (leave.traffic?.extra ?? 0)),
            start: f.time(item.start_time),
          }),
        })),
      );
    void replaceReminders(tripId, 'trip-leave', reminders).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `f` and `t` change with the language only
  }, [tripId, itinerary, leaveReminders, today, hotel?.lat, hotel?.lon]);

  // The evening before: tomorrow's weather warnings
  useEffect(() => {
    if (!conditions) return;
    if (!weatherReminders) {
      void cancelReminders(tripId, 'trip-weather');
      return;
    }
    const reminders: Reminder[] = conditions.days
      .filter((d) => d.date && d.date > today && d.in_forecast)
      .flatMap((d) => {
        const ws = d.warnings.filter((w) => !w.kept && SERIOUS.has(w.code));
        if (!ws.length) return [];
        return [{
          at: eveningBefore(d.date!),
          title: t('today.remindWeatherTitle', { count: ws.length, n: f.n(ws.length) }),
          body: [
            ws[0].place ? t('today.remindWeatherAt', { what: text.title(ws[0]), place: ws[0].place }) : text.title(ws[0]),
            ws.length > 1 ? t('today.remindWeatherMore', { count: ws.length - 1, n: f.n(ws.length - 1) }) : null,
          ]
            .filter(Boolean)
            .join(' '),
        }];
      });
    void replaceReminders(tripId, 'trip-weather', reminders).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `f`, `t` and `text` change with the language only
  }, [tripId, conditions, weatherReminders, today]);
}
