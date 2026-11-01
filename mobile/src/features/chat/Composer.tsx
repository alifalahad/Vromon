/**
 * The message box under a chat (mockup 5): grows with the text up to a few lines,
 * sends with the button, and tells the chat you're typing. Text is limited to the
 * server's 2,000 characters. The + shares a trip, a place, a trip idea or a poll (step 4).
 * A reply shows what it quotes above the box, with a way to cancel it (step 5).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';

export const MAX_TEXT = 2000;

export function Composer({
  onSend,
  onTyping,
  onShare,
  replyTo,
  onCancelReply,
  placeholder,
}: {
  onSend: (text: string) => void;
  onTyping: () => void;
  onShare?: () => void;
  /** The message being replied to: who wrote it and what it says */
  replyTo?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  /** "Message the trip room" in a room */
  placeholder?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const ready = text.trim().length > 0;

  // Starting a reply puts you in the box
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const send = () => {
    if (!ready) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View>
      {replyTo ? (
        <View style={styles.reply} accessibilityLiveRegion="polite" testID="chat-reply-bar">
          <View style={styles.replyText}>
            <Text style={styles.replyName} numberOfLines={1}>
              {t('chat.reply.to', { name: replyTo.name })}
            </Text>
            <Text style={styles.replyLine} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <PressableScale
            pressEffect="opacity"
            haptic="light"
            onPress={onCancelReply}
            style={styles.replyClose}
            accessibilityRole="button"
            accessibilityLabel={t('chat.reply.cancel')}
            testID="chat-reply-cancel"
          >
            <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
          </PressableScale>
        </View>
      ) : null}
      <View style={styles.bar}>
        {onShare ? (
          <PressableScale
            haptic="light"
            onPress={onShare}
            style={styles.share}
            accessibilityRole="button"
            accessibilityLabel={t('chat.share.button')}
            testID="chat-share"
          >
            <MaterialCommunityIcons name="plus" size={24} color={colors.textPrimary} />
          </PressableScale>
        ) : null}
        <TextInput
          ref={input}
          autoComplete="off"
          importantForAutofill="no"
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (value.trim()) onTyping();
          }}
          placeholder={placeholder ?? t('chat.placeholder')}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={MAX_TEXT}
          style={styles.input}
          accessibilityLabel={placeholder ?? t('chat.placeholder')}
          testID="chat-input"
        />
        <PressableScale
          haptic="light"
          onPress={send}
          disabled={!ready}
          style={[styles.send, !ready && styles.sendOff]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          accessibilityState={{ disabled: !ready }}
          testID="chat-send"
        >
          <MaterialCommunityIcons name="send" size={22} color={colors.onAccent} />
        </PressableScale>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm, paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm },
  input: {
    flex: 1,
    ...t.type.body,
    fontSize: 16,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    minHeight: 44,
    maxHeight: 132,
  },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.onAccentSoft,
    borderRadius: 8,
    backgroundColor: t.colors.surface,
  },
  replyText: { flex: 1, paddingVertical: 6 },
  replyName: { ...t.type.caption, fontWeight: '700', color: t.colors.onAccentSoft },
  replyLine: { ...t.type.footnote, color: t.colors.textSecondary },
  replyClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  share: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.45 },
}));
