/**
 * Replay your years (map home step 10, mockup 9): the travel map fills in year
 * by year from the dates places were first visited, then the undated places.
 * A big year, one line made from that year's own data (no invented text), play
 * or pause, and a year slider TalkBack can adjust. Want-list places never show.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityActionEvent, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { HOME_REGIONS, homeRegionName } from '../../src/features/map/geoData';
import { DEFAULT_HOME, homeRegionProgress, regionWord } from '../../src/features/map/home';
import { mapCountryName } from '../../src/features/map/mapCountries';
import { replaySteps } from '../../src/features/map/story';
import { useVisits } from '../../src/features/map/visits';
import { WorldMap } from '../../src/features/map/WorldMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences } from '../../src/features/preferences/store';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { resolveLanguage } from '../../src/i18n';
import type { Visit } from '../../src/types';
import { glass } from '../../src/ui/GlassSurface';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { SUNSET_CARD } from '../../src/ui/theme/cards';
import { useReduceMotion } from '../../src/ui/useReduceMotion';

const STEP_MS = 1600;

export default function ReplayScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const mapTheme = useMapTheme();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const view = usePreferences((s) => s.mapView);
  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits = [] } = useVisits(me?.id);

  const steps = useMemo(() => replaySteps(visits, new Date()), [visits]);
  const [index, setIndex] = useState(0);
  const [play, setPlay] = useState(!reduceMotion);
  const step = steps[Math.min(index, steps.length - 1)];
  const atEnd = index >= steps.length - 1;
  // Stops by itself at the last step
  const playing = play && !atEnd;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index]);

  const go = (i: number) => {
    setPlay(false);
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
    haptics.selection();
  };

  const nameOf = (v: Visit) =>
    v.place_type === 'region' ? (homeRegionName(v.place_code, lang) ?? null) : v.place_type === 'country' ? mapCountryName(v.place_code, lang) : null;
  const yearLabel = step ? (step.year == null ? t('map.replay.undated') : f.n(step.year)) : '';
  const named = step ? step.added.map(nameOf).filter((n): n is string => !!n) : [];
  const line = !step
    ? ''
    : step.added.length === 0
      ? t('map.replay.quiet')
      : step.year == null
        ? named.length
          ? step.added.length > Math.min(2, named.length)
            ? t('map.replay.undatedPlaces', { places: named.slice(0, 2).join(', '), count: step.added.length - Math.min(2, named.length), n: f.n(step.added.length - Math.min(2, named.length)) })
            : t('map.replay.undatedPlacesOnly', { places: named.join(t('map.replay.and')) })
          : t('map.replay.newPlaces', { count: step.added.length, n: f.n(step.added.length) })
        : named.length === 0
        ? t('map.replay.newPlaces', { count: step.added.length, n: f.n(step.added.length) })
        : named.length <= 2 && named.length === step.added.length
          ? t('map.replay.first', { places: named.join(t('map.replay.and')) })
          : t('map.replay.firstMore', { places: named.slice(0, 2).join(', '), count: step.added.length - Math.min(2, named.length), n: f.n(step.added.length - Math.min(2, named.length)) });
  const progress = step ? homeRegionProgress(step.visits, home) : null;
  const hasHomeRegions = HOME_REGIONS.features.some((r) => r.properties.country === home);

  return (
    <View style={styles.container} testID="replay-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Framed on home; each step repaints the places, nothing reloads */}
      {/* Divisions when the home country has them: replay is framed on home and counts them */}
      <WorldMap view={hasHomeRegions ? 'regions' : view} visits={step?.visits ?? []} theme={mapTheme} home={home} onPressPlace={() => undefined} />

      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Text
            style={[styles.year, step?.year == null && styles.yearWord]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            testID="replay-year"
          >
            {yearLabel}
          </Text>
          <PressableScale style={styles.close} onPress={() => router.back()} accessibilityLabel={t('common.close')} testID="replay-close">
            <MaterialIcons name="close" size={22} color={colors.textPrimary} />
          </PressableScale>
        </View>
        {steps.length ? (
          <>
            <Text style={styles.line}>{line}</Text>
            {progress ? (
              <Text style={styles.count}>
                {t(regionWord(home) === 'divisions' ? 'map.storyDivisions' : 'map.storyRegions', { done: f.n(progress.done), total: f.n(progress.total) })}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.line}>{t('map.replay.none')}</Text>
        )}
      </View>

      {steps.length > 1 ? (
        <View style={[styles.controls, { bottom: insets.bottom + 20 }]}>
          <PressableScale
            style={styles.play}
            onPress={() => {
              if (atEnd) {
                setIndex(0);
                setPlay(true);
              } else setPlay(!playing);
            }}
            accessibilityLabel={playing ? t('map.replay.pause') : t('map.replay.play')}
            testID="replay-play"
          >
            <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={28} color="#11151B" />
          </PressableScale>
          <View
            style={styles.slider}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('map.replay.year')}
            accessibilityValue={{ text: yearLabel }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e: AccessibilityActionEvent) => go(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
            testID="replay-slider"
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(index / (steps.length - 1)) * 100}%` }]} />
            </View>
            <View style={styles.ticks}>
              {steps.map((s, i) => (
                <PressableScale
                  key={s.year ?? 'undated'}
                  haptic="none"
                  pressEffect="opacity"
                  style={styles.tick}
                  onPress={() => go(i)}
                  hitSlop={6}
                  importantForAccessibility="no"
                  testID={`replay-tick-${s.year ?? 'undated'}`}
                >
                  <View style={[styles.dot, i <= index && styles.dotOn]} />
                  {i === 0 || i === steps.length - 1 || i === index ? (
                    <Text style={[styles.tickText, i === index && styles.tickTextOn]} numberOfLines={1}>
                      {s.year == null ? '—' : f.n(s.year)}
                    </Text>
                  ) : null}
                </PressableScale>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  // On glass: the map under it can be light or dark
  top: { ...glass(t), position: 'absolute', left: 12, right: 12, paddingHorizontal: t.spacing.xl, paddingVertical: t.spacing.md, borderRadius: 28, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  year: { fontSize: 72, lineHeight: 78, fontWeight: '800', letterSpacing: -2.5, color: t.colors.textPrimary, flexShrink: 1 },
  // "Undated" is a word, not four digits
  yearWord: { fontSize: 48, lineHeight: 56, letterSpacing: -1, marginTop: 10 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.glassBorder, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  line: { ...t.type.body, fontWeight: '500', color: t.colors.textPrimary },
  count: { ...t.type.footnote, fontWeight: '700', color: t.scheme === 'dark' ? '#F5A06B' : SUNSET_CARD },
  controls: { ...glass(t), position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 28 },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  slider: { flex: 1, gap: 6, minHeight: 48, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: t.colors.glassBorder, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#F08A4B' },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { alignItems: 'center', minWidth: 24, gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.glassBorder },
  dotOn: { backgroundColor: '#F08A4B' },
  tickText: { ...t.type.caption, color: t.colors.textSecondary, position: 'absolute', top: 12, width: 44, textAlign: 'center' },
  tickTextOn: { fontWeight: '700', color: t.colors.textPrimary },
}));
