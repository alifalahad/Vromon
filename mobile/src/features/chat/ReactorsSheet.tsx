/**
 * Who reacted to a message (tap or hold its reaction chip). Your own row takes your
 * reaction back.
 */

import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactionKind } from '../../types';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { useSheetPresentation } from '../../ui/useSheetPresentation';
import { EMOJI, REACTIONS } from './reactions';

export type Reactor = { id: string; name: string; kind: ReactionKind; mine: boolean };

/** Everyone who reacted, in the order of the reaction bar */
export function reactorsOf(reactions: Record<string, string[]>, me: string, nameOf: (id: string) => string): Reactor[] {
  return REACTIONS.flatMap((r) => (reactions[r.kind] ?? []).map((id) => ({ id, name: nameOf(id), kind: r.kind, mine: id === me })));
}

export function ReactorsSheet({
  visible,
  reactors,
  onRemoveMine,
  onClose,
}: {
  visible: boolean;
  reactors: Reactor[];
  onRemoveMine: () => void;
  onClose: () => void;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const styles = useStyles();
  const { t } = useTranslation();
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
        const run = picked.current;
        picked.current = null;
        run?.();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={t('chat.reactions.title')}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {t('chat.reactions.title')}
        </Text>
        {reactors.map((r) => (
          <PressableScale
            key={`${r.id}-${r.kind}`}
            pressEffect={r.mine ? 'opacity' : 'none'}
            haptic={r.mine ? 'light' : 'none'}
            disabled={!r.mine}
            onPress={() => {
              picked.current = onRemoveMine;
              ref.current?.dismiss();
            }}
            style={styles.row}
            accessibilityRole={r.mine ? 'button' : 'text'}
            accessibilityLabel={`${r.name}, ${t(`chat.reactions.${r.kind}`)}${r.mine ? `. ${t('chat.reactions.tapToRemove')}` : ''}`}
            testID={`reactor-${r.id}`}
          >
            <Text style={styles.emoji}>{EMOJI[r.kind]}</Text>
            <Text style={styles.name}>{r.name}</Text>
            {r.mine ? <Text style={styles.remove}>{t('chat.reactions.tapToRemove')}</Text> : null}
          </PressableScale>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const useStyles = makeStyles((t) => ({
  background: { backgroundColor: t.colors.surface },
  handle: { backgroundColor: t.colors.textTertiary },
  content: { paddingHorizontal: t.spacing.lg, gap: t.spacing.xs },
  title: { ...t.type.headline, color: t.colors.textPrimary, marginBottom: t.spacing.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  emoji: { fontSize: 22 },
  name: { ...t.type.body, flex: 1, color: t.colors.textPrimary },
  remove: { ...t.type.footnote, color: t.colors.onAccentSoft },
}));
