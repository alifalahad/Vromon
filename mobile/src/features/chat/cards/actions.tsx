/**
 * What a card's buttons do (docs/friends-chat-plan.md, step 4). The chat screen
 * provides them once; every card in it uses the same.
 *
 * - Open plan: the trip screen (a friend's trip opens read-only).
 * - Copy to my trips: POST /trips/{id}/copy, then "Copied" with a way to open it.
 * - Want to go: the place on your Want list, through the map's own outbox (so it works
 *   offline). An attraction or a destination marks its division (decision C6). A place
 *   already on your map isn't changed.
 * - Add to a trip: pick one of your trips there, then its must-dos with the place added;
 *   with none, plan a new trip there with the place as a must-see.
 * - Plan a trip / Plan this trip: the trip wizard with the destination.
 * - Answers to polls and trip ideas show at once and are sent in the background.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { chatApi, roomsApi, tripsApi } from '../../../services/api';
import type { ChatMessage, IdeaCard, PlaceCard, ReactionKind, Trip, VisitStatus } from '../../../types';
import type { SheetAction } from '../../../ui/ActionSheet';
import { useMe } from '../../account/useMe';
import { homeRegionName } from '../../map/geoData';
import { setVisitStatus, statusOf, useVisits, type PlaceRef } from '../../map/visits';
import { formatRange, localToday } from '../../trips/dates';
import { refreshTrips, useTrips } from '../../trips/queries';
import { stopLiveShare } from '../liveShare';
import { chatKeys, messageChanged, type Thread } from '../queries';

export type CardActions = {
  me: string;
  /** Other people's names by id, for who answered what */
  names: Record<string, string>;
  openTrip: (tripId: number) => void;
  copyTrip: (tripId: number) => void;
  /** The trip being copied right now */
  copying: number | null;
  wantToGo: (place: PlaceCard) => void;
  /** Where the place (or, for an attraction, its division) is on your map */
  mapStatus: (place: PlaceCard) => VisitStatus | null;
  /** Whether Want to go can do anything for this place */
  canWant: (place: PlaceCard) => boolean;
  addToTrip: (place: PlaceCard) => void;
  /** The trip wizard there; `invite`: friends to invite once it's saved (a trip idea's "I'm in") */
  planTrip: (destination: string, place?: PlaceCard, invite?: string[]) => void;
  vote: (message: Pick<ChatMessage, 'id' | 'conversation_id' | 'votes'>, optionIds: number[]) => void;
  /** Your one reaction (null takes it back). "want" also puts the place on your Want list */
  react: (message: Pick<ChatMessage, 'id' | 'conversation_id' | 'kind' | 'payload' | 'reactions'>, reaction: ReactionKind | null) => void;
  /** Unsend your own message for everyone */
  unsend: (message: Pick<ChatMessage, 'id' | 'conversation_id'>) => void;
  /** Trip room invites (step 7): join, turn down, open the room */
  joining: number | null;
  joinRoom: (tripId: number) => void;
  declineRoom: (tripId: number) => void;
  openRoom: (conversationId: number) => void;
  /** In a trip room: its trip, for suggestions (null in a direct chat) */
  room: RoomContext | null;
  /** The owner adds a suggested place to a day (a day picker first), or says "not this time" */
  addSuggestion: (message: Pick<ChatMessage, 'id' | 'conversation_id'>, placeName: string) => void;
  declineSuggestion: (message: Pick<ChatMessage, 'id' | 'conversation_id'>) => void;
  /** Stop sharing your live location (step 8) */
  stopLive: () => void;
};

/** The trip a room is about, as its cards need it. */
export type RoomContext = { tripId: number; ownerId: string; ownerName: string; startDate: string; days: number };

const Context = createContext<CardActions | null>(null);

export const CardActionsProvider = ({ value, children }: { value: CardActions; children: React.ReactNode }) => (
  <Context.Provider value={value}>{children}</Context.Provider>
);

/** The actions, or null outside a chat (a card is then only shown). */
export const useCardActions = () => useContext(Context);

/** Where "Want to go" puts a place on the map: an attraction or destination by its division. */
export function wantTarget(place: PlaceCard): (PlaceRef & { name: string | null }) | null {
  if (place.type === 'attraction' || place.type === 'destination') {
    if (!place.region) return null;
    return { place_type: 'region', place_code: place.region, country_iso2: 'BD', name: null };
  }
  if (!place.code) return null;
  return {
    place_type: place.type,
    place_code: place.code,
    country_iso2: place.type === 'country' ? place.code : (place.country ?? null),
    name: place.name,
  };
}

type Snack = { message: string; actionLabel?: string; onAction?: () => void };

/**
 * The chat screen's card actions, its snackbar, and the trip picker for "Add to a trip".
 * `notify` shows a short message for a few seconds.
 */
