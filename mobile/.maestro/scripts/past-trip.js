/* global http, json, output, API_URL, TOKEN -- Maestro's GraalJS runtime and flow env */
// Flow 16: a trip of the signed-in test account that ended yesterday, with a plan, so the app shows it as
// finished. Bandarban, so the Trips tab's "Rate your trip to Bandarban?" is this trip's (and no one else's).
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => iso(new Date(Date.now() + n * 86400000));
const created = http.post(`${API_URL}/api/v1/trips`, {
  headers,
  body: JSON.stringify({
    destination: 'Bandarban',
    start_date: day(-3),
    end_date: day(-1),
    num_travelers: 2,
    total_budget: 20000,
    preference: { interests: ['Nature', 'Adventure'] },
  }),
});
if (created.status !== 201) throw new Error(`Create trip failed: ${created.status} (an expired TOKEN gives 401)`);
const trip = json(created.body);
const planned = http.post(`${API_URL}/api/v1/trips/${trip.id}/generate?algorithm=heuristic`, { headers, body: '{}' });
if (planned.status !== 200) throw new Error(`Generate failed: ${planned.status}`);
output.pastTripId = String(trip.id);
