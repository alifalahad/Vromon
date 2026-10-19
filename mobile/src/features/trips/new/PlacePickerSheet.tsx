/**
 * Pick a place of the destination: for a must-see, or for the skip list. A list
 * of every place (with its opening hours and visit length) and a search. Places
 * already chosen are left out.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Place } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { topicIcon } from './icons';

const SNAP_POINTS = ['70%', '92%'];

export function PlacePickerSheet({
  visible,
  title,
  places,
  exclude,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  places: readonly Place[];
  exclude: readonly number[];
  onPick: (place: Place) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const [text, setText] = useState('');
  // A new key empties the search box for the next time the sheet opens
  const [inputKey, setInputKey] = useState(0);
  const picked = useRef<Place | null>(null);

  const q = text.trim().toLowerCase();
  const shown = places.filter((p) => !exclude.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
      onDismiss={() => {
        handleDismiss();
        setText('');
        setInputKey((k) => k + 1);
        const place = picked.current;
        picked.current = null;
        if (place) onPick(place);
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={title}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
          {/* Not a controlled input: rewriting the text on every key confuses some keyboards' predictions */}
          <BottomSheetTextInput
            key={inputKey}
            defaultValue=""
            onChangeText={setText}
            placeholder={t('newTrip.searchPlaces')}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            accessibilityLabel={t('newTrip.searchPlaces')}
            testID="place-search"
            returnKeyType="search"
          />
        </View>
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {shown.length === 0 && <Text style={styles.muted}>{t('newTrip.noPlaces')}</Text>}
        {shown.map((p) => {
          const meta = [
            p.category,
            p.hours_known === false
              ? t('plan.hoursUnknown')
              : p.opening_time && p.closing_time
                ? t('newTrip.openHours', { from: f.time(p.opening_time), to: f.time(p.closing_time) })
                : null,
            p.average_visit_duration ? t('newTrip.about', { dur: f.duration(p.average_visit_duration * 60) }) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <PressableScale
              key={p.id}
              style={styles.row}
              onPress={() => {
                picked.current = p;
                Keyboard.dismiss();
                ref.current?.dismiss();
              }}
              accessibilityLabel={`${p.name}. ${meta}`}
              testID={`pick-place-${p.id}`}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons name={topicIcon(p.category)} size={22} color={colors.link} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.meta}>{meta}</Text>
              </View>
            </PressableScale>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  header: { paddingHorizontal: t.spacing.lg + 2, gap: t.spacing.md, paddingBottom: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: 48,
    paddingHorizontal: t.spacing.md,
    borderRadius: 14,
    backgroundColor: t.scheme === 'dark' ? t.colors.bg : t.colors.surfaceInset,
  },
  input: { flex: 1, ...t.type.body, color: t.colors.textPrimary, paddingVertical: t.spacing.sm },
  body: { paddingHorizontal: t.spacing.lg, gap: t.spacing.sm },
  muted: { ...t.type.callout, color: t.colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: 16,
    backgroundColor: t.scheme === 'dark' ? t.colors.bg : '#F3F3F5',
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: t.colors.textPrimary },
  meta: { fontSize: 13, color: t.colors.textSecondary },
}));
