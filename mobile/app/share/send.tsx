/**
 * "Send to a friend" (mockup 9, "Send a copy"; docs/friends-chat-plan.md, step 4):
 * from the trip menu, the map's place sheet or the destination screen. Shows the card,
 * lets you tick friends (search by name), add a note, and sends the card to each,
 * with the note after it. One friend: their chat opens; several: back where you were.
 *
 * Params: `card`, an OutgoingCard as JSON (src/features/chat/share.ts).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { ChatCard } from '../../src/features/chat/cards/ChatCard';
import { sendCardToFriends, type OutgoingCard } from '../../src/features/chat/share';
import { useFriends } from '../../src/features/friends/queries';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MAX_NOTE = 2000;

export default function SendToFriendsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ card: string }>();
  const card = useMemo(() => {
    try {
      return JSON.parse(params.card ?? '') as OutgoingCard;
    } catch {
      return null;
    }
  }, [params.card]);
  const me = useMe().data;
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const shown = useMemo(() => {
    const q = fold(query.trim().replace(/^@/, ''));
    const all = friends.data ?? [];
    return q ? all.filter((f) => fold(`${f.display_name ?? ''} ${f.username}`).includes(q)) : all;
  }, [friends.data, query]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const send = async () => {
    if (!me || !card || !picked.length || sending) return;
    setSending(true);
    try {
      const chats = await sendCardToFriends(client, me.id, picked, card, note);
      if (chats.length === 1) {
        router.replace({ pathname: '/chat/[id]', params: { id: String(chats[0]) } });
      } else {
        // Back only once the dialog is closed: a dialog shown while the screen closes can
        // leave Android's window not redrawing
        haptics.success();
        Alert.alert(t('chat.share.sentMany', { n: f.n(picked.length) }), undefined, [{ text: t('common.done'), onPress: () => router.back() }], {
          cancelable: false,
        });
      }
    } catch (e) {
      setSending(false);
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  if (!card) return null;
  if (friends.data && friends.data.length === 0) {
    return (
      <View style={styles.center} testID="send-no-friends">
        <MaterialCommunityIcons name="account-group-outline" size={56} color={colors.textTertiary} />
        <Text style={styles.centerText}>{t('chat.share.noFriends')}</Text>
        <Button label={t('chat.addFriends')} onPress={() => router.replace('/friends/add')} />
      </View>
    );
  }

  return (
    // Under a header: the keyboard is measured from the screen's top, so the header counts too
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.screen}>
      <FlatList
        data={shown}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.preview}>
              <ChatCard
                kind={card.kind}
                payload={card.preview}
                mine
                tail
                footer={null}
                senderId={me?.id ?? null}
                pending
                messageId={null}
                conversationId={0}
                votes={null}
                labelPrefix=""
                testKey="preview"
              />
            </View>
            <View style={styles.search}>
              <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
              <TextInput
                autoComplete="off"
                importantForAutofill="no"
                value={query}
                onChangeText={setQuery}
                placeholder={t('chat.searchFriends')}
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('chat.searchFriends')}
                testID="send-search"
              />
            </View>
            {friends.isPending ? <ActivityIndicator color={colors.textSecondary} /> : null}
          </View>
        }
        ListEmptyComponent={query.trim() ? <Text style={styles.empty}>{t('chat.noMatch', { q: query.trim() })}</Text> : null}
        renderItem={({ item }) => {
          const name = item.display_name || item.username;
          const on = picked.includes(item.id);
          return (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              style={styles.row}
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${name}, @${item.username}`}
              testID={`send-friend-${item.username}`}
            >
              <Avatar name={name} id={item.id} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={26}
                color={on ? colors.accentStrong : colors.textTertiary}
              />
            </PressableScale>
          );
        }}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TextInput
          autoComplete="off"
          importantForAutofill="no"
          value={note}
          onChangeText={setNote}
          placeholder={t('chat.share.note')}
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_NOTE}
          // Several lines, growing as you write: with large text one line clipped the hint (step 10)
          multiline
          style={styles.note}
          accessibilityLabel={t('chat.share.note')}
          testID="send-note"
        />
        <Button
          label={picked.length ? t('chat.share.sendToButton', { count: picked.length, n: f.n(picked.length) }) : t('chat.share.pickFriends')}
          onPress={() => void send()}
          disabled={!picked.length}
          loading={sending}
          testID="send-button"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  header: { gap: t.spacing.md, paddingTop: t.spacing.lg },
  preview: { alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    marginHorizontal: t.spacing.lg,
    paddingHorizontal: t.spacing.lg,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surface,
  },
  input: { flex: 1, ...t.type.body, color: t.colors.textPrimary, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 68 },
  rowText: { flex: 1, gap: 2 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  empty: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', padding: t.spacing.xxl },
  footer: { gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, borderTopWidth: 1, borderTopColor: t.colors.divider },
  note: {
    ...t.type.body,
    minHeight: 48,
    maxHeight: 132,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlignVertical: 'center',
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl, backgroundColor: t.colors.bg },
  centerText: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
}));
