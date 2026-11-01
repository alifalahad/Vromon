import i18n from '../i18n';
import { buildRows, chatName, dayLabel, listTime, preview, timeLabel, type Row } from '../features/chat/format';
import type { OutboxItem } from '../features/chat/outbox';
import type { ChatMessage, Conversation } from '../types';

const t = i18n.t.bind(i18n);
// Local times, as the phone sees them
const NOW = new Date(2026, 9, 27, 15, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

const message = (id: number, sender: string | null, created: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 1,
  sender_id: sender,
  kind: 'text',
  body: `m${id}`,
  payload: null,
  reply_to_id: null,
  client_id: sender === 'me' ? `c${id}` : null,
  created_at: created,
  deleted: false,
  ...extra,
});

const chat = (last: ChatMessage | null, extra: Partial<Conversation> = {}): Conversation => ({
  id: 1,
  kind: 'direct',
  other: { id: 'rafi', username: 'rafi', display_name: 'Rafi Ahmed', avatar_url: null },
  trip_id: null,
  can_send: true,
  read_only_reason: null,
  last_message: last,
  unread_count: 0,
  last_read_message_id: 0,
  other_read_up_to: null,
  muted_until: null,
  created_at: at(1, 9),
  ...extra,
});

const bubbles = (rows: Row[]) => rows.flatMap((r) => (r.type === 'bubble' ? [r.bubble] : []));

describe('labels', () => {
  it('names days the way people say them', () => {
    expect(dayLabel(at(27, 9), NOW, t, 'en')).toBe('Today');
    expect(dayLabel(at(26, 23), NOW, t, 'en')).toBe('Yesterday');
    expect(dayLabel(at(23, 9), NOW, t, 'en')).toBe('Friday');
    expect(dayLabel(at(2, 9), NOW, t, 'en')).toBe('Oct 2');
    expect(dayLabel(new Date(2025, 11, 31).toISOString(), NOW, t, 'en')).toBe('Dec 31, 2025');
  });

  it('shows a time today and a day before that in the chat list', () => {
    expect(listTime(at(27, 9, 5), NOW, t, 'en')).toBe(timeLabel(at(27, 9, 5), 'en'));
    expect(listTime(at(26, 9), NOW, t, 'en')).toBe('Yesterday');
  });

  it('writes times in Bangla digits in Bangla', () => {
    expect(timeLabel(at(27, 9, 5), 'bn')).toMatch(/[০-৯]/);
    expect(timeLabel(at(27, 9, 5), 'bn')).not.toMatch(/[0-9]/);
  });

  it('names a deleted account', () => {
    expect(chatName({ other: null }, t)).toBe('Deleted account');
    expect(chatName(chat(null), t)).toBe('Rafi Ahmed');
    expect(chatName({ other: { id: 'x', username: 'bob', display_name: null, avatar_url: null } }, t)).toBe('@bob');
  });
});

describe('the chat list preview', () => {
  it('says "You:" before your own message and keeps it to one line', () => {
    expect(preview(chat(message(1, 'me', at(27, 9), { body: 'Sreemangal\nin December?' })), 'me', t)).toEqual({ text: 'You: Sreemangal in December?', quiet: false });
    expect(preview(chat(message(2, 'rafi', at(27, 9))), 'me', t)).toEqual({ text: 'm2', quiet: false });
  });

  it('shows removed messages and Vromon\'s own lines quietly', () => {
    expect(preview(chat(message(3, 'rafi', at(27, 9), { deleted: true, body: null })), 'me', t)).toEqual({ text: 'Message removed', quiet: true });
    expect(preview(chat(message(4, null, at(27, 9), { kind: 'system', payload: { event: 'something_new' } })), 'me', t).text).toBe('Vromon updated this chat');
    expect(preview(chat(null), 'me', t).text).toBe('');
  });
});

