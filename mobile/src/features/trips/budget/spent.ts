/**
 * What you spent (docs/ui-refresh step 19, frames 38–40), from GET /trips/{id}/budget's `spent`, `to_come` and
 * `projected`, and from the notes themselves: the parts in the sheet's order, a suggestion in words, the days a
 * note may have, each part against its plan, the days against theirs, the table after the trip, the biggest
 * costs, the notes by day. Pure, so the screens and the tests agree.
 *
 * Nothing noted is never "৳0 spent": a trip without notes shows the plan, a day without notes says so.
 */

import type { BudgetBreakdown, BudgetPartKey, Expense, ExpensePart, ExpenseSuggestion } from '../../../types';
import { addDays, localToday, parseDay } from '../dates';
import { slotOf } from '../meals/meals';
import type { PlanFormat } from '../plan/usePlanFormat';
import { PART_ORDER } from './budgetView';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "What for", as frame 39 lists them: the day's own costs first, then the trip's, then what no plan has */
export const SHEET_PARTS: readonly ExpensePart[] = ['food', 'local', 'tickets', 'stay', 'getting_there', 'shopping', 'other'];

/** The server's limit on a note's length */
export const NOTE_MAX = 80;

/** The days a note may have: the day before the trip to the day after it */
export function noteDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = addDays(start, -1); d <= addDays(end, 1); d = addDays(d, 1)) days.push(d);
  return days;
}

/** The day a new note starts on: today when it may have it, else the trip's nearest day */
export function defaultDay(start: string, end: string, today: string): string {
  if (today < addDays(start, -1)) return start;
  if (today > addDays(end, 1)) return end;
  return today;
}

