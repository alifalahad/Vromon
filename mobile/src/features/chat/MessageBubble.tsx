/**
 * A chat's rows (mockup 5): message bubbles, cards (cards/), day separators, Vromon's
 * own lines and "typing…". Yours are on the right in the strong accent; theirs on the
 * left. The last bubble of a run carries the time, your ticks and the tail corner; a
 * card always shows its time.
 *
 * Step 5 (mockup 7): press and hold for the menu, swipe right to reply, a quote of
 * the message a reply answers, and a chip with the reactions (tap or hold it to see
 * who). Screen readers get the menu and Reply as actions.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type AccessibilityActionEvent } from 'react-native';

import { Avatar } from '../../ui/Avatar';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { SENDER_NAMES } from '../../ui/theme/tokens';
import { usePlanFormat } from '../trips/plan/usePlanFormat';
import { ChatCard } from './cards/ChatCard';
import { cardSummary, isCard, timeLabel, type Bubble, type BubbleStatus } from './format';
import { quoteText, reactionCounts, reactionsLabel } from './reactions';
import { SwipeToReply } from './SwipeToReply';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const STATUS_ICON: Record<BubbleStatus, Icon> = {
  sending: 'clock-outline',
  waiting: 'clock-alert-outline',
  failed: 'alert-circle',
  sent: 'check',
  read: 'check-all',
};

/** What the chat screen does with a saved message */
export type BubbleHandlers = {
  me: string;
  /** A person's name in this chat ("You" for you) */
  nameOf: (id: string | null) => string;
  onMenu: (bubble: Bubble) => void;
  onReply: (bubble: Bubble) => void;
  onReactors: (bubble: Bubble) => void;
  /** A trip room: other people's bubbles carry their name and avatar (step 7) */
  room?: boolean;
};

