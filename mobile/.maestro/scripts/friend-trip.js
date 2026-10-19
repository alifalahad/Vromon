/* global http, json, output, API_URL, FRIEND_TOKEN -- Maestro's GraalJS runtime and flow env */
// Make sure the second test account has a trip with a plan, for the read-only check.
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}`, 'Content-Type': 'application/json' };
const list = http.get(`${API_URL}/api/v1/trips`, { headers });
if (list.status !== 200) throw new Error(`Listing the friend's trips failed: ${list.status} (an expired FRIEND_TOKEN gives 401)`);
const trips = json(list.body);
let trip = trips.find((t) => t.status === 'generated');
if (!trip) {
  const created = http.post(`${API_URL}/api/v1/trips`, {
    headers,
    body: JSON.stringify({
      destination: "Cox's Bazar",
      start_date: '2027-01-10',
      end_date: '2027-01-11',
      num_travelers: 2,
      total_budget: 20000,
      preference: { interests: ['Beach', 'Food'] },
    }),
  });
  if (created.status !== 201) throw new Error(`Create trip failed: ${created.status}`);
  trip = json(created.body);
  const planned = http.post(`${API_URL}/api/v1/trips/${trip.id}/generate?algorithm=heuristic`, { headers, body: '{}' });
  if (planned.status !== 200) throw new Error(`Generate failed: ${planned.status}`);
}
output.friendTripId = String(trip.id);
