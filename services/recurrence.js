// ── Recurrence engine ────────────────────────────────────────────────
// Occurrences are materialised as normal `bookings` rows (recurrence_id set,
// state 'confirmed' or 'skipped'). No cron: bounded-horizon series are
// generated up front; open-ended ('never') series are topped up lazily
// when the owner lists their bookings.

const HORIZON_WEEKS = 26;          // how far ahead 'never' series materialise
const EXTEND_THRESHOLD_WEEKS = 8;  // top up when runway drops below this
const HARD_CAP_DAYS = 366 * 2;     // safety bound on the day walk

// Kenya-time ISO from a date string + 'HH:MM'.
const toISO = (date, hm) => `${date}T${hm}:00+03:00`;

// Add days to a 'YYYY-MM-DD' string (UTC date math, tz-independent).
const addDays = (dateStr, n) =>
  new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86400000)
    .toISOString().slice(0, 10);

// Weekday (0=Sun..6=Sat) of a calendar date string, tz-independent.
const dow = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

// Compute the list of occurrence dates for a rule within a window.
// days: array of 0–6. Returns ['YYYY-MM-DD', ...].
function computeDates({ firstDate, days, endType, endCount, endDate }, windowEndDate) {
  const set = new Set(days);
  const out = [];
  let cur = firstDate;
  for (let i = 0; i < HARD_CAP_DAYS; i++) {
    if (endType === 'date' && cur > endDate) break;
    if (endType === 'never' && cur > windowEndDate) break;
    if (set.has(dow(cur))) {
      if (endType === 'count' && out.length >= endCount) break;
      out.push(cur);
      if (endType === 'count' && out.length >= endCount) break;
    }
    cur = addDays(cur, 1);
  }
  return out;
}

// Insert occurrences for the given dates, conflict-checking each against
// the room's confirmed bookings (respecting grace). q is a pool or client.
async function insertOccurrences(q, { seriesId, roomId, bookedBy, purpose, attendeeCount, startHm, endHm, graceMinutes, meetingType = 'internal' }, dates) {
  const skipped = [];
  let created = 0;
  for (const ds of dates) {
    const startISO = toISO(ds, startHm);
    const endISO = toISO(ds, endHm);
    const clash = await q.query(
      `SELECT 1 FROM bookings
        WHERE room_id = $1 AND state = 'confirmed'
          AND tstzrange($2::timestamptz, $3::timestamptz + make_interval(mins => $4))
              && tstzrange(start_time, end_time + make_interval(mins => $4))
        LIMIT 1`,
      [roomId, startISO, endISO, graceMinutes]
    );
    const state = clash.rows.length ? 'skipped' : 'confirmed';
    await q.query(
      `INSERT INTO bookings (room_id, booked_by, purpose, start_time, end_time,
                             attendee_count, state, recurrence_id, meeting_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [roomId, bookedBy, purpose, startISO, endISO, attendeeCount, state, seriesId, meetingType]
    );
    if (state === 'skipped') skipped.push(ds); else created++;
  }
  return { created, skipped };
}

const horizonDate = () =>
  new Date(Date.now() + HORIZON_WEEKS * 7 * 86400000).toISOString().slice(0, 10);

module.exports = {
  HORIZON_WEEKS, EXTEND_THRESHOLD_WEEKS,
  toISO, addDays, dow, computeDates, insertOccurrences, horizonDate,
};
