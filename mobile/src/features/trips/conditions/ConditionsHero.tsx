/**
 * The day in one look, the one hero card of Conditions (docs/ui-refresh step 17):
 *   - a day to come (frame 34): its sky in words, the high, the low and the chance of rain, then sunrise,
 *     sunset and the sea;
 *   - today (frame 35): "Now", the weather now, the next rain in words, how long it stays dry;
 *   - a day the forecast doesn't reach yet (frame 36): when it opens, with sunrise and sunset from the date;
 *   - a day that's over (frame 36, D22): as it was, with no warnings; one too old: its weather isn't kept;
 *   - no forecast yet (never fetched): sunrise and sunset only.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';

import type { ConditionsDay, TripConditions } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { dayDate } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { m2t } from '../today/today';
import { dayState, dayWords, dryFor, isNight, nextRain, peakRain, weatherNow, type DayWhen } from './dayView';
import { SkyIcon } from './SkyIcon';
import { useConditionText } from './useConditionText';

export function ConditionsHero({
  day,
  when,
  conditions,
  now,
}: {
  day: ConditionsDay;
  when: DayWhen;
  conditions: TripConditions;
  /** The phone's minute of the day */
  now: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const state = dayState(day, when);
  // Large text: the words go under the sky and the temperature, not squeezed beside them (Bangla at 1.6×)
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const top = (art: React.ReactNode, words: React.ReactNode) => (
    <>
      <View style={styles.top}>
        {art}
        {stacked ? null : words}
      </View>
      {stacked ? <View style={styles.wordsBelow}>{words}</View> : null}
    </>
  );
  const date = day.date ? dayDate(day.date, i18n.language) : '';
  const eyebrow = (parts: string[]) => parts.filter(Boolean).join(' · ').toLocaleUpperCase(i18n.language);
  const dayLabel = t('plan.day', { n: f.n(day.day_number) });
  const sea = day.sea ? t('conditions.seaCell', { level: t(`conditions.level.${day.sea.level}`), wave: f.km(day.sea.wave) }) : null;
  const cells = (list: ([string, string] | null)[]) => (
    <View style={styles.cells}>
      {list
        .filter((c): c is [string, string] => !!c)
        .map(([label, value]) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.cellLabel}>{label}</Text>
            <Text style={styles.cellValue}>{value}</Text>
          </View>
        ))}
    </View>
  );
  const sunCells = [[t('conditions.sunrise'), f.time(day.sunrise)] as [string, string], [t('conditions.sunset'), f.time(day.sunset)] as [string, string]];

  // Today, from the forecast: now, the next rain and how long it stays dry
  if (when === 'today' && state === 'forecast') {
    const live = weatherNow(conditions, day, now);
    const rain = nextRain(day, now);
    const dry = dryFor(day, now);
    const clock = m2t(now);
    return (
      <View style={styles.hero} testID="cond-summary">
        <Text style={styles.eyebrow}>{eyebrow([t('conditions.nowWord'), f.time(clock)])}</Text>
        {top(
          <>
            <SkyIcon code={live?.code ?? null} night={isNight(clock, day)} size={56} tone="hero" />
            <Text style={styles.temp} maxFontSizeMultiplier={1.2} testID="cond-now-temp">
              {live ? `${f.n(live.temp)}°` : '–'}
            </Text>
          </>,
          <View style={styles.words}>
            <Text style={styles.sky}>{text.sky(live?.code ?? null)}</Text>
            <Text style={styles.second}>{t('conditions.highLow', { max: f.n(day.temp_max ?? 0), min: f.n(day.temp_min ?? 0) })}</Text>
          </View>,
        )}
        {rain ? (
          <View style={styles.rainLine} testID="cond-rain-line">
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.highlight} />
            <Text style={styles.rainText}>
              {rain.now ? t('conditions.rainNow', { n: f.n(rain.chance) }) : t('conditions.rainFrom', { time: f.time(rain.at), n: f.n(rain.chance) })}
            </Text>
          </View>
        ) : (
          <View style={[styles.rainLine, styles.dryLine]} testID="cond-rain-line">
            <MaterialCommunityIcons name="weather-sunny" size={20} color={colors.onHeroSecondary} />
            <Text style={styles.dryText}>{t('conditions.noRainToday')}</Text>
          </View>
        )}
        {cells([
          dry === 0
            ? [t('conditions.rainCell'), t('conditions.rainCellNow')]
            : [t('conditions.dryFor'), dry == null ? t('conditions.dryRest') : f.duration(dry)],
          [t('conditions.sunset'), f.time(day.sunset)],
          sea ? [t('conditions.sea'), sea] : null,
        ])}
      </View>
    );
  }

  if (state === 'forecast') {
    const peak = peakRain(day);
    const low = day.temp_min ?? 0;
    return (
      <View style={styles.hero} testID="cond-summary">
        <Text style={styles.eyebrow}>{eyebrow([dayLabel, date])}</Text>
        {top(
          <>
            <SkyIcon code={day.code} size={56} tone="hero" />
            <Text style={styles.temp} maxFontSizeMultiplier={1.2}>{`${f.n(day.temp_max ?? 0)}°`}</Text>
          </>,
          <View style={styles.words}>
            <Text style={styles.sky}>{t(`conditions.${dayWords(day)}`)}</Text>
            <Text style={styles.second}>
              {peak && peak.chance >= 20
                ? t('conditions.lowChance', { min: f.n(low), n: f.n(peak.chance), time: f.time(peak.at) })
                : t('conditions.lowUnlikely', { min: f.n(low) })}
            </Text>
          </View>,
        )}
        {cells([...sunCells, sea ? [t('conditions.sea'), sea] : null])}
      </View>
    );
  }

  if (state === 'recorded') {
    const mm = day.rain_mm ?? 0;
    return (
      <View style={styles.hero} testID="cond-summary">
        <Text style={styles.eyebrow}>{eyebrow([dayLabel, date, t('conditions.asItWas')])}</Text>
        {top(
          <>
            <SkyIcon code={day.code} size={56} tone="hero" />
            <Text style={styles.temp} maxFontSizeMultiplier={1.2}>{`${f.n(day.temp_max ?? 0)}°`}</Text>
          </>,
          <View style={styles.words}>
            <Text style={styles.sky}>{text.sky(day.code)}</Text>
            <Text style={styles.second}>
              {mm >= 0.5
                ? t('conditions.lowRained', { min: f.n(day.temp_min ?? 0), mm: f.distance(mm) })
                : t('conditions.lowDry', { min: f.n(day.temp_min ?? 0) })}
            </Text>
          </View>,
        )}
        <Text style={styles.note}>{t('conditions.recordedNote')}</Text>
      </View>
    );
  }

  // No weather to show: too early, too old, or not fetched yet
  const [title, sub] =
    state === 'later'
      ? [t('conditions.opensOn', { date: day.opens_on ? dayDate(day.opens_on, i18n.language) : '' }), t('conditions.twoWeeks')]
      : state === 'notKept'
        ? [t('conditions.notKept'), t('conditions.notKeptSub')]
        : [t('conditions.never'), t('conditions.noForecast')];
  return (
    <View style={styles.hero} testID="cond-summary">
      <Text style={styles.eyebrow}>{eyebrow([dayLabel, date])}</Text>
      <View style={styles.top}>
        <SkyIcon later={state !== 'notKept'} code={null} size={44} tone="hero" />
        <View style={styles.words}>
          <Text style={styles.laterTitle}>{title}</Text>
          <Text style={styles.second}>{sub}</Text>
        </View>
      </View>
      {cells([...sunCells, state === 'later' ? [t('conditions.fromCell'), t('conditions.theDate')] : null])}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { padding: 18, borderRadius: t.radius.hero, backgroundColor: t.colors.hero },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.96, color: t.colors.highlight },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  temp: { fontFamily: t.type.title.fontFamily, fontSize: 56, lineHeight: 62, fontWeight: 'normal', color: t.colors.onHero, includeFontPadding: false },
  words: { flex: 1, gap: 3 },
  wordsBelow: { marginTop: 10 },
  sky: { fontSize: 16, lineHeight: 19, fontWeight: '700', color: t.colors.onHero },
  laterTitle: { fontFamily: t.type.title.fontFamily, fontSize: 20, lineHeight: 24, fontWeight: 'normal', color: t.colors.onHero },
  second: { fontSize: 13.5, lineHeight: 19, color: t.colors.onHeroSecondary },
  rainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: t.colors.heroWarningTint,
  },
  dryLine: { backgroundColor: t.colors.heroQuiet },
  rainText: { flex: 1, fontSize: 14, fontWeight: '500', color: t.colors.heroWarning },
  dryText: { flex: 1, fontSize: 14, fontWeight: '500', color: t.colors.onHero },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.heroQuiet },
  cell: { flexGrow: 1, flexBasis: 90, gap: 2 },
  cellLabel: { fontSize: 12, color: t.colors.onHeroSecondary },
  cellValue: { fontSize: 14.5, fontWeight: '700', color: t.colors.onHero },
  note: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.heroQuiet, fontSize: 13, lineHeight: 18, color: t.colors.onHeroSecondary },
}));
