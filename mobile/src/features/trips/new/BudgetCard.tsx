/**
 * The trip's budget (new trip, step 2): typed in any currency, the trip country's to begin with.
 * Budget / Comfort / Luxury fill in an amount for the group and the days; typing one replaces it.
 * Amounts in another currency are turned into taka for the planner with today's rate, and the
 * card says what that comes to and whose rates they are.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { fxApi } from '../../../services/api';
import { OptionSheet } from '../../../ui/OptionSheet';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { localDigits } from '../plan/usePlanFormat';
import { CURRENCIES, currencySymbol, formatMoney, fromTaka, roundShown, toTaka, type Currency } from './currency';
import { TIERS, type Tier } from './newTrip';

const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// Bangla keyboards type ০–৯
const digitsOnly = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');

export function BudgetCard({
  budget,
  tier,
  byHand,
  travellers,
  currency,
  hotelText,
  onBudget,
  onTier,
  onCurrency,
}: {
  /** The group's total, in taka */
  budget: number;
  tier: Tier;
  byHand: boolean;
  travellers: number;
  currency: Currency;
  /** "hotels around ৳2,800–4,200 a night", or null */
  hotelText: string | null;
  /** A typed amount, in taka */
  onBudget: (taka: number) => void;
  onTier: (tier: Tier) => void;
  onCurrency: (code: Currency) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [picking, setPicking] = useState(false);
  // While typing, the field shows exactly what was typed
  const [typed, setTyped] = useState<string | null>(null);
  const foreign = currency !== 'BDT';
  const fx = useQuery({ queryKey: ['fx-rates'], queryFn: () => fxApi.rates(), staleTime: 60 * 60_000, enabled: foreign });
  const rates = fx.data?.rates;
  const shown = fromTaka(budget, currency, rates);
  const canType = shown !== null;
  const each = shown !== null ? roundShown(shown / Math.max(1, travellers), currency) : null;

  const change = (raw: string) => {
    const digits = digitsOnly(raw).slice(0, 9);
    setTyped(digits);
    const amount = Number(digits);
    if (!amount) return;
    const taka = toTaka(amount, currency, rates);
    if (taka) onBudget(Math.max(1, taka));
  };

  return (
    <View style={styles.card}>
      <View style={styles.amountRow}>
        <PressableScale
          haptic="selection"
          onPress={() => setPicking(true)}
          style={styles.currency}
          accessibilityRole="button"
          accessibilityLabel={`${t('newTrip.currency')}: ${t(`currencies.${currency}`)}`}
          testID="budget-currency"
        >
          {currencySymbol(currency) ? <Text style={styles.currencySymbol}>{currencySymbol(currency)}</Text> : null}
          <Text style={styles.currencyCode}>{currency}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
        </PressableScale>
        <TextInput
          value={typed ?? (shown !== null ? localDigits(group(roundShown(shown, currency)), lang) : '')}
          onChangeText={change}
          onFocus={() => setTyped(shown !== null ? String(roundShown(shown, currency)) : '')}
          onBlur={() => setTyped(null)}
          editable={canType}
          selectTextOnFocus
          keyboardType="number-pad"
          maxLength={11}
          placeholder={canType ? t('newTrip.budgetType') : ''}
          placeholderTextColor={colors.textTertiary}
          style={styles.amount}
          accessibilityLabel={t('newTrip.budgetAmount', { currency: t(`currencies.${currency}`) })}
          testID="budget-total"
        />
        <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.textTertiary} />
      </View>

      <View style={styles.segment} accessibilityRole="radiogroup">
        {TIERS.map((x) => {
          const on = !byHand && tier === x;
          return (
            <PressableScale
              key={x}
              haptic="selection"
              onPress={() => {
                setTyped(null);
                onTier(x);
              }}
              style={[styles.segmentPart, on && styles.segmentOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              testID={`tier-${x}`}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t(`newTrip.tiers.${x}`)}</Text>
            </PressableScale>
          );
        })}
      </View>

      {foreign && fx.isLoading ? (
        <View style={styles.line}>
          <ActivityIndicator size="small" color={colors.link} />
          <Text style={styles.muted}>{t('newTrip.fxLoading')}</Text>
        </View>
      ) : null}
      {foreign && !fx.isLoading && !rates ? (
        <View style={styles.line}>
          <Text style={[styles.error, styles.flex]}>{t('newTrip.fxFailed')}</Text>
          <PressableScale pressEffect="opacity" haptic="selection" onPress={() => onCurrency('BDT')} hitSlop={8} accessibilityRole="button" testID="budget-back-to-taka">
            <Text style={styles.link}>{t('newTrip.fxUseTaka')}</Text>
          </PressableScale>
        </View>
      ) : null}

      {each !== null ? (
        <Text style={styles.muted}>{[t('newTrip.each', { amount: formatMoney(each, currency, lang) }), hotelText].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {foreign && rates ? (
        <Text style={styles.muted} testID="budget-in-taka">
          {t('newTrip.fxPlanning', { amount: formatMoney(roundShown(budget, 'BDT'), 'BDT', lang) })}
          {'\n'}
          {t(fx.data?.stale ? 'newTrip.fxSourceOld' : 'newTrip.fxSource', {
            source: fx.data?.source ?? '',
            date: fx.data ? localDigits(new Date(fx.data.updated_at).toLocaleDateString(lang, { day: 'numeric', month: 'short' }), lang) : '',
          })}
        </Text>
      ) : null}

      <OptionSheet<Currency>
        visible={picking}
        title={t('newTrip.currency')}
        options={CURRENCIES.map((c) => ({ value: c, label: `${t(`currencies.${c}`)} (${currencySymbol(c) ?? c})` }))}
        selected={currency}
        onSelect={(c) => {
          setTyped(null);
          onCurrency(c);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  card: { backgroundColor: t.colors.surface, borderRadius: 20, padding: t.spacing.lg, gap: t.spacing.md },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    borderRadius: 16,
    paddingRight: t.spacing.md,
    minHeight: 60,
  },
  currency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
    paddingHorizontal: t.spacing.md,
    borderRightWidth: 1,
    borderRightColor: t.colors.border,
    backgroundColor: t.colors.surfaceInset,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  currencySymbol: { ...t.type.headline, color: t.colors.textPrimary },
  currencyCode: { ...t.type.footnote, fontWeight: '700', color: t.colors.textSecondary },
  amount: { flex: 1, fontSize: 26, fontWeight: '700', color: t.colors.textPrimary, paddingVertical: 8 },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: t.radius.control, padding: 3 },
  segmentPart: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: t.colors.segmentThumb },
  segmentText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  segmentTextOn: { color: t.colors.textPrimary },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  muted: { ...t.type.footnote, color: t.colors.textSecondary },
  error: { ...t.type.footnote, color: t.colors.danger },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
