/**
 * The Map sheet (map home step 2; rebuilt in docs/ui-refresh step 3, frame 6): what the map shows
 * and its theme. What the map shows (countries, divisions, districts, cities) follows the zoom, so
 * there's no view switch here.
 *
 * "Show on the map": the optional layers as large tiles (`layers`: only those that exist are
 * offered). On or off is said in words and marked with a tick, not only by colour, and each tile is a
 * switch for screen readers. With large text the tiles become full-width rows, so no word has to
 * break. "Theme": every theme as a small picture of your map in it (MapThumb), in one line you swipe
 * (the owner's ask, 2026-11-15), opening on the chosen one; choosing one applies it at once and keeps
 * the sheet open, so themes can be compared on the map behind it. "All themes" opens the Map Theme
 * screen. The icons are the frame's own line drawings (LineIcon).
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View, type ScrollView as RNScrollView } from 'react-native';
// The sheet's own drag takes a plain ScrollView's touches on Android: gesture-handler's shares them
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineIcon, type LineIconName } from '../../ui/LineIcon';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { useMe } from '../account/useMe';
import { THEMES } from '../mapThemes/catalog';
import { homeMarks, MapThumb, RING, rowThumbSize, THUMB_GAP } from '../mapThemes/MapThumb';
import { resolveMapTheme, selectTheme } from '../mapThemes/resolve';
import { usePreferences, type MapLayer } from '../preferences/store';
import { DEFAULT_HOME } from './home';
import { useVisits } from './visits';

const LAYER_ICON: Record<MapLayer, LineIconName> = { trails: 'trail', plannable: 'pin', friends: 'friends' };
/** The sheet's side margin (styles.content) */
const PAD = 20;
/** Text this much larger than normal turns the three tiles into rows (Android's "Larger" is 1.3) */
const ROWS_FROM_FONT_SCALE = 1.2;

