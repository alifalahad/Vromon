/**
 * "Your travels" (docs/ui-refresh step 2, frame 3): opened from the top-left button on the Map
 * tab, in place of "Your story". The world so far, then tiles: each a real count that opens the
 * list behind it (one function gives both: features/map/travels.ts). Replay and the poster stay
 * (D2) as two buttons at the end.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { countryLabelPoint } from '../../src/features/map/geoData';
import { GlobeImage } from '../../src/features/map/globe/Globe';
import { DEFAULT_HOME, regionWord } from '../../src/features/map/home';
import { useMapRequest } from '../../src/features/map/mapRequest';
import { Tile } from '../../src/features/map/TravelParts';
import { travelSummary, wantList } from '../../src/features/map/travels';
import { useTravelStats, useVisits } from '../../src/features/map/visits';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { localToday } from '../../src/features/trips/dates';
import { useTrips } from '../../src/features/trips/queries';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function TravelsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapTheme = useMapTheme();
  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits = [] } = useVisits(me?.id);
  const { data: stats } = useTravelStats(me?.id);
  const { data: trips = [] } = useTrips();
  const today = localToday();
  const sum = useMemo(() => travelSummary(visits, home, trips, today), [visits, home, trips, today]);
  const ask = useMapRequest((s) => s.ask);
  const [lon, lat] = countryLabelPoint(home) ?? [90, 23];

  const open = (kind: string, params: Record<string, string> = {}) => router.push({ pathname: '/map/list/[kind]', params: { kind, ...params } });
  const words = regionWord(home);
  const want = wantList(visits).length;

  // "3 countries" with the number in the highlight colour, in either language
  const [before, after] = t('travels.heroCount', { count: sum.countries, n: '§' }).split('§');
  const heroSub = [
    stats ? t('travels.worldShare', { pct: f.n(stats.world_percent) }) : null,
    stats && stats.continents > 0 ? t('travels.continents', { count: stats.continents, n: f.n(stats.continents) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('travels.title') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="travels-screen">
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => open('countries')}
          style={styles.hero}
          accessibilityRole="button"
          accessibilityLabel={[t('travels.heroCount', { count: sum.countries, n: f.n(sum.countries) }), heroSub].filter(Boolean).join(', ')}
          testID="travels-hero"
        >
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>{t('travels.worldSoFar').toUpperCase()}</Text>
            <Text style={styles.heroCount} maxFontSizeMultiplier={1.4}>
              {before}
              <Text style={{ color: colors.highlight }}>{f.n(sum.countries)}</Text>
              {after}
            </Text>
            {heroSub ? <Text style={styles.heroSub}>{heroSub}</Text> : null}
          </View>
          <GlobeImage visits={visits} theme={mapTheme} size={100} lon={lon} lat={lat} glow={colors.globeGlow} />
        </PressableScale>

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Tile icon="flag-variant-outline" value={f.n(sum.countries)} label={t('travels.countries')} onPress={() => open('countries')} testID="travels-countries" />
            {sum.homeRegions ? (
              <Tile
                icon="view-grid-outline"
                tone="warm"
                value={f.n(sum.homeRegions.done)}
                of={t('travels.of', { total: f.n(sum.homeRegions.total) })}
                label={t(`travels.${words}`)}
                fraction={sum.homeRegions.done / sum.homeRegions.total}
                onPress={() => open('regions', { country: home })}
                testID="travels-regions"
              />
            ) : (
              <Tile icon="city-variant-outline" value={f.n(sum.cities)} label={t('travels.cities')} onPress={() => open('cities')} testID="travels-cities" />
            )}
          </View>
          {sum.homeRegions ? (
            <View style={styles.gridRow}>
              {sum.districts ? (
                <Tile
                  icon="hexagon-outline"
                  tone="warm"
                  value={f.n(sum.districts.done)}
                  of={t('travels.of', { total: f.n(sum.districts.total) })}
                  label={t('travels.districts')}
                  fraction={sum.districts.done / sum.districts.total}
                  onPress={() => open('districts')}
                  testID="travels-districts"
                />
              ) : null}
              <Tile icon="city-variant-outline" value={f.n(sum.cities)} label={t('travels.cities')} onPress={() => open('cities')} testID="travels-cities" />
            </View>
          ) : null}
          <View style={styles.gridRow}>
            <Tile
              icon="bag-suitcase-outline"
              tone="green"
              value={f.n(sum.trips)}
              of={t('travels.finished')}
              label={sum.coming > 0 ? t('travels.tripsComing', { count: sum.coming, n: f.n(sum.coming) }) : t('travels.trips')}
              onPress={() => open('trips')}
              testID="travels-trips"
            />
            <Tile icon="calendar-range" tone="green" value={f.n(sum.days)} label={t('travels.days')} onPress={() => open('trips')} testID="travels-days" />
          </View>
        </View>

        <PressableScale pressEffect="opacity" haptic="selection" onPress={() => open('want')} style={styles.wantRow} accessibilityRole="button" testID="travels-want">
          <View style={styles.wantIcon}>
            <MaterialCommunityIcons name="bookmark-outline" size={20} color={colors.onAccentSoft} />
          </View>
          <View style={styles.wantText}>
            <Text style={styles.wantTitle}>{t('travels.want')}</Text>
            <Text style={styles.wantSub}>{want > 0 ? t('travels.wantSub', { count: want, n: f.n(want) }) : t('travels.wantNone')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </PressableScale>

        <View style={styles.actions}>
          <PressableScale haptic="selection" style={styles.action} onPress={() => router.push('/map/replay')} accessibilityRole="button" testID="travels-replay">
            <MaterialCommunityIcons name="play" size={20} color={colors.textPrimary} />
            <Text style={styles.actionText}>{t('travels.replay')}</Text>
          </PressableScale>
          <PressableScale
            haptic="selection"
            style={styles.action}
            onPress={() => {
              ask({ kind: 'poster' });
              router.back();
            }}
            accessibilityRole="button"
            testID="travels-poster"
          >
            <MaterialCommunityIcons name="image-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.actionText}>{t('travels.poster')}</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg, paddingTop: t.spacing.sm, gap: 14 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.xl,
    paddingLeft: 22,
    paddingRight: t.spacing.lg,
    borderRadius: t.radius.hero,
    backgroundColor: t.colors.hero,
  },
  heroText: { flex: 1, gap: 4 },
  heroEyebrow: { ...t.type.caption, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.4, color: t.colors.onHeroSecondary },
  heroCount: { ...t.type.title, fontSize: 36, lineHeight: 40, color: t.colors.onHero },
  heroSub: { ...t.type.footnote, fontSize: 14, color: t.colors.onHeroSecondary },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  wantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 64,
    paddingVertical: t.spacing.md,
    paddingLeft: t.spacing.lg,
    paddingRight: 14,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface,
    ...t.depth.card,
  },
  wantIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  wantText: { flex: 1, gap: 1 },
  wantTitle: { ...t.type.body, fontSize: 15.5, fontWeight: '500', color: t.colors.textPrimary },
  wantSub: { ...t.type.footnote, color: t.colors.textSecondary },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: t.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.sizes.minTouch,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.border,
  },
  actionText: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.textPrimary, flexShrink: 1 },
}));
