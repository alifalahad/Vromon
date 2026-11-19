/**
 * The sky as the frames draw it (docs/ui-refresh step 17, frames 28, 31, 33 to 36): a marigold sun with
 * rays, a white cloud with a quiet edge, blue rain lines, on a 24 grid with round ends. The icon font's
 * weather glyphs are filled shapes of another weight. Hidden from screen readers, like every icon: the
 * text or the button around one says the weather.
 *
 * Tones: `card` on white (and the weather button), `hero` on the dark hero card, `onAccent` on the chosen
 * day's blue card (lines only), `quiet` for a day that's done (grey lines).
 */

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../../ui/theme';
import { planColors } from '../plan/colors';
import { sky } from './useConditionText';

export type SkyTone = 'card' | 'hero' | 'onAccent' | 'quiet';

const RAYS = 'M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7';
// The cloud beside a small sun, a cloud alone, and the cloud over rain
const CLOUD_LOW = 'M9.5 19.5H17a3.7 3.7 0 0 0 .5-7.37A5 5 0 0 0 8.3 11a4.3 4.3 0 0 0 1.2 8.5Z';
const CLOUD = 'M7.5 17.5H17a3.7 3.7 0 0 0 .5-7.37A5 5 0 0 0 8.3 9a4.3 4.3 0 0 0-.8 8.5Z';
const CLOUD_HIGH = 'M7.5 15.5H17a3.7 3.7 0 0 0 .5-7.37A5 5 0 0 0 8.3 7a4.3 4.3 0 0 0-.8 8.5Z';
const DROPS = 'm9 18.5-1 2.5M13 18.5l-1 2.5M17 18.5l-1 2.5';
const DOWNPOUR = 'm8 18.5-1.2 3M11 18.5l-1.2 3M14 18.5l-1.2 3M17 18.5l-1.2 3';
const BOLT = 'M13 15.5 10.5 19h3L11.5 22.5';
const FOG = 'M5 9.5h14M3.5 13.5h17M6 17.5h12';
const MOON = 'M18.5 14.6A7 7 0 0 1 9.4 5.5a7.2 7.2 0 1 0 9.1 9.1Z';
const MOON_SMALL = 'M11.6 4.2a4.2 4.2 0 1 0 4.6 4.6 3.4 3.4 0 0 1-4.6-4.6Z';

export function SkyIcon({
  code,
  night = false,
  later = false,
  size = 24,
  tone = 'card',
}: {
  code?: number | null;
  night?: boolean;
  /** The calendar of a day the forecast doesn't reach yet (frame 36) */
  later?: boolean;
  size?: number;
  tone?: SkyTone;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const sun = planColors(theme).sun;
  const p =
    tone === 'hero'
      ? { sunFill: colors.highlight, sunEdge: colors.highlight, cloud: colors.hero, edge: colors.onHero, drop: colors.heroLink, bolt: colors.highlight }
      : tone === 'onAccent'
        ? { sunFill: 'none', sunEdge: colors.onAccent, cloud: 'none', edge: colors.onAccent, drop: colors.onAccent, bolt: colors.onAccent }
        : tone === 'quiet'
          ? { sunFill: 'none', sunEdge: colors.textTertiary, cloud: 'none', edge: colors.textTertiary, drop: colors.textTertiary, bolt: colors.textTertiary }
          : { sunFill: colors.highlight, sunEdge: sun, cloud: colors.surface, edge: colors.textTertiary, drop: colors.accent, bolt: sun };
  // The frames' line weights: finer as the icon grows
  const w = size >= 44 ? 1.5 : size >= 30 ? 1.8 : size <= 16 ? 2.4 : 2;
  const line = { strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const key = later ? 'later' : sky(code, night).key;

  let shapes: React.ReactNode;
  if (key === 'later') {
    shapes = (
      <>
        <Rect x={4} y={5.5} width={16} height={14.5} rx={2.5} fill="none" stroke={p.edge} {...line} />
        <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" fill="none" stroke={p.edge} {...line} />
        <Path d="M12 13v2.5l1.7 1" fill="none" stroke={tone === 'hero' ? colors.highlight : p.sunEdge} {...line} />
      </>
    );
  } else if (key === 'clear') {
    shapes = night ? (
      <Path d={MOON} fill={p.cloud} stroke={p.edge} {...line} />
    ) : (
      <>
        <Circle cx={12} cy={12} r={4.5} fill={p.sunFill} stroke={p.sunEdge} {...line} />
        <Path d={RAYS} fill="none" stroke={p.sunEdge} {...line} />
      </>
    );
  } else if (key === 'partly') {
    shapes = (
      <>
        {night ? (
          <Path d={MOON_SMALL} fill={p.cloud} stroke={p.edge} {...line} />
        ) : (
          <Circle cx={8.5} cy={8.5} r={3.5} fill={p.sunFill} stroke={p.sunEdge} {...line} />
        )}
        <Path d={CLOUD_LOW} fill={p.cloud} stroke={p.edge} {...line} />
      </>
    );
  } else if (key === 'fog') {
    shapes = <Path d={FOG} fill="none" stroke={p.edge} {...line} />;
  } else if (key === 'rain' || key === 'heavyRain' || key === 'storm') {
    shapes = (
      <>
        <Path d={CLOUD_HIGH} fill={p.cloud} stroke={p.edge} {...line} />
        {key === 'storm' ? (
          <Path d={BOLT} fill="none" stroke={p.bolt} {...line} />
        ) : (
          <Path d={key === 'heavyRain' ? DOWNPOUR : DROPS} fill="none" stroke={p.drop} {...line} />
        )}
      </>
    );
  } else {
    shapes = <Path d={CLOUD} fill={p.cloud} stroke={p.edge} {...line} />;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`sky-${key}`}>
      {shapes}
    </Svg>
  );
}
