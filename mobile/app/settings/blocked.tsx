/**
 * Vromon Mobile — Blocked people (Settings → Chats and privacy), in Settings' cards (UI refresh step 13).
 * Unblocking lets them find you and send requests again; it doesn't restore a friendship.
 */

import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { friendKeys } from '../../src/features/friends/queries';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { friendsApi } from '../../src/services/api';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { makeStyles } from '../../src/ui/theme';

export default function BlockedScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const blocks = useQuery({ queryKey: friendKeys.blocks, queryFn: friendsApi.blocks });
  const { unblock } = useFriendActions();
  const people = blocks.data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="blocked-screen">
      {people.length ? (
        <View style={styles.card}>
          {people.map((item, i) => (
            <View key={item.id} style={[styles.row, i < people.length - 1 && styles.divider]}>
              <Avatar name={item.display_name ?? item.username} id={item.id} uri={item.avatar_url} size={44} />
              <View style={styles.text}>
                <Text style={styles.name}>{item.display_name ?? item.username}</Text>
                <Text style={styles.meta}>@{item.username}</Text>
              </View>
              <Button variant="small" label={t('friends.unblock')} onPress={() => unblock(item.id)} testID={`unblock-${item.username}`} />
            </View>
          ))}
        </View>
      ) : blocks.isPending ? null : (
        <Text style={styles.empty}>{t('friends.noBlocked')}</Text>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.spacing.lg },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.surface, ...t.depth.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.md, minHeight: 68 },
  divider: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  text: { flex: 1, gap: 2 },
  name: { ...t.type.headline, fontSize: 15.5, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  empty: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', marginTop: 48, paddingHorizontal: t.spacing.xxl },
}));
