/**
 * Currencies a trip's budget can be typed in. The planner works in taka: an amount in another
 * currency is turned into taka with today's rate (GET /fx/rates), and back for showing it.
 * The currency starts as the destination country's (taka for Bangladesh) and can be changed.
 */

import { formatBDT } from '../../../utils/format';
import { localDigits } from '../plan/usePlanFormat';

/** The ones on offer: taka first, then where Bangladeshi travellers most often earn or travel from */
export const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'MYR', 'SGD', 'CAD', 'AUD', 'JPY', 'KRW', 'CNY', 'NPR'] as const;
export type Currency = (typeof CURRENCIES)[number];

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const BY_COUNTRY: Record<string, Currency> = {
  BD: 'BDT',
  US: 'USD',
  GB: 'GBP',
  IN: 'INR',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  OM: 'OMR',
  MY: 'MYR',
  SG: 'SGD',
  CA: 'CAD',
  AU: 'AUD',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  NP: 'NPR',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR' as Currency])),
};

/** The currency of a trip's country (taka when unknown). */
export function currencyFor(countryIso2: string | null | undefined): Currency {
  return BY_COUNTRY[(countryIso2 ?? '').toUpperCase()] ?? 'BDT';
}

/** Taka → the currency, with `rates` from GET /fx/rates (one taka buys `rates[code]`). */
export function fromTaka(taka: number, code: string, rates: Record<string, number> | undefined): number | null {
  if (code === 'BDT') return taka;
  const r = rates?.[code];
  return r ? taka * r : null;
}

/** The currency → taka (whole taka). */
export function toTaka(amount: number, code: string, rates: Record<string, number> | undefined): number | null {
  if (code === 'BDT') return Math.round(amount);
  const r = rates?.[code];
  return r ? Math.round(amount / r) : null;
}

/** A round amount to show: whole units, and for big-unit currencies (yen, won) to the nearest 100. */
export function roundShown(amount: number, code: string): number {
  const step = code === 'JPY' || code === 'KRW' ? 100 : code === 'BDT' || code === 'INR' || code === 'NPR' ? 50 : 1;
  return Math.max(step, Math.round(amount / step) * step);
}

// Symbols the app writes itself (Hermes doesn't know them all, ৳ among them); the rest go by their code
const SYMBOLS: Partial<Record<string, string>> = { BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', KRW: '₩', CNY: '¥' };

/** The symbol of a currency ("$", "৳", "€"), or null when it's written by its code (AED, SAR…). */
export function currencySymbol(code: string): string | null {
  return SYMBOLS[code] ?? null;
}

/** "$125", "€110", "৳25,000", "AED 450": whole units, grouped by thousands, the language's digits. */
export function formatMoney(amount: number, code: string, language: string): string {
  if (code === 'BDT') return localDigits(formatBDT(amount), language);
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = SYMBOLS[code];
  const text = symbol ? `${symbol}${digits}` : `${code} ${digits}`;
  return localDigits(rounded < 0 ? `-${text}` : text, language);
}
