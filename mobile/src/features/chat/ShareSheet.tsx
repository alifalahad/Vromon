/**
 * "Share with Rafi" (mockup 6), from the chat's +: a trip, a place, a trip idea or a
 * poll; your coming trips and your Want list one tap away. Photos and "I'm here"
 * come later (decision C5, step 8), so they aren't offered.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Trip, Visit } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { formatRange } from '../trips/dates';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type ShareChoice = 'trip' | 'place' | 'idea' | 'poll' | 'checkin' | 'live';

const TILES: { key: ShareChoice; icon: Icon }[] = [
  { key: 'trip', icon: 'bag-suitcase-outline' },
  { key: 'place', icon: 'map-marker-star-outline' },
  { key: 'idea', icon: 'lightbulb-on-outline' },
  { key: 'poll', icon: 'poll' },
];

/** In a trip room on one of the trip's days (step 8): I'm here, and live location. No photos yet (decision C5) */
const ON_THE_TRIP: { key: ShareChoice; icon: Icon }[] = [
  { key: 'checkin', icon: 'flag-outline' },
  { key: 'live', icon: 'crosshairs-gps' },
];

export function ShareSheet({
  visible,
  name,
  trips,
  wants,
  placeName,
  onPick,
  onTrip,
  onWant,
  onClose,
  onTheTrip = false,
}: {
  visible: boolean;
  /** Who you're sharing with */
  name: string;
  /** Your coming and current trips, soonest first */
  trips: readonly Trip[];
  /** Places on your Want list */
  wants: readonly Visit[];
  placeName: (v: Visit) => string;
  onPick: (choice: ShareChoice) => void;
  onTrip: (trip: Trip) => void;
  onWant: (visit: Visit) => void;
  onClose: () => void;
  /** A trip room on a day of its trip: also I'm here and live location */
  onTheTrip?: boolean;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const picked = useRef<(() => void) | null>(null);
  const pick = (run: () => void) => {
    picked.current = run;
    ref.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />,
    [],
  );

  const row = (key: string, icon: Icon, title: string, line: string, run: () => void, testID: string) => (
    <PressableScale key={key} pressEffect="opacity" haptic="light" onPress={() => pick(run)} style={styles.row} accessibilityRole="button" accessibilityLabel={`${title}, ${line}`} testID={testID}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.onAccentSoft} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowLine} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <MaterialCommunityIcons name="send-outline" size={20} color={colors.textSecondary} />
    </PressableScale>
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={() => {
        handleDismiss();
        // After the sheet is gone, so a new screen isn't hidden behind it
        const run = picked.current;
        picked.current = null;
        run?.();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('chat.share.title', { name })}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {t('chat.share.title', { name })}
        </Text>
        <View style={styles.tiles}>
          {(onTheTrip ? [...ON_THE_TRIP, ...TILES] : TILES).map((tile) => (
            <PressableScale
              key={tile.key}
              pressEffect="scale"
              haptic="light"
              onPress={() => pick(() => onPick(tile.key))}
              style={styles.tile}
              accessibilityRole="button"
              accessibilityLabel={`${t(`chat.share.${tile.key}`)}: ${t(`chat.share.${tile.key}Hint`)}`}
              testID={`share-${tile.key}`}
            >
              <MaterialCommunityIcons name={tile.icon} size={26} color={colors.onAccentSoft} />
              <Text style={styles.tileTitle}>{t(`chat.share.${tile.key}`)}</Text>
              <Text style={styles.tileHint}>{t(`chat.share.${tile.key}Hint`)}</Text>
            </PressableScale>
          ))}
        </View>

        {trips.length ? (
          <>
            <Text style={styles.section} accessibilityRole="header">
              {t('chat.share.yourTrips')}
            </Text>
            {trips.map((trip) =>
              row(`t${trip.id}`, 'bag-suitcase-outline', trip.destination, formatRange(trip.start_date, trip.end_date, i18n.language), () => onTrip(trip), `share-trip-${trip.id}`),
            )}
          </>
        ) : null}

        {wants.length ? (
          <>
            <Text style={styles.section} accessibilityRole="header">
              {t('chat.share.wantList')}
            </Text>
            {wants.map((v) =>
              row(`w${v.place_type}${v.place_code}`, 'star-outline', placeName(v), t(`chat.cards.place.${v.place_type}`), () => onWant(v), `share-want-${v.place_code}`),
            )}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface },
  handle: { backgroundColor: t.colors.textTertiary },
  content: { paddingHorizontal: t.spacing.lg, gap: t.spacing.sm },
  title: { ...t.type.headline, color: t.colors.textPrimary, marginBottom: t.spacing.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: 16,
    padding: t.spacing.md,
    gap: 4,
    backgroundColor: t.colors.surfaceRaised,
  },
  tileTitle: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  tileHint: { ...t.type.caption, color: t.colors.textSecondary },
  section: { ...t.type.footnote, fontWeight: '600', color: t.colors.textSecondary, textTransform: 'uppercase', marginTop: t.spacing.md },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...t.type.body, color: t.colors.textPrimary },
  rowLine: { ...t.type.footnote, color: t.colors.textSecondary },
}));
