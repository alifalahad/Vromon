/**
 * Plan together (friends-chat step 7, mockup 9): invite friends to a trip's room.
 * Friends who said "I'm in" (or maybe) to a trip idea there come first, ticked; a
 * friend who's away says so. Each gets an invite card, and the note, in their chat;
 * then the room opens. Only you change the plan (decision C1).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../../src/features/account/useMe';
import { ideaAnswers, type IdeaAnswer } from '../../../src/features/chat/ideaAnswers';
import { chatKeys } from '../../../src/features/chat/queries';
import { tripLine } from '../../../src/features/friends/onTheRoad';
import { useFriends, useOnTheRoad } from '../../../src/features/friends/queries';
import { usePlanFormat } from '../../../src/features/trips/plan/usePlanFormat';
import { roomsApi, tripsApi } from '../../../src/services/api';
import type { Friend } from '../../../src/types';
import { Avatar } from '../../../src/ui/Avatar';
import { Button } from '../../../src/ui/Button';
import { haptics } from '../../../src/ui/haptics';
import { PressableScale } from '../../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../../src/ui/theme';
import { notify } from '../../../src/utils/dialogs';

const MAX_NOTE = 2000;
const RANK: Record<IdeaAnswer, number> = { in: 0, maybe: 1 };

export default function InviteScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const client = useQueryClient();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(rawId);
  const me = useMe().data;
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripsApi.get(tripId), enabled: !!tripId });
  const room = useQuery({ queryKey: ['tripRoom', tripId], queryFn: () => roomsApi.members(tripId), enabled: !!tripId });
  const friends = useFriends();
  const road = useOnTheRoad();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const destination = trip.data?.destination ?? '';
  const answers = useMemo(() => (destination && me ? ideaAnswers(client, destination, me.id) : {}), [client, destination, me]);
  const already = useMemo(() => new Map((room.data?.members ?? []).map((m) => [m.user.id, m.status])), [room.data]);
  // Friends who said they're in (or maybe) are ticked until you change the picks
  const ticked = useMemo(() => (friends.data ?? []).filter((x) => answers[x.id] && !already.has(x.id)).map((x) => x.id), [friends.data, answers, already]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (friends.data ?? []).filter((x) => !q || `${x.display_name ?? ''} ${x.username}`.toLowerCase().includes(q));
    return [...all].sort(
      (a, b) =>
        (answers[a.id] ? RANK[answers[a.id]] : 2) - (answers[b.id] ? RANK[answers[b.id]] : 2) ||
        (a.display_name || a.username).localeCompare(b.display_name || b.username),
    );
  }, [friends.data, query, answers]);

  const chosen = picked ?? ticked;
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  const line = (friend: Friend): { text: string; good: boolean } | null => {
    const status = already.get(friend.id);
    if (status === 'joined') return { text: t('tripRoom.inRoom'), good: false };
    if (status === 'invited') return { text: t('tripRoom.invited'), good: false };
    if (answers[friend.id] === 'in') return { text: t('tripRoom.saidIn', { destination }), good: true };
    if (answers[friend.id] === 'maybe') return { text: t('tripRoom.saidMaybe'), good: false };
    const away = road.data?.find((r) => r.friend.id === friend.id);
    return away ? { text: t('tripRoom.away', { line: tripLine(away.trip, t, i18n.language, f.n) }), good: false } : null;
  };

  const send = async () => {
    if (!chosen.length || sending) return;
    setSending(true);
    try {
      const out = await roomsApi.invite(tripId, chosen, note.trim());
      haptics.success();
      void client.invalidateQueries({ queryKey: chatKeys.list });
      void client.invalidateQueries({ queryKey: ['tripRoom', tripId] });
      // Straight into the room, where "You invited …" is the newest line
      if (out.conversation_id != null) router.replace({ pathname: '/chat/[id]', params: { id: String(out.conversation_id) } });
      else router.back();
    } catch (e) {
      setSending(false);
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  if (friends.data && friends.data.length === 0) {
    return (
      <View style={styles.center} testID="invite-no-friends">
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
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.intro}>{t('tripRoom.intro')}</Text>
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
                testID="invite-search"
              />
            </View>
            {friends.isPending || room.isPending ? <ActivityIndicator color={colors.textSecondary} /> : null}
          </View>
        }
        ListEmptyComponent={query.trim() ? <Text style={styles.empty}>{t('chat.noMatch', { q: query.trim() })}</Text> : null}
        renderItem={({ item }) => {
          const name = item.display_name || item.username;
          const inRoom = already.has(item.id);
          const on = inRoom || chosen.includes(item.id);
          const sub = line(item);
          return (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              style={styles.row}
              disabled={inRoom}
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: inRoom }}
              accessibilityLabel={sub ? `${name}. ${sub.text}` : name}
              testID={`invite-friend-${item.username}`}
            >
              <Avatar name={name} id={item.id} uri={item.avatar_url} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.meta, sub?.good && styles.good]} numberOfLines={1}>
                  {sub?.text ?? `@${item.username}`}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={26}
                color={inRoom ? colors.textTertiary : on ? colors.accentStrong : colors.textTertiary}
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
          testID="invite-note"
        />
        <Button
          label={chosen.length ? t('tripRoom.inviteButton', { count: chosen.length, n: f.n(chosen.length) }) : t('chat.share.pickFriends')}
          onPress={() => void send()}
          disabled={!chosen.length}
          loading={sending}
          testID="invite-button"
        />
        <Text style={styles.small}>{t('tripRoom.onlyYou')}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  header: { gap: t.spacing.md, paddingTop: t.spacing.md },
  intro: { ...t.type.footnote, color: t.colors.textSecondary, paddingHorizontal: t.spacing.lg + 2 },
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
  good: { color: t.colors.success },
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
  small: { ...t.type.footnote, color: t.colors.textSecondary, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl, backgroundColor: t.colors.bg },
  centerText: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
}));
