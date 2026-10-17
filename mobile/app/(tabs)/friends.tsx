/**
 * Vromon Mobile — Friends tab (12-friends-empty.jpg).
 *
 * Requests to you (Accept / Decline) and from you (Cancel), then your friends with
 * their countries and % of the world. With none of these, the empty state from 12:
 * "Invite" shares your invite, "add via code" opens Add friend. FAB + → Add friend.
 */

import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useMe } from '../../src/features/account/useMe';
import { useFriendRequests, useFriends, useRefreshFriends } from '../../src/features/friends/queries';
import { shareInvite } from '../../src/features/friends/share';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import type { Friend, FriendRequest } from '../../src/types';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { Fab } from '../../src/ui/Fab';
import { haptics } from '../../src/ui/haptics';
import { LargeTitle } from '../../src/ui/LargeTitle';
import { PressableScale } from '../../src/ui/PressableScale';
import { makeStyles, useTheme } from '../../src/ui/theme';

export default function FriendsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { data: me } = useMe();
  const signedIn = !!me;
  const friends = useFriends(signedIn);
  const incoming = useFriendRequests('in', signedIn);
  const outgoing = useFriendRequests('out', signedIn);
  const refresh = useRefreshFriends();
  const actions = useFriendActions();
  // Changes made on the other phone (accepted, cancelled) show up whenever you come back here
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const loading = friends.isPending || incoming.isPending || outgoing.isPending;
  const empty = !loading && !friends.data?.length && !incoming.data?.length && !outgoing.data?.length;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, empty && styles.contentEmpty]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.textSecondary} colors={[colors.accent]} />}
      >
        <LargeTitle title={t('friends.title')} />

        {loading ? <Skeleton /> : null}

        {incoming.data?.length ? (
          <Section title={t('friends.sectionRequests')}>
            {incoming.data.map((r) => (
              <RequestRow key={r.id} request={r}>
                <Button variant="small" label={t('friends.accept')} haptic="medium" onPress={() => actions.accept(r.id)} testID={`accept-${r.user.username}`} />
                <Button variant="smallDanger" label={t('friends.decline')} onPress={() => actions.decline(r.id)} testID={`decline-${r.user.username}`} />
              </RequestRow>
            ))}
          </Section>
        ) : null}

        {outgoing.data?.length ? (
          <Section title={t('friends.sectionSent')}>
            {outgoing.data.map((r) => (
              <RequestRow key={r.id} request={r}>
                <Button variant="small" label={t('friends.cancel')} onPress={() => actions.cancel(r.id)} testID={`cancel-${r.user.username}`} />
              </RequestRow>
            ))}
          </Section>
        ) : null}

        {friends.data?.length ? (
          <Section title={t('friends.sectionFriends')}>
            {friends.data.map((f) => (
              <FriendRow key={f.id} friend={f} onPress={() => router.push(`/friends/${f.id}`)} />
            ))}
          </Section>
        ) : null}

        {empty ? (
          <View style={styles.empty} testID="friends-empty">
            <Text style={styles.emptyTitle}>{t('friends.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>
              <LinkText label={t('friends.emptyInvite')} onPress={() => me && shareInvite(me.friend_code, t)} testID="friends-invite" />
              {t('friends.emptyMiddle')}
              <LinkText
                label={t('friends.emptyAddViaCode')}
                onPress={() => router.push({ pathname: '/friends/add', params: { tab: 'search' } })}
                testID="friends-add-via-code"
              />
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Fab onPress={() => router.push('/friends/add')} accessibilityLabel={t('friends.addFriend')} testID="add-friend-fab" />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RequestRow({ request, children }: { request: FriendRequest; children: React.ReactNode }) {
  const styles = useStyles();
  const name = request.user.display_name ?? request.user.username;
  return (
    <View style={styles.row} testID={`request-${request.user.username}`}>
      <Avatar name={name} size={44} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          @{request.user.username}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function FriendRow({ friend, onPress }: { friend: Friend; onPress: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const name = friend.display_name ?? friend.username;
  const meta = `${t('friends.countries', { count: friend.countries })} · ${t('friends.worldPercent', { percent: friend.world_percent })}`;
  return (
    <PressableScale pressEffect="opacity" style={styles.row} onPress={onPress} accessibilityLabel={`${name}, ${meta}`} testID={`friend-${friend.username}`}>
      <Avatar name={name} size={44} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Placeholder rows while the lists load (prompt §5.2: skeletons, not spinners). */
function Skeleton() {
  const styles = useStyles();
  return (
    <View accessibilityLabel="Loading" style={styles.section}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          <View style={styles.skelAvatar} />
          <View style={styles.rowText}>
            <View style={[styles.skelLine, { width: '55%' }]} />
            <View style={[styles.skelLine, { width: '35%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Inline link inside a sentence. A nested <Text onPress> keeps the sentence
 * wrapping naturally, so this is the one tappable that isn't a PressableScale;
 * it still fires the standard light haptic.
 */
function LinkText({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Text
      style={styles.link}
      accessibilityRole="link"
      testID={testID}
      onPress={() => {
        haptics.light();
        onPress();
      }}
    >
      {label}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingBottom: 120 },
  contentEmpty: { flexGrow: 1 },
  section: { marginBottom: t.spacing.xl },
  sectionTitle: {
    ...t.type.footnote,
    fontWeight: '600',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: t.spacing.lg + 2,
    marginBottom: t.spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 68 },
  rowText: { flex: 1, gap: 4 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  skelAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surface },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: t.colors.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.spacing.xxl, paddingBottom: 96, gap: t.spacing.md },
  emptyTitle: { ...t.type.body, fontSize: 19, color: t.colors.textSecondary, textAlign: 'center' },
  emptyBody: { ...t.type.body, fontSize: 17, lineHeight: 34, color: t.colors.textSecondary, textAlign: 'center', alignSelf: 'stretch' },
  link: { color: t.colors.link },
}));