/** One name colour per person, from their id */
function senderColor(id: string | null, scheme: 'dark' | 'light'): string {
  const colors = SENDER_NAMES[scheme];
  let hash = 0;
  for (const ch of id ?? '') hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export const MessageBubble = React.memo(function MessageBubble({
  bubble,
  senderName,
  conversationId,
  onUnsentPress,
  handlers,
}: {
  bubble: Bubble;
  /** Who sent it, for screen readers */
  senderName: string;
  conversationId: number;
  /** Yours, still waiting or refused: try it again now, or delete it */
  onUnsentPress: (clientId: string) => void;
  handlers?: BubbleHandlers;
}) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  // Bubbles and handlers keep their identity, so this does too and the swipe isn't attached again
  const swipeReply = useCallback(() => handlers?.onReply(bubble), [handlers, bubble]);

  if (bubble.kind === 'system') {
    return (
      <Text style={styles.system} accessibilityRole="text">
        {bubble.body}
      </Text>
    );
  }

  const time = timeLabel(bubble.createdAt, i18n.language);
  const card = isCard(bubble.kind) && !bubble.deleted ? bubble.kind : null;
  const text = bubble.deleted ? t('chat.messageRemoved') : card ? cardSummary(card, bubble.payload, t, i18n.language) : (bubble.body ?? '');
  const status = bubble.status;
  const quote = bubble.replyTo && !bubble.deleted ? bubble.replyTo : null;
  const quoteName = quote && handlers ? handlers.nameOf(quote.sender_id) : senderName;
  const quoteLine = quote ? quoteText(quote, t, i18n.language) : '';
  const replyLabel = quote ? `${t('chat.reply.label', { name: quoteName, text: quoteLine })} ` : '';
  const label =
    replyLabel +
    (bubble.mine
      ? t('chat.messageFromYou', { time, text, status: status ? t(`chat.${status}`) : '' })
      : t('chat.messageFrom', { name: senderName, time, text }));
  const failed = status === 'failed' && bubble.clientId;
  const unsent = (status === 'waiting' || status === 'failed') && bubble.clientId;
  // Only a saved message that's still there has a menu, replies and reactions
  const live = !!handlers && bubble.id != null && !bubble.deleted;
  const counts = live ? reactionCounts(bubble.reactions) : [];
  const actions = live
    ? [
        { name: 'longpress', label: t('chat.menu.open') },
        { name: 'reply', label: t('chat.menu.reply') },
      ]
    : undefined;
  const onAction = (e: AccessibilityActionEvent) => {
    if (!handlers) return;
    if (e.nativeEvent.actionName === 'longpress') handlers.onMenu(bubble);
    if (e.nativeEvent.actionName === 'reply') handlers.onReply(bubble);
  };
  // The time and ticks are in the bubble's (or card's) label already. Hidden from screen readers,
  // so a card's footer isn't read again by its long-press area, tick glyph and all (step 10)
  const meta = (
    <View style={styles.meta} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text style={[styles.time, bubble.mine && (card ? styles.timeCardMine : styles.timeMine)]}>{time}</Text>
      {status ? (
        <MaterialCommunityIcons
          name={STATUS_ICON[status]}
          size={15}
          color={!bubble.mine ? colors.textSecondary : card ? colors.cardEyebrowMine : colors.onAccent}
        />
      ) : null}
    </View>
  );
  const quoteBlock = quote ? (
    <View style={[styles.quote, bubble.mine && !card ? styles.quoteMine : styles.quoteTheirs]} testID={`chat-quote-${bubble.id ?? bubble.clientId}`}>
      <Text style={[styles.quoteName, bubble.mine && !card && styles.quoteNameMine]} numberOfLines={1}>
        {quoteName}
      </Text>
      <Text style={[styles.quoteText, bubble.mine && !card && styles.quoteTextMine]} numberOfLines={2}>
        {quoteLine}
      </Text>
    </View>
  ) : null;

  const body = card ? (
    <ChatCard
      kind={card}
      payload={bubble.payload}
      mine={bubble.mine}
      tail={bubble.lastInRun}
      footer={meta}
      senderId={bubble.senderId}
      pending={bubble.id == null}
      messageId={bubble.id}
      conversationId={conversationId}
      votes={bubble.votes}
      labelPrefix={
        replyLabel +
        (bubble.mine ? `${t('chat.cards.fromYou', { time })}${status ? `${t(`chat.${status}`)}. ` : ''}` : t('chat.cards.from', { name: senderName, time }))
      }
      testKey={bubble.id != null ? String(bubble.id) : (bubble.clientId ?? '')}
      a11yActions={actions}
      onA11yAction={onAction}
    />
  ) : (
    <View
      style={[
        styles.bubble,
        bubble.mine ? styles.mine : styles.theirs,
        bubble.lastInRun && (bubble.mine ? styles.mineTail : styles.theirsTail),
        failed ? styles.failedBubble : null,
      ]}
    >
      {quoteBlock}
      {/* The bubble's label already says it, so the text isn't a second TalkBack stop; Copy is in the menu */}
      <Text style={[styles.text, bubble.mine && styles.textMine, bubble.deleted && styles.removed]} accessible={false} importantForAccessibility="no">
        {text}
      </Text>
      {bubble.lastInRun || status === 'waiting' || failed ? meta : null}
    </View>
  );

  const inRoom = !!handlers?.room && !bubble.mine;
  const row = (
    <View
      style={[
        styles.wrap,
        bubble.mine ? styles.wrapMine : styles.wrapTheirs,
        inRoom && styles.wrapInRoom,
        bubble.lastInRun || counts.length ? styles.runEnd : null,
      ]}
    >
      {card ? quoteBlock : null}
      {unsent ? (
        <PressableScale
          pressEffect="opacity"
          haptic="light"
          onPress={() => onUnsentPress(bubble.clientId!)}
          accessibilityRole="button"
          accessibilityLabel={failed && bubble.error ? `${label}. ${bubble.error}` : label}
          accessibilityHint={t('chat.unsentHint')}
          testID={failed ? `chat-failed-${bubble.clientId}` : `chat-pending-${bubble.clientId}`}
        >
          {body}
        </PressableScale>
      ) : live ? (
        // Hold for the menu. A card's heading (which carries the menu as an action) and its buttons
        // stay separate stops for screen readers; the card's long-press area isn't one more
        <PressableScale
          pressEffect="none"
          haptic="none"
          onLongPress={() => handlers!.onMenu(bubble)}
          delayLongPress={350}
          accessible={!card}
          importantForAccessibility={card ? 'no' : 'auto'}
          accessibilityRole="text"
          accessibilityLabel={card ? undefined : label}
          accessibilityActions={card ? undefined : actions}
          onAccessibilityAction={card ? undefined : onAction}
          testID={`chat-message-${bubble.id}`}
        >
          {body}
        </PressableScale>
      ) : (
        <View
          accessible={!card}
          accessibilityLabel={card ? undefined : label}
          testID={bubble.id != null ? `chat-message-${bubble.id}` : `chat-pending-${bubble.clientId}`}
        >
          {body}
        </View>
      )}
      {counts.length ? (
        <PressableScale
          pressEffect="opacity"
          haptic="selection"
          onPress={() => handlers!.onReactors(bubble)}
          onLongPress={() => handlers!.onReactors(bubble)}
          style={[styles.chip, bubble.mine ? styles.chipMine : styles.chipTheirs]}
          accessibilityRole="button"
          accessibilityLabel={reactionsLabel(bubble.reactions, t, f.n)}
          accessibilityHint={t('chat.reactions.hint')}
          testID={`chat-reactions-${bubble.id}`}
        >
          {counts.map((r) => (
            <Text key={r.kind} style={styles.chipText}>
              {r.emoji} {f.n(r.count)}
            </Text>
          ))}
        </PressableScale>
      ) : null}
      {status === 'waiting' || failed ? (
        <Text style={[styles.note, failed ? styles.noteFailed : null]}>{failed ? (bubble.error ?? t('chat.failed')) : t('chat.waiting')}</Text>
      ) : null}
    </View>
  );

  // In a trip room: the sender's name over their first bubble, their face beside the last
  const content = inRoom ? (
    <View style={styles.roomRow}>
      {bubble.lastInRun ? <Avatar name={senderName} id={bubble.senderId ?? undefined} size={28} /> : <View style={styles.faceSpace} />}
      <View style={styles.roomColumn}>
        {bubble.firstInRun ? (
          <Text style={[styles.sender, { color: senderColor(bubble.senderId, scheme) }]} numberOfLines={1} importantForAccessibility="no">
            {senderName}
          </Text>
        ) : null}
        {row}
      </View>
    </View>
  ) : (
    row
  );

  if (!live) return content;
  // Swipe right to reply
  return (
    <SwipeToReply onReply={swipeReply} iconColor={colors.textSecondary}>
      {content}
    </SwipeToReply>
  );
});

