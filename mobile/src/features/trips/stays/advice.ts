/**
 * The stay advisor in words (docs/trip-upgrades, step 4): "Sleep in Mongla for night 3?", the price
 * against the current one, what it saves, and how the numbers add up ("Why?"). Pure, unit-tested.
 */

import type { StaySuggestion } from '../../../types';

type T = (key: string, options?: Record<string, unknown>) => string;
type F = { n: (v: number) => string; money: (v: number) => string; duration: (minutes: number) => string };

/** "night 3" / "nights 3–4" */
export function nightsWord(s: Pick<StaySuggestion, 'first_night' | 'last_night'>, t: T, f: Pick<F, 'n'>): string {
  return s.first_night === s.last_night
    ? t('stayAdvice.night', { n: f.n(s.first_night) })
    : t('stayAdvice.nights', { from: f.n(s.first_night), to: f.n(s.last_night) });
}

/** "Sleep in Mongla for night 3?" (another town), else "Sleep at Hotel Pashur for nights 1–2?" */
export function adviceTitle(s: StaySuggestion, destination: string, t: T, f: Pick<F, 'n'>): string {
  const nights = nightsWord(s, t, f);
  return s.hotel.destination_name && s.hotel.destination_name !== destination
    ? t('stayAdvice.titleTown', { town: s.hotel.destination_name, nights })
    : t('stayAdvice.titleHotel', { hotel: s.hotel.name, nights });
}

/** "Hotel Pashur, ৳1,800 a night instead of ৳3,500" (or "…; your hotel's price isn't known") */
export function advicePrice(s: StaySuggestion, t: T, f: Pick<F, 'money'>): string {
  const price = f.money(s.hotel.price_per_night);
  if (s.current?.price_per_night == null) return t('stayAdvice.priceUnknownNow', { hotel: s.hotel.name, price });
  return t('stayAdvice.priceInstead', { hotel: s.hotel.name, price, now: f.money(s.current.price_per_night) });
}

/** "Saves ৳1,700 and 1 h 50 min on the road" (whichever it saves), and the move: "one extra check-out and check-in" */
export function adviceSaves(s: StaySuggestion, t: T, f: F): { saves: string; move: string } {
  const money = s.money_saved != null && s.money_saved > 0 ? f.money(Math.round(s.money_saved)) : null;
  const time = s.minutes_saved > 0 ? f.duration(s.minutes_saved) : null;
  const saves =
    money && time
      ? t('stayAdvice.savesBoth', { money, time })
      : money
        ? s.minutes_saved < 0
          ? t('stayAdvice.savesMoneyLonger', { money, time: f.duration(-s.minutes_saved) })
          : t('stayAdvice.savesMoney', { money })
        : time
          ? s.money_saved == null
            ? t('stayAdvice.savesTime', { time })
            : t('stayAdvice.savesTimeCosts', { time, money: f.money(Math.round(-s.money_saved)) })
          : t('stayAdvice.savesLittle');
  const move =
    s.extra_moves <= 0
      ? t('stayAdvice.noMove')
      : s.extra_moves === 1
        ? t('stayAdvice.oneMove')
        : t('stayAdvice.moves', { n: f.n(s.extra_moves) });
  return { saves, move };
}

/** "Why?": how the numbers add up, line by line, in plain words */
export function whyLines(s: StaySuggestion, t: T, f: F): string[] {
  const p = s.parts;
  const lines: string[] = [];
  const nights = t('stayAdvice.nightsCount', { count: p.nights, n: f.n(p.nights) });
  const rooms = t('stayAdvice.rooms', { count: p.rooms, n: f.n(p.rooms) });
  if (p.price_now != null && p.stay_now != null) {
    lines.push(t('stayAdvice.whyRoomNow', { price: f.money(p.price_now), nights, rooms, total: f.money(p.stay_now) }));
  } else {
    lines.push(t('stayAdvice.whyRoomNowUnknown'));
  }
  lines.push(t('stayAdvice.whyRoomThen', { hotel: s.hotel.name, price: f.money(p.price_then), nights, rooms, total: f.money(p.stay_then) }));
  const days = p.days.map((d) => f.n(d)).join(', ');
  lines.push(t('stayAdvice.whyRoad', { count: p.days.length, days, now: f.duration(p.road_now), then: f.duration(p.road_then) }));
  if (p.fares_now !== p.fares_then) lines.push(t('stayAdvice.whyFares', { now: f.money(p.fares_now), then: f.money(p.fares_then) }));
  if (p.transfer_minutes > 0 || p.transfer_cost > 0) {
    lines.push(t('stayAdvice.whyTransfer', { time: f.duration(p.transfer_minutes), money: f.money(p.transfer_cost) }));
  }
  if (p.hassle_minutes > 0) lines.push(t('stayAdvice.whyHassle', { time: f.duration(p.hassle_minutes) }));
  const { saves } = adviceSaves(s, t, f);
  lines.push(t('stayAdvice.whyTotal', { saves }));
  lines.push(t('stayAdvice.whyRule', { value: f.money(p.time_value) }));
  return lines;
}

/** The card's numbers as one sentence, for a screen reader. */
export function adviceA11y(s: StaySuggestion, destination: string, t: T, f: F): string {
  const { saves, move } = adviceSaves(s, t, f);
  // the title ends with "?" and the price and the move with ".": only the savings need a full stop
  return `${adviceTitle(s, destination, t, f)} ${advicePrice(s, t, f)} ${saves}. ${move}`;
}

/** The suggestions to show above a day: the ones that start on its night */
export function adviceForDay(list: readonly StaySuggestion[] | undefined, dayNumber: number): StaySuggestion[] {
  return (list ?? []).filter((s) => s.day_number === dayNumber);
}
