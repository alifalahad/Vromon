/**
 * Who answered a trip idea to a destination, from the chats already on the phone
 * (friends-chat step 7, mockup 9): the "Plan together" picker puts the friends who
 * said "I'm in" first, then those who said maybe, and ticks them.
 */

import type { QueryClient } from '@tanstack/react-query';

import type { IdeaCard } from '../../types';
import { chatKeys, type Thread } from './queries';

export type IdeaAnswer = 'in' | 'maybe';

/** Each friend's best answer to an idea for this destination (I'm in beats maybe). */
export function ideaAnswers(client: QueryClient, destination: string, me: string): Record<string, IdeaAnswer> {
  const out: Record<string, IdeaAnswer> = {};
  for (const [, thread] of client.getQueriesData<Thread>({ queryKey: chatKeys.all })) {
    for (const m of thread?.messages ?? []) {
      if (m.kind !== 'idea' || m.deleted || (m.payload as unknown as IdeaCard | null)?.destination !== destination) continue;
      for (const id of m.votes?.['2'] ?? []) if (id !== me && !out[id]) out[id] = 'maybe';
      for (const id of m.votes?.['1'] ?? []) if (id !== me) out[id] = 'in';
    }
  }
  return out;
}
