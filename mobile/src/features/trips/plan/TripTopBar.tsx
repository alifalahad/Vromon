/**
 * The trip screen's row over the map (docs/ui-refresh step 7, frames 11 and 12, D7): the weather, the
 * largest, on the left; map options, Full map and ⋮ on the right. No back arrow: the phone's back
 * leaves the screen.
 *
 * The weather is the selected day's: its sky and high, "Clear · Low 24°", a mark when the day has a
 * warning, and a quieter look with how old it is when the forecast couldn't be refreshed. It opens
 * the weather screen on that day, where refreshing lives. Map options open a small panel: the map
 * type (Default, Satellite), 3D on or off, and "Show the whole day".
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { ConditionsDay, TripConditions } from '../../../types';
import { LineIcon } from '../../../ui/LineIcon';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { Toggle } from '../../../ui/Toggle';
import { daySky, isSerious, sky, useConditionText } from '../conditions/useConditionText';
import { usePlanFormat } from './usePlanFormat';

/** Weather older than this is shown quieter, with its age */
const OLD_MINUTES = 180;

export type WeatherLook =
  | { kind: 'loading' }
  | { kind: 'later' }
  | { kind: 'forecast'; code: number | null; max: number; min: number; warnings: number; serious: boolean; old: boolean; fetchedAt: string | null };

/** What the weather button says for a day. */
export function weatherLook(day: ConditionsDay | undefined, conditions: TripConditions | undefined, now = Date.now()): WeatherLook {
  if (!conditions) return { kind: 'loading' };
  if (!conditions.available || !day || !day.in_forecast || day.temp_max == null || day.temp_min == null) return { kind: 'later' };
  const active = day.warnings.filter((w) => !w.kept);
  const ageMin = conditions.fetched_at ? (now - Date.parse(conditions.fetched_at)) / 60000 : 0;
  return {
    kind: 'forecast',
    code: daySky(day),
    max: day.temp_max,
    min: day.temp_min,
    warnings: active.length,
    serious: active.some(isSerious),
    old: conditions.stale || ageMin > OLD_MINUTES,
    fetchedAt: conditions.fetched_at,
  };
}

