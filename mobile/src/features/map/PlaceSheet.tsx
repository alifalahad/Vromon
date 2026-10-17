/**
 * Sheet for one place (tap a country, region or city): status as text and colour
 * (never colour alone), a three-way choice plus Clear, and for countries how many of
 * its regions and cities are visited, and your photos there (a country's include
 * those of its regions and cities). Trips join in Phase 7.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Visit, VisitStatus } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { flagEmoji } from '../geo/countries';
import { readableOn } from '../mapThemes/color';
import { StatusSwatch } from '../mapThemes/StatusSwatch';
import { useMapTheme } from '../mapThemes/useMapTheme';
import { PhotoStrip } from '../photos/PhotoStrip';
import { useMarkPlace } from './useMarkPlace';
import { STATUS_ORDER } from './style';
import { clearVisit, statusOf, type PlaceRef } from './visits';
import type { PressedPlace } from './WorldMap';

const VISITED: VisitStatus[] = ['visited', 'lived'];

export function insideCountry(visits: readonly Visit[], iso2: string) {
  const inside = visits.filter((v) => v.country_iso2 === iso2 && VISITED.includes(v.status));
  return { regions: inside.filter((v) => v.place_type === 'region').length, cities: inside.filter((v) => v.place_type === 'city').length };
}

export function PlaceSheet({
  place,
  userId,
  visits,
  onClose,
}: {
  place: PressedPlace | null;
  userId: string;
  visits: readonly Visit[];
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const mapTheme = useMapTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const markPlace = useMarkPlace(userId, visits);

  const handleDismiss = useSheetPresentation(ref, !!place, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.3} pressBehavior="close" />,
    [],
  );

  const status = place ? statusOf(visits, place.place_type, place.place_code) : null;
  const counts = place?.place_type === 'country' ? insideCountry(visits, place.place_code) : null;
  const ref_: PlaceRef | null = place ? { place_type: place.place_type, place_code: place.place_code, country_iso2: place.country_iso2 } : null;
  const photoTarget = useMemo(
    () => (place ? { place_type: place.place_type, place_code: place.place_code } : null),
    [place],
  );

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
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {place && ref_ ? (
          <>
            <View style={styles.header}>
              <Text style={styles.flag}>{place.country_iso2 ? flagEmoji(place.country_iso2) : ''}</Text>
              <View style={styles.titles}>
                <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                  {place.name}
                </Text>
                <Text style={styles.subtitle}>
                  {t(`map.placeType.${place.place_type}`)}
                  {status ? ` · ${t(`map.status.${status}`)}` : ''}
                </Text>
              </View>
              <PressableScale style={styles.close} onPress={() => ref.current?.dismiss()} accessibilityLabel={t('common.close')}>
                <MaterialIcons name="close" size={24} color={colors.textPrimary} />
              </PressableScale>
            </View>

            <View style={styles.segment} accessibilityRole="radiogroup">
              {STATUS_ORDER.map((s) => {
                const on = s === status;
                return (
                  <PressableScale
                    key={s}
                    haptic="none"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(`map.status.${s}`)}
                    testID={`status-${s}`}
                    style={[styles.segmentItem, on && { backgroundColor: mapTheme.status[s], borderColor: mapTheme.outline[s] ?? mapTheme.status[s] }]}
                    onPress={() => {
                      if (!on) markPlace(ref_, s);
                    }}
                  >
                    <StatusSwatch theme={mapTheme} status={s} style={on && styles.swatchOn} />
                    <Text style={[styles.segmentText, on && { color: readableOn(mapTheme.status[s]) }]} numberOfLines={1}>
                      {t(`map.status.${s}`)}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            {status ? (
              <PressableScale
                pressEffect="opacity"
                haptic="light"
                style={styles.clear}
                accessibilityLabel={t('map.clear')}
                onPress={() => clearVisit(queryClient, userId, ref_)}
                testID="status-clear"
              >
                <MaterialIcons name="remove-circle-outline" size={20} color={colors.danger} />
                <Text style={styles.clearText}>{t('map.clear')}</Text>
              </PressableScale>
            ) : null}

            {counts ? <Text style={styles.counts}>{t('map.insideCountry', counts)}</Text> : null}

            <PhotoStrip
              ownerId={userId}
              filter={{ place_type: place.place_type, place_code: place.place_code }}
              target={photoTarget}
              canEdit
            />
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  flag: { fontSize: 40 },
  titles: { flex: 1, gap: 2 },
  title: { ...t.type.title, color: t.colors.textPrimary },
  subtitle: { ...t.type.callout, color: t.colors.textSecondary },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: t.colors.surfaceInset, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  swatchOn: { borderWidth: 2, borderColor: t.colors.surface },
  segmentText: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary },
  clear: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  clearText: { ...t.type.callout, fontWeight: '600', color: t.colors.danger },
  counts: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center' },
}));
