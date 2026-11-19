/* global http, json, output, API_URL, TOKEN -- Maestro's GraalJS runtime and flow env */
// Flow 17: a trip of the signed-in test account that's under way (yesterday to tomorrow), with a plan, so
// Budget shows what you spent. Kuakata, so its card is this trip's and no one else's.
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => iso(new Date(Date.now() + n * 86400000));
const created = http.post(`${API_URL}/api/v1/trips`, {
  headers,
  body: JSON.stringify({
    destination: 'Kuakata',
    start_date: day(-1),
    end_date: day(1),
    num_travelers: 2,
    total_budget: 20000,
    preference: { interests: ['Beach', 'Nature'] },
  }),
});
if (created.status !== 201) throw new Error(`Create trip failed: ${created.status} (an expired TOKEN gives 401)`);
const trip = json(created.body);
const planned = http.post(`${API_URL}/api/v1/trips/${trip.id}/generate?algorithm=heuristic`, { headers, body: '{}' });
if (planned.status !== 200) throw new Error(`Generate failed: ${planned.status}`);
output.spentTripId = String(trip.id);