export function TripTopBar({
  top,
  look,
  dayNumber,
  layersOpen,
  onWeather,
  onLayers,
  onFullMap,
  onMore,
}: {
  top: number;
  look: WeatherLook;
  dayNumber: number;
  layersOpen: boolean;
  onWeather: () => void;
  onLayers: () => void;
  /** Absent in Full map (the plan comes back from its own button) */
  onFullMap?: () => void;
  /** The owner's menu; absent for a friend */
  onMore?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.row, { top }]} pointerEvents="box-none">
      <WeatherButton look={look} dayNumber={dayNumber} onPress={onWeather} />
      <View style={styles.right} pointerEvents="box-none">
        <PressableScale
          haptic="selection"
          onPress={onLayers}
          style={[styles.round, layersOpen && styles.roundOn]}
          accessibilityRole="button"
          accessibilityLabel={layersOpen ? t('plan.layersClose') : t('plan.layers')}
          accessibilityState={{ expanded: layersOpen }}
          testID="trip-layers"
        >
          <LineIcon name="layers" size={24} color={layersOpen ? colors.onAccent : colors.textPrimary} />
        </PressableScale>
        {onFullMap ? (
          <PressableScale
            haptic="selection"
            onPress={onFullMap}
            style={styles.round}
            accessibilityRole="button"
            accessibilityLabel={t('plan.fullMap')}
            testID="trip-full-map"
          >
            <LineIcon name="fullMap" size={22} color={colors.textPrimary} />
          </PressableScale>
        ) : null}
        {onMore ? (
          <PressableScale
            haptic="selection"
            onPress={onMore}
            style={styles.round}
            accessibilityRole="button"
            accessibilityLabel={t('plan.more')}
            testID="trip-menu"
          >
            <LineIcon name="more" size={22} color={colors.textPrimary} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

function WeatherButton({ look, dayNumber, onPress }: { look: WeatherLook; dayNumber: number; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const text = useConditionText();
  const day = t('plan.day', { n: f.n(dayNumber) });

  if (look.kind !== 'forecast') {
    const words = look.kind === 'loading' ? t('plan.weather') : t('conditions.noForecastShort');
    return (
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        onPress={onPress}
        style={styles.weather}
        accessibilityRole="button"
        accessibilityLabel={t('plan.weatherA11yLater', { day, words })}
        testID="trip-weather"
      >
        <MaterialCommunityIcons name={look.kind === 'loading' ? 'weather-partly-cloudy' : 'calendar-clock'} size={30} color={colors.textSecondary} />
        <Text style={styles.weatherLater} maxFontSizeMultiplier={1.3}>
          {words}
        </Text>
      </PressableScale>
    );
  }

  const s = sky(look.code);
  const tint =
    s.key === 'clear' || s.key === 'partly'
      ? colors.highlight
      : s.key === 'rain' || s.key === 'heavyRain' || s.key === 'storm'
        ? colors.link
        : colors.textSecondary;
  // Short words: the row is narrow on a phone (the weather screen has the whole sentence)
  const second = look.old ? text.age(look.fetchedAt) : t('plan.low', { n: f.n(look.min) });
  const warn = look.warnings > 0 ? t('conditions.warnings', { count: look.warnings, n: f.n(look.warnings) }) : null;
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      onPress={onPress}
      style={styles.weather}
      accessibilityRole="button"
      accessibilityLabel={[t('plan.weatherA11y', { day, max: f.n(look.max), sky: text.sky(look.code) }), warn, look.old ? t('conditions.updated', { age: second }) : null, t('plan.weatherOpen')]
        .filter(Boolean)
        .join('. ')}
      testID="trip-weather"
    >
      <View style={look.old && styles.old}>
        <MaterialCommunityIcons name={s.icon} size={28} color={tint} />
        {warn ? <View style={[styles.mark, look.serious ? styles.markDanger : styles.markWarning]} testID="trip-weather-warning" /> : null}
      </View>
      <Text style={[styles.temp, look.old && styles.old]} maxFontSizeMultiplier={1.2}>
        {`${f.n(look.max)}°`}
      </Text>
      <View style={styles.words}>
        <Text style={styles.sky} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.3}>
          {t(`conditions.skyShort.${s.key}`)}
        </Text>
        <Text style={[styles.second, look.old && styles.secondOld]} numberOfLines={1} maxFontSizeMultiplier={1.3} testID="trip-weather-second">
          {second}
        </Text>
      </View>
    </PressableScale>
  );
}

/** The map options panel (frame 12), under the row on the right; a tap outside it closes it. */
export function MapOptions({
  top,
  satellite,
  is3d,
  onSatellite,
  on3d,
  onShowDay,
  onClose,
}: {
  top: number;
  satellite: boolean;
  is3d: boolean;
  onSatellite: (on: boolean) => void;
  on3d: (on: boolean) => void;
  /** Absent when the day has nothing to show */
  onShowDay?: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const type = (key: 'default' | 'satellite', on: boolean, pick: () => void) => (
    <PressableScale
      key={key}
      pressEffect="opacity"
      haptic="selection"
      onPress={pick}
      style={styles.type}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={key === 'default' ? t('plan.mapDefault') : t('plan.mapSatellite')}
      testID={`map-type-${key}`}
    >
      <TypePicture kind={key} on={on} ring={colors.accent} hairline={colors.hairline} ground={colors.surface} />
      <Text style={[styles.typeName, on && styles.typeNameOn]} maxFontSizeMultiplier={1.3}>
        {key === 'default' ? t('plan.mapDefault') : t('plan.mapSatellite')}
      </Text>
    </PressableScale>
  );
  return (
    <>
      <PressableScale
        pressEffect="none"
        haptic="none"
        style={styles.outside}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="map-options-outside"
      />
      <View style={[styles.panel, { top }]} accessibilityViewIsModal testID="map-options">
        <Text style={styles.heading}>{t('plan.mapType').toUpperCase()}</Text>
        <View style={styles.types} accessibilityRole="radiogroup">
          {type('default', !satellite, () => onSatellite(false))}
          {type('satellite', satellite, () => onSatellite(true))}
        </View>
        <View style={styles.divider} />
        {/* The whole row switches 3D, not only the switch */}
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => on3d(!is3d)}
          style={styles.option}
          accessibilityRole="switch"
          accessibilityState={{ checked: is3d }}
          accessibilityLabel={t('plan.map3d')}
          testID="map-3d-row"
        >
          <LineIcon name="cube" size={22} color={colors.textSecondary} />
          <Text style={styles.optionText}>{t('plan.map3d')}</Text>
          <Toggle value={is3d} onValueChange={on3d} accessibilityElementsHidden importantForAccessibility="no" testID="map-3d" />
        </PressableScale>
        {onShowDay ? (
          <>
            <View style={styles.divider} />
            <PressableScale pressEffect="opacity" haptic="selection" onPress={onShowDay} style={styles.option} accessibilityRole="button" testID="map-show-day">
              <LineIcon name="fitDay" size={22} color={colors.textSecondary} />
              <Text style={styles.optionText}>{t('plan.showDay')}</Text>
            </PressableScale>
          </>
        ) : null}
      </View>
    </>
  );
}

/** A small picture of each map type, with the chosen one ringed (drawn, so the edges are smooth). */
const TYPE_W = 108;
const TYPE_H = 70;
const RING = 5;
// Picture colours, not UI colours: a street map's land, water and road, and satellite greens
const ART = {
  default: { land: '#EDEFE4', water: '#A9D9F5', road: '#FFFFFF', route: '#2459D6' },
  satellite: { land: '#4B6A47', water: '#1F4B6E', patchA: '#3D5A3A', patchB: '#5C7A52' },
};

function TypePicture({ kind, on, ring, hairline, ground }: { kind: 'default' | 'satellite'; on: boolean; ring: string; hairline: string; ground: string }) {
  const W = TYPE_W + 2 * RING;
  const H = TYPE_H + 2 * RING;
  const r = 14;
  const x = RING;
  const y = RING;
  const round = `M${x + r} ${y}H${x + TYPE_W - r}A${r} ${r} 0 0 1 ${x + TYPE_W} ${y + r}V${y + TYPE_H - r}A${r} ${r} 0 0 1 ${x + TYPE_W - r} ${y + TYPE_H}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + TYPE_H - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  return (
    <Svg width={W} height={H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'default' ? (
        <>
          <Rect x={x} y={y} width={TYPE_W} height={TYPE_H} fill={ART.default.land} />
          <Ellipse cx={x + 8} cy={y + 48} rx={34} ry={30} fill={ART.default.water} />
          <Path d={`M${x + 30} ${y + 72}C${x + 50} ${y + 46} ${x + 64} ${y + 40} ${x + 110} ${y + 14}`} stroke={ART.default.road} strokeWidth={5} fill="none" />
          <Path
            d={`M${x + 44} ${y + 18}L${x + 62} ${y + 34}L${x + 80} ${y + 26}`}
            stroke={ART.default.route}
            strokeWidth={2.5}
            strokeDasharray="1 5"
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={x + 62} cy={y + 34} r={5} fill={ART.default.route} stroke="#FFFFFF" strokeWidth={1.5} />
        </>
      ) : (
        <>
          <Rect x={x} y={y} width={TYPE_W} height={TYPE_H} fill={ART.satellite.land} />
          <Ellipse cx={x + 6} cy={y + 34} rx={40} ry={52} fill={ART.satellite.water} />
          <Ellipse cx={x + 80} cy={y + 23} rx={22} ry={13} fill={ART.satellite.patchA} />
          <Ellipse cx={x + 94} cy={y + 51} rx={25} ry={11} fill={ART.satellite.patchB} />
        </>
      )}
      {/* The panel's own colour round the rounded picture (a clip has hard edges on Android), then the ring */}
      <Path d={`M0 0H${W}V${H}H0Z${round}`} fill={ground} fillRule="evenodd" />
      {on ? (
        <Rect x={RING - 3.75} y={RING - 3.75} width={TYPE_W + 7.5} height={TYPE_H + 7.5} rx={r + 3.75} fill="none" stroke={ring} strokeWidth={2.5} />
      ) : (
        <Rect x={RING - 0.5} y={RING - 0.5} width={TYPE_W + 1} height={TYPE_H + 1} rx={r + 0.5} fill="none" stroke={hairline} strokeWidth={1} />
      )}
    </Svg>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    position: 'absolute',
    left: t.spacing.lg,
    right: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
  },
  right: { flexDirection: 'row', gap: 6 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.colors.glass, alignItems: 'center', justifyContent: 'center', ...t.depth.raised },
  roundOn: { backgroundColor: t.colors.accent },
  // Frame 11: the largest, 58 tall
  weather: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 58,
    paddingLeft: 10,
    paddingRight: t.spacing.md,
    borderRadius: 29,
    backgroundColor: t.colors.glass,
    ...t.depth.raised,
  },
  weatherLater: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary, flexShrink: 1 },
  temp: { ...t.type.title, fontSize: 24, lineHeight: 28, color: t.colors.textPrimary },
  words: { flexShrink: 1, gap: 1 },
  sky: { ...t.type.footnote, fontSize: 13.5, fontWeight: '700', color: t.colors.textPrimary },
  second: { ...t.type.caption, color: t.colors.textSecondary },
  secondOld: { color: t.colors.warning, fontWeight: '600' },
  old: { opacity: 0.55 },
  mark: { position: 'absolute', right: -2, top: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: t.colors.surface },
  markWarning: { backgroundColor: t.colors.warning },
  markDanger: { backgroundColor: t.colors.danger },
  outside: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  // Frame 12: 272 wide, under the row on the right
  panel: {
    position: 'absolute',
    right: t.spacing.lg,
    width: 272,
    paddingTop: t.spacing.lg,
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.sm,
    borderRadius: 24,
    backgroundColor: t.colors.surface,
    ...t.depth.raised,
  },
  heading: { ...t.type.footnote, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, color: t.colors.textSecondary, marginBottom: 6 },
  types: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -RING },
  type: { alignItems: 'center', gap: 2 },
  typeName: { ...t.type.footnote, fontSize: 13.5, fontWeight: '500', color: t.colors.textSecondary },
  typeNameOn: { fontWeight: '700', color: t.colors.textPrimary },
  divider: { height: 1, backgroundColor: t.colors.divider, marginTop: t.spacing.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 52 },
  optionText: { ...t.type.callout, fontSize: 15.5, color: t.colors.textPrimary, flex: 1 },
}));