/** A date between messages: "Today", "Yesterday", "Monday", "2 Nov". */
export function DayPill({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.dayWrap} accessibilityRole="header">
      <Text style={styles.day}>{label}</Text>
    </View>
  );
}

/** "typing…" as a small bubble on their side. */
export function TypingBubble({ name }: { name: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.wrap, styles.wrapTheirs, styles.runEnd]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('chat.typingName', { name })}
      testID="chat-typing"
    >
      <View style={[styles.bubble, styles.theirs, styles.theirsTail, styles.dots]}>
        <View style={[styles.dot, { opacity: 0.9 }]} />
        <View style={[styles.dot, { opacity: 0.65 }]} />
        <View style={[styles.dot, { opacity: 0.4 }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.spacing.md, marginTop: 2 },
  wrapInRoom: { paddingLeft: 0 },
  roomRow: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: t.spacing.md, gap: 6 },
  roomColumn: { flex: 1 },
  faceSpace: { width: 28 },
  sender: { ...t.type.footnote, fontWeight: '600', marginTop: t.spacing.sm, marginBottom: 2, marginLeft: 4 },
  wrapMine: { alignItems: 'flex-end' },
  wrapTheirs: { alignItems: 'flex-start' },
  runEnd: { marginBottom: 6 },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 7 },
  mine: { backgroundColor: t.colors.bubbleMine },
  theirs: { backgroundColor: t.colors.bubbleTheirs },
  mineTail: { borderBottomRightRadius: 6 },
  theirsTail: { borderBottomLeftRadius: 6 },
  failedBubble: { opacity: 0.75 },
  text: { ...t.type.body, fontSize: 16, lineHeight: 22, color: t.colors.textPrimary },
  textMine: { color: t.colors.onAccent },
  removed: { fontStyle: 'italic', opacity: 0.85 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  time: { ...t.type.caption, fontSize: 11, color: t.colors.textSecondary },
  timeMine: { color: t.colors.onAccent },
  timeCardMine: { color: t.colors.cardMineText2 },
  note: { ...t.type.caption, color: t.colors.textSecondary, marginTop: 3 },
  noteFailed: { color: t.colors.danger },
  system: { ...t.type.caption, color: t.colors.textSecondary, textAlign: 'center', marginVertical: t.spacing.sm, paddingHorizontal: t.spacing.xl },
  dayWrap: { alignItems: 'center', marginVertical: t.spacing.md },
  day: {
    ...t.type.caption,
    color: t.colors.textSecondary,
    backgroundColor: t.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingLeft: 8, paddingRight: 6, paddingVertical: 4, marginBottom: 6, maxWidth: 288 },
  quoteMine: { borderLeftColor: t.colors.onAccent, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  quoteTheirs: { borderLeftColor: t.colors.onAccentSoft, backgroundColor: t.colors.surfaceInset },
  quoteName: { ...t.type.caption, fontWeight: '700', color: t.colors.onAccentSoft },
  quoteNameMine: { color: t.colors.onAccent },
  quoteText: { ...t.type.caption, fontSize: 13, color: t.colors.textSecondary },
  quoteTextMine: { color: t.colors.onAccent },
  chip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: t.colors.bg,
    backgroundColor: t.colors.surfaceRaised,
  },
  chipMine: { marginRight: 12 },
  chipTheirs: { marginLeft: 12 },
  chipText: { ...t.type.caption, fontSize: 13, color: t.colors.textPrimary },
  dots: { flexDirection: 'row', gap: 5, paddingVertical: 13 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.colors.textSecondary },
}));