/** A typed amount (Bangla digits too), whole taka; null when nothing is typed */
export function typedAmount(text: string): number | null {
  const digits = text.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

/** A note fits the server's 80 characters */
export const clip = (note: string) => (note.length > NOTE_MAX ? note.slice(0, NOTE_MAX).trimEnd() : note);

/** The name of a part: Budget's five, shopping and other */
export const partName = (key: ExpensePart, t: T) => t(`budget.parts.${key}`);

/** A suggestion in words: the chip's short name ("Lunch", "CNG to Inani") and the note it fills in. */
export function suggestionWords(s: ExpenseSuggestion, t: T, f: Pick<PlanFormat, 'n'>): { label: string; note: string } {
  if (s.kind === 'meal') {
    const slot = s.title ? slotOf({ item_type: 'meal', title: s.title }) : null;
    if (s.meal_source === 'own') {
      const word = slot ? t(`meals.packed.${slot}`) : (s.title ?? '');
      return { label: word, note: clip(word) };
    }
    const word = slot ? t(`meals.slot.${slot}`) : (s.title ?? '');
    return { label: word, note: clip(s.place ? `${word} · ${s.place}` : word) };
  }
  if (s.kind === 'stop') {
    const place = s.place ?? s.title ?? '';
    const count = s.count ?? 1;
    return { label: place, note: clip(t('spent.tickets', { place, count, n: f.n(count) })) };
  }
  const mode = s.mode ? t(`plan.modes.${s.mode}`) : '';
  const label =
    s.ride === 'back'
      ? s.place
        ? t('spent.rideBack', { mode, place: s.place })
        : t('spent.rideBackStay', { mode })
      : s.ride === 'move'
        ? s.place
          ? t('spent.rideMove', { mode, place: s.place })
          : t('spent.rideMoveStay', { mode })
        : t('spent.rideTo', { mode, place: s.place ?? '' });
  return { label, note: clip(label) };
}

/** "for you", "for both of you", "for all 4 of you" */
export function forGroup(travellers: number, t: T, f: Pick<PlanFormat, 'n'>): string {
  return travellers <= 1 ? t('spent.forOne') : travellers === 2 ? t('spent.forTwo') : t('spent.forMany', { n: f.n(travellers) });
}

/** Something was noted for this trip: Budget shows what's spent, not only the plan */
export const hasNotes = (b: Pick<BudgetBreakdown, 'spent'> | undefined | null): boolean => (b?.spent?.count ?? 0) > 0;

/** The plan's total gets "≈" when a part is a guess, as on Budget's other screens */
export const planIsEstimate = (b: Pick<BudgetBreakdown, 'parts'>) => b.parts.some((p) => p.known && p.estimate);

/** The planned amount of one day (food, tickets and rides), with whether it's an estimate */
export function dayPlan(b: Pick<BudgetBreakdown, 'by_day'>, date: string): { amount: number; estimate: boolean } | null {
  const d = b.by_day.find((x) => x.date === date);
  return d ? { amount: d.amount, estimate: d.estimate } : null;
}

/** What was noted on a day (without getting there and the stay); 0 when nothing was */
export const spentOn = (b: Pick<BudgetBreakdown, 'spent'>, date: string): number => b.spent?.by_day.find((d) => d.date === date)?.amount ?? 0;

export type PartAgainstPlan = {
  key: BudgetPartKey;
  spent: number;
  /** null when the plan doesn't know this part (no start given, no price) */
  planned: number | null;
  estimate: boolean;
  /** How much of the bar is filled, 0–1 */
  share: number;
  /** What's noted beyond the plan */
  over: number;
};

/** Frame 38's "Spent of what's planned": the five parts in their order. */
export function partsAgainstPlan(b: Pick<BudgetBreakdown, 'parts' | 'spent'>): PartAgainstPlan[] {
  return PART_ORDER.map((key) => {
    const p = b.parts.find((x) => x.key === key);
    const spent = b.spent?.by_part[key] ?? 0;
    const planned = p?.known ? (p.amount ?? 0) : null;
    return {
      key,
      spent,
      planned,
      estimate: !!p?.known && p.estimate,
      share: planned ? Math.min(1, spent / planned) : 0,
      over: planned != null && spent > planned ? spent - planned : 0,
    };
  });
}

export type DayRow = {
  date: string;
  /** The plan's day, or null for the day before or after the trip */
  dayNumber: number | null;
  /** null: nothing noted that day */
  spent: number | null;
  plan: number | null;
  estimate: boolean;
  when: 'past' | 'today' | 'future';
};

/** Frames 38 and 40's "By day": each day of the plan, and the day before or after it when something was noted then. */
export function dayRows(b: Pick<BudgetBreakdown, 'by_day' | 'spent'>, today: string): DayRow[] {
  const spent = new Map((b.spent?.by_day ?? []).map((d) => [d.date, d.amount]));
  const rows: DayRow[] = b.by_day
    .filter((d): d is typeof d & { date: string } => !!d.date)
    .map((d) => ({ date: d.date, dayNumber: d.day_number, spent: spent.get(d.date) ?? null, plan: d.amount, estimate: d.estimate, when: 'past' }));
  for (const [date, amount] of spent)
    if (!rows.some((r) => r.date === date)) rows.push({ date, dayNumber: null, spent: amount, plan: null, estimate: false, when: 'past' });
  return rows
    .map((r) => ({ ...r, spent: r.spent && r.spent > 0 ? r.spent : null, when: r.date < today ? 'past' : r.date === today ? 'today' : 'future' }) as DayRow)
    .sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0));
}

/** "৳670 less", "৳350 more", "As planned": what's noted against what was planned */
export function againstPlan(spent: number, planned: number, t: T, f: Pick<PlanFormat, 'money'>): string {
  const diff = Math.round(spent - planned);
  if (diff === 0) return t('spent.asPlanned');
  return diff < 0 ? t('spent.less', { amount: f.money(-diff) }) : t('spent.more', { amount: f.money(diff) });
}

/**
 * The whole trip against the plan (frame 40's "Against the plan"): each part you noted against what the plan had for
 * it, and shopping and other, which no plan has. A part with nothing noted, or one the plan couldn't price, isn't
 * compared: one bus fare noted is never "৳20,970 less" than the whole plan. With every part noted it's the totals'.
 */
