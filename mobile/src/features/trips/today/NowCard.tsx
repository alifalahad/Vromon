/**
 * The "Now" card (docs/ui-refresh step 15, frames 31 and 32), on the plan's tab for today and on Today: the
 * time, what's on now and until when, with a thin progress line. Its words come from `nowView` (today.ts),
 * so "Now" and "Leave by" never disagree. On the plan it also says when to leave for the next stop (or the
 * way back), with Directions, and opens Today; on Today it shows the weather now, opening Conditions.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import type { ItineraryItem, TravelMode } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { sky } from '../conditions/useConditionText';
import { cardTitle } from '../plan/PlanRows';
import { usePlanFormat } from '../plan/usePlanFormat';
import { directionsUrl, m2t, pointOf, type LeaveBy, type NowView, type Point } from './today';

type T = (k: string, o?: Record<string, unknown>) => string;
type F = ReturnType<typeof usePlanFormat>;

/** The way back to where you sleep, for the card's last row */
export type WayBack = { at: string; minutes: number; place: string | null; point: Point | null };

/** The card's words, the same on both screens */
export function nowWords(
  view: NowView | null,
  now: number,
  t: T,
  f: F,
  opts: { startsIn?: number | null; firstStart?: string | null; back?: WayBack | null } = {},
): { label: string; title: string; line: string | null; late: boolean; progress: { share: number; label: string } | null } {
  if (!view) {
    const away = opts.startsIn ?? 0;
    const when = away <= 1 ? t('today.tomorrow') : t('today.inDays', { count: away, n: f.n(away) });
    return {
      label: t('today.startsIn', { when }).toUpperCase(),
      title: t('today.beforeDay'),
      line: opts.firstStart ? t('today.startsAt', { time: f.time(opts.firstStart) }) : null,
      late: false,
      progress: null,
    };
  }
  const label = t('today.now', { time: f.time(m2t(now)) }).toUpperCase();
  switch (view.kind) {
    case 'at':
      return {
        label,
        title: cardTitle(view.item, t),
        line: t('today.until', { end: f.time(view.until), left: f.duration(view.left) }),
        late: false,
        progress: {
          share: Math.min(1, Math.max(0, view.elapsed / Math.max(1, view.length))),
          label: t('today.progressA11y', { done: f.n(Math.max(0, view.elapsed)), all: f.n(view.length) }),
        },
      };
    case 'leave':
      return {
        label,
        title: t('today.timeToLeave'),
        line:
          view.late > 0
            ? t('today.leaveForLate', { place: cardTitle(view.next, t), time: f.duration(view.late) })
            : t('today.leaveFor', { place: cardTitle(view.next, t) }),
        late: view.late > 0,
        progress: null,
      };
    case 'free':
      return {
        label,
        title: t('today.freeTime'),
        line: view.next
          ? t('today.freeThenLeave', { time: f.time(view.until), place: cardTitle(view.next, t) })
          : t('today.freeUntil', { time: f.time(view.until) }),
        late: false,
        progress: null,
      };
    case 'before':
      return {
        label,
        title: t('today.beforeDay'),
        line: view.startsAt ? t('today.startsAt', { time: f.time(view.startsAt) }) : null,
        late: false,
        progress: null,
      };
    case 'back':
      return {
        label,
        title: t('today.headingBack'),
        line: opts.back?.place ? t('today.backAbout', { place: opts.back.place, time: f.time(view.at) }) : t('today.backAboutAt', { time: f.time(view.at) }),
        late: false,
        progress: null,
      };
    default:
      return { label, title: t('today.dayDone'), line: t('today.dayDoneBody'), late: false, progress: null };
  }
}

