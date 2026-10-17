/**
 * Vromon Mobile — Map tab (02-map-home-dark.jpg, 08-map-view-sheet.jpg).
 *
 * Full-bleed world map with the user's visits. Bottom-left pill: current view
 * (Countries / Cities / Regions) → Map view sheet. Bottom-right +: Add place.
 * Top-right: map theme button → Map Theme screen. Tap a feature for its sheet.
 * Re-tapping the Map tab recentres the map.
 */

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { MapViewSheet, type MapViewSheetHandle } from '../../src/features/map/MapViewSheet';
import { PlaceSheet } from '../../src/features/map/PlaceSheet';
import { usedStatuses } from '../../src/features/map/style';
import { useVisitOutbox, useVisits } from '../../src/features/map/visits';
import { WorldMap, type PressedPlace, type WorldMapHandle } from '../../src/features/map/WorldMap';
import { StatusSwatch } from '../../src/features/mapThemes/StatusSwatch';
import { useMapTheme } from '../../src/features/mapThemes/useMapTheme';
import { usePreferences, type MapView } from '../../src/features/preferences/store';
import { Fab } from '../../src/ui/Fab';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

const VIEW_ICON: Record<MapView, React.ReactElement<{ color?: string }>> = {
  countries: <MaterialCommunityIcons name="earth" size={22} />,
  cities: <MaterialCommunityIcons name="office-building-outline" size={22} />,
  regions: <MaterialIcons name="space-dashboard" size={22} />,
};

export default function MapScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const map = useRef<WorldMapHandle>(null);
  const mapTheme = useMapTheme();

  const { data: me } = useMe();
  const { data: visits = [] } = useVisits(me?.id);
  const pending = useVisitOutbox((s) => (s.userId === me?.id ? s.ops.length : 0));
  const view = usePreferences((s) => s.mapView);
  const setView = usePreferences((s) => s.setMapView);
  const viewSheet = useRef<MapViewSheetHandle>(null);
  const [place, setPlace] = useState<PressedPlace | null>(null);

  // Short crossfade when the view changes
  const opacity = useSharedValue(1);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const changeView = (next: MapView) => {
    if (next === view) return;
    opacity.set(withSequence(withTiming(0.35, { duration: 120 }), withTiming(1, { duration: 220 })));
    setView(next);
  };

  // Re-tapping the Map tab recentres the map
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) map.current?.recentre();
    });
    return unsubscribe;
  }, [navigation]);

  const legend = usedStatuses(visits);

  return (
    <View style={styles.container} testID="map-screen">
      <Animated.View style={[styles.map, fade]}>
        <WorldMap
          ref={map}
          view={view}
          visits={visits}
          theme={mapTheme}
          onPressPlace={(p) => {
            haptics.light();
            setPlace(p);
          }}
        />
      </Animated.View>

      {legend.length > 1 ? (
        <View style={[styles.legend, { top: insets.top + 12 }]} accessibilityRole="summary">
          {legend.map((s) => (
            <View key={s} style={styles.legendChip}>
              <StatusSwatch theme={mapTheme} status={s} />
              <Text style={styles.legendText}>{t(`map.status.${s}`)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <PressableScale
        style={[styles.themeButton, { top: insets.top + 12 }]}
        onPress={() => {
          setPlace(null);
          router.push('/map/theme');
        }}
        accessibilityLabel={t('mapTheme.title')}
        testID="map-theme-button"
      >
        <MaterialCommunityIcons name="palette-outline" size={30} color={theme.colors.textPrimary} />
      </PressableScale>

      {pending > 0 ? (
        <View style={[styles.pending, { top: insets.top + (legend.length > 1 ? 56 : 12) }]} accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="cloud-sync-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.pendingText}>{t('map.pending', { count: pending })}</Text>
        </View>
      ) : null}

      <PressableScale
        style={[styles.viewPill, { bottom: 18 }]}
        onPress={() => {
          setPlace(null); // one sheet at a time
          viewSheet.current?.present();
        }}
        accessibilityLabel={`${t('map.mapView')}: ${t(`map.views.${view}`)}`}
        testID="map-view-pill"
      >
        {React.cloneElement(VIEW_ICON[view], { color: theme.colors.textPrimary })}
        <Text style={styles.viewPillText}>{t(`map.views.${view}`)}</Text>
      </PressableScale>

      <Fab onPress={() => router.push({ pathname: '/map/add-place', params: { view } })} accessibilityLabel={t('map.addPlace')} testID="add-place-fab" />

      <MapViewSheet ref={viewSheet} view={view} onSelect={changeView} />
      {me ? <PlaceSheet place={place} userId={me.id} visits={visits} onClose={() => setPlace(null)} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  map: { flex: 1 },
  // Clear of the theme button on the right
  legend: { position: 'absolute', left: t.spacing.lg, right: t.spacing.lg + t.sizes.mapButton + t.spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: t.radius.chip,
    backgroundColor: t.colors.surface,
  },
  themeButton: {
    position: 'absolute',
    right: t.spacing.lg + 2,
    width: t.sizes.mapButton,
    height: t.sizes.mapButton,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  legendText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textPrimary },
  pending: {
    position: 'absolute',
    left: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: t.radius.chip,
    backgroundColor: t.colors.surface,
  },
  pendingText: { ...t.type.footnote, color: t.colors.textSecondary },
  viewPill: {
    position: 'absolute',
    left: t.spacing.lg + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 52,
    paddingHorizontal: t.spacing.xl,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    elevation: 4,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  viewPillText: { ...t.type.headline, color: t.colors.textPrimary },
}));
