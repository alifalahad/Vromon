/**
 * Pick a place on a map (docs/trip-upgrades, step 2; step 6 reuses it for "Put a pin on the map"):
 * the map moves under a fixed pin in the middle. Without gestures: search a place or a town, pick
 * it, then "Use this place". An optional name goes with it ("Uncle's house").
 *
 * The map is a TextureView on Android (androidView="texture"): it sits in a modal over other
 * screens, and the default GLSurfaceView can draw over views mounted after it.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { geoApi, placesApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { haptics } from '../../ui/haptics';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useStreetStyle } from '../trips/plan/mapStyle';

export type PickedPlace = { lat: number; lon: number; label: string | null };

type Result = { key: string; name: string; detail: string; lat: number; lon: number };

const ZOOM = 14;

export function PlacePicker({
  visible,
  title,
  destination,
  initial,
  center,
  askName = true,
  namePlaceholder,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** The trip's destination: its places come first in the search */
  destination?: string;
  /** Opens here (an earlier pick) */
  initial?: PickedPlace | null;
  /** …else here (the destination's centre) */
  center?: { lat: number; lon: number } | null;
  askName?: boolean;
  namePlaceholder?: string;
  onPick: (place: PickedPlace) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapStyle = useStreetStyle(theme.scheme);
  const camera = useRef<CameraRef>(null);
  const start = initial ?? (center ? { lat: center.lat, lon: center.lon, label: null } : { lat: 23.7, lon: 90.35, label: null });
  const [here, setHere] = useState<{ lat: number; lon: number }>({ lat: start.lat, lon: start.lon });
  const [name, setName] = useState(initial?.label ?? '');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // A fresh start each time it opens (set while rendering, not in an effect)
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setHere({ lat: start.lat, lon: start.lon });
      setName(initial?.label ?? '');
      setText('');
      setQuery('');
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  const places = useQuery({
    queryKey: ['places', destination],
    queryFn: () => placesApi.list({ destination }),
    enabled: visible && !!destination,
    staleTime: 10 * 60_000,
  });
  const towns = useQuery({
    queryKey: ['geo-cities', query.toLowerCase()],
    queryFn: () => geoApi.cities(query, 'BD'),
    enabled: visible && query.length >= 2,
    staleTime: 60_000,
  });
  const q = query.toLowerCase();
  const results: Result[] = q.length >= 2
    ? [
        ...(places.data ?? [])
          .filter((p) => p.name.toLowerCase().includes(q) && p.latitude != null && p.longitude != null)
          .slice(0, 6)
          .map((p) => ({ key: `p${p.id}`, name: p.name, detail: p.category, lat: p.latitude!, lon: p.longitude! })),
        ...(towns.data ?? []).slice(0, 6).map((c) => ({ key: `c${c.geonameid}`, name: c.name, detail: t('placePicker.town'), lat: c.lat, lon: c.lon })),
      ]
    : [];

  const go = (r: Result) => {
    haptics.selection();
    setText('');
    setQuery('');
    setHere({ lat: r.lat, lon: r.lon });
    camera.current?.easeTo({ center: [r.lon, r.lat], zoom: ZOOM, duration: 400 });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen} testID="place-picker">
        <Map
          style={styles.map}
          mapStyle={mapStyle}
          androidView="texture"
          logo={false}
          compass={false}
          attribution
          attributionPosition={{ bottom: 8, left: 8 }}
          onRegionDidChange={(e) => {
            const [lon, lat] = e.nativeEvent.center;
            setHere({ lat, lon });
          }}
        >
          <Camera ref={camera} initialViewState={{ center: [start.lon, start.lat], zoom: ZOOM }} />
        </Map>
        {/* The pin stays in the middle; the map moves under it */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <MaterialCommunityIcons name="map-marker" size={44} color={theme.colors.accentStrong} style={styles.pin} />
        </View>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              onPress={onClose}
              style={styles.round}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="place-picker-close"
            >
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </PressableScale>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={22} color={theme.colors.textTertiary} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('placePicker.search')}
              placeholderTextColor={theme.colors.textTertiary}
              style={styles.searchInput}
              accessibilityLabel={t('placePicker.search')}
              autoCorrect={false}
              testID="place-picker-search"
            />
          </View>
          {results.length ? (
            <FlatList
              style={styles.results}
              data={results}
              keyExtractor={(r) => r.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <PressableScale pressEffect="opacity" haptic="none" onPress={() => go(item)} style={styles.result} accessibilityRole="button" testID={`place-picker-${item.key}`}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.resultDetail} numberOfLines={1}>
                    {item.detail}
                  </Text>
                </PressableScale>
              )}
            />
          ) : null}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.hint}>{t('placePicker.hint')}</Text>
          {askName ? (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={namePlaceholder ?? t('placePicker.name')}
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={80}
              style={styles.nameInput}
              accessibilityLabel={namePlaceholder ?? t('placePicker.name')}
              testID="place-picker-name"
            />
          ) : null}
          <Button
            label={t('placePicker.use')}
            icon="check"
            onPress={() => onPick({ lat: Math.round(here.lat * 1e6) / 1e6, lon: Math.round(here.lon * 1e6) / 1e6, label: name.trim() || null })}
            testID="place-picker-use"
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  map: { flex: 1 },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // The marker's tip, not its middle, is on the spot
  pin: { marginBottom: 44 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: t.spacing.lg, gap: t.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface, elevation: 3 },
  title: { ...t.type.headline, color: t.colors.textPrimary, flex: 1, backgroundColor: t.colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.md,
    minHeight: 48,
    elevation: 3,
  },
  searchInput: { flex: 1, color: t.colors.textPrimary, fontSize: 16 },
  results: { maxHeight: 280, backgroundColor: t.colors.surface, borderRadius: t.radius.control, elevation: 3 },
  result: { minHeight: 52, justifyContent: 'center', paddingHorizontal: t.spacing.md, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  resultName: { ...t.type.body, color: t.colors.textPrimary },
  resultDetail: { ...t.type.footnote, color: t.colors.textSecondary },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: t.spacing.lg, gap: t.spacing.sm, backgroundColor: t.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  hint: { ...t.type.footnote, color: t.colors.textSecondary },
  nameInput: { ...t.type.body, color: t.colors.textPrimary, borderWidth: 1, borderColor: t.colors.border, borderRadius: 12, paddingHorizontal: t.spacing.md, minHeight: 48 },
}));
