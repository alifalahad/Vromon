/**
 * Sending cards (docs/friends-chat-plan.md, step 4): what the server needs for each
 * card (only ids and the sender's own words), and a preview so the card shows at
 * once, while the outbox sends it. The server's own card replaces the preview.
 */

import type { QueryClient } from '@tanstack/react-query';

import type { CardKind, Destination, IdeaCard, Place, PlaceCard, PollCard, Trip, TripCard } from '../../types';
import { HOME_REGIONS } from '../map/geoData';
import { durationDays } from '../trips/dates';
import { flushChat, queueCard, queueText } from './outbox';
import { openChatWith } from './queries';

/** A card ready to send: `payload` for the server, `preview` for the screen meanwhile. */
export type OutgoingCard = { kind: CardKind; payload: Record<string, unknown>; preview: Record<string, unknown> };

const where = (d: Pick<Destination, 'latitude' | 'longitude' | 'region_code'> | undefined) =>
  d ? { region: d.region_code ?? null, lat: d.latitude, lon: d.longitude } : {};

export function tripCard(trip: Trip, me: { id: string; name: string }, destinations?: readonly Destination[]): OutgoingCard {
  const preview: TripCard = {
    trip_id: trip.id,
    owner_id: trip.user_id ?? me.id,
    owner_name: me.name,
    title: trip.title ?? null,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    days: durationDays(trip.start_date, trip.end_date),
    travelers: trip.num_travelers,
    // Unknown until the server counts the plan's stops
    stops: -1,
    ...where(destinations?.find((d) => d.name === trip.destination)),
  };
  return { kind: 'trip', payload: { trip_id: trip.id }, preview: preview as unknown as Record<string, unknown> };
}

export function destinationCard(d: Destination): OutgoingCard {
  // The count only when known (the server's card has it anyway): never a made-up 0
  const preview: PlaceCard = { type: 'destination', id: d.id, name: d.name, places: d.place_count, ...where(d) };
  return { kind: 'place', payload: { type: 'destination', ref: String(d.id) }, preview: preview as unknown as Record<string, unknown> };
}

export function attractionCard(p: Place, destinations?: readonly Destination[]): OutgoingCard {
  const d = destinations?.find((x) => x.name === p.destination_name);
  const preview: PlaceCard = {
    type: 'attraction',
    id: p.id,
    name: p.name,
    category: p.category,
    destination: p.destination_name,
    destination_id: d?.id,
    region: d?.region_code ?? null,
    lat: p.latitude,
    lon: p.longitude,
  };
  return { kind: 'place', payload: { type: 'attraction', ref: String(p.id) }, preview: preview as unknown as Record<string, unknown> };
}

/** A division, city or country from the map. */
export function mapPlaceCard(type: 'region' | 'city' | 'country', code: string, name: string, extra: Partial<PlaceCard> = {}): OutgoingCard {
  const home = type === 'region' ? HOME_REGIONS.features.find((f) => f.properties.code === code)?.properties : undefined;
  const preview: PlaceCard = {
    type,
    code,
    name,
    region: type === 'region' ? code : (extra.region ?? null),
    ...(home ? { name_bn: home.name_bn, lon: home.label[0], lat: home.label[1] } : {}),
    ...extra,
  };
  return { kind: 'place', payload: { type, ref: code }, preview: preview as unknown as Record<string, unknown> };
}

export function ideaCard(
  destination: Destination,
  idea: Pick<IdeaCard, 'month' | 'part' | 'days' | 'note'>,
): OutgoingCard {
  const payload: Record<string, unknown> = { destination_id: destination.id };
  for (const [key, value] of Object.entries(idea)) if (value != null && value !== '') payload[key] = value;
  const preview: IdeaCard = { destination_id: destination.id, destination: destination.name, ...where(destination), ...idea };
  return { kind: 'idea', payload, preview: preview as unknown as Record<string, unknown> };
}

/** This month and the next five, as "2026-12": the months a trip idea offers. */
export function nextMonths(now = new Date(), count = 6): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/** What's still wrong with a poll before it can be sent (the server checks the same). */
export function pollProblem(question: string, options: readonly string[]): 'empty' | 'fewAnswers' | 'repeated' | null {
  const answers = options.map((o) => o.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!question.trim()) return 'empty';
  if (answers.length < 2) return 'fewAnswers';
  if (new Set(answers.map((a) => a.toLocaleLowerCase())).size !== answers.length) return 'repeated';
  return null;
}

export function pollCard(question: string, options: string[], multiple: boolean): OutgoingCard {
  const preview: PollCard = { question, options: options.map((text, i) => ({ id: i + 1, text })), multiple };
  return { kind: 'poll', payload: { question, options, multiple }, preview: preview as unknown as Record<string, unknown> };
}

/** Into one chat, through the outbox. */
export function sendCard(client: QueryClient, me: string, conversationId: number, card: OutgoingCard) {
  queueCard(me, conversationId, card.kind, card.payload, card.preview);
  void flushChat(me, client);
}

/**
 * "Send to a friend" (mockup 9, Send a copy): the card into each friend's chat, then
 * the note as its own message. Opening a chat needs the server (a chat may be new);
 * after that the outbox does the rest, offline too, so this doesn't wait for the sends.
 * Returns each friend's chat.
 */
export async function sendCardToFriends(client: QueryClient, me: string, friendIds: readonly string[], card: OutgoingCard, note?: string) {
  const text = note?.trim();
  const chats: number[] = [];
  for (const friend of friendIds) {
    const conversation = await openChatWith(client, friend);
    queueCard(me, conversation, card.kind, card.payload, card.preview);
    if (text) queueText(me, conversation, text);
    chats.push(conversation);
  }
  void flushChat(me, client);
  return chats;
}
