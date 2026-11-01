/**
 * Vromon Mobile — a chat with a friend (docs/friends-chat-plan.md, step 3; mockup 5).
 *
 * Messages arrive live (features/chat/useLiveChat.ts); yours go through the outbox,
 * so they show at once, wait for the network, and can be tried again if refused.
 * The chat counts as read while it's on screen. Read-only when you're no longer
 * friends, or their account is gone. The + shares a trip, a place, a trip idea or a
 * poll (step 4, mockup 6); the cards' buttons work in place (cards/actions.tsx).
 *
 * Step 5 (mockup 7): hold a message for reactions, Reply, Copy, Unsend (yours, within
 * an hour) or Report…; swipe right to reply; tap a reaction chip to see who. The ⋯ in
 * the header mutes the chat, deletes it for you, or unfriends or blocks them.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../../src/features/account/useMe';
import { CardActionsProvider, useChatCardActions, type RoomContext } from '../../src/features/chat/cards/actions';
import { Composer } from '../../src/features/chat/Composer';
import { buildRows, cardSummary, chatName, isCard, nameList, type Bubble, type Row } from '../../src/features/chat/format';
import { DayPill, MessageBubble, TypingBubble, type BubbleHandlers } from '../../src/features/chat/MessageBubble';
import { MessageMenu, type MenuAction } from '../../src/features/chat/MessageMenu';
import { PlanBar } from '../../src/features/chat/PlanBar';
import { LiveShareBar } from '../../src/features/chat/LiveShareBar';
import { NoLocation, startLiveShare, useLiveShare, type LiveLength } from '../../src/features/chat/liveShare';
import { checkInCard, LATE_CHOICES, lateCard, tripIsOn } from '../../src/features/chat/onTheTrip';
import { askForLocation } from '../../src/features/trips/today/useHere';
import { discard, flushChat, pendingFor, queueText, retry, useChatOutbox } from '../../src/features/chat/outbox';
import { chatKeys, loadOlder, markRead, useConversation, useThread } from '../../src/features/chat/queries';
import { myReaction, quoteText } from '../../src/features/chat/reactions';
import { ReactorsSheet, reactorsOf } from '../../src/features/chat/ReactorsSheet';
import { mapPlaceCard, sendCard, tripCard } from '../../src/features/chat/share';
import { ShareSheet, type ShareChoice } from '../../src/features/chat/ShareSheet';
import { useChatNotice, useLiveStatus, useMinuteClock, useOpenChat, useTypingIn } from '../../src/features/chat/state';
import { sendTyping } from '../../src/features/chat/useLiveChat';
import { tripLine } from '../../src/features/friends/onTheRoad';
import { useRoadTripOf } from '../../src/features/friends/queries';
import { useFriendActions } from '../../src/features/friends/useFriendActions';
import { countryName } from '../../src/features/geo/countries';
import { homeRegionName } from '../../src/features/map/geoData';
import { useVisits } from '../../src/features/map/visits';
import { formatRange, localToday } from '../../src/features/trips/dates';
import { usePlanFormat } from '../../src/features/trips/plan/usePlanFormat';
import { useTrips } from '../../src/features/trips/queries';
import { ApiError, chatApi, destinationsApi, roomsApi } from '../../src/services/api';
import type { PlaceCard, ReactionKind, ReplyPreview, Visit } from '../../src/types';
import { ActionSheet, type SheetAction } from '../../src/ui/ActionSheet';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { PressableScale } from '../../src/ui/PressableScale';
import { Snackbar } from '../../src/ui/Snackbar';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { timed, useDevPerf, useScrollPerf } from '../../src/utils/devPerf';
import { confirm } from '../../src/utils/dialogs';

const UNSEND_WINDOW = 60 * 60 * 1000;
/** "Always": the server keeps a far-off date */
const MUTED_FOREVER = '9999-12-31T00:00:00Z';
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

