/* global http, json, API_URL, FRIEND_TOKEN -- Maestro's GraalJS runtime and flow env */
// Make the friend flow repeatable: the second test account drops all friends and
// declines pending requests, so the first account can add it again from scratch.
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}` };
for (const f of json(http.get(`${API_URL}/api/v1/friends`, { headers }).body)) {
  http.request(`${API_URL}/api/v1/friends/${f.id}`, { method: 'DELETE', headers });
}
for (const r of json(http.get(`${API_URL}/api/v1/friend-requests?direction=in`, { headers }).body)) {
  http.post(`${API_URL}/api/v1/friend-requests/${r.id}/decline`, { headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
}
