/* global http, json, output, API_URL, FRIEND_TOKEN, SENT -- Maestro's GraalJS runtime and flow env */
// The second test account answers the message the phone just sent (a second phone in real life).
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}`, 'Content-Type': 'application/json' };
const chats = json(http.get(`${API_URL}/api/v1/conversations`, { headers }).body);
const chat = chats.find((c) => c.last_message && c.last_message.body === SENT);
if (!chat) throw new Error(`No chat whose last message is "${SENT}"`);
http.post(`${API_URL}/api/v1/conversations/${chat.id}/read`, { headers, body: JSON.stringify({ message_id: chat.last_message.id }) });
output.reply = `Got it: ${SENT.slice(-8)}`;
// The server wants the app's id for a message as a UUID (version 4)
const clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  return (c === 'x' ? r : (r % 4) + 8).toString(16);
});
const res = http.post(`${API_URL}/api/v1/conversations/${chat.id}/messages`, {
  headers,
  body: JSON.stringify({ client_id: clientId, body: output.reply }),
});
if (res.status !== 201) throw new Error(`Reply failed: ${res.status} ${res.body}`);
