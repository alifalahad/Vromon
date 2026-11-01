/**
 * "Your story" (map home step 3, mockup 5): opens from the story capsule, from the
 * top, over the dimmed map. The home country's regions with their status as a
 * word (colour is never the only signal, so this is also the map's legend),
 * figures from real data only, new places per year, and (step 10) Replay and
 * the shareable poster.
 *
 * Android's Back closes it; with reduced motion it appears without sliding.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TripStats, Visit, VisitStatus } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { SUNSET_CARD } from '../../ui/theme/cards';
import { readableOn } from '../mapThemes/color';
import { useMapTheme } from '../mapThemes/useMapTheme';
import { usePreferences } from '../preferences/store';
import { resolveLanguage } from '../../i18n';
import { localDigits } from '../trips/plan/usePlanFormat';
import { HOME_REGIONS } from './geoData';
import { countriesVisited, homeRegionProgress, regionWord } from './home';
import { mapCountryName } from './mapCountries';
import { placesPerYear, undatedCount, wantCount } from './story';
import { statusOf } from './visits';

const MOTION = ReduceMotion.System;

export function StoryPanel({
  open,
  onClose,
  visits,
  home,
  tripsPlanned,
  tripStats,
  onReplay,
  onPoster,
}: {
  open: boolean;
  onClose: () => void;
  visits: readonly Visit[];
  home: string;
  /** Trips the user has planned with Vromon (undefined while loading) */
  tripsPlanned?: number;
  tripStats?: TripStats;
  onReplay?: () => void;
  onPoster?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const mapTheme = useMapTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const n = (v: number) => localDigits(String(v), i18n.language);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  if (!open) return null;

  const regions = HOME_REGIONS.features
    .filter((f) => f.properties.country === home)
    .map((f) => ({ code: f.properties.code, name: lang === 'bn' ? f.properties.name_bn : f.properties.name, status: statusOf(visits, 'region', f.properties.code) }))
    .sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, lang));
  const progress = homeRegionProgress(visits, home);
  const years = placesPerYear(visits, new Date());
  const maxYear = Math.max(1, ...years.map((y) => y.count));
  const undated = undatedCount(visits);
  const country = mapCountryName(home, lang);

  const tiles: { value: string; label: string; testID: string }[] = [
    { value: n(countriesVisited(visits)), label: t('map.story.countries'), testID: 'story-countries' },
    ...(tripsPlanned != null ? [{ value: n(tripsPlanned), label: t('map.story.tripsPlanned'), testID: 'story-trips' }] : []),
    ...(tripStats ? [{ value: n(tripStats.total_days), label: t('map.story.daysOnTheRoad'), testID: 'story-days' }] : []),
    { value: n(wantCount(visits)), label: t('map.story.wantList'), testID: 'story-want' },
  ];

  return (
    <View style={styles.overlay} testID="story-panel">
      <Animated.View entering={FadeIn.duration(180).reduceMotion(MOTION)} exiting={FadeOut.duration(150).reduceMotion(MOTION)} style={styles.scrimWrap}>
        <PressableScale pressEffect="none" haptic="none" style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.close')} />
      </Animated.View>
      <Animated.View
        entering={SlideInUp.duration(260).reduceMotion(MOTION)}
        exiting={SlideOutUp.duration(200).reduceMotion(MOTION)}
        style={[styles.panel, { paddingTop: insets.top + 12 }]}
      >
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>{t('map.story.eyebrow')}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {t('map.story.title', { country })}
              </Text>
              {progress ? (
                <Text style={styles.subtitle}>
                  {t(regionWord(home) === 'divisions' ? 'map.storyDivisions' : 'map.storyRegions', { done: n(progress.done), total: n(progress.total) })}
                </Text>
              ) : null}
            </View>
            <PressableScale style={styles.close} onPress={onClose} accessibilityLabel={t('common.close')} testID="story-close">
              <MaterialIcons name="close" size={22} color={colors.textPrimary} />
            </PressableScale>
          </View>

          {regions.length > 0 ? (
            <View style={styles.grid} accessibilityRole="list">
              {regions.map((r) => {
                const fill = r.status && r.status !== 'want' ? mapTheme.status[r.status] : undefined;
                const textColor = fill ? readableOn(fill) : r.status === 'want' ? colors.link : colors.textSecondary;
                return (
                  <View
                    key={r.code}
                    style={[styles.region, fill ? { backgroundColor: fill, borderColor: fill } : r.status === 'want' ? styles.regionWant : null]}
                    accessible
                    accessibilityLabel={r.status ? `${r.name}, ${t(`map.status.${r.status}`)}` : r.name}
                    testID={`story-region-${r.code}`}
                  >
                    <Text style={[styles.regionName, { color: textColor }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.status ? <Text style={[styles.regionStatus, { color: textColor }]}>{t(`map.status.${r.status}`)}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.grid}>
            {tiles.map((tile) => (
              <View key={tile.testID} style={styles.tile} accessible accessibilityLabel={`${tile.value} ${tile.label}`} testID={tile.testID}>
                <Text style={styles.tileValue}>{tile.value}</Text>
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.heading}>{t('map.story.perYear')}</Text>
            <View
              style={styles.bars}
              accessible
              accessibilityLabel={`${t('map.story.perYear')}: ${years.map((y) => `${n(y.year)}, ${n(y.count)}`).join('; ')}`}
              testID="story-years"
            >
              {years.map((y, i) => {
                const current = i === years.length - 1;
                return (
                  <View key={y.year} style={styles.barCol}>
                    <Text style={styles.barCount}>{y.count > 0 ? n(y.count) : ''}</Text>
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(4, (56 * y.count) / maxYear), backgroundColor: current ? SUNSET_CARD : colors.surfaceRaised },
                      ]}
                    />
                    <Text style={[styles.barYear, current && styles.barYearNow]}>{n(y.year)}</Text>
                  </View>
                );
              })}
            </View>
            {undated > 0 ? <Text style={styles.note}>{t('map.story.undated', { count: undated, n: n(undated) })}</Text> : null}
          </View>

          {onReplay || onPoster ? (
            <View style={styles.actions}>
              {onReplay ? (
                <PressableScale style={styles.primary} onPress={onReplay} testID="story-replay">
                  <MaterialIcons name="play-arrow" size={20} color={colors.onAccent} />
                  <Text style={styles.primaryText}>{t('map.replay.replay')}</Text>
                </PressableScale>
              ) : null}
              {onPoster ? (
                <PressableScale style={styles.secondary} onPress={onPoster} testID="story-poster">
                  <Text style={styles.secondaryText}>{t('map.replay.poster')}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Lived, Visited, Want, then the rest
const order = (s: VisitStatus | null) => (s === 'lived' ? 0 : s === 'visited' ? 1 : s === 'want' ? 2 : 3);

const useStyles = makeStyles((t) => ({
  overlay: { ...absolute },
  scrimWrap: { ...absolute },
  scrim: { flex: 1, backgroundColor: t.colors.scrim },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    maxHeight: '92%',
    backgroundColor: t.colors.surface,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    elevation: 12,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  content: { paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xxl, gap: t.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { ...t.type.caption, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', color: t.colors.textSecondary },
  title: { ...t.type.title, fontSize: 28, fontWeight: '800', color: t.colors.textPrimary },
  subtitle: { ...t.type.callout, color: t.colors.textSecondary },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  region: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.xs,
    minHeight: 40,
    paddingHorizontal: t.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  regionWant: { borderStyle: 'dashed', borderWidth: 1.5, borderColor: t.colors.link },
  regionName: { ...t.type.footnote, fontWeight: '600', flexShrink: 1 },
  regionStatus: { ...t.type.caption },
  tile: { flexBasis: '48%', flexGrow: 1, gap: 2, padding: t.spacing.md, borderRadius: 18, backgroundColor: t.colors.surfaceInset },
  tileValue: { ...t.type.title, fontSize: 26, fontWeight: '800', color: t.colors.textPrimary },
  tileLabel: { ...t.type.footnote, color: t.colors.textSecondary },
  section: { gap: t.spacing.sm },
  heading: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.md, minHeight: 96 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barCount: { ...t.type.caption, color: t.colors.textSecondary, minHeight: 16 },
  bar: { width: '100%', borderRadius: 8 },
  barYear: { ...t.type.caption, color: t.colors.textSecondary },
  barYearNow: { fontWeight: '700', color: t.colors.textPrimary },
  note: { ...t.type.caption, color: t.colors.textTertiary },
  actions: { flexDirection: 'row', gap: t.spacing.md },
  primary: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 52, borderRadius: 26, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { ...t.type.headline, fontSize: 16, color: t.colors.onAccent },
  secondary: { minHeight: 52, borderRadius: 26, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
}));

const absolute = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