export function useChatCardActions(names: Record<string, string>, room: RoomContext | null = null) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const me = useMe().data?.id ?? '';
  const visits = useVisits(me || undefined).data;
  const trips = useTrips();
  const lang = i18n.language === 'bn' ? 'bn' : 'en';
  const [snack, setSnack] = useState<Snack | null>(null);
  const [copying, setCopying] = useState<number | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((s: Snack) => {
    if (timer.current) clearTimeout(timer.current);
    setSnack(s);
    // Longer when there's something to tap ("Copied · Open")
    timer.current = setTimeout(() => setSnack(null), s.onAction ? 8000 : 4000);
  }, []);

  const planTrip = useCallback(
    (destination: string, place?: PlaceCard, invite?: string[]) =>
      router.push({
        pathname: '/trip/new',
        params: {
          destination,
          ...(place?.type === 'attraction' && place.id ? { mustSee: String(place.id), mustSeeName: place.name } : {}),
          ...(invite?.length ? { invite: invite.join(',') } : {}),
        },
      }),
    [router],
  );

  const actions = useMemo<CardActions>(() => {
    const placeName = (place: PlaceCard) => (lang === 'bn' && place.name_bn) || place.name;
    const wantToGo = (place: PlaceCard) => {
      const target = wantTarget(place);
      if (!target || !me) return;
      const division = target.place_type === 'region' ? homeRegionName(target.place_code, lang) : undefined;
      const name = target.name ? placeName(place) : (division ?? placeName(place));
      // Already visited, lived in, or wanted: nothing to change
      if (statusOf(visits, target.place_type, target.place_code)) {
        notify({ message: t('chat.cards.place.already', { place: name }) });
        return;
      }
      setVisitStatus(client, me, target, 'want');
      notify({ message: t('chat.cards.place.wantAdded', { place: name }) });
    };
    return {
      me,
      names,
      copying,
      openTrip: (tripId) => router.push({ pathname: '/trip/[id]', params: { id: String(tripId) } }),
      copyTrip: (tripId) => {
        setCopying(tripId);
        tripsApi
          .copy(tripId)
          .then((copy: Trip) => {
            refreshTrips(client);
            notify({
              message: t('chat.cards.trip.copied'),
              actionLabel: t('chat.cards.trip.openCopy'),
              onAction: () => router.push({ pathname: '/trip/[id]', params: { id: String(copy.id) } }),
            });
          })
          .catch((e: unknown) => notify({ message: e instanceof Error ? e.message : t('chat.cards.trip.copyFailed') }))
          .finally(() => setCopying(null));
      },
      canWant: (place) => wantTarget(place) !== null,
      mapStatus: (place) => {
        const target = wantTarget(place);
        return target ? statusOf(visits, target.place_type, target.place_code) : null;
      },
      wantToGo,
      addToTrip: (place) => {
        if (place.type !== 'attraction' || !place.id || !place.destination) return;
        const today = localToday();
        const there = (trips.data ?? []).filter((trip) => trip.destination === place.destination && trip.end_date >= today);
        const placeId = place.id;
        setPicker({
          title: t('chat.cards.place.pickTrip', { place: placeName(place) }),
          actions: [
            ...there.map((trip) => ({
              key: `trip-${trip.id}`,
              label: `${trip.destination} · ${formatRange(trip.start_date, trip.end_date, i18n.language)}`,
              icon: 'calendar-blank-outline' as const,
              onPress: () => router.push({ pathname: '/trip/must-dos/[id]', params: { id: String(trip.id), add: String(placeId), addName: place.name } }),
            })),
            {
              key: 'new',
              label: t('chat.cards.place.newTrip', { destination: place.destination }),
              icon: 'plus' as const,
              onPress: () => planTrip(place.destination!, place),
            },
          ],
        });
      },
      planTrip,
      joining,
      room,
      joinRoom: (tripId) => {
        setJoining(tripId);
        roomsApi
          .join(tripId)
          .then((joined) => {
            void client.invalidateQueries({ queryKey: chatKeys.list });
            void client.invalidateQueries({ queryKey: ['joinedTrips'] });
            if (joined.conversation_id != null) router.push({ pathname: '/chat/[id]', params: { id: String(joined.conversation_id) } });
          })
          .catch((e: unknown) => notify({ message: e instanceof Error ? e.message : t('chat.cards.invite.joinFailed') }))
          .finally(() => setJoining(null));
      },
      declineRoom: (tripId) => {
        setJoining(tripId);
        roomsApi
          .remove(tripId, me)
          .then(() => notify({ message: t('chat.cards.invite.declined') }))
          .catch((e: unknown) => notify({ message: e instanceof Error ? e.message : t('common.error') }))
          .finally(() => setJoining(null));
      },
      openRoom: (conversationId) => router.push({ pathname: '/chat/[id]', params: { id: String(conversationId) } }),
      addSuggestion: (message, place) => {
        if (!room) return;
        const start = new Date(`${room.startDate}T00:00:00`);
        setPicker({
          title: t('chat.room.addTitle', { place }),
          actions: Array.from({ length: room.days }, (_, i) => {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            return {
              key: `day-${i + 1}`,
              label: t('chat.room.dayOption', {
                n: (i + 1).toLocaleString(i18n.language),
                date: date.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }),
              }),
              icon: 'calendar-plus' as const,
              onPress: () =>
                roomsApi
                  .accept(room.tripId, message.id, i + 1)
                  .then((saved) => {
                    messageChanged(client, saved);
                    for (const key of ['itinerary', 'trip', 'budget']) void client.invalidateQueries({ queryKey: [key, room.tripId] });
                  })
                  .catch((e: unknown) => notify({ message: e instanceof Error ? e.message : t('common.error') })),
            };
          }),
        });
      },
      stopLive: () => void stopLiveShare(client),
      declineSuggestion: (message) => {
        if (!room) return;
        roomsApi
          .decline(room.tripId, message.id)
          .then((saved) => messageChanged(client, saved))
          .catch((e: unknown) => notify({ message: e instanceof Error ? e.message : t('common.error') }));
      },
      react: (message, reaction) => {
        const before = message.reactions ?? {};
        const next: Record<string, string[]> = {};
        for (const [kind, people] of Object.entries(before)) {
          const others = people.filter((p) => p !== me);
          if (others.length) next[kind] = others;
        }
        if (reaction) next[reaction] = [...(next[reaction] ?? []), me];
        const setReactions = (reactions: Record<string, string[]>) =>
          client.setQueryData<Thread>(chatKeys.thread(message.conversation_id), (thread) =>
            thread ? { ...thread, messages: thread.messages.map((m) => (m.id === message.id ? { ...m, reactions } : m)) } : thread,
          );
        setReactions(next);
        chatApi
          .react(message.conversation_id, message.id, reaction)
          .then((saved) => messageChanged(client, saved))
          .catch((e: unknown) => {
            setReactions(before);
            notify({ message: e instanceof Error ? e.message : t('chat.reactions.failed') });
          });
        // Want: the place (or the trip idea's destination) goes on your Want list too
        if (reaction === 'want' && message.payload && message.payload.available !== false) {
          if (message.kind === 'place') wantToGo(message.payload as unknown as PlaceCard);
          if (message.kind === 'idea') {
            const idea = message.payload as unknown as IdeaCard;
            wantToGo({ type: 'destination', id: idea.destination_id, name: idea.destination, region: idea.region });
          }
        }
      },
      unsend: (message) => {
        // At once on screen; the server's live event says the same
        const gone = (m: ChatMessage): ChatMessage => ({ ...m, deleted: true, body: null, payload: null, votes: null, reactions: {}, reply_to: null });
        const before = client.getQueryData<Thread>(chatKeys.thread(message.conversation_id));
        client.setQueryData<Thread>(chatKeys.thread(message.conversation_id), (thread) =>
          thread ? { ...thread, messages: thread.messages.map((m) => (m.id === message.id ? gone(m) : m)) } : thread,
        );
        chatApi.unsend(message.conversation_id, message.id).catch((e: unknown) => {
          if (before) client.setQueryData(chatKeys.thread(message.conversation_id), before);
          notify({ message: e instanceof Error ? e.message : t('chat.menu.unsendFailed') });
        });
      },
      vote: (message, optionIds) => {
        const before = message.votes ?? {};
        // At once on screen: my answer replaces my old one
        const mineNow: Record<string, string[]> = {};
        for (const [option, voters] of Object.entries(before)) {
          const others = voters.filter((v) => v !== me);
          if (others.length) mineNow[option] = others;
        }
        for (const option of optionIds) mineNow[String(option)] = [...(mineNow[String(option)] ?? []), me];
        const setVotes = (votes: Record<string, string[]>) =>
          client.setQueryData<Thread>(chatKeys.thread(message.conversation_id), (thread) =>
            thread ? { ...thread, messages: thread.messages.map((m) => (m.id === message.id ? { ...m, votes } : m)) } : thread,
          );
        setVotes(mineNow);
        chatApi
          .vote(message.conversation_id, message.id, optionIds)
          .then((saved) => messageChanged(client, saved))
          .catch((e: unknown) => {
            setVotes(before);
            notify({ message: e instanceof Error ? e.message : t('chat.cards.voteFailed') });
          });
      },
    };
  }, [me, names, copying, joining, room, router, client, notify, t, lang, i18n.language, visits, trips.data, planTrip]);

  return { actions, snack, notify, picker, closePicker: () => setPicker(null) };
}
