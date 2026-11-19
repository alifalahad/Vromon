/**
 * The cards of Conditions under its hero (docs/ui-refresh step 17, frames 34–36): a warning with "Move to …",
 * "Keep" and where it comes from; the weather at each stop; the sea; what else was checked; on a trip day
 * the next hours and tomorrow in a row; and the card that says the phone is offline.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';

import type { ConditionWarning, ConditionsDay, ItineraryItem } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { dayParts, stopTitle } from '../plan/timeline';
import { usePlanFormat } from '../plan/usePlanFormat';
import { isNight, RAIN_LIKELY } from './dayView';
import { SkyIcon } from './SkyIcon';
import { isSerious, useConditionText, warningIcon } from './useConditionText';

export function WarningCard({
  warning: w,
  fetchedAt,
  seaAt,
  busy,
  tomorrowId,
  onMove,
  onKeep,
}: {
  warning: ConditionWarning;
  fetchedAt: string | null;
  seaAt?: string | null;
  busy: boolean;
  /** Today's view: the drier day is tomorrow ("Move to tomorrow") */
  tomorrowId?: number | null;
  onMove?: () => void;
  onKeep?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useConditionText();
  const serious = isSerious(w);
  const dayName = w.move_to ? (w.move_to.day_id === tomorrowId ? t('conditions.tomorrowWord') : text.weekday(w.move_to.date)) : null;
  const body = [text.body(w), dayName ? t('conditions.dryThen', { day: capital(dayName) }) : null].filter(Boolean).join(' ');
  return (
    <View style={styles.card} testID={`warning-${w.code}`}>
      <View style={styles.warningHead}>
        <View style={[styles.round, { backgroundColor: serious ? colors.dangerBg : colors.warningBg }]}>
          <MaterialCommunityIcons name={serious ? warningIcon(w.code) : 'alert-outline'} size={22} color={serious ? colors.danger : colors.warning} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.warningTitle} accessibilityRole="header">
            {text.title(w)}
          </Text>
          <Text style={styles.warningBody}>{body}</Text>
        </View>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.link} style={styles.busy} />
      ) : onMove || onKeep ? (
        <View style={styles.actions}>
          {onMove && w.move_to && dayName ? (
            <PressableScale haptic="medium" onPress={onMove} style={[styles.action, styles.actionPrimary]} accessibilityRole="button" testID="warning-move">
              <Text style={styles.actionPrimaryText}>{t('conditions.moveTo', { day: dayName })}</Text>
            </PressableScale>
          ) : null}
          {onKeep ? (
            <PressableScale
              haptic="selection"
              onPress={onKeep}
              style={[styles.action, styles.actionSecondary]}
              accessibilityRole="button"
              testID="warning-keep"
            >
              <Text style={styles.actionSecondaryText}>{t('conditions.keep')}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.source}>{text.source(w, fetchedAt, seaAt)}</Text>
    </View>
  );
}

