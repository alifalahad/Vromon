/**
 * "Map view" sheet (08-map-view-sheet.jpg): Countries · Cities · Regions as circular
 * options; the selected one has an accent ring, icon and label. Choosing closes it.
 */

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../../ui/haptics';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import type { MapView } from '../preferences/store';

const OPTIONS: { view: MapView; icon: React.ReactElement<{ color?: string }> }[] = [
  { view: 'countries', icon: <MaterialCommunityIcons name="earth" size={30} /> },
  { view: 'cities', icon: <MaterialCommunityIcons name="office-building-outline" size={30} /> },
  { view: 'regions', icon: <MaterialIcons name="space-dashboard" size={30} /> },
];

export type MapViewSheetHandle = { present: () => void };

/**
 * Opened imperatively (`ref.present()`), not through a `visible` flag: a flag can
 * get out of step with the bottom-sheet library's own modal stack and then never
 * re-open the sheet.
 */
export const MapViewSheet = forwardRef<MapViewSheetHandle, { view: MapView; onSelect: (v: MapView) => void }>(function MapViewSheet(
  { view, onSelect },
  handle,
) {
  const ref = useRef<BottomSheetModal>(null);
  useImperativeHandle(handle, () => ({ present: () => ref.current?.present() }));
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const renderBackdrop = useCallback(
    // The map behind dims about 60% (prompt §6.5)
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />,
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      stackBehavior="replace"
      onChange={(i) => i >= 0 && haptics.selection()}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleComponent={null}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('map.mapView')}
          </Text>
          <PressableScale style={styles.close} onPress={() => ref.current?.dismiss()} accessibilityLabel={t('common.close')}>
            <MaterialIcons name="close" size={26} color={colors.textPrimary} />
          </PressableScale>
        </View>
        <View style={styles.options} accessibilityRole="radiogroup">
          {OPTIONS.map((o) => {
            const on = o.view === view;
            const color = on ? colors.link : colors.textSecondary;
            return (
              <PressableScale
                key={o.view}
                haptic="selection"
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(`map.views.${o.view}`)}
                testID={`map-view-${o.view}`}
                style={styles.option}
                onPress={() => {
                  onSelect(o.view);
                  ref.current?.dismiss();
                }}
              >
                <View style={[styles.circle, on && styles.circleOn]}>{React.cloneElement(o.icon, { color })}</View>
                <Text style={[styles.label, on && styles.labelOn]}>{t(`map.views.${o.view}`)}</Text>
              </PressableScale>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const CIRCLE = 64;

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  title: { ...t.type.title, fontSize: 24, color: t.colors.textPrimary },
  close: {
    position: 'absolute',
    right: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flexDirection: 'row', justifyContent: 'space-around', marginTop: t.spacing.xxl },
  option: { alignItems: 'center', gap: t.spacing.sm, minWidth: 88 },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 1.5,
    borderColor: t.colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleOn: { borderColor: t.colors.accent, borderWidth: 2.5 },
  label: { ...t.type.body, fontSize: 17, color: t.colors.textSecondary },
  labelOn: { color: t.colors.link },
}));
