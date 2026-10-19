/**
 * Plain words for must-dos, in the app's language: when a must-see is wanted,
 * why one can't fit (from the server's reason code and details, not its English
 * message), and the choices that fix it.
 */

import { useTranslation } from 'react-i18next';

import type { BusyTime, MustSee, MustSeeWhen, Unplaced, UnplacedReason } from '../../../types';
import { parseDay } from '../dates';
import { usePlanFormat } from '../plan/usePlanFormat';

export function periodOf(hhmm: string): 'morning' | 'afternoon' | 'evening' {
  const h = Number(hhmm.slice(0, 2));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

export function useMustDoText() {
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();

  /** "Mon 19" */
  const shortDate = (iso: string) => {
    const d = parseDay(iso);
    // Weekday first in every language ("Sun 25"); some engines write "25 Sun" for the combined format
    return f.time(`${d.toLocaleDateString(i18n.language, { weekday: 'short' })} ${d.getDate()}`);
  };

  const whenLabel = (when: MustSeeWhen) => t(`mustDos.when.${when}`);

  /** The chip text for a must-see's time: "Any time", "Sunset", "At 15:00" */
  const timeLabel = (m: Pick<MustSee, 'when' | 'at'>) =>
    m.at ? t('mustDos.atTime', { time: f.time(m.at) }) : m.when ? whenLabel(m.when) : t('mustDos.anyTime');

  const dayLabel = (day: number | null) => (day ? t('mustDos.dayN', { n: f.n(day) }) : t('mustDos.anyDay'));

  /** "Day 1 · Sunset", "Any day · Any time" */
  const mustSeeLine = (m: MustSee) => `${dayLabel(m.day)} · ${timeLabel(m)}`;

  /** "on day 1 at sunset", "in the morning", "" */
  const wanted = (m: Pick<MustSee, 'day' | 'when' | 'at'>) => {
    const parts: string[] = [];
    if (m.day) parts.push(t('mustDos.wantedDay', { n: f.n(m.day) }));
    if (m.at) parts.push(t('mustDos.wantedAt', { time: f.time(m.at) }));
    else if (m.when) parts.push(t(`mustDos.wanted.${m.when}`));
    return parts.join(' ');
  };

  const reasonWanted = (r: UnplacedReason) =>
    r.wanted === 'sunset'
      ? t('mustDos.beforeSunset', { time: f.time(r.sunset ?? '') })
      : r.wanted === 'at'
        ? f.time(r.at ?? '')
        : r.wanted && r.wanted !== 'any'
          ? t(`mustDos.the.${r.wanted}`)
          : t('mustDos.the.then');

  const reason = (r: UnplacedReason): string => {
    switch (r.code) {
      case 'closes_before':
        return t('mustDos.reason.closes_before', { time: f.time(r.closes ?? ''), wanted: reasonWanted(r) });
      case 'opens_after':
        return t('mustDos.reason.opens_after', { time: f.time(r.opens ?? ''), wanted: reasonWanted(r) });
      case 'day_ends':
        return t('mustDos.reason.day_ends', { time: f.time(r.end ?? '') });
      case 'day_starts':
        return t('mustDos.reason.day_starts', { time: f.time(r.start ?? '') });
      case 'arrive':
        return t('mustDos.reason.arrive', { time: f.time(r.arrive ?? '') });
      case 'leave':
        return t('mustDos.reason.leave', { time: f.time(r.leave ?? '') });
      case 'busy':
        return r.label ? t('mustDos.reason.busyLabel', { label: r.label }) : t('mustDos.reason.busy');
      case 'clash':
        return r.other ? t('mustDos.reason.clash', { other: r.other }) : t('mustDos.reason.clashAny');
      case 'budget':
        return t('mustDos.reason.budget');
      default:
        return t('mustDos.reason.full');
    }
  };

  const doesntFit = (u: Unplaced) => {
    const w = wanted(u);
    return w ? t('mustDos.doesntFitWhen', { name: u.name, when: w }) : t('mustDos.doesntFit', { name: u.name });
  };

  /** The suggested fix: "Go in the afternoon instead" (same day) or "Go on day 2 instead" */
  const suggestionTitle = (u: Unplaced) => {
    const s = u.suggestion!;
    if (u.day && s.day !== u.day) return t('mustDos.goOtherDay', { n: f.n(s.day) });
    if (!u.day && !u.when && !u.at) return t('mustDos.goOtherDay', { n: f.n(s.day) });
    return t(`mustDos.goPeriod.${periodOf(s.at)}`);
  };
  const suggestionDetail = (u: Unplaced) =>
    t('mustDos.suggestionDetail', { n: f.n(u.suggestion!.day), time: f.time(u.suggestion!.at) });

  /** "Wedding · Tue 20 · 18:00–21:00" parts */
  const busyWhen = (b: BusyTime, startDate: string) => {
    const d = parseDay(startDate);
    d.setDate(d.getDate() + b.day - 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${shortDate(iso)} · ${f.time(b.start)}–${f.time(b.end)}`;
  };

  return { shortDate, whenLabel, timeLabel, dayLabel, mustSeeLine, wanted, reason, doesntFit, suggestionTitle, suggestionDetail, busyWhen };
}

export type MustDoText = ReturnType<typeof useMustDoText>;
