/**
 * Vromon Mobile — Map theme (rebuilt in docs/ui-refresh step 3, frame 7, D3).
 *
 * One page, top to bottom: a preview of your own map (the home country framed, your marks; a
 * labelled sample only when nothing is marked), with "With a friend" for the comparison colours and
 * a legend; every theme in one line you swipe (the owner's ask, 2026-11-15), each a small picture of
 * your map in it; then "Make your own": colour sets as named swatches and the map styles, drawn the
 * same way as the themes (MapThumb). Each line opens on what's chosen. A tap changes the preview at once;
 * Apply (always in reach at the bottom) saves it, syncs it to the account (preferences/sync.ts) and
 * returns to the map; leaving without Apply changes nothing. Reset goes back to Default.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURE_PREMIUM_LOCKS } from '../../src/constants/features';
import { useMe } from '../../src/features/account/useMe';
import { countryBounds, DEFAULT_HOME } from '../../src/features/map/home';
import { useVisits } from '../../src/features/map/visits';
import { COLORS, STYLES, THEMES, type Tier } from '../../src/features/mapThemes/catalog';
import { homeMarks, MapThumb, RING, rowThumbSize, THUMB_GAP } from '../../src/features/mapThemes/MapThumb';
import { EUROPE, SAMPLE_COMPARE, SAMPLE_VISITS } from '../../src/features/mapThemes/preview';
import {
  DEFAULT_USER_MAP_THEME,
  mapThemeName,
  normalizeUserMapTheme,
  resolveMapTheme,
  sameMapTheme,
  selectColors,
  selectionTier,
  selectStyle,
  selectTheme,
  THEME_REF,
  type UserMapTheme,
} from '../../src/features/mapThemes/resolve';
import { ThemePreviewMap, type PreviewContent } from '../../src/features/mapThemes/ThemePreviewMap';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences } from '../../src/features/preferences/store';
import { Button } from '../../src/ui/Button';
import { LineIcon } from '../../src/ui/LineIcon';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

/** The screen's side margin (styles.content) */
const PAD = 16;

/** The home country filling the preview's height, a little sea below (frame 7) */
function framed(home: string): LngLatBounds {
  const b = countryBounds(home);
  if (!b) return EUROPE;
  const h = b[3] - b[1];
  const padX = Math.max(0.5, (b[2] - b[0]) * 0.1);
  return [b[0] - padX, b[1] - Math.max(0.3, h * 0.12), b[2] + padX, b[3] + Math.max(0.2, h * 0.04)];
}

