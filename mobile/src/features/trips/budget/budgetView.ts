/**
 * What Budget says (docs/ui-refresh step 18, frame 37), from GET /trips/{id}/budget: the parts in their fixed
 * order and colours, the bar's pieces and shares, the status in four words (left; only … left; could reach …;
 * over by …), each traveller's share, how much is a guess, what each part's line says, and each way to save
 * in the same few words. Pure, so the screen and the tests agree.
 */

import type { BudgetBreakdown, BudgetPart, BudgetPartKey, BudgetSave } from '../../../types';
import type { ThemeColors } from '../../../ui/theme/tokens';
import type { PlanFormat } from '../plan/usePlanFormat';
import { nightsWord } from '../stays/advice';
import { stayLines } from '../stays/stays';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Always in this order, never by size ("The look") */
export const PART_ORDER: BudgetPartKey[] = ['getting_there', 'stay', 'food', 'tickets', 'local'];

export function partColor(colors: ThemeColors, key: BudgetPartKey): string {
  return {
    getting_there: colors.partGettingThere,
    stay: colors.partStay,
    food: colors.partFood,
    tickets: colors.partTickets,
    local: colors.partLocal,
  }[key];
}

/** The words inside a piece of the bar */
export function onPartColor(colors: ThemeColors, key: BudgetPartKey): string {
  return key === 'getting_there' ? colors.onPartGettingThere : colors.onPart;
}

/** The bar's pieces: the known parts that cost something, in order, with their share of the total. */
export function pieces(b: Pick<BudgetBreakdown, 'parts'>): { key: BudgetPartKey; amount: number; share: number }[] {
  const shown = PART_ORDER.map((key) => b.parts.find((p) => p.key === key)).filter((p): p is BudgetPart => !!p && p.known && (p.amount ?? 0) > 0);
  const total = shown.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  return shown.map((p) => ({ key: p.key, amount: p.amount ?? 0, share: total ? (p.amount ?? 0) / total : 0 }));
}

export type StatusKind = 'left' | 'only' | 'reach' | 'over';

/** The server's status in four: over; close because little is left; close because the guesses could go over; fine. */
export function statusKind(b: Pick<BudgetBreakdown, 'status' | 'total' | 'total_budget'>): StatusKind {
  if (b.status === 'over') return 'over';
  if (b.status === 'close') return b.total >= b.total_budget * 0.9 ? 'only' : 'reach';
  return 'left';
}

/** Some part is a guess: the total gets ≈ */
export const anyEstimate = (b: Pick<BudgetBreakdown, 'parts'>) => b.parts.some((p) => p.known && p.estimate);

/** "Of it, estimated": what the guessed parts come to */
export const estimatedAmount = (b: Pick<BudgetBreakdown, 'parts'>) => b.parts.filter((p) => p.known && p.estimate).reduce((sum, p) => sum + (p.amount ?? 0), 0);

/** "Each": the total shared by the travellers, to ৳10 */
export const eachAmount = (b: Pick<BudgetBreakdown, 'total' | 'num_travelers'>) => Math.round(b.total / Math.max(1, b.num_travelers) / 10) * 10;

