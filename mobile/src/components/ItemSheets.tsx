/**
 * Bottom sheets for one itinerary activity:
 *  - ExplanationSheet: grounded "Why this place?" (Phase 8 RAG endpoint)
 *  - AlternativesSheet: places that fit the same time slot, to replace it
 */

import { MaterialIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, ragApi, tripsApi } from '../services/api';
import type { ItineraryItem } from '../types';
import { haptics } from '../ui/haptics';
import { PressableScale } from '../ui/PressableScale';
import { makeStyles, useTheme } from '../ui/theme';
import { formatBDT } from '../utils/format';

const SNAP_POINTS = ['60%', '90%'];

/** Gesture bottom sheet: drag to resize or dismiss, tap the backdrop to close. Presents on mount. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);

  useEffect(() => {
    ref.current?.present();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={onClose}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        <PressableScale onPress={() => ref.current?.dismiss()} hitSlop={8} accessibilityLabel="Close" style={styles.closeBtn}>
          <MaterialIcons name="close" size={22} color={colors.textPrimary} />
        </PressableScale>
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>{children}</BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export function ExplanationSheet({ tripId, item, onClose }: { tripId: number; item: ItineraryItem; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading, error } = useQuery({
    queryKey: ['explanation', tripId, item.id],
    queryFn: () => ragApi.explainItem(tripId, item.id),
    retry: false,
    staleTime: Infinity,
  });
  const notConfigured = error instanceof ApiError && error.status === 503;
  const { t } = useTranslation();

  return (
    <Sheet title={t('plan.whyTitle', { name: item.title })} onClose={onClose}>
      <Text style={styles.section}>{t('plan.fromPlanner')}</Text>
      {item.recommendation_reasons.filter((r) => !r.includes('CP-SAT') && !r.includes('(penalised)')).map((r, i) => (
        <Text key={i} style={styles.text}>• {r}</Text>
      ))}

      <Text style={styles.section}>{t('plan.fromSources')}</Text>
      {isLoading && <ActivityIndicator color={colors.link} />}
      {notConfigured && <Text style={styles.muted}>{t('plan.explainOff')}</Text>}
      {error && !notConfigured && <Text style={styles.error}>{(error as Error).message}</Text>}
      {data?.status === 'insufficient_evidence' && (
        <Text style={styles.muted}>{t('plan.explainNone')} {data.warnings[0] ?? ''}</Text>
      )}
      {data?.status === 'answered' && (
        <>
          {data.claims.map((c, i) => (
            <Text key={i} style={styles.text}>
              {c.text} <Text style={styles.cite}>[{c.source_labels.join(', ')}]</Text>
            </Text>
          ))}
          <Text style={styles.section}>{t('plan.sources')}</Text>
          {data.sources.map((s) => (
            <View key={s.label} style={styles.source}>
              <Text style={styles.sourceTitle}>[{s.label}] {s.title} · {s.source_type}</Text>
              <Text style={styles.snippet}>{s.snippet}</Text>
            </View>
          ))}
          {data.warnings.length > 0 && <Text style={styles.muted}>{data.warnings.join(' ')}</Text>}
        </>
      )}
    </Sheet>
  );
}

export function AlternativesSheet({
  tripId,
  item,
  onClose,
  onReplaced,
}: {
  tripId: number;
  item: ItineraryItem;
  onClose: () => void;
  onReplaced: (message: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading, error } = useQuery({
    queryKey: ['alternatives', tripId, item.id],
    queryFn: () => tripsApi.alternatives(tripId, item.id),
    retry: false,
  });
  const replace = useMutation({
    mutationFn: (placeId: number) => tripsApi.replaceItem(tripId, item.id, placeId),
    onSuccess: (res) => onReplaced(res.message),
    onError: () => haptics.error(),
  });
  const { t } = useTranslation();

  return (
    <Sheet title={t('plan.swapTitle', { name: item.title })} onClose={onClose}>
      <Text style={styles.muted}>{t('plan.swapHint', { from: item.start_time, to: item.end_time })}</Text>
      {isLoading && <ActivityIndicator color={colors.link} />}
      {error && <Text style={styles.error}>{(error as Error).message}</Text>}
      {data?.is_must_visit && <Text style={styles.error}>{t('plan.swapMustVisit')}</Text>}
      {data && !data.is_must_visit && data.alternatives.length === 0 && <Text style={styles.muted}>{t('plan.swapNone')}</Text>}
      {data?.alternatives.map((alt) => (
        <PressableScale
          key={alt.place.id}
          style={styles.alt}
          testID={`swap-${alt.place.id}`}
          disabled={replace.isPending || data.is_must_visit}
          onPress={() => replace.mutate(alt.place.id)}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.altTitle}>{alt.place.name}</Text>
            <Text style={styles.altMeta}>
              {alt.start_time}–{alt.end_time} · {alt.place.category} ·{' '}
              {alt.place.estimated_cost ? t('plan.perPerson', { amount: formatBDT(alt.place.estimated_cost) }) : t('plan.priceFree')}
            </Text>
            {alt.recommendation_reasons[0] ? <Text style={styles.altReason}>{alt.recommendation_reasons[0]}</Text> : null}
          </View>
          <Text style={styles.use}>{t('plan.swapUse')}</Text>
        </PressableScale>
      ))}
      {replace.isPending && <ActivityIndicator color={colors.link} />}
      {replace.isError && <Text style={styles.error}>{(replace.error as Error).message}</Text>}
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  sheet: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  title: { flex: 1, color: t.colors.textPrimary, fontSize: 17, fontWeight: '800' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  section: { color: t.colors.link, fontWeight: '700', marginTop: 8 },
  text: { color: t.colors.textPrimary, fontSize: 14, lineHeight: 20 },
  muted: { color: t.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: t.colors.danger, fontSize: 13 },
  cite: { color: t.colors.link, fontSize: 12 },
  source: { backgroundColor: t.colors.bg, borderRadius: 10, padding: 10, gap: 4 },
  sourceTitle: { color: t.colors.textPrimary, fontWeight: '600', fontSize: 12 },
  snippet: { color: t.colors.textTertiary, fontSize: 12, lineHeight: 17 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.colors.bg, borderRadius: 16, padding: 12 },
  altTitle: { color: t.colors.textPrimary, fontWeight: '700' },
  altMeta: { color: t.colors.textSecondary, fontSize: 12 },
  altReason: { color: t.colors.textTertiary, fontSize: 11, fontStyle: 'italic' },
  use: { color: t.colors.link, fontWeight: '700' },
}));
