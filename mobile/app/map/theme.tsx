/**
 * Vromon Mobile — Map Theme (prompt §6.6; 03–07 for layout, 14–23 for the catalog).
 *
 * Live preview of the draft theme (the user's countries, or a labelled sample),
 * Map | Friends (comparison colours with a legend), Themes · Colors · Styles, a
 * snapping card carousel, and Apply: saves locally at once, syncs to the account
 * (preferences/sync.ts) and returns to the map.
 */

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURE_PREMIUM_LOCKS } from '../../src/constants/features';
import { useMe } from '../../src/features/account/useMe';
import { countryLabelPoint } from '../../src/features/map/geoData';
import { useVisits } from '../../src/features/map/visits';
import { STYLE_THUMBNAILS } from '../../src/features/mapThemes/assets.generated';
import { COLORS, STYLES, THEMES, type Tier } from '../../src/features/mapThemes/catalog';
import { EUROPE, previewBounds, SAMPLE_COMPARE, SAMPLE_VISITS } from '../../src/features/mapThemes/preview';
import {
  mapThemeName,
  selectColors,
  selectionTier,
  selectStyle,
  selectTheme,
  THEME_REF,
  type UserMapTheme,
} from '../../src/features/mapThemes/resolve';
import { ThemeCard, CARD } from '../../src/features/mapThemes/ThemeCard';
import { ThemePreviewMap, type PreviewContent } from '../../src/features/mapThemes/ThemePreviewMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences } from '../../src/features/preferences/store';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { SegmentedControl } from '../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

type Mode = 'map' | 'friends';
type Catalog = 'themes' | 'colors' | 'styles';

type Card = {
  id: string;
  name: string;
  tier: Tier;
  stripes?: readonly string[];
  image?: number;
  selected: boolean;
  pick: (current: UserMapTheme) => UserMapTheme;
};

const CATALOGS: Catalog[] = ['themes', 'colors', 'styles'];

