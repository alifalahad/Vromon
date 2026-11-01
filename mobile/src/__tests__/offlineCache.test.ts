import { dehydrate, QueryClient, type QueryKey } from '@tanstack/react-query';

import { chatKeys, type Thread } from '../features/chat/queries';
import { ApiError } from '../services/api';
import { CHAT_MESSAGES_SAVED, forDisk, persistOptions } from '../services/queryClient';
import type { ChatMessage } from '../types';

const message = (id: number): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: 'rafi',
  kind: 'text',
  body: `m${id}`,
  payload: null,
  reply_to_id: null,
  client_id: null,
  created_at: '2026-10-27T03:00:00+00:00',
  deleted: false,
});

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

/** What the app writes to AsyncStorage for this cache. */
function saved() {
  const disk = forDisk({ timestamp: 0, buster: 'v1', clientState: dehydrate(client, persistOptions.dehydrateOptions) });
  return (key: QueryKey) => disk.clientState.queries.find((q) => JSON.stringify(q.queryKey) === JSON.stringify(key))?.state;
}

/** Refresh a query that has data, and fail. */
async function failRefresh(key: QueryKey, error: Error) {
  await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(error), staleTime: 0 }).catch(() => undefined);
  expect(client.getQueryState(key)?.status).toBe('error');
}

it('keeps the last good data when a refresh fails offline, so the next offline start still shows it', async () => {
  client.setQueryData(['visits', 'ana'], [{ id: 1 }]);
  client.setQueryData(chatKeys.list, [{ id: 1 }]);
  await failRefresh(['visits', 'ana'], new ApiError('Cannot reach the server'));
  await failRefresh(chatKeys.list, new ApiError('Request failed (502)', 502));

  const state = saved();
  expect(state(['visits', 'ana'])).toMatchObject({ status: 'success', data: [{ id: 1 }], error: null });
  expect(state(chatKeys.list)).toMatchObject({ status: 'success', data: [{ id: 1 }] });
});

it('drops data the server said no to, and data it never had', async () => {
  client.setQueryData(['trip', 92], { id: 92 });
  await failRefresh(['trip', 92], new ApiError('Not found', 404));
  await client.fetchQuery({ queryKey: ['trips'], queryFn: () => Promise.reject(new ApiError('Cannot reach the server')) }).catch(() => undefined);
  client.setQueryData(['search', 'sylhet'], [{ id: 1 }]); // not a saved kind

  const state = saved();
  expect(state(['trip', 92])).toBeUndefined();
  expect(state(['trips'])).toBeUndefined();
  expect(state(['search', 'sylhet'])).toBeUndefined();
});

it('keeps the newest messages of each chat, and the screen keeps them all', () => {
  const long = Array.from({ length: 120 }, (_, i) => message(i + 1));
  client.setQueryData<Thread>(chatKeys.thread(1), { messages: long, hasOlder: false });
  client.setQueryData<Thread>(chatKeys.thread(2), { messages: [message(7)], hasOlder: false });

  const state = saved();
  const kept = state(chatKeys.thread(1))!.data as Thread;
  expect(kept.messages.map((m) => m.id)).toEqual(long.slice(-CHAT_MESSAGES_SAVED).map((m) => m.id));
  expect(kept.hasOlder).toBe(true); // the rest load again when scrolled to
  expect(state(chatKeys.thread(2))!.data).toEqual({ messages: [message(7)], hasOlder: false });
  expect(client.getQueryData<Thread>(chatKeys.thread(1))!.messages).toHaveLength(120);
});
