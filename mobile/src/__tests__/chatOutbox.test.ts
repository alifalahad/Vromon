import { QueryClient } from '@tanstack/react-query';

import { discard, flushChat, pendingFor, queueText, retry, useChatOutbox } from '../features/chat/outbox';
import { chatKeys, type Thread } from '../features/chat/queries';
import { ApiError, chatApi } from '../services/api';
import type { ChatMessage } from '../types';

let mockCount = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `client-${++mockCount}` }));
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  chatApi: { send: jest.fn() },
}));

const send = chatApi.send as jest.Mock;
const saved = (clientId: string, body: string): ChatMessage => ({
  id: 100 + Number(clientId.split('-')[1]),
  conversation_id: 1,
  sender_id: 'me',
  kind: 'text',
  body,
  payload: null,
  reply_to_id: null,
  client_id: clientId,
  created_at: '2026-10-27T03:00:00+00:00',
  deleted: false,
});

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData<Thread>(chatKeys.thread(1), { messages: [], hasOlder: false });
  useChatOutbox.setState({ userId: null, items: [] });
  send.mockReset();
});
afterEach(() => client.clear());

const items = () => useChatOutbox.getState().items;

it('sends a message, puts the saved one in the chat and empties the outbox', async () => {
  send.mockImplementation((_id: number, m: { client_id: string; body: string }) => Promise.resolve(saved(m.client_id, m.body)));
  const item = queueText('me', 1, 'Hi Rafi');
  await flushChat('me', client);
  expect(send).toHaveBeenCalledWith(1, { client_id: item.clientId, body: 'Hi Rafi' });
  expect(items()).toEqual([]);
  expect(client.getQueryData<Thread>(chatKeys.thread(1))!.messages.map((m) => m.body)).toEqual(['Hi Rafi']);
});

it('waits without a network and keeps the order; the same client id goes again later', async () => {
  send.mockRejectedValue(new ApiError('Cannot reach the server'));
  const first = queueText('me', 1, 'One');
  queueText('me', 1, 'Two');
  await flushChat('me', client);
  expect(send).toHaveBeenCalledTimes(1); // stops at the first network failure
  expect(items().map((i) => [i.body, i.state])).toEqual([
    ['One', 'waiting'],
    ['Two', 'sending'],
  ]);
  send.mockImplementation((_id: number, m: { client_id: string; body: string }) => Promise.resolve(saved(m.client_id, m.body)));
  await flushChat('me', client);
  expect(send.mock.calls[1][1].client_id).toBe(first.clientId);
  expect(items()).toEqual([]);
});

it('marks a refused message failed with the reason, and goes on with the next', async () => {
  send
    .mockRejectedValueOnce(new ApiError('You can only message your friends', 403))
    .mockImplementation((_id: number, m: { client_id: string; body: string }) => Promise.resolve(saved(m.client_id, m.body)));
  const refused = queueText('me', 1, 'Hello?');
  queueText('me', 1, 'Next');
  await flushChat('me', client);
  expect(items()).toEqual([expect.objectContaining({ clientId: refused.clientId, state: 'failed', error: 'You can only message your friends' })]);

  await retry('me', refused.clientId, client);
  expect(items()).toEqual([]);
});

it('a failed message can be thrown away', () => {
  const item = queueText('me', 1, 'Nope');
  discard(item.clientId);
  expect(items()).toEqual([]);
});

it("never sends another account's messages", async () => {
  queueText('someone-else', 1, 'Theirs');
  await flushChat('me', client);
  expect(send).not.toHaveBeenCalled();
  expect(pendingFor(items(), 'me', useChatOutbox.getState().userId, 1)).toEqual([]);
});
