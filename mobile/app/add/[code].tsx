/**
 * Vromon Mobile — a friend code's profile preview. Reached by scanning a QR,
 * typing a code, or opening a `vromon://add/<code>` invite link. Shows only what a
 * non-friend may see (decision D3) and the one action that fits.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { formatFriendCode, parseFriendCode } from '../../src/features/friends/friendCode';
import { PersonAction } from '../../src/features/friends/PersonRow';
import { friendKeys } from '../../src/features/friends/queries';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { friendsApi } from '../../src/services/api';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function FriendCodeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = parseFriendCode(raw ?? '');
  const person = useQuery({ queryKey: friendKeys.code(code ?? ''), queryFn: () => friendsApi.byCode(code!), enabled: !!code, retry: false });

  const failed = !code || person.isError;
  useEffect(() => {
    if (failed) haptics.error();
  }, [failed]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('friends.addFriend') }} />
      {failed ? (
        <View style={styles.center} testID="code-invalid">
          <MaterialCommunityIcons name="account-question-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.title}>{t('friends.codeNotFound')}</Text>
          <Text style={styles.body}>{t('friends.codeNotFoundBody')}</Text>
          <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} style={styles.button} />
        </View>
      ) : !person.data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.link} />
        </View>
      ) : (
        <View style={styles.center} testID="code-preview">
          <Avatar name={person.data.display_name ?? person.data.username} size={96} />
          <Text style={styles.title}>{person.data.display_name ?? person.data.username}</Text>
          <Text style={styles.body}>@{person.data.username}</Text>
          <Text style={styles.code}>{formatFriendCode(code)}</Text>
          <View style={styles.button}>
            {person.data.relation === 'self' ? (
              <Text style={styles.body}>{t('friends.yourCode')}</Text>
            ) : person.data.relation === 'none' ? (
              // Sent by code, so it also works for people who can't be found by username
              <CodeRequestButton code={code} />
            ) : (
              <PersonAction person={person.data} large />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function CodeRequestButton({ code }: { code: string }) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const { sendRequest } = useFriendActions();
  return (
    <Button
      label={t('friends.addFriend')}
      haptic="medium"
      loading={sending}
      onPress={async () => {
        setSending(true);
        await sendRequest({ friend_code: code });
        setSending(false);
      }}
      testID="code-add"
    />
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.xxl, paddingBottom: 80 },
  title: { ...t.type.title, fontSize: 26, color: t.colors.textPrimary, textAlign: 'center', marginTop: t.spacing.md },
  body: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  code: { ...t.type.callout, letterSpacing: 2, color: t.colors.textTertiary },
  button: { alignSelf: 'stretch', marginTop: t.spacing.xl },
}));
