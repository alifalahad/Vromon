/**
 * The end of a day's plan (docs/trip-upgrades, step 2; docs/ui-refresh step 14, frame 29): where the
 * traveller sleeps that night, as a card: "Tonight: Hotel Beach Way", "৳4,000 a night · nights 1 and 2",
 * "Change". The last day has no night: "Last day: leave from Hotel X". Only the owner can change it and
 * sees the price and nights; a friend sees a home as "With family or friends".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ItineraryDay, Stay } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { usePlanFormat, type PlanFormat } from '../plan/usePlanFormat';
import { baseName, stayIcon } from './stays';

type T = (k: string, o?: Record<string, unknown>) => string;

/** The stay that holds a night (1-based) */
export function stayForNight(stays: readonly Stay[] | undefined, night: number): Stay | null {
  return stays?.find((s) => s.first_night <= night && night <= s.last_night) ?? null;
}

/** "৳4,000 a night · nights 1 and 2", "No cost · night 3", "Price not known · night 1" */
export function tonightLine(stay: Stay, t: T, f: PlanFormat): string {
  const price =
    stay.kind === 'hotel' && stay.hotel
      ? stay.hotel.price_known
        ? t('stays.perNight', { amount: f.money(stay.hotel.price_per_night) })
        : t('stays.priceUnknown')
      : stay.kind === 'home' || stay.kind === 'none'
        ? t('stays.noCostShort')
        : null;
  const a = stay.first_night;
  const b = stay.last_night;
  const nights =
    a === b
      ? t('stays.onNight', { n: f.n(a) })
      : b === a + 1
        ? t('stays.onNights', { a: f.n(a), b: f.n(b) })
        : t('stays.onNightsRange', { from: f.n(a), to: f.n(b) });
  return [price, nights].filter(Boolean).join(' · ');
}

export function TonightRow({ day, lastDay, onChange, stay }: { day: ItineraryDay; lastDay: boolean; onChange?: () => void; stay?: Stay | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const base = lastDay ? day.start_base : day.end_base;
  const name = baseName(base, t);
  if (!base || !name) return null;
  const title = t(lastDay ? 'stays.lastDay' : 'stays.tonight', { place: name });
  const line = !lastDay && stay ? tonightLine(stay, t, f) : null;
  const body = (
    <>
      <View style={styles.icon}>
        <MaterialCommunityIcons name={stayIcon(base.kind)} size={22} color={colors.onHero} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>
      {onChange ? (
        <View style={styles.change}>
          <Text style={styles.changeText}>{t('stays.change')}</Text>
        </View>
      ) : null}
    </>
  );
  const label = [title, line].filter(Boolean).join('. ');
  if (!onChange) {
    return (
      <View style={styles.card} accessible accessibilityLabel={label} testID="stays-tonight">
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onChange}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${t('stays.change')}`}
      testID="stays-tonight"
    >
      {body}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 18,
    backgroundColor: t.colors.accentTint,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.scheme === 'dark' ? t.colors.accentStrong : t.colors.hero,
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  line: { fontSize: 13, color: t.colors.textSecondary },
  change: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  changeText: { fontSize: 14.5, fontWeight: '500', color: t.colors.link },
}));
