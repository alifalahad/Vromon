/**
 * Numbers on the trip screen in the app's language (design spec §2): Bangla uses
 * Bangla digits for counts, money, times and durations, as the stats card does.
 * Text from the data (place names, categories) is shown as it is.
 */

import { useTranslation } from 'react-i18next';

import { formatBDT } from '../../../utils/format';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** "09:30" → "০৯:৩০" in Bangla; unchanged otherwise. */
export function localDigits(text: string, language: string): string {
  return language.startsWith('bn') ? text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : text;
}

export function usePlanFormat() {
  const { t, i18n } = useTranslation();
  const d = (s: string | number) => localDigits(String(s), i18n.language);
  const parts = (minutes: number) => {
    const m = Math.round(minutes);
    return { h: Math.floor(m / 60), m: m % 60, total: m };
  };
  return {
    /** A number, digits only (no grouping) */
    n: (value: number) => d(value),
    /** "৳1,500" */
    money: (amount: number) => d(formatBDT(amount)),
    /** "09:30" */
    time: (hhmm: string) => d(hhmm),
    /** "0.9" km */
    km: (value: number) => d(value.toFixed(1)),
    /** 45 → "45 min", 60 → "1 h", 95 → "1 h 35 min" */
    duration: (minutes: number) => {
      const p = parts(minutes);
      if (p.total < 60) return t('plan.durMin', { m: d(p.total) });
      return p.m ? t('plan.durHM', { h: d(p.h), m: d(p.m) }) : t('plan.durH', { h: d(p.h) });
    },
    /** For the narrow time column: 150 → "2 h 30" */
    shortDuration: (minutes: number) => {
      const p = parts(minutes);
      if (p.total < 60) return t('plan.durMin', { m: d(p.total) });
      return p.m ? t('plan.durHMShort', { h: d(p.h), m: d(p.m) }) : t('plan.durH', { h: d(p.h) });
    },
  };
}

export type PlanFormat = ReturnType<typeof usePlanFormat>;
