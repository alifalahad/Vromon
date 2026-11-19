/**
 * "By the hour" (docs/ui-refresh step 17, frame 34): one figure of three strips that share the hours 06 to
 * 22. The temperature as a line, with its highest, first and last values written on it; the chance of rain
 * as thin columns from one baseline (likely hours in the blue, the rest lighter), the highest written
 * above; and where your stops start, as their numbers. One measure per strip, never two scales on one.
 *
 * Sliding a finger along it reads one hour in the line above (time, sky, temperature, chance); a tap reads
 * one too. A screen reader gets each strip in a sentence, then the hours one by one.
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { ConditionsDay, ItineraryItem } from '../../../types';
import { makeStyles, useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { usePlanFormat } from '../plan/usePlanFormat';
import { t2m } from '../today/today';
import { FIGURE_FROM, FIGURE_TO, RAIN_LIKELY } from './dayView';
import { useConditionText } from './useConditionText';

const PAD = 14;
const TEMP_H = 90;
const RAIN_H = 96;
const STOPS_H = 30;
const TEMP_TOP = 20;
const TEMP_LOW = 68;
const RAIN_BASE = 70;
const RAIN_TALL = 52; // a column at 100%
const LABEL_HOURS = [6, 9, 12, 15, 18, 21];

export type FigureStop = { number: number; start: string; meal: boolean };

/** The day's stops for the third strip: their numbers in the plan and when they start. */
export function figureStops(items: readonly ItineraryItem[]): FigureStop[] {
  return items.map((i, k) => ({ number: k + 1, start: i.start_time, meal: i.item_type === 'meal' }));
}

