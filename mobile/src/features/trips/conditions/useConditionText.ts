/**
 * Plain words for live conditions, in the app's language: weather icons, warning
 * titles and what they mean, where each comes from and how old it is.
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConditionWarning, ConditionsDay } from '../../../types';
import { parseDay } from '../dates';
import { usePlanFormat } from '../plan/usePlanFormat';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** WMO weather code → icon and a short name (the key under conditions.sky); `night` for hours without the sun */
export function sky(code: number | null | undefined, night = false): { icon: IconName; key: string } {
  if (code == null) return { icon: 'weather-cloudy', key: 'unknown' };
  if (code === 0) return { icon: night ? 'weather-night' : 'weather-sunny', key: 'clear' };
  if (code <= 2) return { icon: night ? 'weather-night-partly-cloudy' : 'weather-partly-cloudy', key: 'partly' };
  if (code === 3) return { icon: 'weather-cloudy', key: 'cloudy' };
  if (code === 45 || code === 48) return { icon: 'weather-fog', key: 'fog' };
  if (code >= 95) return { icon: 'weather-lightning-rainy', key: 'storm' };
  if (code === 65 || code === 82) return { icon: 'weather-pouring', key: 'heavyRain' };
  if (code >= 51) return { icon: 'weather-rainy', key: 'rain' };
  return { icon: 'weather-cloudy', key: 'cloudy' };
}

/**
 * The sky that describes the day: the most common weather in daylight hours (a morning
 * fog shouldn't label a sunny day), with a thunderstorm at any time winning.
 */
export function daySky(day: Pick<ConditionsDay, 'hours' | 'code' | 'sunrise' | 'sunset'>): number | null {
  const daylight = day.hours.filter((h) => h.time >= day.sunrise && h.time < day.sunset && h.code != null);
  if (!daylight.length) return day.code;
  if (daylight.some((h) => (h.code ?? 0) >= 95)) return 95;
  const count = new Map<number, number>();
  for (const h of daylight) count.set(h.code!, (count.get(h.code!) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export function warningIcon(code: ConditionWarning['code']): IconName {
  switch (code) {
    case 'storm':
      return 'weather-lightning-rainy';
    case 'rain':
      return 'weather-rainy';
    case 'wind':
      return 'weather-windy';
    case 'rough_sea':
      return 'waves';
    case 'after_dark':
      return 'weather-night';
    default:
      return 'car-clock';
  }
}

/** Storms are serious (red); the rest need attention (amber). */
export const isSerious = (w: ConditionWarning) => w.code === 'storm';

export function useConditionText() {
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();

  const weekday = (iso: string | null) => (iso ? f.time(parseDay(iso).toLocaleDateString(i18n.language, { weekday: 'long' })) : '');

  const title = (w: ConditionWarning) => {
    const p = { from: f.time(w.from ?? ''), to: f.time(w.to ?? ''), place: w.place ?? '' };
    switch (w.code) {
      case 'storm':
        return t('conditions.w.storm', p);
      case 'rain':
        return t('conditions.w.rain', { ...p, chance: f.n(w.chance ?? 0) });
      case 'wind':
        return t('conditions.w.wind', { ...p, gust: f.n(w.gust ?? 0) });
      case 'rough_sea':
        return t('conditions.w.roughSea');
      case 'after_dark':
        return t('conditions.w.afterDark', p);
      default:
        return t('conditions.w.traffic', p);
    }
  };

  const body = (w: ConditionWarning) => {
    const p = { n: f.n(w.stop_number ?? 0), place: w.place ?? '' };
    switch (w.code) {
      case 'storm':
        return w.boat ? t('conditions.b.stormBoat', p) : t('conditions.b.outdoors', p);
      case 'rain':
        return t('conditions.b.outdoors', p);
      case 'wind':
        return t('conditions.b.wind', p);
      case 'rough_sea':
        return t('conditions.b.roughSea', { wave: f.km(w.wave ?? 0) });
      case 'after_dark':
        return t('conditions.b.afterDark', { sunset: f.time(w.sunset ?? ''), end: f.time(w.end ?? '') });
      default:
        return t('conditions.b.traffic', { extra: f.n(w.extra ?? 0), closes: f.time(w.closes ?? '') });
    }
  };

  /** "3 min ago", from an ISO time */
  const age = (iso: string | null | undefined, now = Date.now()) => {
    if (!iso) return '';
    const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    if (minutes < 1) return t('conditions.justNow');
    if (minutes < 60) return t('conditions.minAgo', { n: f.n(minutes) });
    const hours = Math.round(minutes / 60);
    if (hours < 48) return t('conditions.hAgo', { n: f.n(hours) });
    return t('conditions.dAgo', { n: f.n(Math.round(hours / 24)) });
  };

  const source = (w: ConditionWarning, fetchedAt: string | null, seaAt?: string | null) => {
    if (w.source === 'traffic') return t('conditions.src.traffic');
    if (w.source === 'sea') return t('conditions.src.sea', { age: age(seaAt ?? fetchedAt) });
    if (w.source === 'sun') return t('conditions.src.sun');
    return t('conditions.src.weather', { age: age(fetchedAt) });
  };

  const check = (c: ConditionsDay['checks'][number]) => {
    switch (c.code) {
      case 'opening_hours':
        return { title: t('conditions.c.hours'), text: c.ok ? t('conditions.c.hoursOk', { count: c.count ?? 0, n: f.n(c.count ?? 0) }) : t('conditions.c.hoursNo') };
      case 'after_dark':
        return {
          title: t('conditions.c.dark'),
          text: c.ok ? t('conditions.c.darkOk', { sunset: f.time(c.sunset ?? ''), back: f.time(c.back_by ?? '') }) : t('conditions.c.darkNo', { sunset: f.time(c.sunset ?? '') }),
        };
      default:
        return {
          title: t('conditions.c.traffic'),
          text: c.ok ? t('conditions.c.trafficOk') : t('conditions.c.trafficNo', { when: (c.peaks ?? []).map((p) => t(`conditions.peak.${p}`)).join(', ') }),
        };
    }
  };

  return { title, body, age, source, check, weekday, sky: (code: number | null | undefined) => t(`conditions.sky.${sky(code).key}`) };
}

export type ConditionText = ReturnType<typeof useConditionText>;