const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** The weather where each stop is, when you're there: number, time, name, sky, temperature, chance of rain. */
export function StopsWeather({
  day,
  stops,
  numberOf,
  footer,
}: {
  day: ConditionsDay;
  stops: ItineraryItem[];
  numberOf: (item: ItineraryItem) => number;
  footer?: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const pc = planColors(theme);
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  // Large text: the weather under the stop's name, the name whole (Bangla at 1.6×)
  const stacked = useWindowDimensions().fontScale >= 1.3;
  return (
    <View style={styles.list}>
      {stops.map((item, i) => {
        const w = day.items[String(item.id)];
        const meal = item.item_type === 'meal';
        const n = numberOf(item);
        const chance = w.rain ?? 0;
        const label = `${f.time(item.start_time)}, ${stopTitle(item)}: ${text.sky(w.code)}, ${f.n(w.temp ?? 0)}°, ${t('conditions.rainChance', { n: f.n(chance) })}`;
        return (
          <View
            key={item.id}
            style={[styles.stopRow, stacked && styles.stopRowStacked, (i < stops.length - 1 || !!footer) && styles.rowLine]}
            accessible
            accessibilityLabel={label}
          >
            <View style={styles.stopWho}>
              <View style={[styles.badge, { backgroundColor: meal ? pc.meal : pc.visit }]}>
                <Text style={[styles.badgeText, { color: meal ? pc.onMeal : pc.onVisit }]} maxFontSizeMultiplier={1.3}>
                  {f.n(n)}
                </Text>
              </View>
              <Text style={styles.stopTime} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {f.time(item.start_time)}
              </Text>
              <Text style={[styles.stopName, styles.flex]} numberOfLines={stacked ? undefined : 2}>
                {stopTitle(item)}
              </Text>
            </View>
            <View style={[styles.stopSky, stacked && styles.stopSkyStacked]}>
              <SkyIcon code={w.code} night={isNight(item.start_time, day)} size={20} />
              <Text style={styles.stopTemp}>{`${f.n(w.temp ?? 0)}°`}</Text>
              <Text style={[styles.stopRain, chance >= RAIN_LIKELY && styles.warnText]}>{`${f.n(chance)}%`}</Text>
            </View>
          </View>
        );
      })}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

/** "Stops 1 and 2 are done. You're at stop 3 now." (frame 35) */
export function useDoneLine() {
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (done: number[], at: number | null) => {
    const parts: string[] = [];
    if (done.length === 1) parts.push(t('conditions.doneOne', { n: f.n(done[0]) }));
    else if (done.length === 2) parts.push(t('conditions.doneTwo', { a: f.n(done[0]), b: f.n(done[1]) }));
    else if (done.length > 2) parts.push(t('conditions.doneMany', { a: f.n(done[0]), b: f.n(done[done.length - 1]) }));
    if (at != null) parts.push(t('conditions.atStop', { n: f.n(at) }));
    return parts.length ? parts.join(' ') : null;
  };
}

export function SeaCard({ sea }: { sea: NonNullable<ConditionsDay['sea']> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  return (
    <View style={styles.row} testID="cond-sea">
      <View style={[styles.square, { backgroundColor: sea.level === 'rough' ? colors.warningBg : colors.accentTint }]}>
        <MaterialCommunityIcons name="waves" size={22} color={sea.level === 'rough' ? colors.warning : colors.link} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{t('conditions.seaAt', { place: sea.place })}</Text>
        <Text style={[styles.rowSub, sea.level === 'rough' && styles.warnText]}>{t(`conditions.seaWords.${sea.level}`, { wave: f.km(sea.wave) })}</Text>
      </View>
    </View>
  );
}

export function ChecksList({ checks }: { checks: ConditionsDay['checks'] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useConditionText();
  return (
    <View style={[styles.list, styles.checksList]}>
      {checks.map((c, i) => {
        const words = text.check(c);
        return (
          <View key={c.code} style={[styles.check, i < checks.length - 1 && styles.rowLine]}>
            <MaterialCommunityIcons
              name={c.ok ? 'check-circle-outline' : 'alert-circle-outline'}
              size={22}
              color={c.ok ? colors.success : colors.warning}
              accessibilityLabel={c.ok ? t('conditions.checkOk') : t('conditions.checkLook')}
            />
            <View style={styles.flex}>
              <Text style={styles.checkTitle}>{words.title}</Text>
              <Text style={styles.rowSub}>{words.text}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * "The next hours" (frame 35): now and the five after it, likely rain on a warm tint. "Now" shows the
 * weather now, as the card above does, when the service's own reading is fresh.
 */
export function NextHours({
  hours,
  day,
  live,
}: {
  hours: ConditionsDay['hours'];
  day: ConditionsDay;
  live?: { temp: number; code: number | null; live: boolean } | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  return (
    <View style={styles.hoursRow} testID="cond-next-hours">
      {hours.map((hour, i) => {
        const h = i === 0 && live?.live ? { ...hour, temp: live.temp, code: live.code } : hour;
        const chance = h.rain ?? 0;
        const wet = chance >= RAIN_LIKELY;
        return (
          <View
            key={h.time}
            style={[styles.hourCell, i === 0 && styles.hourNow, wet && styles.hourWet]}
            accessible
            accessibilityLabel={t('conditions.hourA11y', {
              time: i === 0 ? t('conditions.nowWord') : f.time(h.time),
              sky: text.sky(h.code),
              temp: f.n(h.temp ?? 0),
              n: f.n(chance),
            })}
          >
            <Text style={[styles.hourTime, i === 0 && styles.hourTimeNow]} maxFontSizeMultiplier={1.3}>
              {i === 0 ? t('conditions.nowWord') : f.time(h.time)}
            </Text>
            <SkyIcon code={h.code} night={isNight(h.time, day)} size={22} />
            <Text style={styles.hourTemp} maxFontSizeMultiplier={1.3}>{`${f.n(h.temp ?? 0)}°`}</Text>
            <Text style={[styles.hourRain, wet && styles.warnText]} maxFontSizeMultiplier={1.3}>{`${f.n(chance)}%`}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Tomorrow in a row (frame 35): its sky, high and low, and whether there's anything to know; opens that day. */
export function TomorrowRow({ day, onOpen }: { day: ConditionsDay; onOpen: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const parts = day.date ? dayParts(day.date, i18n.language) : null;
  const warns = day.warnings.filter((w) => !w.kept).length;
  const sunny = (day.code ?? 99) <= 2;
  const sub = day.in_forecast
    ? [
        day.temp_max != null && day.temp_min != null ? t('conditions.temps', { max: f.n(day.temp_max), min: f.n(day.temp_min) }) : null,
        text.sky(day.code).toLocaleLowerCase(i18n.language),
        warns ? t('conditions.toKnowLower', { count: warns, n: f.n(warns) }) : t('conditions.noWarningsLower'),
      ]
        .filter(Boolean)
        .join(' · ')
    : t('conditions.never');
  return (
    <PressableScale pressEffect="opacity" haptic="selection" onPress={onOpen} style={styles.row} accessibilityRole="button" testID="cond-tomorrow">
      <View style={[styles.square, { backgroundColor: sunny ? colors.markTint : colors.accentTint }]}>
        <SkyIcon code={day.in_forecast ? day.code : null} later={!day.in_forecast} size={24} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{t('conditions.tomorrowRow', { date: parts ? f.time(`${parts.weekday} ${parts.day}`) : '' })}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </PressableScale>
  );
}

/** No connection (frame 36): the last copy, how old it is, and "Try again". */
export function OfflineCard({ age, busy, onRetry }: { age: string | null; busy: boolean; onRetry: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row} testID="cond-offline" accessibilityLiveRegion="polite">
      <View style={[styles.round, { backgroundColor: colors.warningBg }]}>
        <MaterialCommunityIcons name="wifi-off" size={22} color={colors.warning} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{t('conditions.offline')}</Text>
        <Text style={styles.rowSub}>{age ? t('conditions.offlineFrom', { age }) : t('conditions.never')}</Text>
      </View>
      <PressableScale haptic="selection" onPress={onRetry} disabled={busy} style={styles.retry} accessibilityRole="button" testID="cond-retry">
        {busy ? <ActivityIndicator size="small" color={colors.link} /> : <Text style={styles.actionSecondaryText}>{t('conditions.tryAgain')}</Text>}
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  card: { padding: t.spacing.lg, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  warningHead: { flexDirection: 'row', gap: 12 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  square: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  warningTitle: { fontSize: 15.5, lineHeight: 19, fontWeight: '700', color: t.colors.textPrimary },
  warningBody: { fontSize: 14, lineHeight: 20, color: t.colors.textSecondary, marginTop: 3 },
  busy: { marginTop: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  action: { minHeight: 46, borderRadius: 23, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { flexGrow: 1, backgroundColor: t.colors.accentStrong },
  actionPrimaryText: { fontSize: 15, fontWeight: '500', color: t.colors.onAccent, textAlign: 'center' },
  actionSecondary: { backgroundColor: t.colors.surfaceInset },
  actionSecondaryText: { fontSize: 15, fontWeight: '500', color: t.colors.textPrimary },
  source: { fontSize: 12.5, lineHeight: 17, color: t.colors.textSecondary, marginTop: 12 },
  list: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  checksList: { paddingHorizontal: t.spacing.lg },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  stopRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 4, paddingVertical: 10 },
  stopWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopSky: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Under the name, from where the name starts
  stopSkyStacked: { marginLeft: 34 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  stopTime: { minWidth: 42, fontSize: 13.5, color: t.colors.textSecondary },
  stopName: { fontSize: 14.5, color: t.colors.textPrimary },
  stopTemp: { minWidth: 30, textAlign: 'right', fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  stopRain: { minWidth: 34, textAlign: 'right', fontSize: 13.5, color: t.colors.textSecondary },
  warnText: { color: t.colors.warning, fontWeight: '700' },
  footer: { minHeight: 40, paddingVertical: 10, fontSize: 13.5, lineHeight: 19, color: t.colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: t.colors.textPrimary },
  rowSub: { fontSize: 13.5, lineHeight: 19, color: t.colors.textSecondary, marginTop: 2 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 66, paddingVertical: 10 },
  checkTitle: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  hoursRow: { flexDirection: 'row', gap: 4, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  hourCell: { flex: 1, minHeight: 108, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5 },
  hourNow: { backgroundColor: t.colors.accentTint },
  hourWet: { backgroundColor: t.colors.warningBg },
  hourTime: { fontSize: 12.5, color: t.colors.textSecondary },
  hourTimeNow: { fontWeight: '700', color: t.colors.onAccentSoft },
  hourTemp: { fontSize: 14.5, fontWeight: '700', color: t.colors.textPrimary },
  hourRain: { fontSize: 12, color: t.colors.textSecondary },
  retry: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surfaceInset },
}));