export default function MapThemeScreen() {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Lines you swipe: about three and a half pictures in view (rowThumbSize), the same size in each
  const { width: screenWidth } = useWindowDimensions();
  const pic = rowThumbSize(screenWidth - PAD);
  const cell = pic.width + 2 * RING;

  const applied = usePreferences((s) => s.mapTheme);
  const setMapTheme = usePreferences((s) => s.setMapTheme);
  const [draft, setDraft] = useState<UserMapTheme>(applied);
  const [friend, setFriend] = useState(false);
  const resolved = useMapTheme(draft);
  const pick = (next: UserMapTheme) => setDraft(normalizeUserMapTheme(next));
  // The lines open with what's chosen in full view (once, when it's first laid out): scrolled only as
  // far as needed, so a line whose choice is already in view doesn't move
  const themeRow = useRef<ScrollView>(null);
  const colourRow = useRef<ScrollView>(null);
  const styleRow = useRef<ScrollView>(null);
  const scrolled = useRef({ themes: false, colours: false, styles: false });
  const reveal = (row: 'themes' | 'colours' | 'styles', { x, width }: { x: number; width: number }) => {
    if (scrolled.current[row]) return;
    scrolled.current[row] = true;
    // What the line shows: the screen for the themes, the card (inside the margins) for the others
    const view = row === 'themes' ? screenWidth : screenWidth - 2 * PAD;
    if (x + width <= view - RING) return;
    const ref = row === 'themes' ? themeRow : row === 'colours' ? colourRow : styleRow;
    ref.current?.scrollTo({ x: x + width - view + PAD, animated: false });
  };

  // Your own map: the home country framed, your marks; a labelled sample when nothing is marked
  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits = [] } = useVisits(me?.id);
  const own = useMemo(() => visits.filter((v) => v.place_type === 'country' || v.place_type === 'region'), [visits]);
  const marks = useMemo(() => homeMarks(visits, home), [visits, home]);
  const sampleMap = own.length === 0;
  const content: PreviewContent = friend ? { mode: 'friends', ...SAMPLE_COMPARE } : { mode: 'map', visits: sampleMap ? SAMPLE_VISITS : own };
  const bounds = friend || sampleMap ? EUROPE : framed(home);
  const isSample = friend || sampleMap;

  // The preset whose own colours and style "Theme's own" means
  const presetId = draft.themeId ?? draft.compareId;
  const own0 = resolveMapTheme(selectTheme(presetId), scheme);
  const locked = FEATURE_PREMIUM_LOCKS && selectionTier(draft) === 'premium';
  const lockOf = (tier: Tier) => FEATURE_PREMIUM_LOCKS && tier === 'premium';
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

  const legend: [string, string, boolean][] = friend
    ? [
        [t('mapTheme.inCommon'), resolved.compare.inCommon, false],
        [t('mapTheme.you'), resolved.compare.you, false],
        [t('mapTheme.friend'), resolved.compare.friend, false],
      ]
    : [
        [t('mapTheme.legend.visited'), resolved.status.visited, false],
        [t('mapTheme.legend.lived'), resolved.status.lived, false],
        [t('mapTheme.legend.want'), resolved.outline.want ?? resolved.status.want, !!resolved.outline.want],
      ];

  return (
    <View style={styles.container} testID="map-theme-screen">
      <Stack.Screen
        options={{
          title: t('mapTheme.title'),
          // The header's own title can't cap its growth: at 1.6× text it was cut to "মানচিত্র…"
          headerTitle: () => (
            <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('mapTheme.title')}
            </Text>
          ),
          headerRight: () => (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={() => setDraft(DEFAULT_USER_MAP_THEME)}
              disabled={sameMapTheme(draft, DEFAULT_USER_MAP_THEME)}
              style={styles.reset}
              accessibilityRole="button"
              accessibilityLabel={t('mapTheme.resetA11y')}
              testID="map-theme-reset"
            >
              <Text style={[styles.resetText, sameMapTheme(draft, DEFAULT_USER_MAP_THEME) && styles.resetOff]} maxFontSizeMultiplier={1.3}>{t('mapTheme.reset')}</Text>
            </PressableScale>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.preview} accessible accessibilityLabel={t('mapTheme.preview', { name })} testID="map-theme-preview">
          <ThemePreviewMap theme={resolved} content={content} bounds={bounds} />
          <PressableScale
            haptic="selection"
            onPress={() => setFriend((f) => !f)}
            style={[styles.friend, friend && styles.friendOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: friend }}
            testID="map-theme-friend"
          >
            <LineIcon name="friends" size={18} strokeWidth={2} color={friend ? colors.onAccent : colors.textPrimary} />
            <Text style={[styles.friendText, friend && styles.friendTextOn]}>{t('mapTheme.withFriend')}</Text>
          </PressableScale>
          {isSample ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>{t(friend ? 'mapTheme.sampleCompare' : 'mapTheme.sample')}</Text>
            </View>
          ) : null}
          <View style={styles.legend} testID="map-theme-legend">
            {legend.map(([label, color, ring]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, ring ? { borderWidth: 2.5, borderColor: color } : { backgroundColor: color }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.heading}>{t('mapTheme.themes').toUpperCase()}</Text>
        <ScrollView
          ref={themeRow}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.themeLine}
          contentContainerStyle={styles.themes}
          accessibilityRole="radiogroup"
        >
          {THEMES.map((th) => {
            const on = draft.themeId === th.id;
            const look = resolveMapTheme(selectTheme(th.id), scheme);
            return (
              <PressableScale
                key={th.id}
                haptic="selection"
                onPress={() => pick(selectTheme(th.id))}
                onLayout={on ? (e) => reveal('themes', e.nativeEvent.layout) : undefined}
                style={[styles.item, { width: cell }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={lockOf(th.tier) ? `${th.name}, ${t('mapTheme.premium')}` : th.name}
                testID={`map-theme-card-themes-${th.id}`}
              >
                <View>
                  <MapThumb
                    home={home}
                    look={look}
                    marks={marks}
                    width={pic.width}
                    height={pic.height}
                    selected={on}
                    ring={colors.accent}
                    hairline={colors.hairline}
                    ground={colors.bg}
                  />
                  {lockOf(th.tier) ? <Lock /> : null}
                </View>
                <Text style={[styles.itemName, on && styles.itemNameOn]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {th.name}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <Text style={styles.heading}>{t('mapTheme.makeOwn').toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t('mapTheme.colours')}</Text>
            <Text style={styles.cardHint}>{t('mapTheme.coloursHint')}</Text>
          </View>
          <ScrollView ref={colourRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="radiogroup">
            {[
              { id: 'own', name: t('mapTheme.themesOwn'), tier: 'free' as Tier, set: [own0.status.visited, own0.status.want, own0.status.lived], on: draft.colorsId.startsWith(THEME_REF), choose: () => pick(selectColors(draft, THEME_REF + presetId)) },
              ...COLORS.map((c) => ({ id: c.id, name: c.name, tier: c.tier, set: [c.visited, c.want, c.lived], on: draft.colorsId === c.id, choose: () => pick(selectColors(draft, c.id)) })),
            ].map((c) => (
              <PressableScale
                key={c.id}
                haptic="selection"
                onPress={c.choose}
                onLayout={c.on ? (e) => reveal('colours', e.nativeEvent.layout) : undefined}
                style={[styles.chip, c.on && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: c.on }}
                accessibilityLabel={lockOf(c.tier) ? `${c.name}, ${t('mapTheme.premium')}` : c.name}
                testID={`map-theme-card-colors-${c.id}`}
              >
                <Dots colors={c.set} ground={c.on ? colors.accentTint : colors.surface} />
                <Text style={[styles.chipText, c.on && styles.chipTextOn]}>{c.name}</Text>
                {lockOf(c.tier) ? <MaterialCommunityIcons name="lock" size={14} color={colors.textSecondary} /> : null}
              </PressableScale>
            ))}
          </ScrollView>

          <View style={styles.divider} />

          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t('mapTheme.style')}</Text>
            <Text style={styles.cardHint}>{t('mapTheme.styleHint')}</Text>
          </View>
          <ScrollView ref={styleRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleRow} accessibilityRole="radiogroup">
            {[
              {
                id: 'own',
                name: t('mapTheme.themesOwn'),
                tier: 'free' as Tier,
                on: draft.styleId.startsWith(THEME_REF),
                choose: () => pick(selectStyle(draft, THEME_REF + presetId)),
                look: resolveMapTheme(selectStyle(draft, THEME_REF + presetId), scheme),
              },
              ...STYLES.map((st) => ({
                id: st.id,
                name: st.name,
                tier: st.tier,
                on: draft.styleId === st.id,
                choose: () => pick(selectStyle(draft, st.id)),
                // Your colours on this style
                look: resolveMapTheme(selectStyle(draft, st.id), scheme),
              })),
            ].map((st) => (
              <PressableScale
                key={st.id}
                haptic="selection"
                onPress={st.choose}
                onLayout={st.on ? (e) => reveal('styles', e.nativeEvent.layout) : undefined}
                style={[styles.item, { width: cell }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: st.on }}
                accessibilityLabel={lockOf(st.tier) ? `${st.name}, ${t('mapTheme.premium')}` : st.name}
                testID={`map-theme-card-styles-${st.id}`}
              >
                <View>
                  <MapThumb
                    home={home}
                    look={st.look}
                    marks={marks}
                    width={pic.width}
                    height={pic.height}
                    selected={st.on}
                    ring={colors.accent}
                    hairline={colors.hairline}
                    ground={colors.surface}
                  />
                  {lockOf(st.tier) ? <Lock /> : null}
                </View>
                <Text style={[styles.itemName, st.on && styles.itemNameOn]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {st.name}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={t('mapTheme.apply')}
          accessibilityLabel={`${t('mapTheme.apply')}: ${name}`}
          onPress={apply}
          haptic={locked ? 'error' : 'none'}
          icon={locked ? 'lock-outline' : undefined}
          testID="map-theme-apply"
        />
      </View>
    </View>
  );
}

/** A colour set: three dots overlapping, each ringed in the chip's own colour (frame 7). One SVG, so
 * the rings have clean edges (an Android border around a filled circle leaves a fringe). */
function Dots({ colors: set, ground }: { colors: string[]; ground: string }) {
  const step = 12;
  return (
    <Svg width={22 + step * (set.length - 1)} height={22} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {set.map((color, i) => (
        <React.Fragment key={i}>
          <Circle cx={11 + i * step} cy={11} r={11} fill={ground} />
          <Circle cx={11 + i * step} cy={11} r={9} fill={color} />
        </React.Fragment>
      ))}
    </Svg>
  );
}

function Lock() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.lock}>
      <MaterialCommunityIcons name="lock" size={14} color={colors.onHero} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  title: { ...t.type.screenTitle, color: t.colors.textPrimary },
  content: { padding: PAD, paddingTop: t.spacing.sm, paddingBottom: t.spacing.xxl, gap: 14 },
  reset: { minHeight: t.sizes.minTouch, paddingHorizontal: t.spacing.md, justifyContent: 'center' },
  resetText: { ...t.type.callout, fontWeight: '500', color: t.colors.link },
  resetOff: { color: t.colors.textTertiary },
  preview: { height: 214, borderRadius: 24, overflow: 'hidden', backgroundColor: t.colors.surfaceInset, ...t.depth.raised },
  friend: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 20,
    backgroundColor: t.colors.glass,
  },
  friendOn: { backgroundColor: t.colors.accent },
  friendText: { ...t.type.footnote, fontWeight: '500', color: t.colors.textPrimary },
  friendTextOn: { color: t.colors.onAccent },
  note: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: t.radius.chip, backgroundColor: t.colors.glass },
  noteText: { ...t.type.footnote, color: t.colors.textPrimary },
  legend: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 17,
    backgroundColor: t.colors.glass,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { ...t.type.caption, fontSize: 12.5, fontWeight: '500', color: t.colors.textPrimary },
  heading: { ...t.type.footnote, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, color: t.colors.textSecondary, marginHorizontal: 4, marginTop: 4 },
  // The line runs to the screen's edges; the first picture lines up with the card below (its ring
  // room, RING, reaches into the margin)
  themeLine: { marginHorizontal: -PAD },
  themes: { gap: THUMB_GAP - 2 * RING, paddingHorizontal: PAD - RING },
  // 7 from the picture to its name, as in frame 7 (RING of it is the ring's room)
  item: { alignItems: 'center', gap: 7 - RING },
  // A name may be a little wider than its picture, into the space between pictures
  itemName: { ...t.type.footnote, fontWeight: '500', color: t.colors.textSecondary, alignSelf: 'stretch', marginHorizontal: -4, textAlign: 'center' },
  itemNameOn: { fontWeight: '700', color: t.colors.textPrimary },
  lock: { position: 'absolute', right: RING + 5, top: RING + 5, width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.hero, alignItems: 'center', justifyContent: 'center' },
  card: { paddingVertical: 14, gap: 10, borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg },
  cardTitle: { ...t.type.callout, fontSize: 15.5, fontWeight: '700', color: t.colors.textPrimary },
  cardHint: { ...t.type.footnote, color: t.colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  row: { gap: t.spacing.sm, paddingHorizontal: t.spacing.lg },
  // The pictures sit 12 apart, their ring room inside that
  styleRow: { gap: THUMB_GAP - 2 * RING, paddingHorizontal: t.spacing.lg - RING },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    // Frame 7's chip: 10 and 14 inside its edge, 8 after the dots. Here the 1.5 border takes room and
    // the dots' rings (2) are drawn inside their SVG
    gap: 6,
    minHeight: 44,
    paddingLeft: 6.5,
    paddingRight: 12.5,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.surface,
  },
  chipOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentTint },
  chipText: { ...t.type.footnote, fontSize: 13.5, fontWeight: '500', color: t.colors.textPrimary },
  chipTextOn: { fontWeight: '700' },
  divider: { height: 1, marginHorizontal: t.spacing.lg, backgroundColor: t.colors.divider },
  footer: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, borderTopWidth: 1, borderTopColor: t.colors.divider, backgroundColor: t.colors.surface },
}));
