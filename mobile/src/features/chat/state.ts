/**
 * Small shared chat state: the live connection's status, the chat on screen, and
 * who is typing where. Kept apart so the socket, the cache and the screens can all
 * use it without importing each other.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';

/** off: signed out or in the background · connecting · live · down: retrying (the app polls meanwhile) */
export type LiveStatus = 'off' | 'connecting' | 'live' | 'down';

export const useLiveStatus = create<{ status: LiveStatus }>(() => ({ status: 'off' }));

/** The chat on screen: its new messages are read at once, not counted as unread. */
export const useOpenChat = create<{ id: number | null }>(() => ({ id: null }));

/**
 * A line for the chat's snackbar from a screen that just closed ("Report sent").
 * A dialog shown while a screen closes can leave Android's window not redrawing.
 */
export const useChatNotice = create<{ notice: string | null }>(() => ({ notice: null }));

/**
 * The newest message from someone else in a chat that isn't open (friends-chat step 9):
 * a small banner over the app says who and what, and opens the chat.
 */
export const useChatBanner = create<{ banner: { conversationId: number; messageId: number } | null }>(() => ({ banner: null }));

/** "typing…" shows this long after the last typing event (the app sends one every 3 s while typing) */
export const TYPING_SHOWS_FOR = 6000;

type Typing = { userId: string; until: number };

export const useTyping = create<{ byChat: Record<number, Typing> }>(() => ({ byChat: {} }));

export function markTyping(conversationId: number, userId: string, now = Date.now()) {
  useTyping.setState((s) => ({ byChat: { ...s.byChat, [conversationId]: { userId, until: now + TYPING_SHOWS_FOR } } }));
}

/** Their message arrived: they've stopped typing. */
export function clearTyping(conversationId: number, userId: string) {
  useTyping.setState((s) => {
    if (s.byChat[conversationId]?.userId !== userId) return s;
    const { [conversationId]: _gone, ...rest } = s.byChat;
    return { byChat: rest };
  });
}

/** Who is typing in a chat now (or null); re-renders when it runs out. */
export function useTypingIn(conversationId: number | null): string | null {
  const typing = useTyping((s) => (conversationId == null ? undefined : s.byChat[conversationId]));
  // The entry that has run out; a newer typing event is a new entry
  const [expired, setExpired] = useState<Typing | null>(null);
  useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => setExpired(typing), Math.max(0, typing.until - Date.now()));
    return () => clearTimeout(timer);
  }, [typing]);
  return typing && expired !== typing ? typing.userId : null;
}

/** The time now, updated every minute: day labels move on at midnight, mutes run out. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
