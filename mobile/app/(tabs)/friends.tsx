/**
 * Vromon Mobile — Friends tab (docs/friends-chat-plan.md, step 3; mockups 1, 2 and 4).
 *
 * Two segments:
 * - Chats (first): incoming friend requests as one row, then On the road (friends on a trip
 *   now or soon, step 6), then your chats, newest first;
 *   the button starts a new message.
 * - Friends: requests to you (Accept / Decline) and from you (Cancel), then your
 *   friends, each with a Message button; the button adds a friend.
 * With nobody yet, mockup 4's empty state: invite, or add by code or QR.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useMe } from '../../src/features/account/useMe';
import { ChatRow } from '../../src/features/chat/ChatRow';
import { chatKeys, openChatWith, unreadChats, useConversations } from '../../src/features/chat/queries';
import { useMinuteClock } from '../../src/features/chat/state';
import { OnTheRoadStrip } from '../../src/features/friends/OnTheRoadStrip';
import { useFriendRequests, useFriends, useOnTheRoad, useRefreshFriends } from '../../src/features/friends/queries';
import { shareInvite } from '../../src/features/friends/share';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import type { Conversation, Friend, FriendRequest } from '../../src/types';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { Fab } from '../../src/ui/Fab';
import { LargeTitle } from '../../src/ui/LargeTitle';
import { PressableScale } from '../../src/ui/PressableScale';
import { SegmentedControl } from '../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { useDevPerf, useScrollPerf } from '../../src/utils/devPerf';
import { notify } from '../../src/utils/dialogs';

type Segment = 'chats' | 'friends';

export default function FriendsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const client = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const listRef = useRef<FlatList<Conversation>>(null);
  useScrollToTop(scrollRef);
  useScrollToTop(listRef);
  const [segment, setSegment] = useState<Segment>('chats');
  const now = useMinuteClock();
  const openChat = useCallback((id: number) => router.push({ pathname: '/chat/[id]', params: { id: String(id) } }), [router]);

  const { data: me } = useMe();
  const signedIn = !!me;
  const friends = useFriends(signedIn);
  const incoming = useFriendRequests('in', signedIn);
  const outgoing = useFriendRequests('out', signedIn);
  const chats = useConversations(signedIn);
  // Step 10: how fast the chat list shows and scrolls (development builds, or EXPO_PUBLIC_PERF_LOG=1)
  useDevPerf('chat list', !!chats.data, chats.isFetchedAfterMount === false);
  const scrollPerf = useScrollPerf('chat list scroll');
  const road = useOnTheRoad(signedIn);
  const refreshFriends = useRefreshFriends();
  const actions = useFriendActions();
  const refresh = useCallback(() => {
    refreshFriends();
    void client.invalidateQueries({ queryKey: chatKeys.list });
  }, [refreshFriends, client]);
  // Changes made on the other phone (accepted, cancelled, new chats) show up whenever you come back here
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const loading = friends.isPending || incoming.isPending || outgoing.isPending;
  const nobody = !loading && !friends.data?.length && !incoming.data?.length && !outgoing.data?.length && !chats.data?.length;
  const unread = unreadChats(chats.data, now.getTime());

  // The chat list draws only the rows on screen: drawn all at once, 100 chats took over half
  // a second when the tab first opened (step 10)
  const myId = me?.id;
  const renderChat = useCallback(
    ({ item }: { item: Conversation }) => (myId ? <ChatRow conversation={item} me={myId} now={now} onOpen={openChat} /> : null),
    [myId, now, openChat],
  );

  const message = async (friend: Pick<Friend, 'id'>) => {
    try {
      const id = await openChatWith(client, friend.id);
      router.push({ pathname: '/chat/[id]', params: { id: String(id) } });
    } catch (e) {
      notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
    }
  };

  if (nobody) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.textSecondary} colors={[colors.accent]} />}
        >
          <LargeTitle title={t('friends.title')} />
          <EmptyState
            onInvite={() => me && shareInvite(me.friend_code, t)}
            onAddByCode={() => router.push({ pathname: '/friends/add', params: { tab: 'search' } })}
          />
        </ScrollView>
        <Fab onPress={() => router.push('/friends/add')} accessibilityLabel={t('friends.addFriend')} testID="add-friend-fab" />
      </View>
    );
  }

  const refreshControl = <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.textSecondary} colors={[colors.accent]} />;
  const top = (
    <>
      <LargeTitle title={t('friends.title')} />
      <SegmentedControl
        options={[
          { value: 'chats', label: unread > 0 ? `${t('chat.chats')} (${f.n(unread)})` : t('chat.chats') },
          { value: 'friends', label: t('chat.friends') },
        ]}
        value={segment}
        onChange={setSegment}
        style={styles.segments}
        testID="friends-segment"
      />
    </>
  );

  return (
    <View style={styles.container}>
      {segment === 'chats' ? (
        <FlatList
          ref={listRef}
          {...scrollPerf}
          data={myId ? (chats.data ?? []) : []}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderChat}
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          ListHeaderComponent={
            <>
              {top}
              {incoming.data?.length ? <RequestsRow requests={incoming.data} onPress={() => setSegment('friends')} /> : null}
              <OnTheRoadStrip
                road={road.data ?? []}
                onOpenChat={(id) => void message({ id })}
                onOpenTrip={(id) => router.push({ pathname: '/trip/[id]', params: { id: String(id) } })}
              />
              {chats.isPending || (loading && !chats.data?.length) ? <Skeleton /> : null}
              {chats.data?.length ? <View style={styles.chats} /> : null}
            </>
          }
          ListEmptyComponent={
            chats.isError ? (
              <View style={styles.noChats} testID="chats-failed">
                <MaterialCommunityIcons name="cloud-off-outline" size={44} color={colors.textTertiary} />
                <Text style={styles.noChatsBody}>{t('chat.listFailed')}</Text>
                <Button label={t('common.retry')} variant="secondary" onPress={() => void chats.refetch()} testID="chats-retry" />
              </View>
            ) : !chats.isPending ? (
              <View style={styles.noChats} testID="no-chats">
                <MaterialCommunityIcons name="chat-processing-outline" size={44} color={colors.textTertiary} />
                <Text style={styles.noChatsTitle}>{t('chat.noChatsTitle')}</Text>
                <Text style={styles.noChatsBody}>{t('chat.noChatsBody')}</Text>
                {friends.data?.length ? (
                  <Button label={t('chat.startChat')} variant="secondary" onPress={() => router.push('/chat/new')} testID="start-chat" />
                ) : null}
              </View>
            ) : null
          }
          testID="chat-list"
        />
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} refreshControl={refreshControl}>
          {top}
          {loading ? <Skeleton /> : null}
          {incoming.data?.length ? (
            <Section title={t('friends.sectionRequests')}>
              {incoming.data.map((r) => (
                <RequestRow key={r.id} request={r}>
                  <Button
                    variant="small"
                    label={t('friends.accept')}
                    haptic="medium"
                    onPress={() => actions.accept(r.id)}
                    testID={`accept-${r.user.username}`}
                  />
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
              {friends.data.map((fr) => (
                <FriendRow key={fr.id} friend={fr} onPress={() => router.push(`/friends/${fr.id}`)} onMessage={() => void message(fr)} />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}

      {segment === 'chats' ? (
        <Fab icon="edit" onPress={() => router.push('/chat/new')} accessibilityLabel={t('chat.newMessage')} testID="chat-compose-fab" />
      ) : (
        <Fab onPress={() => router.push('/friends/add')} accessibilityLabel={t('friends.addFriend')} testID="add-friend-fab" />
      )}
    </View>
  );
}

/** Incoming requests as one row in Chats (mockup 1); it opens the Friends segment. */
function RequestsRow({ requests, onPress }: { requests: FriendRequest[]; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const names = requests
    .slice(0, 3)
    .map((r) => r.user.display_name || r.user.username)
    .join(', ');
  const title = t('chat.requestsRow', { count: requests.length, n: f.n(requests.length) });
  const from = t('chat.requestsFrom', { names: requests.length > 3 ? `${names}…` : names });
  return (
    <PressableScale
      pressEffect="opacity"
      haptic="selection"
      style={styles.requests}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${from}`}
      testID="chats-requests"
    >
      <View style={styles.stack}>
        {requests.slice(0, 2).map((r, i) => (
          <View key={r.id} style={[styles.stackItem, i > 0 && styles.stackOverlap]}>
            <Avatar name={r.user.display_name ?? r.user.username} id={r.user.id} size={32} />
          </View>
        ))}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.requestsTitle}>{title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {from}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </PressableScale>
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
      <Avatar name={name} id={request.user.id} size={44} />
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

function FriendRow({ friend, onPress, onMessage }: { friend: Friend; onPress: () => void; onMessage: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const f = usePlanFormat();
  const name = friend.display_name ?? friend.username;
  // Bangla digits in Bangla (step 10): `count` picks the plural, `n` is what shows
  const meta = `${t('friends.countries', { count: friend.countries, n: f.n(friend.countries) })} · ${t('friends.worldPercent', { percent: f.n(friend.world_percent) })}`;
  return (
    <View style={styles.friendRow}>
      <PressableScale
        pressEffect="opacity"
        style={styles.friendMain}
        onPress={onPress}
        accessibilityLabel={`${name}, ${meta}`}
        testID={`friend-${friend.username}`}
      >
        <Avatar name={name} id={friend.id} size={44} />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </PressableScale>
      <PressableScale
        pressEffect="opacity"
        haptic="selection"
        style={styles.messageButton}
        onPress={onMessage}
        accessibilityRole="button"
        accessibilityLabel={t('chat.messageName', { name })}
        testID={`message-${friend.username}`}
      >
        <MaterialCommunityIcons name="message-text-outline" size={24} color={colors.link} />
      </PressableScale>
    </View>
  );
}

/** Mockup 4: nobody yet. */
function EmptyState({ onInvite, onAddByCode }: { onInvite: () => void; onAddByCode: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const points: [React.ComponentProps<typeof MaterialCommunityIcons>['name'], string][] = [
    ['message-text-outline', t('friends.emptyPoint1')],
    ['map-marker-path', t('friends.emptyPoint2')],
    ['compare-horizontal', t('friends.emptyPoint3')],
  ];
  return (
    <View style={styles.empty} testID="friends-empty">
      <Svg width={168} height={132} viewBox="0 0 168 132" accessible={false}>
        <Circle cx={84} cy={66} r={62} fill={colors.surface} />
        <Path d="M46 84 C 64 40, 104 104, 122 52" fill="none" stroke={colors.link} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 9" />
        <Path d="M46 92s-14-12.4-14-23a14 14 0 0128 0c0 10.6-14 23-14 23z" fill={colors.accentStrong} />
        <Circle cx={46} cy={69} r={5} fill={colors.onAccent} />
        <Path d="M122 60s-14-12.4-14-23a14 14 0 0128 0c0 10.6-14 23-14 23z" fill={colors.warning} />
        <Circle cx={122} cy={37} r={5} fill={colors.bg} />
      </Svg>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {t('friends.emptyHeading')}
      </Text>
      <Text style={styles.emptyBody}>{t('friends.emptyLead')}</Text>
      <View style={styles.emptyButtons}>
        <Button label={t('friends.emptyInviteButton')} onPress={onInvite} testID="friends-invite" />
        <Button label={t('friends.emptyCodeButton')} variant="secondary" onPress={onAddByCode} testID="friends-add-via-code" />
      </View>
      <View style={styles.points}>
        {points.map(([icon, text]) => (
          <View key={text} style={styles.point}>
            <View style={styles.pointIcon}>
              <MaterialCommunityIcons name={icon} size={20} color={colors.onAccentSoft} />
            </View>
            <Text style={styles.pointText}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
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

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingBottom: 120 },
  emptyScroll: { flexGrow: 1, paddingBottom: 120 },
  segments: { marginHorizontal: t.spacing.lg, marginBottom: t.spacing.md },
  chats: { paddingTop: t.spacing.xs },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    marginHorizontal: t.spacing.lg,
    marginBottom: t.spacing.sm,
    paddingVertical: t.spacing.md,
    paddingLeft: t.spacing.md + 2,
    paddingRight: t.spacing.sm,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    minHeight: 64,
  },
  requestsTitle: { ...t.type.callout, fontWeight: '600', color: t.colors.textPrimary },
  stack: { flexDirection: 'row' },
  stackItem: { borderRadius: 18, borderWidth: 2, borderColor: t.colors.surface },
  stackOverlap: { marginLeft: -12 },
  noChats: { alignItems: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.xxl, paddingTop: t.spacing.xxl },
  noChatsTitle: { ...t.type.headline, color: t.colors.textPrimary },
  noChatsBody: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center', marginBottom: t.spacing.sm },
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
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingRight: t.spacing.sm },
  friendMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingLeft: t.spacing.lg + 2, minHeight: 68 },
  messageButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 4 },
  name: { ...t.type.headline, color: t.colors.textPrimary },
  meta: { ...t.type.footnote, color: t.colors.textSecondary },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  skelAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.surface },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: t.colors.surface },
  empty: { alignItems: 'center', paddingHorizontal: t.spacing.xxl + 4, paddingTop: t.spacing.xl, gap: t.spacing.md },
  emptyTitle: { ...t.type.title, color: t.colors.textPrimary, textAlign: 'center', marginTop: t.spacing.sm },
  emptyBody: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  emptyButtons: { alignSelf: 'stretch', gap: t.spacing.sm, marginTop: t.spacing.md },
  points: { alignSelf: 'stretch', gap: t.spacing.md, marginTop: t.spacing.lg },
  point: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  pointIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pointText: { ...t.type.callout, color: t.colors.textPrimary, flex: 1 },
}));
