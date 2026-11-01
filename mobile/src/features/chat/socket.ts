/**
 * The live connection for chat (docs/architecture.md, "Live updates"): one socket per
 * signed-in app, while the app is in the foreground.
 *
 * - Signs in with its first message (never the URL), then waits for "ready".
 * - Reconnects with backoff (1, 2, 4 … 30 s), at once when nudged (the app came back,
 *   the network returned), and with a refreshed token after 4401.
 * - Treats 60 s without a word from the server (it pings every 25 s) as a dead connection.
 * - Sends "typing" at most every 3 s per chat.
 *
 * Plain class with its dependencies passed in, so it's tested without a server.
 */

import type { LiveEvent } from '../../types';
import type { LiveStatus } from './state';

export const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
/** No word from the server for this long: the connection is dead, even if the phone hasn't noticed */
export const SILENCE_LIMIT = 60_000;
export const TYPING_EVERY = 3000;
const WATCH_EVERY = 15_000;

/** http(s)://host → ws(s)://host/api/v1/ws (the dev server, or a share's https tunnel) */
export const liveUrl = (base: string) => `${base.replace(/\/$/, '').replace(/^http/, 'ws')}/api/v1/ws`;

export interface LiveSocketDeps {
  /** The backend's address now (it can change: serverConfig.ts) */
  url: () => string;
  token: () => Promise<string | null>;
  /** After 4401: a fresh token */
  refreshToken: () => Promise<string | null>;
  onEvent: (event: LiveEvent) => void;
  /** Signed in and live: catch up on what was missed */
  onReady: () => void;
  onStatus: (status: LiveStatus) => void;
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
  random?: () => number;
}

export class LiveSocket {
  status: LiveStatus = 'off';
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  // Each connect gets the next number; one that a newer connect replaced stops (step 10)
  private generation = 0;
  private refreshNext = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private lastTyping = new Map<number, number>();

  constructor(private readonly deps: LiveSocketDeps) {}

  private now = () => (this.deps.now ?? Date.now)();

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    void this.connect();
  }

  /** Signed out, or the app went to the background: close and stay closed. */
  stop() {
    this.stopped = true;
    this.clearTimers();
    this.drop();
    this.setStatus('off');
  }

  /**
   * Back in the foreground, or the network returned: retry now instead of waiting out the
   * backoff. An attempt still under way began on the old network and may hang until it
   * times out, then wait out a long backoff (up to 30 s), so it starts again too (step 10).
   */
  nudge() {
    if (this.stopped || this.status === 'live') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.drop();
    this.attempt = 0;
    void this.connect();
  }

  /** Tell the chat you're typing (at most every 3 s per chat; nothing while not live). */
  typing(conversationId: number) {
    if (this.status !== 'live' || !this.ws) return;
    const last = this.lastTyping.get(conversationId) ?? -Infinity;
    if (this.now() - last < TYPING_EVERY) return;
    this.lastTyping.set(conversationId, this.now());
    this.ws.send(JSON.stringify({ type: 'typing', conversation_id: conversationId }));
  }

  private setStatus(status: LiveStatus) {
    if (status === this.status) return;
    this.status = status;
    this.deps.onStatus(status);
  }

  private async connect() {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.setStatus('connecting');
    let token: string | null = null;
    try {
      token = this.refreshNext ? await this.deps.refreshToken() : await this.deps.token();
    } catch {
      token = null;
    }
    if (this.stopped || generation !== this.generation) return;
    this.refreshNext = false;
    if (!token) {
      this.retryLater();
      return;
    }
    const Impl = this.deps.WebSocketImpl ?? (typeof WebSocket === 'undefined' ? undefined : WebSocket);
    let ws: WebSocket;
    try {
      if (!Impl) throw new Error('No WebSocket here');
      ws = new Impl(liveUrl(this.deps.url()));
    } catch {
      this.retryLater();
      return;
    }
    this.ws = ws;
    this.lastHeard = this.now();
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => this.received(ws, e.data);
    ws.onerror = () => undefined; // onclose follows
    ws.onclose = (e) => this.closed(ws, e.code);
  }

  private received(ws: WebSocket, data: unknown) {
    if (ws !== this.ws) return;
    this.lastHeard = this.now();
    let event: LiveEvent;
    try {
      event = JSON.parse(String(data));
    } catch {
      return;
    }
    if (event.type === 'ready') {
      this.attempt = 0;
      this.setStatus('live');
      this.watch();
      this.deps.onReady();
      return;
    }
    if (event.type === 'ping' || event.type === 'pong') return;
    this.deps.onEvent(event);
  }

  private closed(ws: WebSocket, code: number) {
    if (ws !== this.ws) return;
    this.ws = null;
    this.stopWatching();
    if (this.stopped) return;
    if (code === 4401) this.refreshNext = true; // signed out by the server: a fresh token
    this.retryLater();
  }

  private retryLater() {
    this.setStatus('down');
    const wait = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)] + (this.deps.random ?? Math.random)() * 500;
    this.attempt += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, wait);
  }

  private watch() {
    this.stopWatching();
    this.watchTimer = setInterval(() => {
      if (this.now() - this.lastHeard <= SILENCE_LIMIT) return;
      // Silent too long: drop it and reconnect (a dead network may never fire onclose)
      this.drop();
      this.stopWatching();
      if (!this.stopped) this.retryLater();
    }, WATCH_EVERY);
  }

  private stopWatching() {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
  }

  private drop() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopWatching();
  }
}
