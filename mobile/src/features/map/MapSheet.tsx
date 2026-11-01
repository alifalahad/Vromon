/**
 * The Map sheet (map home step 2, mockup 8): what the map shows (Countries ·
 * Divisions · Cities, the middle word from the home country) and its theme (the
 * four preset themes, plus "All themes" for the full Map Theme screen). Replaces
 * the Map view sheet and the palette button.
 *
 * Choosing a view closes the sheet; choosing a theme applies it at once and keeps
 * the sheet open, so themes can be compared on the map behind it. "On the map"
 * switches the optional layers (`layers`: only those that exist are listed).
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '../../ui/PressableScale';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { THEMES } from '../mapThemes/catalog';
import { selectTheme } from '../mapThemes/resolve';
import { usePreferences, type MapLayer, type MapView } from '../preferences/store';
import { regionWord } from './home';

const VIEWS: MapView[] = ['countries', 'regions', 'cities'];

export function MapSheet({
  open,
  home,
  view,
  onSelectView,
  onAllThemes,
  onClose,
  layers = [],
}: {
  open: boolean;
  /** Home country: names the regions option ("Divisions" for Bangladesh) */
  home: string;
  view: MapView;
  onSelectView: (v: MapView) => void;
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
  const themeId = usePreferences((s) => s.mapTheme.themeId);
  const setMapTheme = usePreferences((s) => s.setMapTheme);
  const mapLayers = usePreferences((s) => s.mapLayers);
  const setMapLayer = usePreferences((s) => s.setMapLayer);

  const handleDismiss = useSheetPresentation(ref, open, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.3} pressBehavior="close" />,
    [],
  );

  const label = (v: MapView) => t(`map.views.${v === 'regions' ? regionWord(home) : v}`);

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      stackBehavior="replace"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 28 }]} testID="map-sheet">
        <Text style={styles.title} accessibilityRole="header">
          {t('map.sheetTitle')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.heading}>{t('map.show')}</Text>
          <SegmentedControl<MapView>
            options={VIEWS.map((v) => ({ value: v, label: label(v) }))}
            value={view}
            onChange={(v) => {
              onSelectView(v);
              ref.current?.dismiss();
            }}
            testID="map-view"
          />
        </View>

        {layers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>{t('map.layers.heading')}</Text>
            {layers.map((layer) => (
              <View key={layer} style={styles.layerRow}>
                <View style={styles.layerText}>
                  <Text style={styles.layerName}>{t(`map.layers.${layer}`)}</Text>
                  <Text style={styles.layerBody}>{t(`map.layers.${layer}Body`)}</Text>
                </View>
                <Switch
                  value={mapLayers[layer]}
                  onValueChange={(on) => setMapLayer(layer, on)}
                  trackColor={{ true: colors.accentStrong, false: colors.surfaceRaised }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel={t(`map.layers.${layer}`)}
                  testID={`map-layer-${layer}`}
                />
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>{t('map.themeHeading')}</Text>
            <PressableScale pressEffect="opacity" haptic="light" onPress={onAllThemes} hitSlop={8} testID="map-sheet-all-themes">
              <Text style={styles.link}>{t('map.allThemes')}</Text>
            </PressableScale>
          </View>
          <View style={styles.themes} accessibilityRole="radiogroup">
            {THEMES.map((th) => {
              const on = th.id === themeId;
              const land = scheme === 'dark' && th.style.dark ? th.style.dark.land : th.style.land;
              return (
                <PressableScale
                  key={th.id}
                  haptic="selection"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={th.name}
                  style={styles.theme}
                  onPress={() => {
                    if (!on) setMapTheme(selectTheme(th.id));
                  }}
                  testID={`map-sheet-theme-${th.id}`}
                >
                  <View style={[styles.swatch, { backgroundColor: land }, on && styles.swatchOn]}>
                    <View style={[styles.blob, { backgroundColor: scheme === 'dark' ? (th.visitedDark ?? th.visited) : th.visited }]} />
                  </View>
                  <Text style={[styles.themeName, on && styles.themeNameOn]} numberOfLines={1}>
                    {th.name}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const SWATCH = 64;

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.xl },
  title: { ...t.type.title, fontSize: 24, fontWeight: '800', color: t.colors.textPrimary },
  section: { gap: t.spacing.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  heading: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  themes: { flexDirection: 'row', justifyContent: 'space-between' },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 56 },
  layerText: { flex: 1, gap: 2 },
  layerName: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  layerBody: { ...t.type.footnote, color: t.colors.textSecondary },
  theme: { alignItems: 'center', gap: 6, minWidth: SWATCH },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  swatchOn: { borderColor: t.colors.accent, borderWidth: 2.5 },
  // A country-ish shape in the theme's Visited colour
  blob: { position: 'absolute', left: 14, top: 16, width: 30, height: 26, borderTopLeftRadius: 10, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  themeName: { ...t.type.caption, fontWeight: '600', color: t.colors.textSecondary },
  themeNameOn: { color: t.colors.textPrimary },
}));