describe('the rows of a chat', () => {
  it('come newest first, with a day separator wherever the day changes', () => {
    const rows = buildRows([message(1, 'rafi', at(26, 21)), message(2, 'me', at(27, 9))], [], 'me', null, NOW, t, 'en');
    expect(rows.map((r) => (r.type === 'day' ? r.label : `#${r.bubble.id}`))).toEqual(['#2', 'Today', '#1', 'Yesterday']);
  });

  it('group a quick run from one person: only its last bubble shows the time', () => {
    const rows = buildRows(
      [message(1, 'rafi', at(27, 9, 0)), message(2, 'rafi', at(27, 9, 2)), message(3, 'rafi', at(27, 9, 10)), message(4, 'me', at(27, 9, 11))],
      [],
      'me',
      null,
      NOW,
      t,
      'en',
    );
    const run = Object.fromEntries(bubbles(rows).map((b) => [b.id, b.lastInRun]));
    expect(run).toEqual({ 1: false, 2: true, 3: true, 4: true });
  });

  it('tick your messages read up to where the other person has read', () => {
    const rows = buildRows([message(1, 'me', at(27, 9)), message(2, 'me', at(27, 9, 1))], [], 'me', 1, NOW, t, 'en');
    expect(Object.fromEntries(bubbles(rows).map((b) => [b.id, b.status]))).toEqual({ 1: 'read', 2: 'sent' });
  });

  it('add unsent messages from the outbox, once', () => {
    const waiting: OutboxItem[] = [
      { clientId: 'c1', conversationId: 1, body: 'm1', createdAt: at(27, 9), state: 'sending' }, // the server has it already
      { clientId: 'new', conversationId: 1, body: 'Hi!', createdAt: at(27, 10), state: 'waiting' },
    ];
    const shown = bubbles(buildRows([message(1, 'me', at(27, 9))], waiting, 'me', null, NOW, t, 'en'));
    expect(shown.map((b) => [b.key, b.status])).toEqual([
      ['c:new', 'waiting'],
      ['c:c1', 'sent'],
    ]);
  });

  it("give the same bubble again while nothing about it changed, so a long chat doesn't redraw every bubble", () => {
    const first = [message(1, 'rafi', at(27, 9)), message(2, 'rafi', at(27, 9, 1)), message(3, 'me', at(27, 10))];
    const before = bubbles(buildRows(first, [], 'me', null, NOW, t, 'en'));
    // A page of older messages arrives, and a new one: only the bubble whose run changed is new
    const more = [message(0, 'rafi', at(26, 9)), ...first, message(4, 'me', at(27, 10, 1))];
    const after = bubbles(buildRows(more, [], 'me', null, NOW, t, 'en'));
    const byId = (list: ReturnType<typeof bubbles>, id: number) => list.find((b) => b.id === id);
    expect(byId(after, 1)).toBe(byId(before, 1));
    expect(byId(after, 2)).toBe(byId(before, 2));
    expect(byId(after, 3)).not.toBe(byId(before, 3)); // no longer the last of its run
    expect(byId(after, 3)?.lastInRun).toBe(false);
    // Read up to it now: a new bubble with the tick; a changed message (a reaction) too
    const read = bubbles(buildRows(more, [], 'me', 4, NOW, t, 'en'));
    expect(byId(read, 4)).not.toBe(byId(after, 4));
    expect(byId(read, 4)?.status).toBe('read');
    const reacted = more.map((m) => (m.id === 1 ? { ...m, reactions: { heart: ['me'] } } : m));
    const again = bubbles(buildRows(reacted, [], 'me', 4, NOW, t, 'en'));
    expect(byId(again, 1)).not.toBe(byId(read, 1));
    expect(byId(again, 2)).toBe(byId(read, 2));
  });

  it('give the same row objects again too, day separators included, so the list skips them', () => {
    const first = [message(1, 'rafi', at(26, 9)), message(2, 'rafi', at(27, 9))];
    const before = buildRows(first, [], 'me', null, NOW, t, 'en');
    const after = buildRows([message(0, 'rafi', at(25, 9)), ...first], [], 'me', null, NOW, t, 'en');
    const row = (rows: Row[], key: string) => rows.find((r) => r.key === key);
    for (const r of before) expect(row(after, r.key)).toBe(r);
    // The next day, "Today" becomes "Yesterday": that separator is new
    const nextDay = buildRows(first, [], 'me', null, new Date(2026, 9, 28, 9, 0), t, 'en');
    const today = before.find((r) => r.type === 'day' && r.label === 'Today')!;
    expect(row(nextDay, today.key)).not.toBe(today);
  });

  it('give Vromon\'s own lines their text', () => {
    const [row] = buildRows([message(1, null, at(27, 9), { kind: 'system', payload: { event: 'member_joined' } })], [], 'me', null, NOW, t, 'en');
    expect(row.type === 'bubble' && row.bubble.body).toBe('Someone joined');
  });
});