export default function ChatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const f = usePlanFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const meProfile = useMe().data;
  const me = meProfile?.id;

  const conversation = useConversation(id);
  const thread = useThread(id);
  const outbox = useChatOutbox();
  const pending = useMemo(() => pendingFor(outbox.items, me, outbox.userId, id), [outbox.items, outbox.userId, me, id]);
  const typing = useTypingIn(id);
  const now = useMinuteClock();

  const chat = conversation.data;
  const name = chat ? chatName(chat, t) : '';
  const messages = thread.data?.messages;
  // Earlier messages: a page that failed (offline) says so with a way to try again, and is
  // tried again by itself once the connection is back. Before step 10 the spinner stayed
  const [olderFailed, setOlderFailed] = useState(false);
  const older = useCallback(() => {
    loadOlder(client, id).then(
      () => setOlderFailed(false),
      () => setOlderFailed(true),
    );
  }, [client, id]);
  const online = useLiveStatus((s) => s.status === 'live');
  useEffect(() => {
    if (online && olderFailed) older();
  }, [online, olderFailed, older]);
  // Step 10: how fast a chat opens and scrolls (development builds, or EXPO_PUBLIC_PERF_LOG=1)
  useDevPerf('chat', !!messages, thread.isFetchedAfterMount === false);
  const scrollPerf = useScrollPerf('chat scroll');
  const newestId = messages?.[messages.length - 1]?.id;

  // Cards: what their buttons do, and the share sheet's quick picks
  const other = chat?.other;
  const onTrip = useRoadTripOf(other?.id);
  // A trip room (step 7): its trip, and everyone in it by id
  const roomTrip = chat?.kind === 'trip' ? (chat.trip ?? null) : null;
  const isRoom = !!roomTrip;
  const members = chat?.members;
  const names = useMemo(
    () =>
      roomTrip
        ? Object.fromEntries((members ?? []).filter((m) => m.id !== me).map((m) => [m.id, m.display_name || m.username]))
        : other
          ? { [other.id]: name }
          : {},
    [roomTrip, members, me, other, name],
  );
  const room = useMemo<RoomContext | null>(() => {
    if (!roomTrip) return null;
    const owner = members?.find((m) => m.id === roomTrip.owner_id);
    const days = Math.round((Date.parse(`${roomTrip.end_date}T00:00:00`) - Date.parse(`${roomTrip.start_date}T00:00:00`)) / 86_400_000) + 1;
    return {
      tripId: roomTrip.id,
      ownerId: roomTrip.owner_id,
      ownerName: owner?.display_name || owner?.username || '',
      startDate: roomTrip.start_date,
      days,
    };
  }, [roomTrip, members]);
  const cards = useChatCardActions(names, room);
  const [sharing, setSharing] = useState(false);
  const lang = i18n.language === 'bn' ? 'bn' : 'en';
  const trips = useTrips();
  const visits = useVisits(me).data;
  const destinations = useQuery({
    queryKey: ['destinations'],
    queryFn: destinationsApi.list,
  });
  const shareTrips = useMemo(() => {
    const today = localToday();
    return (trips.data ?? [])
      .filter((trip) => trip.end_date >= today && (!trip.user_id || trip.user_id === me))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 3);
  }, [trips.data, me]);
  const placeName = useCallback(
    (v: Visit) => (v.place_type === 'region' ? homeRegionName(v.place_code, lang) : countryName(v.place_code, lang)) ?? v.place_code,
    [lang],
  );
  // Divisions and countries have their names on the phone; a city's would need the server
  const wants = useMemo(
    () =>
      (visits ?? [])
        .filter((v) => v.status === 'want' && (v.place_type === 'country' || (v.place_type === 'region' && homeRegionName(v.place_code, lang))))
        .slice(0, 3),
    [visits, lang],
  );
  const openShare = (choice: ShareChoice) => {
    if (choice === 'checkin') return void checkIn();
    if (choice === 'live') return setLiveMenu(true);
    const params = { chat: String(id) };
    if (choice === 'trip') router.push({ pathname: '/chat/share/trip', params });
    else if (choice === 'place') router.push({ pathname: '/chat/share/place', params });
    else if (choice === 'idea') router.push({ pathname: '/chat/share/idea', params });
    else router.push({ pathname: '/chat/share/poll', params });
  };

  // On screen: new messages count as read, not unread
  useFocusEffect(
    useCallback(() => {
      useOpenChat.setState({ id });
      return () => {
        if (useOpenChat.getState().id === id) useOpenChat.setState({ id: null });
      };
    }, [id]),
  );
  useEffect(() => {
    if (chat && newestId != null && useOpenChat.getState().id === id) void markRead(client, chat, newestId);
  }, [chat, newestId, id, client]);

  // "Report sent", from the report screen once it has closed
  const notice = useChatNotice((s) => s.notice);
  const notify = cards.notify;
  useEffect(() => {
    if (!notice) return;
    useChatNotice.setState({ notice: null });
    notify({ message: notice });
  }, [notice, notify]);

  const rows = useMemo(
    () =>
      me
        ? timed('chat rows', () => buildRows(messages ?? [], pending, me, chat?.other_read_up_to ?? null, now, t, i18n.language), (r) => r.length)
        : [],
    [messages, pending, me, chat?.other_read_up_to, now, t, i18n.language],
  );

  // Step 5: the message menu, who reacted, the reply being written, the header menu
  const canSend = !!chat?.can_send;
  const [menuFor, setMenuFor] = useState<Bubble | null>(null);
  const [reactorsId, setReactorsId] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [muteMenu, setMuteMenu] = useState(false);
  const friendActions = useFriendActions();

  const nameOf = useCallback(
    (sender: string | null) => (sender && sender === me ? t('chat.cards.you') : (sender && names[sender]) || t('chat.cards.someone')),
    [me, names, t],
  );
  const handlers = useMemo<BubbleHandlers | undefined>(
    () =>
      me
        ? {
            me,
            nameOf,
            onMenu: setMenuFor,
            onReply: (b) =>
              canSend &&
              b.id != null &&
              setReplyTo({
                id: b.id,
                sender_id: b.senderId,
                kind: b.kind,
                body: b.body,
                payload: b.payload,
                deleted: false,
              }),
            onReactors: (b) => setReactorsId(b.id),
            room: isRoom,
          }
        : undefined,
    [me, nameOf, canSend, isRoom, setReplyTo, setMenuFor, setReactorsId],
  );
  const reactorsBubble = useMemo(() => messages?.find((m) => m.id === reactorsId), [messages, reactorsId]);

  const react = (b: Pick<Bubble, 'id' | 'kind' | 'payload' | 'reactions'>, reaction: ReactionKind | null) =>
    b.id != null &&
    cards.actions.react(
      {
        id: b.id,
        conversation_id: id,
        kind: b.kind,
        payload: b.payload,
        reactions: b.reactions,
      },
      reaction,
    );

  // What the menu offers for a message
  const menuText = (b: Bubble) => (isCard(b.kind) ? cardSummary(b.kind, b.payload, t, i18n.language) : (b.body ?? ''));
  const menuPlace = menuFor?.kind === 'place' && menuFor.payload?.available !== false ? (menuFor.payload as unknown as PlaceCard) : null;
  const menuActions: MenuAction[] = menuFor
    ? [
        ...(canSend ? (['reply'] as const) : []),
        ...(menuFor.kind === 'text' || menuPlace ? (['copy'] as const) : []),
        ...(menuPlace?.type === 'attraction' && menuPlace.id && menuPlace.destination ? (['addToTrip'] as const) : []),
        ...(menuFor.mine && now.getTime() - Date.parse(menuFor.createdAt) < UNSEND_WINDOW ? (['unsend'] as const) : []),
        ...(!menuFor.mine ? (['report'] as const) : []),
      ]
    : [];
  const onMenuAction = (action: MenuAction) => {
    const b = menuFor;
    if (!b || b.id == null) return;
    if (action === 'reply') handlers?.onReply(b);
    else if (action === 'copy') {
      void Clipboard.setStringAsync(menuPlace ? menuPlace.name : (b.body ?? '')).then(() => cards.notify({ message: t('chat.menu.copied') }));
    } else if (action === 'addToTrip' && menuPlace) cards.actions.addToTrip(menuPlace);
    else if (action === 'unsend') {
      const messageId = b.id;
      Alert.alert(t('chat.menu.unsendTitle'), t('chat.menu.unsendBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.menu.unsend'),
          style: 'destructive',
          onPress: () => cards.actions.unsend({ id: messageId, conversation_id: id }),
        },
      ]);
    } else if (action === 'report')
      router.push({
        pathname: '/chat/report',
        params: { message: String(b.id), name },
      });
  };

  const mute = (until: string | null) =>
    chatApi
      .updateMe(id, { muted_until: until })
      .then((saved) => {
        client.setQueryData(chatKeys.conversation(id), saved);
        void client.invalidateQueries({ queryKey: chatKeys.list });
        cards.notify({
          message: until ? t('chat.header.muted') : t('chat.header.unmuted'),
        });
      })
      .catch((e: unknown) =>
        cards.notify({
          message: e instanceof Error ? e.message : t('common.error'),
        }),
      );
  const muted = !!chat?.muted_until && Date.parse(chat.muted_until) > now.getTime();
  const deleteForMe = () =>
    Alert.alert(t('chat.header.deleteTitle'), t('chat.header.deleteBody', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.header.delete'),
        style: 'destructive',
        onPress: () => {
          if (newestId == null) return void router.back();
          chatApi
            .updateMe(id, { cleared_up_to_id: newestId })
            .then(() => {
              client.removeQueries({ queryKey: chatKeys.thread(id) });
              void client.invalidateQueries({ queryKey: chatKeys.list });
              router.back();
            })
            .catch((e: unknown) =>
              cards.notify({
                message: e instanceof Error ? e.message : t('common.error'),
              }),
            );
        },
      },
    ]);
  // Unfriending or blocking makes the chat read-only (plan 3.4, rule 2)
  const refreshChat = () => void client.invalidateQueries({ queryKey: chatKeys.all });
  const muteActions: SheetAction[] = [
    {
      key: 'mute-1h',
      label: t('chat.header.mute1h'),
      icon: 'bell-sleep-outline',
      onPress: () => void mute(hoursFromNow(1)),
    },
    {
      key: 'mute-8h',
      label: t('chat.header.mute8h'),
      icon: 'bell-sleep-outline',
      onPress: () => void mute(hoursFromNow(8)),
    },
    {
      key: 'mute-always',
      label: t('chat.header.muteAlways'),
      icon: 'bell-off-outline',
      onPress: () => void mute(MUTED_FOREVER),
    },
  ];
  // A trip room: "Thu 3 – Sat 5 Dec · you, Rafi, Nusrat"; its menu leads to the trip and who's in it
  const roomLine = roomTrip
    ? [
        formatRange(roomTrip.start_date, roomTrip.end_date, i18n.language),
        nameList(
          (members ?? []).map((m) => (m.id === me ? t('chat.system.you') : (m.display_name || m.username).split(/\s+/)[0])),
          t,
        ),
      ].join(' · ')
    : '';
  const openTrip = () => roomTrip && router.push({ pathname: '/trip/[id]', params: { id: String(roomTrip.id) } });
  const isOwner = !!roomTrip && roomTrip.owner_id === me;
  const [membersSheet, setMembersSheet] = useState(false);
  const leaveRoom = () =>
    roomTrip &&
    me &&
    confirm(
      t('chat.room.leaveTitle'),
      t('chat.room.leaveBody', { owner: room?.ownerName ?? '' }),
      t('chat.room.leave'),
      () =>
        void roomsApi
          .remove(roomTrip.id, me)
          .then(() => {
            refreshChat();
            void client.invalidateQueries({ queryKey: ['joinedTrips'] });
            router.back();
          })
          .catch((e: unknown) => cards.notify({ message: e instanceof Error ? e.message : t('common.error') })),
      true,
    );
  const memberActions: SheetAction[] = (members ?? []).map((m) => {
    const label = `${m.id === me ? t('chat.room.youMember') : m.display_name || m.username}${m.id === roomTrip?.owner_id ? ` · ${t('chat.room.owner')}` : ''}`;
    const removable = isOwner && m.id !== me;
    return {
      key: `member-${m.username}`,
      label: removable ? t('chat.room.removeMember', { name: label }) : label,
      icon: removable ? ('account-remove-outline' as const) : ('account-outline' as const),
      danger: removable,
      onPress: () =>
        removable &&
        roomTrip &&
        confirm(
          t('chat.room.removeTitle', { name: m.display_name || m.username }),
          t('chat.room.removeBody'),
          t('chat.room.remove'),
          () =>
            void roomsApi
              .remove(roomTrip.id, m.id)
              .then(() => void client.invalidateQueries({ queryKey: chatKeys.conversation(id) }))
              .catch((e: unknown) => cards.notify({ message: e instanceof Error ? e.message : t('common.error') })),
          true,
        ),
    };
  });
  const roomActions: SheetAction[] = roomTrip
    ? [
        { key: 'trip', label: t('chat.room.openTrip'), icon: 'map-marker-path' as const, onPress: openTrip },
        {
          key: 'members',
          label: t('chat.room.members', { count: members?.length ?? 0, n: f.n(members?.length ?? 0) }),
          icon: 'account-group-outline' as const,
          onPress: () => setMembersSheet(true),
        },
        ...(isOwner
          ? [
              {
                key: 'invite',
                label: t('chat.room.invite'),
                icon: 'account-plus-outline' as const,
                onPress: () => router.push({ pathname: '/trip/invite/[id]', params: { id: String(roomTrip.id) } }),
              },
            ]
          : []),
      ]
    : [];
  // On the trip (step 8): I'm here, running late, live location
  const onTheTrip = !!roomTrip && tripIsOn(roomTrip) && canSend;
  const sharingHere = useLiveShare((s) => s.share?.conversationId === id);
  const [lateMenu, setLateMenu] = useState(false);
  const [liveMenu, setLiveMenu] = useState(false);
  const checkIn = async () => {
    if (!me) return;
    if (!(await askForLocation())) return cards.notify({ message: t('chat.trip.noLocation') });
    const card = await checkInCard();
    if (!card) return cards.notify({ message: t('chat.trip.noFix') });
    sendCard(client, me, id, card);
  };
  const lateActions: SheetAction[] = LATE_CHOICES.map((m) => ({
    key: `late-${m}`,
    label: m === 60 ? t('today.lateHour') : t('today.lateBy_min', { n: f.n(m) }),
    icon: 'clock-alert-outline' as const,
    onPress: () => me && sendCard(client, me, id, lateCard(m, 'room')),
  }));
  const startLive = (length: LiveLength) =>
    me &&
    void startLiveShare(client, me, id, name, length).catch((e: unknown) =>
      cards.notify({ message: e instanceof NoLocation ? t('chat.trip.noLocation') : e instanceof Error ? e.message : t('common.error') }),
    );
  const liveActions: SheetAction[] = [
    { key: 'live-15m', label: t('chat.live.for15'), icon: 'crosshairs-gps' as const, onPress: () => startLive('15m') },
    { key: 'live-1h', label: t('chat.live.for1h'), icon: 'crosshairs-gps' as const, onPress: () => startLive('1h') },
    { key: 'live-day', label: t('chat.live.forDay'), icon: 'crosshairs-gps' as const, onPress: () => startLive('day') },
  ];
  const headerActions: SheetAction[] = [
    ...roomActions,
    muted
      ? {
          key: 'unmute',
          label: t('chat.header.unmute'),
          icon: 'bell-outline' as const,
          onPress: () => void mute(null),
        }
      : {
          key: 'mute',
          label: t('chat.header.mute'),
          icon: 'bell-off-outline' as const,
          onPress: () => setMuteMenu(true),
        },
    ...(other
      ? [
          {
            key: 'profile',
            label: t('chat.header.profile'),
            icon: 'account-outline' as const,
            onPress: () => router.push(`/friends/${other.id}`),
          },
        ]
      : []),
    {
      key: 'delete',
      label: t('chat.header.delete'),
      icon: 'delete-outline' as const,
      onPress: deleteForMe,
    },
    ...(roomTrip && !isOwner ? [{ key: 'leave', label: t('chat.room.leave'), icon: 'exit-run' as const, danger: true, onPress: leaveRoom }] : []),
    ...(other && canSend
      ? [
          {
            key: 'unfriend',
            label: t('chat.header.unfriend'),
            icon: 'account-remove-outline' as const,
            onPress: () => friendActions.remove(other.id, name, refreshChat),
          },
        ]
      : []),
    ...(other
      ? [
          {
            key: 'block',
            label: t('chat.header.block', { name }),
            icon: 'cancel' as const,
            danger: true,
            onPress: () =>
              friendActions.block(other.id, name, () => {
                refreshChat();
                router.back();
              }),
          },
        ]
      : []),
  ];

  const send = (text: string) => {
    if (!me) return;
    queueText(me, id, text, new Date(), replyTo ?? undefined);
    setReplyTo(null);
    void flushChat(me, client);
  };

  const onUnsentPress = useCallback(
    (clientId: string) => {
      if (!me) return;
      const item = useChatOutbox.getState().items.find((i) => i.clientId === clientId);
      const refused = item?.state === 'failed';
      Alert.alert(refused ? t('chat.failedTitle') : t('chat.waitingTitle'), refused ? item?.error : t('chat.waitingBody'), [
        {
          text: t('chat.tryAgain'),
          onPress: () => void retry(me, clientId, client),
        },
        {
          text: t('chat.deleteMessage'),
          style: 'destructive',
          onPress: () => discard(clientId),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [me, client, t],
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) =>
      item.type === 'day' ? (
        <DayPill label={item.label} />
      ) : (
        <MessageBubble
          bubble={item.bubble}
          senderName={roomTrip ? nameOf(item.bubble.senderId) : name}
          conversationId={id}
          onUnsentPress={onUnsentPress}
          handlers={handlers}
        />
      ),
    [name, id, onUnsentPress, handlers, roomTrip, nameOf],
  );

  const gone = conversation.isError && conversation.error instanceof ApiError && conversation.error.status === 404;

  return (
    <CardActionsProvider value={cards.actions}>
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <PressableScale
            pressEffect="opacity"
            haptic="none"
            style={styles.back}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            testID="chat-back"
          >
            <MaterialCommunityIcons name="arrow-left" size={26} color={colors.textPrimary} />
          </PressableScale>
          {chat && roomTrip ? (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              style={styles.who}
              onPress={openTrip}
              accessibilityRole="button"
              accessibilityLabel={`${name}${muted ? `, ${t('chat.header.mutedLabel')}` : ''}. ${roomLine}`}
              accessibilityHint={t('chat.room.openPlan')}
              testID="chat-header"
            >
              <View style={styles.roomIcon}>
                <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.onAccentSoft} />
              </View>
              <View style={styles.whoText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
                    {name}
                  </Text>
                  {muted ? (
                    <MaterialCommunityIcons name="bell-off-outline" size={18} color={colors.textSecondary} />
                  ) : null}
                </View>
                <Text style={styles.roomLine} numberOfLines={1} testID="room-members-line">
                  {roomLine}
                </Text>
              </View>
            </PressableScale>
          ) : chat ? (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              style={styles.who}
              disabled={!chat.other}
              onPress={() => chat.other && router.push(`/friends/${chat.other.id}`)}
              accessibilityRole="button"
              accessibilityLabel={
                (chat.other ? t('chat.openProfile', { name }) : name) +
                (muted ? `, ${t('chat.header.mutedLabel')}` : '') +
                (onTrip ? `. ${tripLine(onTrip, t, i18n.language, f.n)}` : '')
              }
              testID="chat-header"
            >
              <Avatar name={name} id={chat.other?.id} size={40} />
              <View style={styles.whoText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
                    {name}
                  </Text>
                  {muted ? (
                    <MaterialCommunityIcons name="bell-off-outline" size={18} color={colors.textSecondary} />
                  ) : null}
                </View>
                {/* On a trip, or leaving soon (step 6) */}
                {onTrip ? (
                  <View style={styles.tripRow} testID="chat-header-trip">
                    <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.onAccentSoft} />
                    <Text style={styles.tripText} numberOfLines={1}>
                      {tripLine(onTrip, t, i18n.language, f.n)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </PressableScale>
          ) : null}
          {chat && !gone ? (
            <PressableScale
              pressEffect="opacity"
              haptic="selection"
              style={styles.back}
              onPress={() => setChatMenu(true)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.header.menu')}
              testID="chat-menu"
            >
              <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.textPrimary} />
            </PressableScale>
          ) : null}
        </View>

        {roomTrip && !gone ? <PlanBar trip={roomTrip} onOpen={openTrip} /> : null}
        {roomTrip && !gone && sharingHere ? <LiveShareBar variant="inline" /> : null}

        {gone ? (
          <View style={styles.center} testID="chat-unavailable">
            <Text style={styles.centerText}>{t('chat.unavailable')}</Text>
            <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
          </View>
        ) : thread.isError && !messages ? (
          <View style={styles.center}>
            <Text style={styles.centerText}>{t('chat.loadFailed')}</Text>
            <Button variant="secondary" label={t('common.retry')} onPress={() => void thread.refetch()} />
          </View>
        ) : !messages && thread.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center} testID="chat-empty">
            <Avatar name={name} id={chat?.other?.id} size={72} />
            <Text style={styles.centerText}>{roomTrip ? t('chat.room.empty') : t('chat.sayHello', { name })}</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            ListHeaderComponent={typing ? <TypingBubble name={roomTrip ? nameOf(typing) : name} /> : null}
            ListFooterComponent={
              thread.data?.hasOlder ? (
                olderFailed ? (
                  <View style={styles.olderFailed} testID="chat-older-failed">
                    <Text style={styles.olderFailedText}>{t('chat.olderFailed')}</Text>
                    <Button variant="small" label={t('common.retry')} onPress={older} testID="chat-older-retry" />
                  </View>
                ) : (
                  <ActivityIndicator style={styles.older} color={colors.textSecondary} accessibilityLabel={t('chat.loadingOlder')} />
                )
              ) : null
            }
            onEndReached={older}
            onEndReachedThreshold={0.5}
            {...scrollPerf}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            testID="chat-messages"
          />
        )}

        {chat && !gone ? (
          chat.can_send ? (
            <View style={{ paddingBottom: insets.bottom + 8 }}>
              {onTheTrip ? (
                // Quick chips during the trip (mockup 11); no photos yet (decision C5)
                <View style={styles.chips} accessibilityRole="toolbar" accessibilityLabel={t('chat.trip.quick')}>
                  <PressableScale pressEffect="opacity" haptic="selection" onPress={() => void checkIn()} style={styles.chip} accessibilityRole="button" testID="chip-checkin">
                    <MaterialCommunityIcons name="flag-outline" size={16} color={colors.success} />
                    <Text style={styles.chipText}>{t('chat.trip.checkin')}</Text>
                  </PressableScale>
                  <PressableScale pressEffect="opacity" haptic="selection" onPress={() => setLateMenu(true)} style={styles.chip} accessibilityRole="button" testID="chip-late">
                    <MaterialCommunityIcons name="clock-alert-outline" size={16} color={colors.warning} />
                    <Text style={styles.chipText}>{t('chat.trip.late')}</Text>
                  </PressableScale>
                </View>
              ) : null}
              <Composer
                onSend={send}
                onTyping={() => sendTyping(id)}
                onShare={() => setSharing(true)}
                replyTo={
                  replyTo
                    ? {
                        name: nameOf(replyTo.sender_id),
                        text: quoteText(replyTo, t, i18n.language),
                      }
                    : null
                }
                onCancelReply={() => setReplyTo(null)}
                placeholder={roomTrip ? t('chat.room.placeholder') : undefined}
              />
            </View>
          ) : (
            <View style={[styles.readOnly, { paddingBottom: insets.bottom + 12 }]} testID="chat-read-only">
              <MaterialCommunityIcons name="lock-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.readOnlyText}>
                {chat.read_only_reason === 'account_deleted' ? t('chat.readOnlyGone') : t('chat.readOnlyNotFriends', { name })}
              </Text>
            </View>
          )
        ) : null}
        <Snackbar message={cards.snack?.message ?? null} actionLabel={cards.snack?.actionLabel} onAction={cards.snack?.onAction} testID="chat-snack" />
        <ShareSheet
          visible={sharing}
          name={name}
          trips={shareTrips}
          wants={wants}
          placeName={placeName}
          onPick={openShare}
          onTheTrip={onTheTrip}
          onTrip={(trip) =>
            me &&
            sendCard(
              client,
              me,
              id,
              tripCard(
                trip,
                {
                  id: me,
                  name: meProfile?.display_name || meProfile?.username || '',
                },
                destinations.data,
              ),
            )
          }
          onWant={(v) => me && sendCard(client, me, id, mapPlaceCard(v.place_type as 'region' | 'country', v.place_code, placeName(v)))}
          onClose={() => setSharing(false)}
        />
        <ActionSheet visible={!!cards.picker} title={cards.picker?.title ?? ''} actions={cards.picker?.actions ?? []} onClose={cards.closePicker} />
        <MessageMenu
          visible={!!menuFor}
          kind={menuFor?.kind ?? 'text'}
          preview={menuFor ? menuText(menuFor) : ''}
          mine={menuFor && me ? myReaction(menuFor.reactions, me) : null}
          canReact={canSend}
          actions={menuActions}
          copyLabel={menuPlace ? t('chat.menu.copyName') : t('chat.menu.copy')}
          onReact={(reaction) => menuFor && react(menuFor, reaction)}
          onAction={onMenuAction}
          onClose={() => setMenuFor(null)}
        />
        <ReactorsSheet
          visible={!!reactorsBubble}
          reactors={reactorsBubble && me ? reactorsOf(reactorsBubble.reactions ?? {}, me, nameOf) : []}
          onRemoveMine={() => reactorsBubble && react({ ...reactorsBubble, reactions: reactorsBubble.reactions ?? {} }, null)}
          onClose={() => setReactorsId(null)}
        />
        <ActionSheet visible={chatMenu} title={name} actions={headerActions} onClose={() => setChatMenu(false)} />
        <ActionSheet visible={lateMenu} title={t('chat.trip.lateTitle')} actions={lateActions} onClose={() => setLateMenu(false)} />
      <ActionSheet visible={liveMenu} title={t('chat.live.startTitle')} actions={liveActions} onClose={() => setLiveMenu(false)} />
      <ActionSheet visible={membersSheet} title={t('chat.room.membersTitle')} actions={memberActions} onClose={() => setMembersSheet(false)} />
        <ActionSheet visible={muteMenu} title={t('chat.header.muteTitle', { name })} actions={muteActions} onClose={() => setMuteMenu(false)} />
      </KeyboardAvoidingView>
    </CardActionsProvider>
  );
}

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.xs,
    paddingBottom: t.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  back: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm + 2,
    minHeight: 48,
  },
  whoText: { flex: 1, gap: 1 },
  roomIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' },
  roomLine: { ...t.type.footnote, color: t.colors.textSecondary },
  chips: { flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.md, paddingBottom: t.spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { ...t.type.footnote, fontWeight: '500', color: t.colors.textPrimary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  name: { ...t.type.headline, color: t.colors.textPrimary, flexShrink: 1 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripText: { ...t.type.footnote, color: t.colors.onAccentSoft, flexShrink: 1 },
  list: { paddingVertical: t.spacing.sm },
  older: { marginVertical: t.spacing.md },
  olderFailed: { alignItems: 'center', gap: t.spacing.sm, marginVertical: t.spacing.md },
  olderFailedText: { ...t.type.footnote, color: t.colors.textSecondary, textAlign: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.lg,
    padding: t.spacing.xxl,
  },
  centerText: {
    ...t.type.body,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
  },
  readOnlyText: { ...t.type.footnote, color: t.colors.textSecondary, flex: 1 },
}));
