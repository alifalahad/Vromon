/**
 * Add a stop to a day (the "+" in free time, or "Add a stop" at the end of the
 * day): suggestions near the stop before it, best first, or a search. Places
 * already in the trip or excluded from it are never offered.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tripsApi } from '../../../services/api';
import type { Place } from '../../../types';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { forYou } from './timeline';
import { usePlanFormat } from './usePlanFormat';

export type AddTarget = { dayId: number; position: number; nearItemId?: number };

const SNAP_POINTS = ['70%', '92%'];

export function AddStopSheet({
  tripId,
  destination,
  target,
  onClose,
  onAdd,
}: {
  tripId: number;
  destination: string;
  target: AddTarget | null;
  onClose: () => void;
  onAdd: (place: Place, target: AddTarget) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, !!target, onClose);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  // A new key empties the search box for the next time the sheet opens
  const [inputKey, setInputKey] = useState(0);
  const picked = useRef<Place | null>(null);
  // Remembered so the pick can be added after the sheet has closed (target is cleared then)
  const lastTarget = useRef<AddTarget | null>(null);
  useEffect(() => {
    if (target) lastTarget.current = target;
  }, [target]);

  // Search after a short pause in typing
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  const suggestions = useQuery({
    queryKey: ['suggestions', tripId, target?.dayId, target?.nearItemId, query],
    queryFn: () => tripsApi.suggestions(tripId, target!.dayId, { near_item_id: target?.nearItemId, q: query || undefined }),
    enabled: !!target,
  });

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
        const where = lastTarget.current;
        picked.current = null;
        if (place && where) onAdd(place, where);
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('plan.addTitle')}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('plan.addTitle')}
        </Text>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
          {/* Not a controlled input: rewriting the text on every key confuses some keyboards' predictions */}
          <BottomSheetTextInput
            key={inputKey}
            defaultValue=""
            onChangeText={setText}
            placeholder={t('plan.search')}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            accessibilityLabel={t('plan.search')}
            testID="add-search"
            returnKeyType="search"
          />
        </View>
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {suggestions.isLoading && <ActivityIndicator color={colors.link} style={styles.loading} />}
        {suggestions.isError && <Text style={styles.error}>{(suggestions.error as Error).message}</Text>}
        {suggestions.data?.length === 0 && (
          <Text style={styles.muted}>{query ? t('plan.noMatch', { q: query }) : t('plan.noSuggestions', { dest: destination })}</Text>
        )}
        {suggestions.data?.map((s) => {
          const tag = forYou(s.recommendation_reasons);
          const price =
            s.place.cost_known === false
              ? t('plan.priceUnknown')
              : s.place.estimated_cost
                ? t('plan.perPerson', { amount: f.money(s.place.estimated_cost) })
                : t('plan.priceFree');
          const meta = [s.place.category, price, s.distance_km != null ? t('plan.awayKm', { km: f.km(s.distance_km) }) : null].filter(Boolean).join(' · ');
          return (
            <PressableScale
              key={s.place.id}
              style={styles.row}
              onPress={() => {
                picked.current = s.place;
                Keyboard.dismiss();
                ref.current?.dismiss();
              }}
              accessibilityLabel={`${s.place.name}. ${meta}`}
              testID={`add-place-${s.place.id}`}
            >
              <View style={styles.rowText}>
                <Text style={styles.name}>{s.place.name}</Text>
                <Text style={styles.meta}>{meta}</Text>
                {tag ? <Text style={styles.tag}>{t('plan.forYou', { what: tag })}</Text> : null}
              </View>
              <View style={styles.plus}>
                <MaterialCommunityIcons name="plus" size={22} color={colors.link} />
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
  loading: { marginTop: t.spacing.lg },
  error: { ...t.type.callout, color: t.colors.danger },
  muted: { ...t.type.callout, color: t.colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    padding: t.spacing.md,
    borderRadius: 16,
    backgroundColor: t.scheme === 'dark' ? t.colors.bg : '#F3F3F5',
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: t.colors.textPrimary },
  meta: { fontSize: 13, color: t.colors.textSecondary },
  tag: { fontSize: 13, color: t.colors.link },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accentSoft },
}));
