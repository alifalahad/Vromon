/**
 * The strip at the top while a stop is dragged (docs/ui-refresh step 8, frames 13 and 14): one row of
 * day chips, the same height for any trip length, with a line saying what a release does. The chip
 * under the finger grows and fills; the current day is shown but isn't a target.
 *
 * On a long trip the row scrolls by itself while the finger rests at its left or right side (faster
 * the longer it stays), and the track under the chips is a fast lane: sliding along it runs through
 * all the days (D8). The geometry is in ./dropGeometry.ts.
 *
 * The drag itself (useStopDrag) reports the finger here through `attach`; nothing here takes touches.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { haptics } from '../../../ui/haptics';
import { LineIcon } from '../../../ui/LineIcon';
import { makeStyles, useTheme } from '../../../ui/theme';
import { parseDay } from '../dates';
import { chipAt, clampOffset, edgeDirection, edgeStep, maxOffset, offsetFor, stripGeometry, trackDay } from './dropGeometry';
import { dayParts } from './timeline';
import { usePlanFormat } from './usePlanFormat';
import type { DropTarget } from './useStopDrag';

/** The card's distance from the screen's sides, and its padding (frames 13 and 14) */
const SIDE = 12;
const PAD = 12;
/** Just outside the card, the finger still counts as on it */
const SLOP = 16;
/** How far the finger slides along the track, mostly sideways, before the fast lane takes over */
const LANE_START = 16;

export type StripDay = { id: number; day_number: number; day_date?: string | null };

