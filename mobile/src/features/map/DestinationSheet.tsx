/**
 * Tap the name of a place Vromon can plan (map home step 5): its name, where it
 * is, how many places the plan can choose from, whether a person has checked the
 * data yet, and "Plan a trip here" (the trip wizard, with it chosen).
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveLanguage } from '../../i18n';
import type { Destination } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { usePreferences } from '../preferences/store';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { homeRegionName } from './geoData';

export function DestinationSheet({
  destination,
  onPlan,
  onOpen,
  onClose,
}: {
  destination: Destination | null;
  onPlan: (d: Destination) => void;
  onOpen: (d: Destination) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const insets = useSafeAreaInsets();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const handleDismiss = useSheetPresentation(ref, !!destination, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.3} pressBehavior="close" />,
    [],
  );

  const region = destination?.region_code ? homeRegionName(destination.region_code, lang) : undefined;

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
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 24 }]} testID="destination-sheet">
        {destination ? (
          <>
            <View style={styles.titles}>
              <Text style={styles.eyebrow}>{t('map.destination.eyebrow')}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {destination.name}
              </Text>
              <Text style={styles.subtitle}>{[region, destination.country].filter(Boolean).join(' · ')}</Text>
            </View>
            {destination.place_count != null ? (
              <Text style={styles.line}>{t('map.destination.places', { count: destination.place_count, n: f.n(destination.place_count) })}</Text>
            ) : null}
            {destination.checked === false ? <Text style={styles.note}>{t('map.destination.unchecked')}</Text> : null}
            <View style={styles.buttons}>
              <PressableScale style={styles.primary} onPress={() => onPlan(destination)} testID="destination-plan">
                <Text style={styles.primaryText}>{t('map.dock.planHere')}</Text>
              </PressableScale>
              <PressableScale style={styles.secondary} onPress={() => onOpen(destination)} testID="destination-open">
                <Text style={styles.secondaryText}>{t('map.destination.see')}</Text>
              </PressableScale>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm, gap: t.spacing.md },
  titles: { gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', color: t.colors.link },
  title: { ...t.type.title, fontSize: 26, fontWeight: '800', color: t.colors.textPrimary },
  subtitle: { ...t.type.callout, color: t.colors.textSecondary },
  line: { ...t.type.body, color: t.colors.textPrimary },
  note: { ...t.type.footnote, color: t.colors.textSecondary },
  buttons: { flexDirection: 'row', gap: 10, marginTop: t.spacing.sm },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { ...t.type.headline, fontSize: 16, color: t.colors.onAccent },
  secondary: { minHeight: 52, borderRadius: 26, backgroundColor: t.colors.surfaceInset, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
}));
