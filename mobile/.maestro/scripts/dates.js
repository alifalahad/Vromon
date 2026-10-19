/* global output -- Maestro's GraalJS runtime */
// Today and tomorrow as the calendar's ids use them (YYYY-MM-DD, this Mac's local date)
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
output.today = iso(now);
output.tomorrow = iso(new Date(now.getTime() + 86400000));
