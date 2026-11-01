/* global http, API_URL, FRIEND_TOKEN, ROOM_TRIP_ID -- Maestro's GraalJS runtime and flow env */
// Flow 12: the second test account deletes the trip; its room goes with it, so the next run starts clean.
const res = http.request(`${API_URL}/api/v1/trips/${ROOM_TRIP_ID}`, { method: 'DELETE', headers: { Authorization: `Bearer ${FRIEND_TOKEN}` } });
if (res.status !== 204) throw new Error(`Deleting the trip failed: ${res.status} ${res.body}`);
