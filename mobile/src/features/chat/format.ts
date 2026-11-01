/**
 * Chat formatting (docs/friends-chat-plan.md, section 2): day separators, the
 * grouping of a run of messages, times, ticks and the chat list's preview.
 * Pure functions, so the screens only render.
 */

import type { TFunction } from 'i18next';

import type { CardKind, ChatMessage, Conversation, ReplyPreview } from '../../types';
import { dateFormat } from '../../utils/dateFormat';
import type { OutboxItem } from './outbox';

/** Messages from one person less than this far apart share one time label */
export const GROUP_MINUTES = 3;

const DAY_MS = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (iso: string, now: Date) => Math.round((dayStart(now) - dayStart(new Date(iso))) / DAY_MS);

/** "Today", "Yesterday", a weekday in the last week, "2 Nov", or "2 Nov 2025" in another year. */
export function dayLabel(iso: string, now: Date, t: TFunction, lang: string): string {
  const days = daysAgo(iso, now);
  if (days === 0) return t('chat.today');
  if (days === 1) return t('chat.yesterday');
  const d = new Date(iso);
  if (days > 1 && days < 7) return dateFormat(lang, { weekday: 'long' }).format(d);
  return dateFormat(
    lang,
    d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(d);
}

/** The time a message was sent, in the language's own digits. */
export const timeLabel = (iso: string, lang: string) => dateFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** The chat list's time column: a time today, otherwise the day. */
export const listTime = (iso: string, now: Date, t: TFunction, lang: string) => (daysAgo(iso, now) === 0 ? timeLabel(iso, lang) : dayLabel(iso, now, t, lang));

type Person = { id: string; name: string } | null | undefined;

/** "Rafi", "Rafi and Nusrat", "Rafi, Nusrat and Mim" */
export function nameList(names: string[], t: TFunction): string {
  if (names.length < 2) return names[0] ?? '';
  return t('chat.system.list', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] });
}

/**
 * A line from Vromon itself, as this person reads it: "You invited Rafi and Nusrat",
 * "Ana added Madhabpur Lake to Day 2" (trip rooms, step 7). Unknown events still say something.
 */
export function systemText(message: ChatMessage, t: TFunction, me?: string, lang = 'en'): string {
  const p = message.payload ?? {};
  const event = typeof p.event === 'string' ? p.event : '';
  const who = (person: Person, you: 'you' | 'You') => (person && person.id === me ? t(`chat.system.${you}`) : person?.name || t('chat.system.someone'));
  const actor = p.actor as Person;
  const target = p.target as Person;
  const mine = !!actor && actor.id === me;
  switch (event) {
    case 'invited': {
      const names = ((p.targets as Person[]) ?? []).map((x) => who(x, 'you'));
      return t(mine ? 'chat.system.invitedByYou' : 'chat.system.invited', { actor: who(actor, 'You'), names: nameList(names, t) });
    }
    case 'joined':
    case 'left':
      return t(mine ? `chat.system.${event}You` : `chat.system.${event}`, { actor: who(actor, 'You') });
    case 'removed':
      return t(mine ? 'chat.system.removedByYou' : 'chat.system.removed', { actor: who(actor, 'You'), target: who(target, 'you') });
    case 'added':
      return t(mine ? 'chat.system.addedByYou' : 'chat.system.added', {
        actor: who(actor, 'You'),
        place: typeof p.place === 'string' ? p.place : '',
        day: typeof p.day === 'number' ? p.day.toLocaleString(lang) : '',
      });
    default:
      return t(`chat.system.${event}`, { defaultValue: t('chat.system.other') });
  }
}

/** Who a direct chat is with, or a trip room's trip ("Sreemangal trip"), as the list and the header show it. */
export const chatName = (c: Pick<Conversation, 'other'> & Partial<Pick<Conversation, 'kind' | 'trip'>>, t: TFunction) =>
  c.kind === 'trip' && c.trip
    ? c.trip.title || t('chat.room.name', { destination: c.trip.destination })
    : c.other
      ? c.other.display_name || `@${c.other.username}`
      : t('chat.deletedAccount');

