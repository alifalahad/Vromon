/**
 * A person in search results or a code preview: avatar, name, @username and the
 * one action that fits (Add / Requested / Accept / Friends).
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Person } from '../../types';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles } from '../../ui/theme';
import { useFriendActions } from './useFriendActions';

export function PersonAction({ person, large }: { person: Person; large?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const actions = useFriendActions();
  const variant = large ? undefined : 'small';
  const id = `person-action-${person.username}`;

  switch (person.relation) {
    case 'none':
      return <Button variant={large ? 'primary' : 'small'} label={t('friends.add')} haptic="medium" onPress={() => actions.sendRequest({ user_id: person.id })} testID={id} />;
    case 'incoming':
      return <Button variant={large ? 'primary' : 'small'} label={t('friends.accept')} haptic="medium" onPress={() => person.request_id && actions.accept(person.request_id)} testID={id} />;
    case 'requested':
      return (
        <Button
          variant={large ? 'secondary' : 'small'}
          label={t('friends.requested')}
          accessibilityLabel={t('friends.cancelRequestLabel', { name: person.username })}
          onPress={() => person.request_id && actions.cancel(person.request_id)}
          testID={id}
        />
      );
    case 'friends':
      return <Button variant={variant ?? 'secondary'} label={t('friends.friends')} onPress={() => router.push(`/friends/${person.id}`)} testID={id} />;
    default:
      return <Text>{t('friends.you')}</Text>;
  }
}

export function PersonRow({ person, onPress }: { person: Person; onPress?: () => void }) {
  const styles = useStyles();
  const name = person.display_name ?? person.username;
  return (
    <PressableScale pressEffect="opacity" haptic={onPress ? 'light' : 'none'} disabled={!onPress} onPress={onPress} style={styles.row} accessibilityLabel={`${name}, @${person.username}`}>
      <Avatar name={name} size={44} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <PersonAction person={person} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 68 },
  text: { flex: 1, gap: 2 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  username: { ...t.type.footnote, color: t.colors.textSecondary },
}));
