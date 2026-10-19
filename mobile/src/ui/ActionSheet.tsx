/**
 * A list of actions in a bottom sheet (the trip's ⋯ menu). Like OptionSheet,
 * but each row runs an action; a `danger` row is red.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from './haptics';
import { PressableScale } from './PressableScale';
import { makeStyles, useTheme } from './theme';
import { useSheetPresentation } from './useSheetPresentation';

export type SheetAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  danger?: boolean;
};

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const handleDismiss = useSheetPresentation(ref, visible, onClose);
  const picked = useRef<(() => void) | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />,
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={() => {
        handleDismiss();
        // Run the action after the sheet is gone, so a dialog or a new screen isn't hidden behind it
        const run = picked.current;
        picked.current = null;
        run?.();
      }}
      onChange={(index) => {
        if (index >= 0) haptics.selection();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={title}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View>
          {actions.map((a) => (
            <PressableScale
              key={a.key}
              pressEffect="opacity"
              haptic="selection"
              style={styles.row}
              testID={`action-${a.key}`}
              onPress={() => {
                picked.current = a.onPress;
                ref.current?.dismiss();
              }}
            >
              <MaterialCommunityIcons name={a.icon} size={24} color={a.danger ? colors.danger : colors.textSecondary} />
              <Text style={[styles.label, a.danger && { color: colors.danger }]}>{a.label}</Text>
            </PressableScale>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { backgroundColor: t.colors.textTertiary, width: 40 },
  content: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm },
  title: { ...t.type.title, color: t.colors.textPrimary, marginBottom: t.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg, minHeight: 56 },
  label: { ...t.type.body, fontSize: 17, color: t.colors.textPrimary, flex: 1 },
}));
