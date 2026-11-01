import { BACKOFF, LiveSocket, liveUrl, SILENCE_LIMIT, TYPING_EVERY } from '../features/chat/socket';
import type { LiveStatus } from '../features/chat/state';
import type { LiveEvent } from '../types';

class FakeSocket {
  static all: FakeSocket[] = [];
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  // The server's side
  open() {
    this.onopen?.();
  }
  say(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  drop(code: number) {
    this.onclose?.({ code });
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

function make() {
  const events: LiveEvent[] = [];
  const statuses: LiveStatus[] = [];
  const deps = {
    url: () => 'https://nursery-bench.trycloudflare.com',
    token: jest.fn(() => Promise.resolve('token-1')),
    refreshToken: jest.fn(() => Promise.resolve('token-2')),
    onEvent: (e: LiveEvent) => events.push(e),
    onReady: jest.fn(),
    onStatus: (s: LiveStatus) => statuses.push(s),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    now: () => Date.now(),
    random: () => 0,
  };
  return { socket: new LiveSocket(deps), deps, events, statuses };
}

/** Let the token promise resolve */
const settle = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  FakeSocket.all = [];
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

it('turns the server address into the socket address, for the dev server and a share tunnel', () => {
  expect(liveUrl('http://127.0.0.1:8001')).toBe('ws://127.0.0.1:8001/api/v1/ws');
  expect(liveUrl('https://x.trycloudflare.com/')).toBe('wss://x.trycloudflare.com/api/v1/ws');
});

it('signs in with its first message, goes live on "ready" and passes events on', async () => {
  const { socket, deps, events, statuses } = make();
  socket.start();
  await settle();
  expect(last().url).toBe('wss://nursery-bench.trycloudflare.com/api/v1/ws');
  last().open();
  expect(last().sent).toEqual([{ type: 'auth', token: 'token-1' }]);
  last().say({ type: 'ready', user_id: 'me' });
  expect(statuses).toEqual(['connecting', 'live']);
  expect(deps.onReady).toHaveBeenCalledTimes(1);
  last().say({ type: 'ping' });
  last().say({ type: 'typing', conversation_id: 1, user_id: 'rafi' });
  expect(events).toEqual([{ type: 'typing', conversation_id: 1, user_id: 'rafi' }]); // pings aren't events
  socket.stop();
});

it('reconnects with backoff after a drop, and with a fresh token after 4401', async () => {
  const { socket, deps, statuses } = make();
  socket.start();
  await settle();
  last().drop(1006);
  expect(statuses[statuses.length - 1]).toBe('down');
  await jest.advanceTimersByTimeAsync(BACKOFF[0] - 1);
  expect(FakeSocket.all).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(FakeSocket.all).toHaveLength(2); // after 1 s
  last().drop(1006);
  await jest.advanceTimersByTimeAsync(BACKOFF[1]);
  expect(FakeSocket.all).toHaveLength(3); // then after 2 s

  last().drop(4401);
  await jest.advanceTimersByTimeAsync(BACKOFF[2]);
  expect(deps.refreshToken).toHaveBeenCalledTimes(1);
  last().open();
  expect(last().sent).toEqual([{ type: 'auth', token: 'token-2' }]);
  socket.stop();
});

it('reconnects at once when nudged, and not at all once stopped', async () => {
  const { socket } = make();
  socket.start();
  await settle();
  last().drop(1006);
  socket.nudge(); // the app came back to the foreground
  await settle();
  expect(FakeSocket.all).toHaveLength(2);
  socket.stop();
  expect(last().closed).toBe(true);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(FakeSocket.all).toHaveLength(2);
});

it('a nudge while an attempt hangs on the old network starts a fresh one at once (step 10)', async () => {
  const { socket, deps } = make();
  socket.start();
  await settle();
  last().drop(1006); // the network went away
  await jest.advanceTimersByTimeAsync(BACKOFF[0]); // a retry starts and hangs: it never opens
  expect(FakeSocket.all).toHaveLength(2);
  socket.nudge(); // the network is back
  await settle();
  expect(FakeSocket.all).toHaveLength(3);
  expect(FakeSocket.all[1].closed).toBe(true);
  last().open();
  last().say({ type: 'ready', user_id: 'me' });
  expect(socket.status).toBe('live');
  expect(deps.onReady).toHaveBeenCalledTimes(1);
  socket.stop();
});

it('an attempt that a newer one replaced while it waited for its token opens nothing', async () => {
  const { socket, deps } = make();
  let release: (token: string) => void = () => undefined;
  deps.token.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)));
  socket.start(); // waits for its token
  socket.nudge(); // a newer attempt starts meanwhile
  await settle();
  expect(FakeSocket.all).toHaveLength(1);
  release('token-1'); // the first one gets its token late
  await settle();
  expect(FakeSocket.all).toHaveLength(1); // and stops: no second socket
  socket.stop();
});

it('gives up on a silent connection and reconnects', async () => {
  const { socket } = make();
  socket.start();
  await settle();
  last().open();
  last().say({ type: 'ready', user_id: 'me' });
  await jest.advanceTimersByTimeAsync(SILENCE_LIMIT + 15_000);
  expect(FakeSocket.all[0].closed).toBe(true);
  await jest.advanceTimersByTimeAsync(BACKOFF[0]);
  expect(FakeSocket.all).toHaveLength(2);
  socket.stop();
});

it('sends typing at most every 3 seconds per chat, and only while live', async () => {
  const { socket } = make();
  socket.typing(1); // not connected: nothing
  socket.start();
  await settle();
  last().open();
  last().say({ type: 'ready', user_id: 'me' });
  socket.typing(1);
  socket.typing(1);
  socket.typing(2);
  await jest.advanceTimersByTimeAsync(TYPING_EVERY);
  socket.typing(1);
  expect(last().sent.slice(1)).toEqual([
    { type: 'typing', conversation_id: 1 },
    { type: 'typing', conversation_id: 2 },
    { type: 'typing', conversation_id: 1 },
  ]);
  socket.stop();
});

it('waits and tries again while there is no token (signing in)', async () => {
  const { socket, deps } = make();
  deps.token.mockResolvedValueOnce(null as unknown as string);
  socket.start();
  await settle();
  expect(FakeSocket.all).toHaveLength(0);
  await jest.advanceTimersByTimeAsync(BACKOFF[0]);
  expect(FakeSocket.all).toHaveLength(1);
  socket.stop();
});