export function NowCard({
  variant,
  view,
  now,
  startsIn,
  firstStart,
  next,
  leave,
  back,
  weather,
  onToday,
  onWeather,
  testID,
}: {
  variant: 'plan' | 'today';
  /** null: not today (Today, the evening before the trip) */
  view: NowView | null;
  /** The minute of the day */
  now: number;
  startsIn?: number | null;
  firstStart?: string | null;
  /** The next stop and when to leave for it (the plan's card shows them) */
  next?: ItineraryItem | null;
  leave?: LeaveBy | null;
  back?: WayBack | null;
  /** The weather now (Today's card) */
  weather?: { temp: number | null; code: number | null; night?: boolean; words: string } | null;
  onToday?: () => void;
  onWeather?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const f = usePlanFormat();
  const big = variant === 'today';
  const words = nowWords(view, now, t, f, { startsIn, firstStart, back });

  // The plan's last row: leave for the next stop, or the way back after the last one
  const to = next && leave ? pointOf(next) : null;
  const leaveRow =
    variant === 'plan' && view && view.kind !== 'done' && view.kind !== 'back' && next && leave
      ? {
          title: view.kind === 'leave' && view.late > 0 ? t('today.leaveNow') : t('today.leaveByAt', { time: f.time(leave.at) }),
          sub: [cardTitle(next, t), t('today.rideShort', { mode: t(`plan.modes.${leave.mode}`), time: f.duration(leave.minutes) })].join(' · '),
          url: to ? directionsUrl(to, leave.mode) : null,
          place: cardTitle(next, t),
        }
      : variant === 'plan' && view && (view.kind === 'back' || (view.kind === 'at' && !next)) && back
        ? {
            title: t('today.backBy', { time: f.time(back.at) }),
            sub: [back.place, f.duration(back.minutes)].filter(Boolean).join(' · '),
            url: back.point ? directionsUrl(back.point, 'cng' as TravelMode) : null,
            place: back.place ?? '',
          }
        : null;

  const look = weather?.code != null ? sky(weather.code, weather.night) : null;

  return (
    <View style={[styles.card, big && styles.cardBig]} testID={testID}>
      <View style={styles.top}>
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          {words.label}
        </Text>
        {variant === 'plan' && onToday ? (
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={onToday}
            hitSlop={10}
            style={styles.todayLink}
            accessibilityRole="button"
            accessibilityLabel={t('today.openA11y')}
            testID="open-today"
          >
            <Text style={styles.todayLinkText}>{t('today.open')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.heroLink} />
          </PressableScale>
        ) : null}
        {variant === 'today' && weather && look && onWeather ? (
          <PressableScale
            pressEffect="opacity"
            haptic="selection"
            onPress={onWeather}
            hitSlop={10}
            style={styles.weather}
            accessibilityRole="button"
            accessibilityLabel={t('today.weatherA11y', { temp: weather.temp != null ? f.n(Math.round(weather.temp)) : '', sky: weather.words })}
            testID="today-weather"
          >
            <MaterialCommunityIcons name={look.icon} size={18} color={look.key === 'clear' || look.key === 'partly' ? colors.highlight : colors.onHero} />
            {weather.temp != null ? <Text style={styles.weatherText}>{f.n(Math.round(weather.temp))}°</Text> : null}
          </PressableScale>
        ) : null}
      </View>
      <View accessible accessibilityLabel={[words.label, words.title, words.line, words.progress?.label].filter(Boolean).join('. ')}>
        <Text style={[styles.title, big && styles.titleBig]}>{words.title}</Text>
        {words.line ? <Text style={[styles.line, big && styles.lineBig, words.late && { color: colors.heroWarning }]}>{words.line}</Text> : null}
        {words.progress ? (
          <View style={[styles.track, big && styles.trackBig]}>
            <View style={[styles.fill, big && styles.fillBig, { width: `${Math.round(words.progress.share * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      {leaveRow ? (
        <View style={styles.leave}>
          <View style={styles.leaveText} accessible accessibilityLabel={`${leaveRow.title}. ${leaveRow.sub}`}>
            <Text style={[styles.leaveTitle, view?.kind === 'leave' && view.late > 0 && { color: colors.heroWarning }]}>{leaveRow.title}</Text>
            <Text style={styles.leaveSub}>{leaveRow.sub}</Text>
          </View>
          {leaveRow.url ? (
            <PressableScale
              haptic="selection"
              onPress={() => void Linking.openURL(leaveRow.url!)}
              style={styles.directions}
              accessibilityRole="link"
              accessibilityLabel={t('today.directionsA11y', { place: leaveRow.place })}
              testID="now-directions"
            >
              <MaterialCommunityIcons name="navigation-variant-outline" size={17} color={colors.onAccent} />
              <Text style={styles.directionsText}>{t('today.directions')}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: 16, borderRadius: 22, backgroundColor: t.colors.hero },
  cardBig: { padding: 18, borderRadius: 28 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  label: { flexShrink: 1, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: t.colors.highlight },
  todayLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28 },
  todayLinkText: { fontSize: 13.5, fontWeight: '500', color: t.colors.heroLink },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingLeft: 8,
    paddingRight: 11,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  weatherText: { fontSize: 13.5, fontWeight: '500', color: t.colors.onHero },
  title: { ...t.type.title, fontSize: 22, lineHeight: 26, marginTop: 2, color: t.colors.onHero },
  titleBig: { fontSize: 26, lineHeight: 30, marginTop: 6 },
  line: { marginTop: 3, fontSize: 13.5, lineHeight: 18, color: t.colors.onHeroSecondary },
  lineBig: { marginTop: 4, fontSize: 14, lineHeight: 19 },
  track: { marginTop: 10, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  trackBig: { marginTop: 12, height: 6 },
  fill: { height: 5, borderRadius: 3, backgroundColor: t.colors.highlight },
  fillBig: { height: 6 },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  leaveText: { flex: 1, minWidth: 0, gap: 2 },
  leaveTitle: { fontSize: 14, fontWeight: '700', color: t.colors.onHero },
  leaveSub: { fontSize: 13, color: t.colors.onHeroSecondary },
  directions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingLeft: 13,
    paddingRight: 16,
    borderRadius: 22,
    backgroundColor: t.colors.accentStrong,
  },
  directionsText: { fontSize: 14.5, fontWeight: '500', color: t.colors.onAccent },
}));