export const CARD_KINDS: readonly CardKind[] = ['trip', 'place', 'idea', 'poll', 'invite', 'checkin', 'late', 'live'];
export const isCard = (kind: string): kind is CardKind => (CARD_KINDS as readonly string[]).includes(kind);

/** A card's main line: where a trip or idea goes, a place's name, a poll's question. */
export function cardTitle(kind: CardKind, payload: Record<string, unknown> | null | undefined, lang = 'en'): string {
  const p = payload ?? {};
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  if (kind === 'place') return (lang === 'bn' && text(p.name_bn)) || text(p.name);
  if (kind === 'poll') return text(p.question);
  // On the trip (step 8): where you checked in, the stop you're late for; a live location has no title
  if (kind === 'checkin') return text(p.stop) || text(p.near);
  if (kind === 'late') return text(p.stop);
  if (kind === 'live') return '';
  return text(p.destination);
}

/** "Trip plan: Sreemangal" (or "…: No longer available") for the chat list and screen readers. */
export function cardSummary(kind: CardKind, payload: Record<string, unknown> | null | undefined, t: TFunction, lang = 'en'): string {
  const title = payload?.available === false ? t('chat.cards.unavailable') : cardTitle(kind, payload, lang);
  return title ? t('chat.cards.summary', { kind: t(`chat.cards.${kind}.eyebrow`), title }) : t(`chat.cards.${kind}.eyebrow`);
}

/** The chat list's second line. */
export function preview(c: Conversation, me: string, t: TFunction, lang = 'en'): { text: string; quiet: boolean } {
  const m = c.last_message;
  if (!m) return { text: '', quiet: true };
  if (m.deleted) return { text: t('chat.messageRemoved'), quiet: true };
  if (m.kind === 'system') return { text: systemText(m, t, me, lang), quiet: true };
  const body = isCard(m.kind) ? cardSummary(m.kind, m.payload, t, lang) : (m.body ?? '').replace(/\s+/g, ' ');
  return { text: m.sender_id === me ? t('chat.you', { text: body }) : body, quiet: false };
}

export type BubbleStatus = 'sending' | 'waiting' | 'failed' | 'sent' | 'read';

export interface Bubble {
  key: string;
  /** null while the message is only in the outbox */
  id: number | null;
  clientId: string | null;
  mine: boolean;
  senderId: string | null;
  kind: string;
  body: string | null;
  /** A card's snapshot (the outbox's preview while it's sending) */
  payload: Record<string, unknown> | null;
  /** Polls and trip ideas: who chose each answer */
  votes: Record<string, string[]> | null;
  /** Who reacted with what */
  reactions: Record<string, string[]>;
  /** The message it replies to */
  replyTo: ReplyPreview | null;
  deleted: boolean;
  createdAt: string;
  /** Your own messages only */
  status: BubbleStatus | null;
  error?: string;
  /** The last of a run from one person: it shows the time and the tail */
  lastInRun: boolean;
  /** The first of a run: in a trip room, it carries the sender's name */
  firstInRun?: boolean;
}

export type Row = { type: 'day'; key: string; label: string } | { type: 'bubble'; key: string; bubble: Bubble };

/**
 * The last bubble built for each saved message, given again while nothing about it changed,
 * so React.memo skips it: a long chat doesn't draw every bubble again when a page of older
 * messages, a new message or the next minute arrives (step 10). Messages keep their identity
 * between fetches (TanStack Query's structural sharing), so this follows them and lets go with them.
 */
const built = new WeakMap<ChatMessage, Bubble>();
// The rows around those bubbles, and the day separator that a bubble starts, given again too:
// the list draws a row again whenever its object changes, even when the bubble inside doesn't
const bubbleRows = new WeakMap<Bubble, Row>();
const dayRows = new WeakMap<Bubble, Row>();

function remember(rows: WeakMap<Bubble, Row>, bubble: Bubble, row: Row): Row {
  rows.set(bubble, row);
  return row;
}
// One empty object for "no reactions", so it compares equal
const NO_REACTIONS: Record<string, string[]> = Object.freeze({}) as Record<string, string[]>;

