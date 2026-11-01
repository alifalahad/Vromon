/**
 * Reactions and reply quotes (docs/friends-chat-plan.md, step 5; mockup 7). One
 * reaction per person per message; "want" is for places and trip ideas, and also
 * puts the place on your Want list.
 */

import type { TFunction } from 'i18next';

import type { ReactionKind, ReplyPreview } from '../../types';
import { cardSummary, isCard } from './format';

export const REACTIONS: readonly { kind: ReactionKind; emoji: string }[] = [
  { kind: 'heart', emoji: '❤️' },
  { kind: 'thumbs_up', emoji: '👍' },
  { kind: 'laugh', emoji: '😂' },
  { kind: 'wow', emoji: '😮' },
  { kind: 'want', emoji: '⭐' },
];

export const EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.kind, r.emoji])) as Record<ReactionKind, string>;

/** "Want" only on messages about a place */
export const takesWant = (kind: string) => kind === 'place' || kind === 'idea';

/** The reactions a message offers */
export const reactionsFor = (kind: string) => REACTIONS.filter((r) => r.kind !== 'want' || takesWant(kind));

/** Your reaction to a message, if any */
export function myReaction(reactions: Record<string, string[]> | undefined, me: string | undefined): ReactionKind | null {
  if (!me || !reactions) return null;
  const found = Object.entries(reactions).find(([, people]) => people.includes(me));
  return (found?.[0] as ReactionKind | undefined) ?? null;
}

/** The reactions in the order of the bar, with how many chose each */
export function reactionCounts(reactions: Record<string, string[]> | undefined): { kind: ReactionKind; emoji: string; count: number }[] {
  return REACTIONS.map((r) => ({ ...r, count: reactions?.[r.kind]?.length ?? 0 })).filter((r) => r.count > 0);
}

/** For screen readers: "Reactions: 2 heart, 1 laugh" */
export function reactionsLabel(reactions: Record<string, string[]> | undefined, t: TFunction, n: (v: number) => string): string {
  const parts = reactionCounts(reactions).map((r) => `${n(r.count)} ${t(`chat.reactions.${r.kind}`)}`);
  return t('chat.reactions.label', { list: parts.join(', ') });
}

/** What a quote shows: the text, a card's line, or "Message removed" */
export function quoteText(quote: Pick<ReplyPreview, 'kind' | 'body' | 'payload' | 'deleted'>, t: TFunction, lang: string): string {
  if (quote.deleted) return t('chat.messageRemoved');
  if (isCard(quote.kind)) return cardSummary(quote.kind, quote.payload, t, lang);
  return (quote.body ?? '').replace(/\s+/g, ' ');
}
