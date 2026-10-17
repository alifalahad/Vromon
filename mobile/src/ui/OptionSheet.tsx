/**
 * Single-choice bottom sheet (Appearance, Language, Units). Built on
 * @gorhom/bottom-sheet: drag to dismiss, tap the backdrop to close.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';
import { useSheetPresentation } from './useSheetPresentation';

export type Option<T extends string> = { value: T; label: string };

export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  footnote,
}: {
  visible: boolean;
  title: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  footnote?: string;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleDismiss = useSheetPresentation(ref, visible, onClose);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={handleDismiss}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={title}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View accessibilityRole="radiogroup">
          {options.map((o) => {
            const on = o.value === selected;
            return (
              <PressableScale
                key={o.value}
                haptic="selection"
                pressEffect="opacity"
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
                testID={`option-${o.value}`}
                style={styles.option}
                onPress={() => {
                  onSelect(o.value);
                  ref.current?.dismiss();
                }}
              >
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{o.label}</Text>
                {on ? <MaterialCommunityIcons name="check" size={24} color={colors.link} /> : null}
              </PressableScale>
            );
          })}
        </View>
        {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary, marginBottom: t.spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  optionLabel: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary },
  optionLabelOn: { color: t.colors.link, fontWeight: '600' },
  footnote: { ...t.type.footnote, color: t.colors.textSecondary, marginTop: t.spacing.md },
}));
