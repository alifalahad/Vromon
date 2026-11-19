/**
 * What Conditions says about a day (docs/ui-refresh step 17, frames 34–36), worked out from the server's
 * answer and the phone's clock: whether the day is over, today or still to come; the day in words; its
 * highest chance of rain; on a trip day the next rain, how long it stays dry and the next hours. Pure, so
 * the screen, the weather button and the tests agree.
 */

import type { ConditionsDay, TripConditions } from '../../../types';
import { tripPhase } from '../dates';
import { t2m } from '../today/today';
import { daySky, sky } from './useConditionText';

export type DayWhen = 'past' | 'today' | 'coming';
type Hour = ConditionsDay['hours'][number];

/** The chance of rain in an hour that counts as likely (the server's line, conditions/service.py) */
export const RAIN_LIKELY = 60;
/** The hours "By the hour" draws */
export const FIGURE_FROM = 6;
export const FIGURE_TO = 22;
/** How old the weather now may be before this hour's forecast is shown instead */
const NOW_FRESH_MIN = 90;

/** Over, today or to come, by the phone's date: the one rule for dates (tripPhase), on a single day. */
export function dayWhen(day: Pick<ConditionsDay, 'date' | 'when'>, today: string): DayWhen {
  if (!day.date) return day.when ?? 'coming';
  const phase = tripPhase(day.date, day.date, today);
  return phase === 'past' ? 'past' : phase === 'ongoing' ? 'today' : 'coming';
}

/** What the day's card can show. */
export type DayState = 'recorded' | 'notKept' | 'forecast' | 'later' | 'none';

export function dayState(day: ConditionsDay, when: DayWhen): DayState {
  if (when === 'past') return day.recorded || (day.in_forecast && day.temp_max != null) ? 'recorded' : 'notKept';
  if (day.in_forecast) return 'forecast';
  return day.opens_on ? 'later' : 'none';
}

const inFigure = (h: Hour) => {
  const m = t2m(h.time);
  return m >= FIGURE_FROM * 60 && m <= FIGURE_TO * 60;
};

/** The highest chance of rain in the day's hours and the first hour it's reached, or null without hours. */
export function peakRain(day: Pick<ConditionsDay, 'hours'>): { chance: number; at: string } | null {
  let best: { chance: number; at: string } | null = null;
  for (const h of day.hours.filter(inFigure)) {
    const chance = h.rain ?? 0;
    if (!best || chance > best.chance) best = { chance, at: h.time };
  }
  return best;
}

/** The part of the day an hour is in */
const partOf = (minute: number) => (minute < 12 * 60 ? 'morning' : minute < 17 * 60 ? 'afternoon' : 'evening');

/**
 * The day in words for the card's first line (frame 34: "Rain in the afternoon"): storms if any daytime hour
 * has them, rain and when it falls if likely, else the day's sky. A key under `conditions.`.
 */
export function dayWords(day: Pick<ConditionsDay, 'hours' | 'code' | 'sunrise' | 'sunset'>): string {
  const hours = day.hours.filter(inFigure);
  if (hours.some((h) => (h.code ?? 0) >= 95)) return 'stormsDay';
  const wet = new Set(hours.filter((h) => (h.rain ?? 0) >= RAIN_LIKELY).map((h) => partOf(t2m(h.time))));
  if (wet.size === 1) return `rainPart.${[...wet][0]}`;
  if (wet.size > 1) return 'rainOnOff';
  return `sky.${sky(daySky(day)).key}`;
}

/** The hours not over yet: from the one that has begun. */
export function hoursFrom(day: Pick<ConditionsDay, 'hours'>, now: number): Hour[] {
  return day.hours.filter((h) => t2m(h.time) + 60 > now);
}

/** Today: the next hour rain is likely (now, if it already is), with the highest chance of that spell. */
export function nextRain(day: Pick<ConditionsDay, 'hours'>, now: number): { at: string; chance: number; now: boolean } | null {
  const ahead = hoursFrom(day, now);
  const start = ahead.findIndex((h) => (h.rain ?? 0) >= RAIN_LIKELY);
  if (start < 0) return null;
  let chance = 0;
  for (const h of ahead.slice(start)) {
    if ((h.rain ?? 0) < RAIN_LIKELY) break;
    chance = Math.max(chance, h.rain ?? 0);
  }
  return { at: ahead[start].time, chance, now: t2m(ahead[start].time) <= now };
}

/** Today: minutes until rain is likely (0 when it is now), or null when it stays dry for the rest of the day. */
export function dryFor(day: Pick<ConditionsDay, 'hours'>, now: number): number | null {
  const rain = nextRain(day, now);
  if (!rain) return null;
  return rain.now ? 0 : t2m(rain.at) - now;
}

/** "The next hours" (frame 35): the hour that has begun, then the ones after it. */
export function nextHours(day: Pick<ConditionsDay, 'hours'>, now: number, count = 6): Hour[] {
  return hoursFrom(day, now).slice(0, count);
}

/**
 * The weather now: the service's own (15-minute data) while it's fresh, else the forecast for the hour
 * that has begun. Null when there's neither.
 */
export function weatherNow(conditions: Pick<TripConditions, 'now'> | undefined, day: Pick<ConditionsDay, 'hours'>, now: number) {
  const live = conditions?.now;
  if (live && live.temp != null && Math.abs(now - t2m(live.time)) <= NOW_FRESH_MIN) return { temp: live.temp, code: live.code, live: true };
  const hour = [...day.hours].reverse().find((h) => t2m(h.time) <= now && h.temp != null);
  return hour ? { temp: hour.temp as number, code: hour.code, live: false } : null;
}

/** Night at that time of the day: before sunrise or from sunset. */
export const isNight = (time: string, day: Pick<ConditionsDay, 'sunrise' | 'sunset'>) => time < day.sunrise || time >= day.sunset;
