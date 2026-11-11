/**
 * One chat in the Friends tab's list (mockup 1): avatar, name, the last message or
 * "typing…", its time, your read ticks, and the unread count. Muted chats show a
 * bell and a grey count.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Conversation } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { chatName, listTime, preview } from './format';
import { useTypingIn } from './state';

/**
 * Memoized, with `onOpen` taking the chat's id, so a list of 100 chats doesn't draw every
 * row again whenever the Friends tab does (step 10): only a chat that changed draws again.
 */
export const ChatRow = React.memo(function ChatRow({
  conversation,
  me,
  now,
  onOpen,
}: {
  conversation: Conversation;
  me: string;
  now: Date;
  onOpen: (id: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const typing = useTypingIn(conversation.id) !== null;
  const name = chatName(conversation, t);
  const line = preview(conversation, me, t, i18n.language);
  const last = conversation.last_message;
  const unread = conversation.unread_count;
  const muted = !!conversation.muted_until && Date.parse(conversation.muted_until) > now.getTime();
  const mineLast = !!last && last.sender_id === me && !last.deleted && last.kind !== 'system';
  const readByThem = mineLast && (conversation.other_read_up_to ?? 0) >= last.id;
  const time = last ? listTime(last.created_at, now, t, i18n.language) : '';
  const label = [
    name,
    typing ? t('chat.typing') : line.text,
    time,
    mineLast ? t(readByThem ? 'chat.read' : 'chat.sent') : null,
    unread > 0 ? t('chat.unread', { count: unread, n: f.n(unread) }) : null,
    muted ? t('chat.muted') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      style={styles.row}
      onPress={() => onOpen(conversation.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`chat-${conversation.kind === 'trip' ? `room-${conversation.trip_id}` : (conversation.other?.username ?? conversation.id)}`}
    >
      {conversation.kind === 'trip' ? (
        // A trip room (step 7): the trip, not a face
        <View style={styles.room}>
          <MaterialCommunityIcons name="map-marker-path" size={26} color={colors.onAccentSoft} />
        </View>
      ) : (
        <Avatar name={name} id={conversation.other?.id} uri={conversation.other?.avatar_url} size={52} />
      )}
      <View style={styles.middle}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {muted ? <MaterialCommunityIcons name="bell-off-outline" size={16} color={colors.textTertiary} /> : null}
        </View>
        {typing ? (
          <Text style={styles.typing} numberOfLines={1}>
            {t('chat.typing')}
          </Text>
        ) : (
          <View style={styles.line}>
            {mineLast ? (
              <MaterialCommunityIcons name={readByThem ? 'check-all' : 'check'} size={16} color={readByThem ? colors.link : colors.textTertiary} />
            ) : null}
            <Text style={[styles.preview, unread > 0 && styles.previewUnread, line.quiet && styles.previewQuiet]} numberOfLines={1}>
              {line.text}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.side}>
        <Text style={[styles.time, unread > 0 && !muted && styles.timeUnread]}>{time}</Text>
        {unread > 0 ? (
          <View style={[styles.badge, muted && styles.badgeMuted]}>
            <Text style={[styles.badgeText, muted && styles.badgeTextMuted]}>{f.n(unread)}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
});

const useStyles = makeStyles((t) => ({
  room: { width: 52, height: 52, borderRadius: 16, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md + 2, paddingHorizontal: t.spacing.lg + 2, minHeight: 76, paddingVertical: t.spacing.sm },
  middle: { flex: 1, gap: 3, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { ...t.type.headline, color: t.colors.textPrimary, flexShrink: 1 },
  preview: { ...t.type.callout, color: t.colors.textSecondary, flexShrink: 1 },
  previewUnread: { color: t.colors.textPrimary },
  previewQuiet: { fontStyle: 'italic' },
  typing: { ...t.type.callout, color: t.colors.link },
  side: { alignItems: 'flex-end', gap: 6, alignSelf: 'stretch', justifyContent: 'center' },
  time: { ...t.type.caption, color: t.colors.textTertiary },
  timeUnread: { color: t.colors.link, fontWeight: '600' },
  badge: {
    minWidth: 22,
    // Grows with large text instead of cutting the number off
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: t.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Light mode's raised surface is white, like the row
  badgeMuted: { backgroundColor: t.scheme === 'dark' ? t.colors.surfaceRaised : t.colors.surfaceInset },
  badgeText: { ...t.type.caption, fontWeight: '700', color: t.colors.onAccent },
  badgeTextMuted: { color: t.colors.textPrimary },
}));
