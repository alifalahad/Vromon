/* global http, json, output, API_URL, FRIEND_TOKEN -- Maestro's GraalJS runtime and flow env */
// Accept the newest incoming friend request as the second test account.
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}` };
const list = http.get(`${API_URL}/api/v1/friend-requests?direction=in`, { headers });
const requests = json(list.body);
if (!requests.length) throw new Error('No incoming request to accept');
const res = http.post(`${API_URL}/api/v1/friend-requests/${requests[0].id}/accept`, {
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: '{}', // Maestro's http.post requires a body
});
if (res.status !== 200) throw new Error(`Accept failed: ${res.status}`);
output.accepted = requests[0].id;
