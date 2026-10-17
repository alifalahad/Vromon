/**
 * Vromon Mobile — Blocked users (Settings → Privacy & friends). Unblocking lets
 * them find you and send requests again; it doesn't restore a friendship.
 */

import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';

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

  return (
    <FlatList
      style={styles.container}
      data={blocks.data ?? []}
      keyExtractor={(u) => u.id}
      ListEmptyComponent={blocks.isPending ? null : <Text style={styles.empty}>{t('friends.noBlocked')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Avatar name={item.display_name ?? item.username} size={44} />
          <View style={styles.text}>
            <Text style={styles.name}>{item.display_name ?? item.username}</Text>
            <Text style={styles.meta}>@{item.username}</Text>
          </View>
          <Button variant="small" label={t('friends.unblock')} onPress={() => unblock(item.id)} testID={`unblock-${item.username}`} />
        </View>
      )}
    />
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 68 },
  text: { flex: 1, gap: 2 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  empty: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', marginTop: 48, paddingHorizontal: t.spacing.xxl },
}));