function sameBubble(a: Bubble, b: Bubble): boolean {
  const keys = Object.keys(b) as (keyof Bubble)[];
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

/**
 * The chat's rows, newest first (for an inverted list): saved messages and your
 * own unsent ones from the outbox, with a separator wherever the day changes.
 */
export function buildRows(
  messages: readonly ChatMessage[],
  pending: readonly OutboxItem[],
  me: string,
  otherReadUpTo: number | null,
  now: Date,
  t: TFunction,
  lang: string,
): Row[] {
  const saved = new Set(messages.map((m) => m.client_id).filter(Boolean));
  const sources: (ChatMessage | null)[] = [...messages, ...pending.filter((p) => !saved.has(p.clientId)).map(() => null)];
  const bubbles: Omit<Bubble, 'lastInRun'>[] = [
    ...messages.map((m) => {
      const mine = m.sender_id === me;
      return {
        key: m.client_id && mine ? `c:${m.client_id}` : `m:${m.id}`,
        id: m.id,
        clientId: m.client_id,
        mine,
        senderId: m.sender_id,
        kind: m.kind,
        body: m.kind === 'system' ? systemText(m, t, me, lang) : m.body,
        payload: m.payload,
        votes: m.votes ?? null,
        reactions: m.reactions ?? NO_REACTIONS,
        replyTo: m.reply_to ?? null,
        deleted: m.deleted,
        createdAt: m.created_at,
        status: mine ? ((otherReadUpTo ?? 0) >= m.id ? 'read' : 'sent') : null,
      } as Omit<Bubble, 'lastInRun'>;
    }),
    // An outbox message the server already has shows once, as the saved one
    ...pending
      .filter((p) => !saved.has(p.clientId))
      .map((p) => ({
        key: `c:${p.clientId}`,
        id: null,
        clientId: p.clientId,
        mine: true,
        senderId: me,
        kind: p.kind ?? 'text',
        body: p.kind ? null : p.body,
        payload: p.preview ?? null,
        votes: null,
        reactions: NO_REACTIONS,
        replyTo: p.replyPreview ?? null,
        deleted: false,
        createdAt: p.createdAt,
        status: p.state,
        error: p.error,
      })),
  ];

  // Each time and day once: parsing dates for every comparison took ~100 ms for 2,000 messages (step 10)
  const today = dayStart(now);
  const at = bubbles.map((b) => Date.parse(b.createdAt));
  const day = at.map((ms) => Math.round((today - dayStart(new Date(ms))) / DAY_MS));
  const sameRun = (i: number, j: number) =>
    bubbles[i].kind !== 'system' &&
    bubbles[j].kind !== 'system' &&
    bubbles[i].senderId === bubbles[j].senderId &&
    day[i] === day[j] &&
    Math.abs(at[j] - at[i]) < GROUP_MINUTES * 60_000;

  const rows: Row[] = [];
  bubbles.forEach((b, i) => {
    const first = i === 0;
    const last = i === bubbles.length - 1;
    const fresh: Bubble = { ...b, lastInRun: last || !sameRun(i, i + 1), firstInRun: first || !sameRun(i - 1, i) };
    const message = sources[i];
    const before = message ? built.get(message) : undefined;
    const bubble = before && sameBubble(before, fresh) ? before : fresh;
    if (message && bubble === fresh) built.set(message, fresh);
    if (first || day[i - 1] !== day[i]) {
      const key = `d:${b.createdAt.slice(0, 10)}:${b.key}`;
      const label = dayLabel(b.createdAt, now, t, lang);
      const old = dayRows.get(bubble);
      rows.push(old?.type === 'day' && old.key === key && old.label === label ? old : remember(dayRows, bubble, { type: 'day', key, label }));
    }
    rows.push(bubbleRows.get(bubble) ?? remember(bubbleRows, bubble, { type: 'bubble', key: b.key, bubble }));
  });
  return rows.reverse();
}
