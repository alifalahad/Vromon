/**
 * Pick a time from a short grid (no typing): the arrival and leaving times, the
 * day's start and end, a must-see's exact time, a busy time. An optional first
 * choice stands for "no time" (for example "Morning" = the usual start).
 */

import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { localDigits } from '../features/trips/plan/usePlanFormat';
import { haptics } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles } from './theme';
import { useSheetPresentation } from './useSheetPresentation';

export function TimeSheet({
  visible,
  title,
  times,
  selected,
  none,
  onSelect,
  onClose,
  testID = 'time-sheet',
}: {
  visible: boolean;
  title: string;
  times: readonly string[];
  selected: string | null;
  /** A first choice meaning "no time" */
  none?: string;
  onSelect: (time: string | null) => void;
  onClose: () => void;
  testID?: string;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />
    ),
    [],
  );

  const pick = (value: string | null) => {
    onSelect(value);
    ref.current?.dismiss();
  };

  const chip = (value: string | null, label: string) => {
    const on = value === selected;
    return (
      <PressableScale
        key={value ?? 'none'}
        haptic="selection"
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        testID={`${testID}-${value ?? 'none'}`}
        style={[styles.chip, value === null && styles.chipWide, on && styles.chipOn]}
        onPress={() => pick(value)}
      >
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      </PressableScale>
    );
  };

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      maxDynamicContentSize={560}
      onDismiss={handleDismiss}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={title}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {none ? chip(null, none) : null}
          {times.map((time) => chip(time, localDigits(time, i18n.language)))}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary, marginBottom: t.spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  chip: {
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    flexBasis: '22%',
    flexGrow: 1,
  },
  chipWide: { flexBasis: '100%' },
  chipOn: { backgroundColor: t.colors.accent },
  chipText: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  chipTextOn: { color: t.colors.onAccent },
}));
