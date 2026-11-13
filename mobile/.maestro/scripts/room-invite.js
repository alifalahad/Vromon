/* global http, json, output, API_URL, FRIEND_TOKEN, USERNAME -- Maestro's GraalJS runtime and flow env */
// Flow 12: the second test account plans a trip and invites the phone's account (USERNAME)
// to plan it together. It also picks a place that isn't in its plan yet, for the phone to suggest.
const headers = { Authorization: `Bearer ${FRIEND_TOKEN}`, 'Content-Type': 'application/json' };
const ok = (res, what, status) => {
  if (res.status !== (status || 200)) throw new Error(`${what} failed: ${res.status} ${res.body} (an expired FRIEND_TOKEN gives 401)`);
  return json(res.body);
};
const friend = ok(http.get(`${API_URL}/api/v1/friends`, { headers }), 'Listing friends').find((f) => f.username === USERNAME);
if (!friend) throw new Error(`${USERNAME} isn't the second account's friend (flow 04 makes them friends)`);
const trip = ok(
  http.post(`${API_URL}/api/v1/trips`, {
    headers,
    body: JSON.stringify({
      destination: "Cox's Bazar",
      start_date: '2027-02-10',
      end_date: '2027-02-11',
      num_travelers: 2,
      total_budget: 20000,
      preference: { interests: ['Beach', 'Nature'] },
    }),
  }),
  'Creating the trip',
  201,
);
ok(http.post(`${API_URL}/api/v1/trips/${trip.id}/generate?algorithm=heuristic`, { headers, body: '{}' }), 'Planning the trip');
const plan = ok(http.get(`${API_URL}/api/v1/trips/${trip.id}/itinerary`, { headers }), 'Reading the plan');
const planned = plan.days.flatMap((d) => d.items.map((i) => i.title.toLowerCase()));
// Words the search finds one place for, in the catalogue since 2026-11-11 (the old sample places' ids are gone);
// one that isn't in the plan yet. The flow types the word and looks for it in the plan's stop names.
const candidates = ['Dulhazra', 'Ramkot', 'Adinath', 'Sonadia', 'Ajgobi'];
const pick = candidates.find((word) => !planned.some((t) => t.indexOf(word.toLowerCase()) !== -1));
if (!pick) throw new Error('Every candidate place is already in the plan');
ok(http.post(`${API_URL}/api/v1/trips/${trip.id}/members`, { headers, body: JSON.stringify({ user_ids: [friend.id] }) }), 'Inviting');
const direct = ok(http.get(`${API_URL}/api/v1/conversations`, { headers }), 'Listing chats').find(
  (c) => c.kind === 'direct' && c.other && c.other.username === USERNAME,
);
const card = ok(http.get(`${API_URL}/api/v1/conversations/${direct.id}/messages`, { headers }), 'Reading the chat')
  .messages.filter((m) => m.kind === 'invite' && m.payload && m.payload.trip_id === trip.id)
  .pop();
if (!card) throw new Error('No invite card in the chat');
output.roomTripId = String(trip.id);
output.inviteId = String(card.id);
output.roomPlace = pick;
