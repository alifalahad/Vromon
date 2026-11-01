/**
 * A message arrived in a chat that isn't open (friends-chat step 9): a small banner at
 * the top says who and what for a few seconds; tapping it opens the chat. It works
 * without push, from the live socket, and is the only notice while Vromon is open.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Conversation } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { chatName, preview } from './format';
import { chatKeys, type Thread } from './queries';
import { useChatBanner } from './state';

export const BANNER_MS = 4000;

export function ChatBanner({ me }: { me: string }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const banner = useChatBanner((s) => s.banner);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => useChatBanner.setState({ banner: null }), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  const chat = client.getQueryData<Conversation[]>(chatKeys.list)?.find((c) => c.id === banner.conversationId);
  const message =
    chat?.last_message?.id === banner.messageId
      ? chat.last_message
      : client.getQueryData<Thread>(chatKeys.thread(banner.conversationId))?.messages.find((m) => m.id === banner.messageId);
  if (!chat || !message) return null;
  const name = chatName(chat, t);
  const sender = chat.kind === 'trip' ? (chat.members?.find((m) => m.id === message.sender_id) ?? null) : chat.other;
  const title = chat.kind === 'trip' ? `${sender?.display_name || sender?.username || ''} · ${name}` : name;
  const line = preview({ ...chat, last_message: { ...message, sender_id: message.sender_id } }, me, t, i18n.language).text;
  const open = () => {
    useChatBanner.setState({ banner: null });
    router.push({ pathname: '/chat/[id]', params: { id: String(chat.id) } });
  };

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(180)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(160)}
      style={[styles.wrap, { top: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        onPress={open}
        style={styles.banner}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${title}: ${line}`}
        accessibilityHint={t('chat.banner.hint')}
        testID="chat-banner"
      >
        <Avatar name={sender?.display_name || sender?.username || name} id={sender?.id} size={36} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {line}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { position: 'absolute', left: t.spacing.md, right: t.spacing.md },
  banner: {
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    elevation: 8,
    shadowColor: t.colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  text: { flex: 1, gap: 1 },
  title: { ...t.type.footnote, fontWeight: '700', color: t.colors.textPrimary },
  line: { ...t.type.footnote, color: t.colors.textSecondary },
}));
