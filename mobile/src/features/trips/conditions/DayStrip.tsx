/**
 * Conditions' days as a strip of cards (docs/ui-refresh step 17, frames 34 and 35): the date, the sky, the
 * high and the low, and a marigold dot when the day has something to know. On the trip, days gone by are
 * quiet ("done") and today's says "Today". Three fit across; more scroll, the chosen one kept in view.
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import type { ConditionsDay } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { parseDay } from '../dates';
import { dayParts } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { dayState, type DayWhen } from './dayView';
import { SkyIcon } from './SkyIcon';
import { useConditionText } from './useConditionText';

const GAP = 8;

export function DayStrip({
  days,
  chosen,
  whenOf,
  onTrip,
  onPick,
}: {
  days: ConditionsDay[];
  chosen: number;
  whenOf: (day: ConditionsDay) => DayWhen;
  /** While the trip is on: days gone by are quiet */
  onTrip: boolean;
  onPick: (dayNumber: number) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  // The marigold dot's ring: the blue round it on the chosen card (frame 34), the sun's darker edge on a white one
  const ring = planColors(theme).sun;
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const { width } = useWindowDimensions();
  const scroll = days.length > 3;
  const cardWidth = (width - 32 - 2 * GAP) / 3;
  const strip = useRef<ScrollView>(null);
  const index = days.findIndex((d) => d.day_number === chosen);
  useEffect(() => {
    if (scroll && index >= 0) strip.current?.scrollTo({ x: Math.max(0, (index - 1) * (cardWidth + GAP)), animated: true });
  }, [scroll, index, cardWidth]);

  const cards = days.map((d) => {
    const on = d.day_number === chosen;
    const when = whenOf(d);
    const state = dayState(d, when);
    const done = onTrip && when === 'past';
    const parts = d.date ? dayParts(d.date, i18n.language) : null;
    const date = parts ? f.time(`${parts.weekday} ${parts.day}`) : t('plan.day', { n: f.n(d.day_number) });
    const label = when === 'today' ? t('today.open') : done ? t('conditions.dayDone', { date }) : date;
    const warns = when === 'past' ? 0 : d.warnings.filter((w) => !w.kept).length;
    const weather = state === 'forecast' || state === 'recorded';
    const tone = on ? 'onAccent' : done ? 'quiet' : 'card';
    const a11y = [
      t('plan.day', { n: f.n(d.day_number) }),
      // "Friday 20": weekday first in every language, as on the cards
      d.date ? f.time(`${parseDay(d.date).toLocaleDateString(i18n.language, { weekday: 'long' })} ${parts?.day ?? ''}`) : null,
      when === 'today' ? t('today.open') : done ? t('today.done') : null,
      weather ? `${state === 'recorded' ? t('conditions.asItWas') + ': ' : ''}${text.sky(d.code)}` : state === 'later' ? t('conditions.laterShort') : null,
      weather && d.temp_max != null && d.temp_min != null ? t('conditions.degreesRange', { max: f.n(d.temp_max), min: f.n(d.temp_min) }) : null,
      warns ? t('conditions.toKnow', { count: warns, n: f.n(warns) }) : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <PressableScale
        key={d.day_id}
        haptic="selection"
        onPress={() => onPick(d.day_number)}
        style={[styles.card, scroll ? { width: cardWidth } : styles.cardFlex, done && styles.cardDone, on && styles.cardOn]}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={a11y}
        testID={`cond-day-${d.day_number}`}
      >
        <Text style={[styles.date, when === 'today' && styles.today, on && styles.onAccent]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <SkyIcon code={weather ? d.code : null} later={state === 'later'} size={26} tone={tone} />
        {weather && d.temp_max != null ? (
          <Text style={[styles.temps, on && styles.onAccent]} maxFontSizeMultiplier={1.3}>
            <Text style={styles.high}>{`${f.n(d.temp_max)}°`}</Text>
            {d.temp_min != null ? <Text style={!on && styles.low}>{` ${f.n(d.temp_min)}°`}</Text> : null}
          </Text>
        ) : (
          <Text style={[styles.temps, styles.low, on && styles.onAccent]} maxFontSizeMultiplier={1.3}>
            {state === 'later' ? t('conditions.laterShort') : '–'}
          </Text>
        )}
        {warns > 0 ? <View style={[styles.mark, on ? styles.markOn : { borderColor: ring }]} testID={`cond-day-mark-${d.day_number}`} /> : null}
      </PressableScale>
    );
  });

  return scroll ? (
    <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {cards}
    </ScrollView>
  ) : (
    <View style={styles.row} accessibilityRole="tablist">
      {cards}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: GAP },
  card: {
    minHeight: 96,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...t.depth.card,
  },
  cardFlex: { flex: 1 },
  cardDone: { backgroundColor: t.colors.surfaceInset, shadowOpacity: 0, elevation: 0 },
  cardOn: { backgroundColor: t.colors.accentStrong },
  date: { fontSize: 13, color: t.colors.textSecondary },
  today: { fontWeight: '700', color: t.colors.textPrimary },
  onAccent: { color: t.colors.onAccent },
  temps: { fontSize: 14, color: t.colors.textPrimary },
  high: { fontWeight: '700' },
  low: { color: t.colors.textSecondary },
  mark: {
    position: 'absolute',
    // A 10 dp dot with a 2 dp ring of the card's colour round it (frame 34)
    right: 8,
    top: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: t.colors.highlight,
    borderWidth: 2,
  },
  markOn: { borderColor: t.colors.accentStrong },
}));
