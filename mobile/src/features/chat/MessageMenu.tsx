/**
 * Press and hold a message (mockup 7): react (heart, thumbs up, laugh, wow, and
 * Want to go on a place or a trip idea), then Reply, Copy, Add to a trip (an
 * attraction), Unsend (yours, within an hour) or Report… (someone else's).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactionKind } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { reactionsFor } from './reactions';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type MenuAction = 'reply' | 'copy' | 'addToTrip' | 'unsend' | 'report';

const ICONS: Record<MenuAction, Icon> = {
  reply: 'reply',
  copy: 'content-copy',
  addToTrip: 'plus',
  unsend: 'delete-outline',
  report: 'flag-outline',
};

export function MessageMenu({
  visible,
  kind,
  preview,
  mine,
  canReact = true,
  actions,
  copyLabel,
  onReact,
  onAction,
  onClose,
}: {
  visible: boolean;
  /** The message's kind ("text", "place", …): which reactions it offers */
  kind: string;
  /** What the message says, in a line */
  preview: string;
  /** Your reaction now */
  mine: ReactionKind | null;
  /** False in a read-only chat */
  canReact?: boolean;
  /** The menu rows, in order */
  actions: MenuAction[];
  /** "Copy text" or "Copy the name" */
  copyLabel: string;
  onReact: (reaction: ReactionKind | null) => void;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
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

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      onDismiss={() => {
        handleDismiss();
        // After the sheet is gone, so a dialog or a new screen isn't hidden behind it
        const run = picked.current;
        picked.current = null;
        run?.();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('chat.menu.title')}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        {canReact ? (
          <View style={styles.reactions} accessibilityRole="radiogroup" accessibilityLabel={t('chat.menu.react')}>
            {reactionsFor(kind).map((r) => {
              const on = mine === r.kind;
              const want = r.kind === 'want';
              return (
                <PressableScale
                  key={r.kind}
                  pressEffect="scale"
                  haptic="selection"
                  onPress={() => pick(() => onReact(on ? null : r.kind))}
                  style={[styles.reaction, want && styles.want, on && styles.reactionOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={want ? t('chat.reactions.wantLabel') : t(`chat.reactions.${r.kind}`)}
                  testID={`menu-react-${r.kind}`}
                >
                  <Text style={styles.emoji}>{r.emoji}</Text>
                  {want ? <Text style={styles.wantText}>{t('chat.cards.place.want')}</Text> : null}
                </PressableScale>
              );
            })}
          </View>
        ) : null}
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
        {actions.map((a) => {
          const label = a === 'copy' ? copyLabel : t(`chat.menu.${a}`);
          return (
            // Named by its words: without a name, screen readers also read the icon's glyph (step 10)
            <PressableScale
              key={a}
              pressEffect="opacity"
              haptic="light"
              onPress={() => pick(() => onAction(a))}
              style={styles.row}
              accessibilityRole="menuitem"
              accessibilityLabel={label}
              testID={`menu-${a}`}
            >
              <MaterialCommunityIcons name={ICONS[a]} size={22} color={a === 'report' ? colors.danger : colors.textPrimary} />
              <Text style={[styles.rowText, a === 'report' && styles.danger]}>{label}</Text>
            </PressableScale>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface },
  handle: { backgroundColor: t.colors.textTertiary },
  content: { paddingHorizontal: t.spacing.lg, gap: t.spacing.xs },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.spacing.sm,
    marginBottom: t.spacing.sm,
  },
  reaction: {
    minWidth: 48,
    // Grows with large text instead of cutting the emoji off
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceRaised,
  },
  want: { paddingHorizontal: 14 },
  reactionOn: {
    backgroundColor: t.colors.accentSoft,
    borderWidth: 1.5,
    borderColor: t.colors.onAccentSoft,
  },
  emoji: { fontSize: 22 },
  wantText: {
    ...t.type.callout,
    fontWeight: '600',
    color: t.colors.textPrimary,
  },
  preview: {
    ...t.type.footnote,
    color: t.colors.textSecondary,
    marginBottom: t.spacing.xs,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  rowText: { ...t.type.body, color: t.colors.textPrimary },
  danger: { color: t.colors.danger },
}));
