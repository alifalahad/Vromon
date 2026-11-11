/**
 * Vromon Mobile — New message: pick a friend to chat with (docs/friends-chat-plan.md, step 3).
 * Opening the chat makes it on the server the first time; it stays out of the chat list
 * until a message is sent.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';

import { openChatWith } from '../../src/features/chat/queries';
import { useFriends } from '../../src/features/friends/queries';
import type { Friend } from '../../src/types';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { notify } from '../../src/utils/dialogs';

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function NewChatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = fold(query.trim().replace(/^@/, ''));
    const all = friends.data ?? [];
    return q ? all.filter((f) => fold(`${f.display_name ?? ''} ${f.username}`).includes(q)) : all;
  }, [friends.data, query]);

  const pick = async (friend: Friend) => {
    if (opening) return;
    setOpening(friend.id);
    try {
      const id = await openChatWith(client, friend.id);
      router.replace({ pathname: '/chat/[id]', params: { id: String(id) } });
    } catch (e) {
      setOpening(null);
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  if (friends.data && friends.data.length === 0) {
    return (
      <View style={styles.center} testID="new-chat-no-friends">
        <MaterialCommunityIcons name="account-group-outline" size={56} color={colors.textTertiary} />
        <Text style={styles.centerText}>{t('chat.noFriendsYet')}</Text>
        <Button label={t('chat.addFriends')} onPress={() => router.replace('/friends/add')} testID="new-chat-add-friends" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('chat.searchFriends')}
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('chat.searchFriends')}
          testID="new-chat-search"
        />
      </View>
      {friends.isPending ? (
        <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={query.trim() ? <Text style={styles.empty}>{t('chat.noMatch', { q: query.trim() })}</Text> : null}
          renderItem={({ item }) => {
            const name = item.display_name || item.username;
            return (
              <PressableScale
                pressEffect="opacity"
                haptic="selection"
                style={styles.row}
                onPress={() => void pick(item)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.messageName', { name })}
                testID={`new-chat-${item.username}`}
              >
                <Avatar name={name} id={item.id} uri={item.avatar_url} size={44} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    @{item.username}
                  </Text>
                </View>
                {opening === item.id ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </PressableScale>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    margin: t.spacing.lg,
    paddingHorizontal: t.spacing.lg,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surface,
  },
  input: { flex: 1, ...t.type.body, color: t.colors.textPrimary, paddingVertical: 10 },
  loading: { marginTop: t.spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 68 },
  rowText: { flex: 1, gap: 2 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  empty: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', padding: t.spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, padding: t.spacing.xxl, backgroundColor: t.colors.bg },
  centerText: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
}));