export function HourFigure({ day, stops, testID }: { day: ConditionsDay; stops: FigureStop[]; testID?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const pc = planColors(theme);
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const [width, setWidth] = useState(326);
  const [picked, setPicked] = useState<number | null>(null);
  const left = useRef(0);
  const box = useRef<View>(null);

  const hours = day.hours.filter((h) => {
    const m = t2m(h.time);
    return m >= FIGURE_FROM * 60 && m <= FIGURE_TO * 60;
  });
  if (!hours.length) return null;
  const step = (width - 2 * PAD) / (FIGURE_TO - FIGURE_FROM);
  const x = (minute: number) => PAD + (minute / 60 - FIGURE_FROM) * step;

  // Temperature: the day's range between two heights
  const temps = hours.filter((h) => h.temp != null);
  const tMin = Math.min(...temps.map((h) => h.temp as number));
  const tMax = Math.max(...temps.map((h) => h.temp as number));
  const y = (temp: number) => (tMax === tMin ? (TEMP_TOP + TEMP_LOW) / 2 : TEMP_LOW - ((temp - tMin) / (tMax - tMin)) * (TEMP_LOW - TEMP_TOP));
  const points = temps.map((h) => ({ x: x(t2m(h.time)), y: y(h.temp as number), h }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = points.length ? `${line} ${points[points.length - 1].x.toFixed(1)},${TEMP_LOW + 16} ${points[0].x.toFixed(1)},${TEMP_LOW + 16}` : '';
  const top = points.reduce((a, b) => (b.y < a.y ? b : a), points[0]);
  const first = points[0];
  const last = points[points.length - 1];

  // Rain: one column an hour, the likely ones in the blue
  const peak = hours.reduce((a, b) => ((b.rain ?? 0) > (a.rain ?? 0) ? b : a), hours[0]);
  const column = (h: (typeof hours)[number]) => {
    const chance = h.rain ?? 0;
    const tall = Math.max(3, Math.round((chance / 100) * RAIN_TALL));
    const cx = x(t2m(h.time));
    const fill = chance >= RAIN_LIKELY ? colors.accent : colors.chartRainSoft;
    if (tall < 8) return <Rect key={h.time} x={cx - 5} y={RAIN_BASE - tall} width={10} height={tall} rx={1.5} fill={fill} />;
    // Rounded at the value's end, square at the baseline
    return <Path key={h.time} d={`M${cx - 5} ${RAIN_BASE}V${RAIN_BASE - tall + 4}a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4V${RAIN_BASE}Z`} fill={fill} />;
  };

  const hourWords = (h: (typeof hours)[number]) =>
    t('conditions.hourA11y', { time: f.time(h.time), sky: text.sky(h.code), temp: f.n(h.temp ?? 0), n: f.n(h.rain ?? 0) });
  const pick = (e: GestureResponderEvent) => {
    const i = Math.round((e.nativeEvent.pageX - left.current - PAD) / step);
    const at = Math.max(FIGURE_FROM, Math.min(FIGURE_TO, FIGURE_FROM + i)) * 60;
    const hour = hours.reduce((a, b) => (Math.abs(t2m(b.time) - at) < Math.abs(t2m(a.time) - at) ? b : a), hours[0]);
    setPicked(t2m(hour.time));
  };
  const chosen = picked == null ? null : hours.find((h) => t2m(h.time) === picked);
  const guide = chosen ? x(t2m(chosen.time)) : null;
  const inDay = stops.filter((s) => t2m(s.start) >= FIGURE_FROM * 60 && t2m(s.start) <= FIGURE_TO * 60);
  const from = f.time(hours[0].time);
  const to = f.time(hours[hours.length - 1].time);

  return (
    <View style={styles.card} testID={testID}>
      {/* The hour under the finger, or how to read one */}
      <Text style={[styles.reading, !chosen && styles.readingHint]} accessibilityLiveRegion="polite" testID="cond-hour-reading">
        {chosen ? hourWords(chosen) : t('conditions.slideHint')}
      </Text>
      <View
        ref={box}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
          box.current?.measureInWindow((wx) => {
            left.current = wx;
          });
        }}
      >
        <Text style={styles.h3}>{t('conditions.tempTitle')}</Text>
        <Svg
          width={width}
          height={TEMP_H}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('conditions.figureTemp', {
            from,
            to,
            first: f.n(first.h.temp ?? 0),
            max: f.n(tMax),
            maxAt: f.time(top.h.time),
            last: f.n(last.h.temp ?? 0),
          })}
        >
          <Line x1={4} y1={TEMP_LOW + 16.5} x2={width - 4} y2={TEMP_LOW + 16.5} stroke={colors.divider} strokeWidth={1} />
          <Polygon points={area} fill={colors.chartTemp} fillOpacity={0.1} />
          <Polyline points={line} fill="none" stroke={colors.chartTemp} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {guide != null ? <Line x1={guide} y1={4} x2={guide} y2={TEMP_LOW + 16} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 3" /> : null}
          <Circle cx={top.x} cy={top.y} r={4} fill={colors.chartTemp} stroke={colors.surface} strokeWidth={2} />
          <SvgText x={top.x} y={top.y - 10} textAnchor="middle" fontSize={12} fontWeight="700" fill={colors.textPrimary}>
            {`${f.n(tMax)}°`}
          </SvgText>
          {first !== top ? (
            <SvgText x={first.x} y={first.y - 10} textAnchor="start" fontSize={12} fontWeight="700" fill={colors.textPrimary}>
              {`${f.n(first.h.temp ?? 0)}°`}
            </SvgText>
          ) : null}
          {last !== top ? (
            <SvgText x={last.x} y={last.y - 10} textAnchor="end" fontSize={12} fontWeight="700" fill={colors.textPrimary}>
              {`${f.n(last.h.temp ?? 0)}°`}
            </SvgText>
          ) : null}
        </Svg>

        <Text style={[styles.h3, styles.h3Gap]}>{t('conditions.rainTitle')}</Text>
        <Svg
          width={width}
          height={RAIN_H}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('conditions.figureRain', { from, to, max: f.n(peak.rain ?? 0), maxAt: f.time(peak.time) })}
        >
          {hours.map(column)}
          <Line x1={4} y1={RAIN_BASE + 0.5} x2={width - 4} y2={RAIN_BASE + 0.5} stroke={colors.divider} strokeWidth={1} />
          {guide != null ? <Line x1={guide} y1={4} x2={guide} y2={RAIN_BASE} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 3" /> : null}
          {(peak.rain ?? 0) > 0 ? (
            <SvgText
              x={x(t2m(peak.time))}
              y={RAIN_BASE - Math.max(3, Math.round(((peak.rain ?? 0) / 100) * RAIN_TALL)) - 8}
              textAnchor="middle"
              fontSize={12}
              fontWeight="700"
              fill={colors.textPrimary}
            >
              {`${f.n(peak.rain ?? 0)}%`}
            </SvgText>
          ) : null}
          {LABEL_HOURS.map((h) => (
            <SvgText key={h} x={x(h * 60)} y={RAIN_BASE + 18} textAnchor="middle" fontSize={11.5} fill={colors.textSecondary}>
              {f.time(String(h).padStart(2, '0'))}
            </SvgText>
          ))}
        </Svg>

        {inDay.length > 0 ? (
          <>
            <Text style={[styles.h3, styles.h3Gap]}>{t('conditions.stopsTitle')}</Text>
            <Svg
              width={width}
              height={STOPS_H}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('conditions.figureStops', {
                list: inDay.map((s) => t('conditions.figureStop', { n: f.n(s.number), time: f.time(s.start) })).join(', '),
              })}
            >
              <Line x1={4} y1={STOPS_H / 2} x2={width - 4} y2={STOPS_H / 2} stroke={colors.divider} strokeWidth={1} />
              {inDay.map((s) => (
                <React.Fragment key={s.number}>
                  <Circle cx={x(t2m(s.start))} cy={STOPS_H / 2} r={10} fill={s.meal ? pc.meal : pc.visit} stroke={colors.surface} strokeWidth={2} />
                  <SvgText x={x(t2m(s.start))} y={STOPS_H / 2 + 4} textAnchor="middle" fontSize={11.5} fontWeight="700" fill={s.meal ? pc.onMeal : pc.onVisit}>
                    {f.n(s.number)}
                  </SvgText>
                </React.Fragment>
              ))}
            </Svg>
          </>
        ) : null}

        {/* Over the drawing: a finger reads the hours; a screen reader finds each hour here */}
        <View
          style={styles.touch}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={pick}
          onResponderMove={pick}
          onResponderTerminationRequest={() => true}
          testID="cond-hours-touch"
        >
          {hours.map((h) => (
            <View
              key={h.time}
              style={[styles.hourSlot, { left: x(t2m(h.time)) - step / 2, width: step }]}
              accessible
              accessibilityLabel={hourWords(h)}
              testID={`cond-hour-${h.time}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.spacing.lg, borderRadius: 22, backgroundColor: t.colors.surface, ...t.depth.card },
  reading: { ...t.type.footnote, fontWeight: '700', color: t.colors.textPrimary, minHeight: 22, marginBottom: 4 },
  readingHint: { fontWeight: 'normal', color: t.colors.textSecondary },
  h3: { ...t.type.footnote, fontSize: 13, fontWeight: '700', color: t.colors.textSecondary, marginBottom: 6 },
  h3Gap: { marginTop: 10 },
  touch: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  hourSlot: { position: 'absolute', top: 0, bottom: 0 },
}));
