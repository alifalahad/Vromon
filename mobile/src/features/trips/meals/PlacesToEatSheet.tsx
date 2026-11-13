/**
 * "Places to eat nearby" for a meal (docs/trip-upgrades, step 3): restaurants open then, nearest to
 * where the traveller is (the stop before it). Even with a packed lunch, in case of a change of
 * mind: the owner can pick one, and that meal becomes an hour there.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tripsApi } from '../../../services/api';
import type { ItineraryItem } from '../../../types';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { usePlanFormat } from '../plan/usePlanFormat';
import { mealTitle } from './meals';

const SNAP_POINTS = ['70%'];

export function PlacesToEatSheet({
  tripId,
  item,
  canPick,
  busy,
  onPick,
  onClose,
}: {
  tripId: number;
  /** The meal; null when closed */
  item: ItineraryItem | null;
  /** The trip's owner can switch the meal to one of them */
  canPick: boolean;
  busy?: boolean;
  onPick: (restaurantId: number, name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, item != null, onClose);
  const list = useQuery({
    queryKey: ['placesToEat', tripId, item?.id],
    queryFn: () => tripsApi.placesToEat(tripId, item!.id),
    enabled: item != null,
    staleTime: 5 * 60_000,
  });
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );
  const near = list.data?.near;
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('meals.eatNearby')}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="places-to-eat">
        <Text style={styles.title} accessibilityRole="header">
          {t('meals.eatNearby')}
        </Text>
        {item ? (
          <Text style={styles.hint}>
            {[mealTitle(item, t) ?? item.title.split(' at ')[0], f.time(item.start_time), near ? t('meals.near', { place: near }) : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {list.isLoading ? <ActivityIndicator color={colors.link} /> : null}
        {list.isError ? <Text style={styles.hint}>{t('meals.eatNearbyFailed')}</Text> : null}
        {list.data && !list.data.restaurants.length ? <Text style={styles.hint}>{t('meals.eatNearbyNone')}</Text> : null}
        {list.data?.restaurants.map(({ restaurant: r, km }) => {
          const sub = [
            r.cuisine?.replace(/_/g, ' '),
            km != null ? t('plan.awayKm', { km: f.km(km) }) : null,
            r.cost_known === false || r.average_meal_cost == null ? t('plan.priceUnknown') : t('plan.perPerson', { amount: f.money(r.average_meal_cost) }),
            r.opening_time && r.closing_time ? `${f.time(r.opening_time)}–${f.time(r.closing_time)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const body = (
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={2}>
                {r.name}
              </Text>
              <Text style={styles.sub}>{sub}</Text>
            </View>
          );
          return canPick ? (
            <PressableScale
              key={r.id}
              haptic="selection"
              disabled={busy}
              onPress={() => onPick(r.id, r.name)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}. ${sub}. ${t('meals.eatHere')}`}
              testID={`eat-at-${r.id}`}
            >
              {body}
              <Text style={styles.link}>{t('meals.eatHere')}</Text>
            </PressableScale>
          ) : (
            <View key={r.id} style={styles.row} accessible accessibilityLabel={`${r.name}. ${sub}`}>
              {body}
            </View>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary },
  hint: { ...t.type.callout, color: t.colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 64, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  name: { ...t.type.body, fontWeight: '600', color: t.colors.textPrimary },
  sub: { ...t.type.footnote, color: t.colors.textSecondary },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
}));
