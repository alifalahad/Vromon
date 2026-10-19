/**
 * How to get to the next stop: walk, rickshaw, CNG or a hired car, each with its
 * time and fare, and what choosing it does to the rest of the day ("Arrive 12:10.
 * Nothing else moves." / "Lunch moves 30 min later."). Times and fares other than
 * the road distance and driving time are estimates, and the sheet says so.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tripsApi } from '../../../services/api';
import type { LegOptions, TravelMode } from '../../../types';
import { Button } from '../../../ui/Button';
import { haptics } from '../../../ui/haptics';
import { PressableScale } from '../../../ui/PressableScale';
import { makeStyles, useTheme } from '../../../ui/theme';
import { useSheetPresentation } from '../../../ui/useSheetPresentation';
import { MODE_ICON } from './PlanRows';
import { stopTitle } from './timeline';
import { usePlanFormat } from './usePlanFormat';

export function LegSheet({
  tripId,
  itemId,
  onClose,
  onPick,
}: {
  tripId: number;
  /** The stop the leg leaves from; null when closed */
  itemId: number | null;
  onClose: () => void;
  /** The chosen mode (null: let the app choose), applied after the sheet has closed */
  onPick: (itemId: number, mode: TravelMode | null, leg: LegOptions) => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, itemId !== null, onClose);
  const [picked, setPicked] = useState<TravelMode | null>(null);
  const apply = useRef<{ itemId: number; mode: TravelMode | null; leg: LegOptions } | null>(null);

  const leg = useQuery({
    queryKey: ['leg', tripId, itemId],
    queryFn: () => tripsApi.leg(tripId, itemId!),
    enabled: itemId !== null,
  });
  const data = leg.data;
  const selected = picked ?? data?.mode ?? null;
  const option = data?.options.find((o) => o.mode === selected);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  const effect = () => {
    if (!option) return null;
    const arrive = t('plan.legArrive', { time: f.time(option.arrive) });
    if (!option.moves.length) return `${arrive} ${t('plan.legNothingMoves')}`;
    const first = option.moves[0];
    const name = stopTitle({ item_type: first.item_type, title: first.title, restaurant: null });
    const moved = t('plan.legMoves', { name, time: f.duration(first.minutes_later) });
    const more = option.moves.length > 1 ? ` ${t('plan.legMovesMore', { count: option.moves.length - 1, n: f.n(option.moves.length - 1) })}` : '';
    return `${arrive} ${moved}${more}`;
  };
  const changed = data && selected !== data.mode;

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={() => {
        handleDismiss();
        setPicked(null);
        const a = apply.current;
        apply.current = null;
        if (a) onPick(a.itemId, a.mode, a.leg);
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('plan.legSheet')}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {leg.isLoading && <ActivityIndicator color={colors.link} style={styles.loading} />}
        {leg.isError && <Text style={styles.error}>{(leg.error as Error).message}</Text>}
        {data && (
          <>
            <View style={styles.head}>
              <Text style={styles.kicker}>
                {data.source === 'road'
                  ? t('plan.legLeaveRoad', { time: f.time(data.leave), km: f.km(data.km) })
                  : t('plan.legLeaveEstimate', { time: f.time(data.leave), km: f.km(data.km) })}
              </Text>
              <Text style={styles.title} accessibilityRole="header">
                {t('plan.legTitle', { from: data.from, to: data.to })}
              </Text>
            </View>
            <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('plan.legSheet')}>
              {data.options.map((o) => {
                const on = o.mode === selected;
                const price = o.fare ? t('plan.legFare', { amount: f.money(o.fare) }) : t('plan.legFree');
                const note = o.recommended ? t('plan.legRecommended') : t(`plan.modeNote.${o.mode}`);
                return (
                  <PressableScale
                    key={o.mode}
                    haptic="selection"
                    onPress={() => setPicked(o.mode)}
                    style={[styles.option, on && styles.optionOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t(`plan.modes.${o.mode}`)}, ${f.duration(o.minutes)}, ${price}. ${note}`}
                    testID={`leg-mode-${o.mode}`}
                  >
                    <MaterialCommunityIcons name={MODE_ICON[o.mode]} size={24} color={on ? colors.link : colors.textSecondary} />
                    <View style={styles.optionText}>
                      <Text style={styles.optionLabel}>{t(`plan.modes.${o.mode}`)}</Text>
                      <Text style={styles.optionNote}>{note}</Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionTime}>{f.duration(o.minutes)}</Text>
                      <Text style={styles.optionNote}>{price}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
            {option && (
              <Text style={[styles.effect, option.moves.length > 0 && styles.effectWarn]} accessibilityLiveRegion="polite">
                {effect()}
              </Text>
            )}
            <Button
              label={t('plan.legUse')}
              disabled={!changed}
              onPress={() => {
                apply.current = { itemId: data.item_id, mode: selected, leg: data };
                ref.current?.dismiss();
              }}
              testID="leg-use"
            />
            {data.chosen && (
              <PressableScale
                pressEffect="opacity"
                haptic="selection"
                onPress={() => {
                  apply.current = { itemId: data.item_id, mode: null, leg: data };
                  ref.current?.dismiss();
                }}
                style={styles.reset}
                accessibilityRole="button"
                testID="leg-reset"
              >
                <Text style={styles.link}>{t('plan.legLetChoose')}</Text>
              </PressableScale>
            )}
            <Text style={styles.footnote}>{t('plan.legEstimates')}</Text>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.lg },
  loading: { marginVertical: t.spacing.xl },
  error: { ...t.type.callout, color: t.colors.danger },
  head: { gap: 4 },
  kicker: { ...t.type.footnote, color: t.colors.textSecondary },
  title: { ...t.type.title, color: t.colors.textPrimary },
  options: { gap: t.spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: 60,
    paddingHorizontal: t.spacing.md,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceInset,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionOn: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  optionNote: { ...t.type.footnote, color: t.colors.textSecondary },
  optionRight: { alignItems: 'flex-end', gap: 2 },
  optionTime: { ...t.type.callout, fontWeight: '700', color: t.colors.textPrimary },
  effect: { ...t.type.callout, color: t.colors.textPrimary },
  effectWarn: { color: t.colors.warning },
  reset: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  link: { ...t.type.callout, fontWeight: '600', color: t.colors.link },
  footnote: { ...t.type.footnote, color: t.colors.textTertiary },
}));