export default function MapThemeScreen() {
  const styles = useStyles();
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const applied = usePreferences((s) => s.mapTheme);
  const setMapTheme = usePreferences((s) => s.setMapTheme);
  const [draft, setDraft] = useState<UserMapTheme>(applied);
  const [mode, setMode] = useState<Mode>('map');
  // Open where the applied selection has a selected card
  const [catalog, setCatalog] = useState<Catalog>(applied.themeId ? 'themes' : applied.colorsId.startsWith(THEME_REF) ? 'styles' : 'colors');
  const resolved = useMapTheme(draft);

  // The user's countries, or a sample when there are none yet
  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const ownCountries = useMemo(() => visits.filter((v) => v.place_type === 'country'), [visits]);
  const sampleMap = ownCountries.length === 0;
  const ownBounds = useMemo(
    () => previewBounds(ownCountries.map((v) => countryLabelPoint(v.place_code)).filter((p): p is [number, number] => !!p)),
    [ownCountries],
  );
  // Friend comparison is a sample until friends exist (Phase 5)
  const content: PreviewContent =
    mode === 'map' ? { mode: 'map', visits: sampleMap ? SAMPLE_VISITS : ownCountries } : { mode: 'friends', ...SAMPLE_COMPARE };
  const bounds = mode === 'map' && !sampleMap ? ownBounds : EUROPE;
  const isSample = mode === 'friends' || sampleMap;

  const cards: Card[] = useMemo(() => {
    if (catalog === 'themes') {
      return THEMES.map((th) => ({
        id: th.id,
        name: th.name,
        tier: th.tier,
        stripes: th.swatches,
        selected: draft.themeId === th.id,
        pick: () => selectTheme(th.id),
      }));
    }
    if (catalog === 'colors') {
      return COLORS.map((c) => ({
        id: c.id,
        name: c.name,
        tier: c.tier,
        stripes: [c.visited, c.want, c.lived],
        selected: draft.colorsId === c.id,
        pick: (cur) => selectColors(cur, c.id),
      }));
    }
    return STYLES.map((s) => {
      const thumb = STYLE_THUMBNAILS[s.id];
      return {
        id: s.id,
        name: s.name,
        tier: s.tier,
        image: scheme === 'dark' && thumb.dark ? thumb.dark : thumb.light,
        selected: draft.styleId === s.id,
        pick: (cur) => selectStyle(cur, s.id),
      };
    });
  }, [catalog, draft, scheme]);

  const selectedIndex = Math.max(0, cards.findIndex((c) => c.selected));
  const cardWidth = catalog === 'styles' ? CARD.imageWidth : CARD.stripesWidth;
  const locked = FEATURE_PREMIUM_LOCKS && selectionTier(draft) === 'premium';
  const name = mapThemeName(draft) ?? t('mapTheme.custom');

  const apply = () => {
    if (locked) {
      notify(t('mapTheme.premiumTitle'), t('mapTheme.premiumBody'), 'error');
      return;
    }
    setMapTheme(draft);
    haptics.success();
    router.back();
  };

  return (
    <View style={styles.container} testID="map-theme-screen">
      {mode === 'friends' ? (
        <View style={styles.legend} accessibilityRole="summary" testID="map-theme-legend">
          {(
            [
              ['inCommon', resolved.compare.inCommon],
              ['you', resolved.compare.you],
              ['friend', resolved.compare.friend],
            ] as const
          ).map(([key, color]) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{t(`mapTheme.${key}`)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.preview} accessible accessibilityLabel={t('mapTheme.preview', { name })} testID="map-theme-preview">
        <ThemePreviewMap theme={resolved} content={content} bounds={bounds} />
        {isSample ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{t(mode === 'friends' ? 'mapTheme.sampleCompare' : 'mapTheme.sample')}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <SegmentedControl<Mode>
          options={[
            { value: 'map', label: t('mapTheme.map') },
            { value: 'friends', label: t('mapTheme.friends') },
          ]}
          value={mode}
          onChange={setMode}
          style={styles.segment}
          testID="map-theme-mode"
        />

        <View style={styles.chips} accessibilityRole="tablist">
          {CATALOGS.map((c) => {
            const on = c === catalog;
            return (
              <PressableScale
                key={c}
                haptic="selection"
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                hitSlop={6}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setCatalog(c)}
                testID={`map-theme-catalog-${c}`}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`mapTheme.catalog.${c}`)}</Text>
              </PressableScale>
            );
          })}
        </View>

        <FlatList
          // Re-mount per catalog so it opens scrolled to the selected card
          key={catalog}
          horizontal
          data={cards}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          ItemSeparatorComponent={() => <View style={{ width: CARD.gap }} />}
          snapToInterval={cardWidth + CARD.gap}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: cardWidth + CARD.gap, offset: (cardWidth + CARD.gap) * index, index })}
          initialScrollIndex={Math.max(0, selectedIndex - 1)}
          accessibilityRole="radiogroup"
          renderItem={({ item }) => (
            <ThemeCard
              name={item.name}
              stripes={item.stripes}
              image={item.image}
              selected={item.selected}
              locked={FEATURE_PREMIUM_LOCKS && item.tier === 'premium'}
              lockedLabel={t('mapTheme.premium')}
              onPress={() => setDraft((cur) => item.pick(cur))}
              testID={`map-theme-card-${catalog}-${item.id}`}
            />
          )}
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={t('mapTheme.apply')}
          accessibilityLabel={`${t('mapTheme.apply')}: ${name}`}
          onPress={apply}
          haptic={locked ? 'error' : 'none'}
          icon={locked ? 'lock-outline' : undefined}
          style={styles.apply}
          testID="map-theme-apply"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  legend: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  legendSwatch: { width: 20, height: 20, borderRadius: 5 },
  legendText: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary },
  preview: { flex: 1, minHeight: 200, overflow: 'hidden' },
  // Top-left: open Atlantic in the Europe crop
  note: {
    position: 'absolute',
    left: t.spacing.md,
    top: t.spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: t.radius.chip,
    backgroundColor: t.colors.scrim,
  },
  noteText: { ...t.type.footnote, color: '#FFFFFF' },
  panel: { paddingTop: t.spacing.lg, gap: t.spacing.md },
  segment: { marginHorizontal: t.spacing.lg + 2 },
  chips: { flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg + 2 },
  chip: { minHeight: 36, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.chip, justifyContent: 'center' },
  chipOn: { backgroundColor: t.colors.surfaceRaised },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textSecondary },
  chipTextOn: { color: t.colors.textPrimary },
  carousel: { paddingHorizontal: t.spacing.lg + 2, paddingBottom: t.spacing.lg },
  apply: { minHeight: 60 },
  footer: {
    paddingHorizontal: t.spacing.lg + 2,
    paddingTop: t.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
  },
}));