/** Where a part's number comes from, or why it isn't known. */
export function partDetail(p: BudgetPart, b: Pick<BudgetBreakdown, 'num_travelers'>, t: T, f: PlanFormat): string {
  const d = p.detail;
  const who = (n: number) => (n === 1 ? t('budget.youOne') : n === 2 ? t('budget.youTwo') : t('budget.youMany', { n: f.n(n) }));
  switch (p.key) {
    case 'getting_there':
      if (!p.known) return t('budget.noOriginAdd');
      return t('budget.gettingThere', {
        mode: t(`trips.modes.${d.mode}`),
        from: d.from,
        to: d.to,
        who: t(d.fare_per === 'vehicle' ? 'budget.cars' : 'budget.seats', { count: d.count ?? 1, n: f.n(d.count ?? 1) }),
      });
    case 'stay': {
      const blocks = d.blocks ?? [];
      if (blocks.length && blocks.every((x) => x.kind === 'home' || x.kind === 'none')) return t('stays.budgetFree');
      if (!p.known && blocks.some((x) => x.kind === 'undecided')) return t('stays.budgetUndecided');
      if (blocks.length > 1 || (blocks.length === 1 && blocks[0].kind !== 'hotel'))
        return t('stays.budgetMixed', { count: blocks.length, n: f.n(blocks.length) });
      if (!p.known) {
        if (d.reason === 'currency') return t('budget.otherCurrency', { currency: d.currency });
        return d.reason === 'no_price' ? t('budget.hotelNoPrice', { hotel: d.hotel }) : t('budget.noHotel');
      }
      const nights = t('budget.nights', { count: d.nights ?? 0, n: f.n(d.nights ?? 0) });
      const args = { hotel: d.hotel, nights, price: f.money(d.per_night ?? 0), rooms: f.n(d.rooms ?? 1) };
      return (d.rooms ?? 1) > 1 ? t('budget.stayRooms', args) : t('budget.stay', args);
    }
    case 'food': {
      // Where the meals are eaten (trip upgrades step 3), as frame 37: "5 at restaurants · 3 where you stay"
      const by = d.by_source ?? {};
      const where =
        by.own || by.stay
          ? (['restaurant', 'own', 'stay'] as const)
              .filter((k) => by[k])
              .map((k) => t(`meals.count.${k}`, { count: by[k] ?? 0, n: f.n(by[k] ?? 0) }))
              .join(' · ')
          : t('budget.food', { days: t('budget.days', { count: d.days ?? 0, n: f.n(d.days ?? 0) }), who: who(d.travellers ?? b.num_travelers) });
      const guesses = d.placeholder_meals ? t('budget.foodGuesses', { count: d.placeholder_meals, n: f.n(d.placeholder_meals) }) : null;
      return [where, guesses].filter(Boolean).join(' · ');
    }
    case 'tickets': {
      if (!p.known) return t('budget.ticketsNoPrice', { count: d.places ?? d.unknown ?? 0, n: f.n(d.places ?? d.unknown ?? 0) });
      const lines = [
        d.free ? t('budget.ticketsFree', { count: d.free, n: f.n(d.free) }) : null,
        d.unknown ? t('budget.ticketsUnknown', { count: d.unknown, n: f.n(d.unknown) }) : null,
      ].filter(Boolean);
      return lines.length ? lines.join(' · ') : t('budget.tickets');
    }
    case 'local': {
      // "CNG and rickshaw, 11 rides": names in a sentence are lower case, short forms stay as they are
      const modes = (d.modes ?? []).map((m) => t(`plan.modes.${m}`)).map((w) => (w === w.toUpperCase() ? w : w.toLowerCase()));
      if (!modes.length) return t('budget.localWalk');
      const list = modes.length === 1 ? modes[0] : t('budget.and', { a: modes.slice(0, -1).join(', '), b: modes[modes.length - 1] });
      const line = t('budget.localRides', { modes: list, count: d.legs ?? 0, n: f.n(d.legs ?? 0) });
      return line.charAt(0).toUpperCase() + line.slice(1);
    }
  }
}

/** The stay's own lines under it: several stays, or no hotel (trip upgrades step 2) */
export const stayRows = (p: BudgetPart, t: T, f: PlanFormat) => (p.key === 'stay' ? stayLines(p.detail.blocks, t, f) : []);

/** What a way to save changes, in one line. `tripNights`: to tell a whole stay from some of its nights. */
export function saveTitle(s: BudgetSave, destination: string, tripNights: number, t: T, f: PlanFormat): string {
  if (s.key === 'stay') {
    const a = s.detail;
    const nights = nightsWord(a, t, f);
    // Another town for some nights, or a night with no hotel to compare with
    if (a.hotel.destination_name && a.hotel.destination_name !== destination) return t('budget.saveStayTown', { town: a.hotel.destination_name, nights });
    if (!a.current) return t('budget.saveStayAt', { hotel: a.hotel.name, nights });
    const whole = a.first_night <= 1 && a.last_night >= tripNights;
    return whole
      ? t('budget.saveHotel', { to: a.hotel.name, from: a.current.name })
      : t('budget.saveHotelSome', { to: a.hotel.name, from: a.current.name, nights });
  }
  if (s.key === 'skip') return t('budget.saveSkip', { title: s.detail.title });
  return t('budget.saveRickshaw', { count: s.detail.legs, n: f.n(s.detail.legs) });
}

/** What it costs in time or comfort, under the title. */
export function saveSub(s: BudgetSave, t: T, f: PlanFormat): string | null {
  if (s.key === 'stay') {
    const a = s.detail;
    return [
      t('budget.perNight', { price: f.money(a.hotel.price_per_night) }),
      // Only when both ratings are known: the server leaves them out otherwise (never a default 3.5)
      a.ratings ? t('budget.saveRatings', { to: f.km(a.ratings.to), from: f.km(a.ratings.from) }) : null,
      a.minutes_saved > 0 ? t('budget.lessRoad', { time: f.duration(a.minutes_saved) }) : null,
      a.minutes_saved < 0 ? t('budget.moreRoad', { time: f.duration(-a.minutes_saved) }) : null,
      a.extra_moves === 1 ? t('budget.oneMove') : a.extra_moves > 1 ? t('budget.moreMoves', { n: f.n(a.extra_moves) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (s.key === 'skip') return t('budget.saveSkipSub', { day: f.n(s.detail.day_number) });
  return t('budget.saveRickshawSub', { time: f.duration(s.detail.extra_min) });
}

/** "Save ৳2,400", or "Save about ৳80" for a guess */
export const saveAmount = (s: BudgetSave, t: T, f: PlanFormat) => t(s.estimate ? 'budget.savingAbout' : 'budget.saving', { amount: f.money(s.saving) });
