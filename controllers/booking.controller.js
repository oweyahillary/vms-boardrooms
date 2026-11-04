const db     = require('../db');
const logger = require('../utils/logger');

// ── CREATE BOOKING ───────────────────────────────────────────────────
// Any logged-in user except 'readonly' may book. Enforces:
//   • room exists & active
//   • end > start, not in the past
//   • attendee_count <= capacity
//   • NO overlap with another confirmed booking, respecting the room's
//     grace buffer on BOTH meetings (a room needs grace_minutes to reset).
// Attendees (optional) link the booking to checked-in visits, colleagues,
// or free-typed guests — this is how "add the visitor as an attendee" works.
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    if (req.admin.role === 'readonly')
      return res.status(403).json({ error: 'Read-only accounts cannot book boardrooms.' });

    const {
      roomId, purpose, startTime, endTime,
      attendeeCount, visitIds = [], userIds = [], externalNames = [],
      meetingType = 'internal'
    } = req.body;

    if (!roomId || !startTime || !endTime)
      return res.status(400).json({ error: 'Boardroom, start time and end time are required.' });
    if (!['internal', 'visitor'].includes(meetingType))
      return res.status(400).json({ error: 'Meeting type must be internal or visitor.' });

    const start = new Date(startTime), end = new Date(endTime);
    if (isNaN(start) || isNaN(end))
      return res.status(400).json({ error: 'Invalid start or end time.' });
    if (end <= start)
      return res.status(400).json({ error: 'End time must be after start time.' });
    if (end < new Date())
      return res.status(400).json({ error: 'Cannot book a time in the past.' });

    const roomRes = await client.query(
      `SELECT * FROM rooms WHERE id=$1 AND is_active=true`, [roomId]);
    const room = roomRes.rows[0];
    if (!room) return res.status(404).json({ error: 'Boardroom not found or inactive.' });

    // Derive attendee count if not explicitly given.
    const count =
      (attendeeCount ?? (visitIds.length + userIds.length + externalNames.length)) || 1;
    if (count > room.capacity)
      return res.status(400).json({ error: `Exceeds boardroom capacity of ${room.capacity}.` });

    // ── Conflict check with grace buffer on both intervals ──
    const conflict = await client.query(
      `SELECT id, purpose, start_time, end_time FROM bookings
        WHERE room_id = $1 AND state = 'confirmed'
          AND tstzrange($2::timestamptz,
                        $3::timestamptz + make_interval(mins => $4))
              && tstzrange(start_time,
                           end_time + make_interval(mins => $4))
        LIMIT 1`,
      [roomId, start.toISOString(), end.toISOString(), room.grace_minutes]
    );
    if (conflict.rows.length) {
      const c = conflict.rows[0];
      return res.status(409).json({
        error: 'That time clashes with another booking (including its grace buffer).',
        conflictsWith: { purpose: c.purpose, start_time: c.start_time, end_time: c.end_time }
      });
    }

    await client.query('BEGIN');
    const booking = await client.query(
      `INSERT INTO bookings (room_id, booked_by, purpose, start_time, end_time, attendee_count, meeting_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [roomId, req.admin.id, purpose, start.toISOString(), end.toISOString(), count, meetingType]
    );
    const bookingId = booking.rows[0].id;

    for (const vId of visitIds)
      await client.query(
        `INSERT INTO booking_attendees (booking_id, visit_id) VALUES ($1,$2)`, [bookingId, vId]);
    for (const uId of userIds)
      await client.query(
        `INSERT INTO booking_attendees (booking_id, user_id) VALUES ($1,$2)`, [bookingId, uId]);
    for (const nm of externalNames.filter(Boolean))
      await client.query(
        `INSERT INTO booking_attendees (booking_id, external_name) VALUES ($1,$2)`, [bookingId, nm]);

    await client.query('COMMIT');
    logger.info({ event: 'booking_created', bookingId, room: room.name, by: req.admin.email });
    res.json({
      success: true,
      booking: booking.rows[0],
      belowMinimum: count < room.min_attendees   // flag, not a block (per spec)
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ event: 'booking_create_failed', error: e.message });
    res.status(500).json({ error: 'Could not create booking.' });
  } finally {
    client.release();
  }
};

// ── LIST BOOKINGS ────────────────────────────────────────────────────
// ?mine=1 → only mine.  ?roomId=..  ?range=today|week|month (default week)
exports.list = async (req, res) => {
  try {
    const { mine, roomId, range = 'week' } = req.query;

    // Keep open-ended recurring series rolling (best-effort, no cron).
    if (mine === '1') await require('./series.controller').topUpForUser(req.admin.id);

    const since = range === 'today' ? 'CURRENT_DATE'
                : `NOW() - INTERVAL '${range === 'month' ? '30 days' : '7 days'}'`;
    const where = [`b.start_time >= ${since}`, `b.state <> 'skipped'`];
    const params = [];
    if (mine === '1')  { params.push(req.admin.id); where.push(`b.booked_by = $${params.length}`); }
    if (roomId)        { params.push(roomId);       where.push(`b.room_id   = $${params.length}`); }

    const result = await db.query(
      `SELECT b.*, r.name AS room_name, u.name AS booked_by_name,
              (SELECT COUNT(*) FROM booking_attendees a WHERE a.booking_id = b.id) AS attendee_rows
         FROM bookings b
         JOIN rooms r        ON r.id = b.room_id
         JOIN admin_users u  ON u.id = b.booked_by
        WHERE ${where.join(' AND ')}
        ORDER BY b.start_time ASC`,
      params
    );
    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (e) {
    logger.error({ event: 'bookings_list_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch bookings.' });
  }
};

// ── ONE BOOKING WITH ATTENDEES ───────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const b = await db.query(
      `SELECT b.*, r.name AS room_name, u.name AS booked_by_name
         FROM bookings b JOIN rooms r ON r.id=b.room_id
         JOIN admin_users u ON u.id=b.booked_by WHERE b.id=$1`, [id]);
    if (!b.rows.length) return res.status(404).json({ error: 'Booking not found.' });

    const att = await db.query(
      `SELECT a.id, a.visit_id, a.user_id, a.external_name,
              vv.full_name AS visitor_name, uu.name AS user_name
         FROM booking_attendees a
         LEFT JOIN visits vi ON vi.id = a.visit_id
         LEFT JOIN visitors vv ON vv.id = vi.visitor_id
         LEFT JOIN admin_users uu ON uu.id = a.user_id
        WHERE a.booking_id = $1`, [id]);

    res.json({ ...b.rows[0], attendees: att.rows });
  } catch (e) {
    logger.error({ event: 'booking_get_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch booking.' });
  }
};

// ── CANCEL ───────────────────────────────────────────────────────────
// Owner or superadmin only.
exports.cancel = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(`SELECT booked_by, state FROM bookings WHERE id=$1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Booking not found.' });
    const b = existing.rows[0];
    if (b.booked_by !== req.admin.id && req.admin.role !== 'superadmin')
      return res.status(403).json({ error: 'You can only cancel your own bookings.' });
    if (b.state === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });

    await db.query(
      `UPDATE bookings SET state='cancelled', cancelled_at=NOW() WHERE id=$1`, [id]);
    logger.info({ event: 'booking_cancelled', id, by: req.admin.email });
    res.json({ success: true });
  } catch (e) {
    logger.error({ event: 'booking_cancel_failed', error: e.message });
    res.status(500).json({ error: 'Could not cancel booking.' });
  }
};

