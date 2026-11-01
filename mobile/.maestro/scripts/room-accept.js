/* global http, json, output, API_URL, FRIEND_TOKEN, ROOM_TRIP_ID -- Maestro's GraalJS runtime and flow env */
// Flow 12: the trip's owner (the second test account) adds the place the phone suggested to Day 1.
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}`, 'Content-Type': 'application/json' };
const room = json(http.get(`${API_URL}/api/v1/trips/${ROOM_TRIP_ID}/members`, { headers }).body);
const messages = json(http.get(`${API_URL}/api/v1/conversations/${room.conversation_id}/messages`, { headers }).body).messages;
const card = messages.filter((m) => m.kind === 'place' && m.payload && m.payload.suggestion && m.payload.suggestion.status === 'open').pop();
if (!card) throw new Error('No open suggestion in the room');
const res = http.post(`${API_URL}/api/v1/trips/${ROOM_TRIP_ID}/suggestions/${card.id}/accept`, { headers, body: JSON.stringify({ day: 1 }) });
if (res.status !== 200) throw new Error(`Adding it to Day 1 failed: ${res.status} ${res.body}`);
output.suggestionId = String(card.id);