export function DropStrip({
  top,
  days,
  currentId,
  attach,
}: {
  /** The card's top on screen */
  top: number;
  days: StripDay[];
  /** The day the stop is on now */
  currentId: number;
  /** Hands the drag a way to report the finger here (null when the strip goes) */
  attach: (target: DropTarget | null) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const { width, fontScale } = useWindowDimensions();
  // The chips' text grows up to 1.3×; so do the chips
  const scale = Math.min(Math.max(fontScale, 1), 1.3);
  const g = useMemo(() => stripGeometry(days.length, width - 2 * SIDE - 2 * PAD, scale), [days.length, width, scale]);
  const current = Math.max(
    0,
    days.findIndex((d) => d.id === currentId),
  );
  const [hover, setHover] = useState<number | null>(null);
  // The days around the current one are in view when the strip opens
  const [start] = useState(() => offsetFor(g, current));
  const offset = useSharedValue(start);
  const [trackWidth, setTrackWidth] = useState(0);

  // Where things are, from their layouts (the card is placed on the screen itself, so its layout is its place on screen)
  const box = useRef<{ card?: LayoutRectangle; chips?: LayoutRectangle; trackRow?: LayoutRectangle; track?: LayoutRectangle }>({});
  // The latest render's values, for the drag's handlers
  const live = useRef({ g, current, days, start });
  useEffect(() => {
    live.current = { g, current, days, start };
  });

  useEffect(() => {
    let pos = live.current.start;
    let hovered: number | null = null;
    let lastX = 0;
    let edge: { dir: -1 | 1; timer: ReturnType<typeof setInterval> } | null = null;
    let lane: { x: number; y: number; on: boolean } | null = null;

    const chips = () => {
      const { card, chips: c } = box.current;
      return card && c ? { x: card.x + c.x, y: card.y + c.y, width: c.width, height: c.height } : null;
    };
    const track = () => {
      const { card, trackRow, track: tr } = box.current;
      return card && trackRow && tr ? { x: card.x + trackRow.x + tr.x, width: tr.width } : null;
    };
    const show = (i: number | null) => {
      if (i === hovered) return;
      hovered = i;
      setHover(i);
      if (i != null && i !== live.current.current) haptics.selection();
    };
    const scrollTo = (value: number) => {
      pos = clampOffset(live.current.g, value);
      offset.set(pos);
      return pos;
    };
    const stopEdge = () => {
      if (edge) clearInterval(edge.timer);
      edge = null;
    };
    // Resting at a side: scroll, a little faster every frame; the chip under the finger follows
    const startEdge = (dir: -1 | 1) => {
      if (edge?.dir === dir) return;
      stopEdge();
      const began = Date.now();
      const timer = setInterval(() => {
        const before = pos;
        const now = scrollTo(before + dir * edgeStep(Date.now() - began));
        const c = chips();
        if (c) show(chipAt(live.current.g, lastX - c.x, now));
        if (now === before) stopEdge();
      }, 16);
      edge = { dir, timer };
    };
    const leave = () => {
      stopEdge();
      lane = null;
      show(null);
    };
    const move = (x: number, y: number) => {
      const card = box.current.card;
      const c = chips();
      if (!card || !c) return false;
      if (y < card.y - SLOP || y > card.y + card.height + SLOP || x < card.x - SLOP || x > card.x + card.width + SLOP) {
        leave();
        return false;
      }
      const geo = live.current.g;
      const tr = track();
      if (geo.scrolls && tr && y > c.y + c.height) {
        // The fast lane: once the finger slides along the track, its place there picks the day
        stopEdge();
        if (!lane) lane = { x, y, on: false };
        if (!lane.on && Math.abs(x - lane.x) > LANE_START && Math.abs(x - lane.x) > 2 * Math.abs(y - lane.y)) lane.on = true;
        if (lane.on) {
          const i = trackDay(geo.count, x - tr.x, tr.width);
          scrollTo(offsetFor(geo, i));
          show(i);
        } else show(null);
        return true;
      }
      lane = null;
      lastX = x;
      const dir = edgeDirection(geo, x - c.x, pos);
      if (dir) startEdge(dir);
      else stopEdge();
      show(chipAt(geo, x - c.x, pos));
      return true;
    };
    attach({
      move,
      dayAt: (x, y) => {
        move(x, y);
        stopEdge();
        const { days: list, current: now } = live.current;
        return hovered != null && hovered !== now ? (list[hovered]?.id ?? null) : null;
      },
      leave,
    });
    return () => {
      stopEdge();
      attach(null);
    };
  }, [attach, offset]);

  const max = maxOffset(g);
  const content = g.content;
  const viewport = g.viewport;
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.get() }] }));
  const leftFade = useAnimatedStyle(() => ({ opacity: offset.get() > 1 ? 1 : 0 }));
  const rightFade = useAnimatedStyle(() => ({ opacity: offset.get() < max - 1 ? 1 : 0 }));
  const thumb = useAnimatedStyle(() => ({
    left: content > 0 ? (offset.get() / content) * trackWidth : 0,
    width: content > 0 ? Math.min(1, viewport / content) * trackWidth : trackWidth,
  }));

  const firstMonth = days[0]?.day_date ? parseDay(days[0].day_date).getMonth() : null;
  const short = (d: StripDay) => {
    const p = d.day_date ? dayParts(d.day_date, i18n.language) : null;
    return p ? `${p.weekday} ${p.day}` : '';
  };
  // The line names the month too once the trip has crossed into another ("Day 12 · Tue 1 Dec")
  const long = (d: StripDay) => {
    if (!d.day_date) return '';
    const date = parseDay(d.day_date);
    return date.getMonth() !== firstMonth ? `${short(d)} ${date.toLocaleDateString(i18n.language, { month: 'short' })}` : short(d);
  };
  const dayLabel = (d: StripDay) => t('plan.day', { n: f.n(d.day_number) });
  const target = hover != null && hover !== current ? days[hover] : null;
  const status = target ? t('plan.dropRelease', { day: [dayLabel(target), long(target)].filter(Boolean).join(' · ') }) : t('plan.dropOnDay');
  const big = !g.scrolls;
  const band = Math.round(66 * scale);

  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      pointerEvents="none"
      style={[styles.card, { top }]}
      onLayout={(e) => {
        box.current.card = e.nativeEvent.layout;
      }}
      accessibilityLabel={t('plan.moveToDay')}
      testID="drop-days"
    >
      <View style={styles.status} accessibilityLiveRegion="polite">
        {target ? <LineIcon name="arrowUp" size={18} color={theme.colors.link} /> : null}
        <Text style={styles.statusText} maxFontSizeMultiplier={1.4} testID="drop-status">
          {status}
        </Text>
      </View>

      <View
        style={[styles.chips, { height: band }]}
        onLayout={(e) => {
          box.current.chips = e.nativeEvent.layout;
        }}
        testID="drop-chips"
      >
        <Animated.View style={[styles.row, { width: g.content, height: band, gap: g.gap }, row]}>
          {days.map((d, i) => {
            const here = i === current;
            const on = i === hover && !here;
            return (
              <View
                key={d.id}
                style={[
                  styles.chip,
                  { width: g.chip, height: Math.round((on ? 66 : 56) * scale) },
                  here ? styles.chipHere : on ? styles.chipOn : styles.chipOff,
                ]}
                testID={`drop-day-${d.day_number}`}
              >
                <Text
                  style={[
                    styles.chipTitle,
                    big ? (on ? styles.titleBigOn : styles.titleBig) : on ? styles.titleOn : null,
                    here ? styles.textHere : on ? styles.textOn : styles.textOff,
                  ]}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {dayLabel(d)}
                </Text>
                <Text
                  style={[
                    styles.chipDate,
                    big && on ? styles.dateBigOn : on ? styles.dateOn : null,
                    here ? styles.textHere : on ? styles.textOn : styles.textOff,
                  ]}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {here ? t(g.chip >= 90 ? 'plan.dropHere' : 'plan.dropHereShort') : short(d)}
                </Text>
              </View>
            );
          })}
        </Animated.View>
        {g.scrolls ? (
          <>
            <Animated.View style={[styles.fade, styles.fadeLeft, { height: band }, leftFade]}>
              <Fade color={theme.colors.surface} side="left" height={band} />
              <LineIcon name="chevronLeft" size={18} color={theme.colors.link} />
            </Animated.View>
            <Animated.View style={[styles.fade, styles.fadeRight, { height: band }, rightFade]}>
              <Fade color={theme.colors.surface} side="right" height={band} />
              <LineIcon name="chevronRight" size={18} color={theme.colors.link} strokeWidth={2.6} />
            </Animated.View>
          </>
        ) : null}
      </View>

      {g.scrolls ? (
        <View
          style={styles.trackRow}
          onLayout={(e) => {
            box.current.trackRow = e.nativeEvent.layout;
          }}
          testID="drop-track"
        >
          <Text style={styles.trackLabel} maxFontSizeMultiplier={1.3}>
            {dayLabel(days[0])}
          </Text>
          <View
            style={styles.track}
            onLayout={(e) => {
              box.current.track = e.nativeEvent.layout;
              setTrackWidth(e.nativeEvent.layout.width);
            }}
            testID="drop-track-bar"
          >
            <Animated.View style={[styles.thumb, thumb]} />
          </View>
          <Text style={styles.trackLabel} maxFontSizeMultiplier={1.3}>
            {dayLabel(days[days.length - 1])}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** The card's colour fading out over the chips at a side that can scroll (frame 14) */
function Fade({ color, side, height }: { color: string; side: 'left' | 'right'; height: number }) {
  const id = `fade-${side}`;
  return (
    <Svg width={34} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
          <Stop offset="0.2" stopColor={color} stopOpacity={1} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={34} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    position: 'absolute',
    left: SIDE,
    right: SIDE,
    padding: PAD,
    paddingBottom: 10,
    gap: 10,
    borderRadius: 26,
    backgroundColor: t.colors.surface,
    borderWidth: t.scheme === 'dark' ? 1 : 0,
    borderColor: t.colors.hairline,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 24,
    zIndex: 50,
  },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 20 },
  statusText: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: t.colors.link, textAlign: 'center' },
  chips: { overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 4 },
  chipOff: { borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.colors.accent, backgroundColor: t.colors.accentTint },
  chipOn: {
    borderRadius: 18,
    // White on the plain accent is 4.1:1 in dark mode: the strong one is AA
    backgroundColor: t.colors.accentStrong,
    shadowColor: t.colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  chipHere: { borderRadius: 16, backgroundColor: t.colors.bg },
  chipTitle: { fontSize: 14.5, fontWeight: '700' },
  titleOn: { fontSize: 15.5 },
  titleBig: { fontSize: 15 },
  titleBigOn: { fontSize: 17 },
  chipDate: { fontSize: 12 },
  dateOn: { fontSize: 12.5 },
  dateBigOn: { fontSize: 13 },
  textOff: { color: t.colors.link },
  textOn: { color: t.colors.onAccent },
  textHere: { color: t.colors.textSecondary },
  fade: { position: 'absolute', top: 0, width: 34, justifyContent: 'center' },
  fadeLeft: { left: 0, alignItems: 'flex-start' },
  fadeRight: { right: 0, alignItems: 'flex-end' },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 16 },
  trackLabel: { fontSize: 11.5, fontWeight: '500', color: t.colors.textSecondary },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.colors.border },
  thumb: { position: 'absolute', top: 0, height: 4, borderRadius: 2, backgroundColor: t.colors.accent },
}));