// ── END EARLY ────────────────────────────────────────────────────────
// Frees the room now (grace then counts from ended_at). Owner or superadmin.
exports.endEarly = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(`SELECT booked_by, state FROM bookings WHERE id=$1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Booking not found.' });
    const b = existing.rows[0];
    if (b.booked_by !== req.admin.id && req.admin.role !== 'superadmin')
      return res.status(403).json({ error: 'You can only end your own bookings.' });
    if (b.state !== 'confirmed') return res.status(400).json({ error: 'Booking is not active.' });

    const r = await db.query(
      `UPDATE bookings SET ended_at=NOW() WHERE id=$1 RETURNING ended_at`, [id]);
    logger.info({ event: 'booking_ended_early', id, by: req.admin.email });
    res.json({ success: true, ended_at: r.rows[0].ended_at });
  } catch (e) {
    logger.error({ event: 'booking_end_failed', error: e.message });
    res.status(500).json({ error: 'Could not end booking.' });
  }
};

// ── RESCHEDULE ───────────────────────────────────────────────────────
// Change a booking's time. Owner or superadmin. Re-runs the conflict +
// grace check, excluding the booking itself.
exports.reschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime } = req.body;
    if (!startTime || !endTime)
      return res.status(400).json({ error: 'Start and end time are required.' });

    const start = new Date(startTime), end = new Date(endTime);
    if (isNaN(start) || isNaN(end)) return res.status(400).json({ error: 'Invalid time.' });
    if (end <= start) return res.status(400).json({ error: 'End time must be after start time.' });
    if (end < new Date()) return res.status(400).json({ error: 'Cannot move a booking to the past.' });

    const existing = await db.query(
      `SELECT b.booked_by, b.state, b.room_id, r.grace_minutes
         FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Booking not found.' });
    const bk = existing.rows[0];
    if (bk.booked_by !== req.admin.id && req.admin.role !== 'superadmin')
      return res.status(403).json({ error: 'You can only reschedule your own bookings.' });
    if (bk.state !== 'confirmed') return res.status(400).json({ error: 'Booking is not active.' });

    const conflict = await db.query(
      `SELECT id FROM bookings
        WHERE room_id = $1 AND state = 'confirmed' AND id <> $5
          AND tstzrange($2::timestamptz, $3::timestamptz + make_interval(mins => $4))
              && tstzrange(start_time, end_time + make_interval(mins => $4))
        LIMIT 1`,
      [bk.room_id, start.toISOString(), end.toISOString(), bk.grace_minutes, id]
    );
    if (conflict.rows.length)
      return res.status(409).json({ error: 'That time clashes with another booking (including its grace buffer).' });

    await db.query(
      `UPDATE bookings SET start_time=$1, end_time=$2 WHERE id=$3`,
      [start.toISOString(), end.toISOString(), id]);
    logger.info({ event: 'booking_rescheduled', id, by: req.admin.email });
    res.json({ success: true });
  } catch (e) {
    logger.error({ event: 'booking_reschedule_failed', error: e.message });
    res.status(500).json({ error: 'Could not reschedule booking.' });
  }
};