export function MapSheet({
  open,
  onAllThemes,
  onClose,
  layers = [],
}: {
  open: boolean;
  onAllThemes: () => void;
  onClose: () => void;
  /** The optional layers to offer, in order */
  layers?: readonly MapLayer[];
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const rows = fontScale > ROWS_FROM_FONT_SCALE;
  const pic = rowThumbSize(screenWidth - PAD);
  const themeRow = useRef<RNScrollView>(null);
  const { data: me } = useMe();
  const home = me?.home_country_iso2 ?? DEFAULT_HOME;
  const { data: visits } = useVisits(me?.id);
  const marks = useMemo(() => homeMarks(visits ?? [], home), [visits, home]);
  const themeId = usePreferences((s) => s.mapTheme.themeId);
  const setMapTheme = usePreferences((s) => s.setMapTheme);
  const mapLayers = usePreferences((s) => s.mapLayers);
  const setMapLayer = usePreferences((s) => s.setMapLayer);

  const handleDismiss = useSheetPresentation(ref, open, onClose);

  // Frame 6 dims the map with a light navy veil; in dark mode a black one
  const veil = scheme === 'dark' ? 0.3 : 0.16;
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={veil} pressBehavior="close" style={[props.style, { backgroundColor: colors.shadow }]} />
    ),
    [veil, colors.shadow],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      stackBehavior="replace"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleStyle={styles.handleArea}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 28 }]} testID="map-sheet">
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {t('map.sheetTitle')}
          </Text>
          <PressableScale pressEffect="opacity" haptic="light" onPress={() => ref.current?.dismiss()} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="map-sheet-close">
            <View style={styles.closeDot}>
              <LineIcon name="close" size={18} color={colors.textPrimary} />
            </View>
          </PressableScale>
        </View>

        {layers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>{t('map.layers.show').toUpperCase()}</Text>
            <View style={rows ? styles.tileRows : styles.tiles}>
              {layers.map((layer) => {
                const on = mapLayers[layer];
                const check = (
                  <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>
                    {on ? <LineIcon name="check" size={14} color={colors.onAccent} /> : null}
                  </View>
                );
                return (
                  <PressableScale
                    key={layer}
                    haptic="selection"
                    onPress={() => setMapLayer(layer, !on)}
                    style={[styles.tile, rows && styles.tileRow, on && styles.tileOn]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t(`map.layers.${layer}`)}
                    accessibilityHint={t(`map.layers.${layer}Body`)}
                    testID={`map-layer-${layer}`}
                  >
                    <View style={styles.tileTop}>
                      <LineIcon name={LAYER_ICON[layer]} size={28} color={on ? (scheme === 'dark' ? colors.onAccentSoft : colors.accent) : colors.textTertiary} />
                      {rows ? null : check}
                    </View>
                    <View style={[styles.tileText, rows && styles.tileTextRow]}>
                      {/* Three tiles share the width: their text grows up to 1.3× (rows take the rest) */}
                      <Text style={styles.tileName} maxFontSizeMultiplier={1.3}>
                        {t(`map.layers.${layer}Short`)}
                      </Text>
                      <Text style={[styles.tileTip, on && styles.tileTipOn]} maxFontSizeMultiplier={1.3}>
                        {t(`map.layers.${layer}Tip`)}
                      </Text>
                      <Text style={[styles.tileState, on && styles.tileStateOn]} maxFontSizeMultiplier={1.3}>
                        {on ? t('map.layers.on') : t('map.layers.off')}
                      </Text>
                    </View>
                    {rows ? check : null}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={[styles.section, styles.themeSection]}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>{t('map.themeHeading').toUpperCase()}</Text>
            <PressableScale pressEffect="opacity" haptic="light" onPress={onAllThemes} hitSlop={8} style={styles.allRow} testID="map-sheet-all-themes">
              <Text style={styles.link}>{t('map.allThemes')}</Text>
              <LineIcon name="chevronRight" size={18} color={colors.link} />
            </PressableScale>
          </View>
          <ScrollView
            ref={themeRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.themeLine}
            contentContainerStyle={styles.themes}
            accessibilityRole="radiogroup"
          >
            {THEMES.map((th) => {
              const on = th.id === themeId;
              return (
                <PressableScale
                  key={th.id}
                  haptic="selection"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={th.name}
                  // Opens with the chosen one in full view
                  onLayout={
                    on
                      ? (e) => {
                          const { x, width } = e.nativeEvent.layout;
                          if (x + width > screenWidth - RING) themeRow.current?.scrollTo({ x: x + width - screenWidth + PAD, animated: false });
                        }
                      : undefined
                  }
                  style={[styles.theme, { width: pic.width + 2 * RING }]}
                  onPress={() => {
                    if (!on) setMapTheme(selectTheme(th.id));
                  }}
                  testID={`map-sheet-theme-${th.id}`}
                >
                  <MapThumb
                    home={home}
                    look={resolveMapTheme(selectTheme(th.id), scheme)}
                    marks={marks}
                    width={pic.width}
                    height={pic.height}
                    selected={on}
                    ring={colors.accent}
                    hairline={colors.hairline}
                    ground={colors.surface}
                  />
                  <Text style={[styles.themeName, on && styles.themeNameOn]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {th.name}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  // Frame 6's handle is a light grey (#C9D1DC); the other sheets keep theirs until the polish step
  handle: { backgroundColor: t.colors.textTertiary, opacity: 0.45, width: 40 },
  // Frame 6: the handle 10 from the top, the title row right under it
  handleArea: { paddingTop: 10, paddingBottom: 0 },
  content: { paddingHorizontal: PAD, paddingTop: 2, gap: 22 },
  // 2 from the title row to the first heading, as in frame 6 (the sections are 22 apart)
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, marginRight: -8, marginBottom: -20 },
  title: { ...t.type.screenTitle, color: t.colors.textPrimary },
  close: { width: t.sizes.minTouch, height: t.sizes.minTouch, alignItems: 'center', justifyContent: 'center' },
  closeDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  // The pictures' ring room (RING) is part of the 10 from the heading
  themeSection: { gap: 10 - RING },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  heading: { ...t.type.footnote, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, color: t.colors.textSecondary },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  link: { ...t.type.callout, fontSize: 14.5, fontWeight: '500', color: t.colors.link },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minHeight: 122,
    justifyContent: 'space-between',
    gap: t.spacing.sm,
    // Frame 6's tile: 12, 10, 10, 12 inside its edge; here the 1.5 border takes room
    paddingTop: 10.5,
    paddingBottom: 8.5,
    paddingLeft: 10.5,
    paddingRight: 8.5,
    borderRadius: 20,
    // One border width on and off (Android stops drawing a clipped view's children when it changes)
    borderWidth: 1.5,
    borderColor: t.colors.hairline,
    backgroundColor: t.colors.bg,
  },
  tileOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentTint },
  tileRows: { gap: t.spacing.sm },
  tileRow: { flex: 0, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: t.spacing.md, paddingVertical: 10.5, paddingRight: 10.5 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: t.colors.accent },
  // A light ring, as in frame 6 (#AEB8C7): the word "Off" says it too
  checkOff: { borderWidth: 2, borderColor: t.colors.textTertiary, opacity: 0.55 },
  tileText: { gap: 2 },
  tileTextRow: { flex: 1 },
  tileName: { ...t.type.callout, fontSize: 14.5, fontWeight: '700', lineHeight: 17.5, color: t.colors.textPrimary },
  tileTip: { ...t.type.caption, lineHeight: 15, color: t.colors.textSecondary },
  tileTipOn: { color: t.colors.textPrimary },
  tileState: { ...t.type.caption, fontWeight: '700', color: t.colors.textSecondary },
  tileStateOn: { color: t.colors.onAccentSoft },
  // The line runs to the screen's edges; the first picture lines up with the tiles (its ring room,
  // RING, reaches into the margin)
  themeLine: { marginHorizontal: -PAD },
  themes: { gap: THUMB_GAP - 2 * RING, paddingHorizontal: PAD - RING },
  // 6 from the picture to its name, as in frame 6 (RING of it is the ring's room)
  theme: { alignItems: 'center', gap: 6 - RING },
  // A name may be a little wider than its picture, into the space between pictures
  themeName: { ...t.type.footnote, fontWeight: '500', color: t.colors.textSecondary, alignSelf: 'stretch', marginHorizontal: -4, textAlign: 'center' },
  themeNameOn: { fontWeight: '700', color: t.colors.textPrimary },
}));