export function planDifference(b: Pick<BudgetBreakdown, 'parts' | 'spent'>): number {
  const parts = partsAgainstPlan(b).reduce((sum, p) => (p.spent > 0 && p.planned != null ? sum + p.spent - p.planned : sum), 0);
  return parts + (b.spent?.by_part.shopping ?? 0) + (b.spent?.by_part.other ?? 0);
}

export type TableRow = {
  key: BudgetPartKey;
  planned: number | null;
  estimate: boolean;
  /** null: nothing noted for this part */
  spent: number | null;
};

/** Frame 40's table: a row for each part, then "Not in the plan" (shopping, other) when something was noted there. */
export function planAndSpent(b: Pick<BudgetBreakdown, 'parts' | 'spent' | 'total'>): {
  rows: TableRow[];
  unplanned: { spent: number; parts: ExpensePart[] } | null;
  planTotal: number;
  planEstimate: boolean;
  spentTotal: number;
} {
  const rows = partsAgainstPlan(b).map((p) => ({ key: p.key, planned: p.planned, estimate: p.estimate, spent: p.spent > 0 ? p.spent : null }));
  const extra = (['shopping', 'other'] as const).filter((k) => (b.spent?.by_part[k] ?? 0) > 0);
  const unplannedSpent = extra.reduce((sum, k) => sum + (b.spent?.by_part[k] ?? 0), 0);
  return {
    rows,
    unplanned: extra.length ? { spent: unplannedSpent, parts: [...extra] } : null,
    planTotal: b.total,
    planEstimate: planIsEstimate(b as Pick<BudgetBreakdown, 'parts'>),
    spentTotal: b.spent?.total ?? 0,
  };
}

/** The biggest notes, largest first (frame 40 shows three) */
export const biggest = (notes: readonly Expense[], count = 3): Expense[] => [...notes].sort((a, c) => c.amount - a.amount || c.id - a.id).slice(0, count);

/** The notes by day, the newest day first, the latest noted first within a day (the full list) */
export function notesByDay(notes: readonly Expense[]): { day: string; notes: Expense[]; total: number }[] {
  const days = new Map<string, Expense[]>();
  for (const e of notes) days.set(e.day, [...(days.get(e.day) ?? []), e]);
  return [...days.entries()]
    .sort(([a], [c]) => (a < c ? 1 : a > c ? -1 : 0))
    .map(([day, list]) => ({ day, notes: [...list].sort((a, c) => c.id - a.id), total: list.reduce((sum, e) => sum + e.amount, 0) }));
}

/** When a note was made ("08:55"), on its own day; none for a note made later for another day */
export function noteTime(e: Pick<Expense, 'created_at' | 'day'>): string | null {
  if (!e.created_at) return null;
  const at = new Date(e.created_at);
  if (Number.isNaN(at.getTime()) || localToday(at) !== e.day) return null;
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** A note's words in a list: what was written, else its part */
export const noteTitle = (e: Pick<Expense, 'note' | 'part'>, t: T) => e.note || partName(e.part, t);

/** "20–22 Nov", "30 Nov – 2 Dec": the year only when it isn't this one (frame 40's line under the title) */
export function shortRange(start: string, end: string, locale: string, today: string): string {
  const a = parseDay(start);
  const b = parseDay(end);
  const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short' });
  const year = (d: Date) => (d.getFullYear() === parseDay(today).getFullYear() ? '' : ` ${d.toLocaleDateString(locale, { year: 'numeric' })}`);
  if (start === end) return `${day(a)} ${month(a)}${year(a)}`;
  if (a.getFullYear() !== b.getFullYear()) return `${day(a)} ${month(a)}${year(a)} – ${day(b)} ${month(b)}${year(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${day(a)} ${month(a)} – ${day(b)} ${month(b)}${year(b)}`;
  return `${day(a)}–${day(b)} ${month(b)}${year(b)}`;
}
