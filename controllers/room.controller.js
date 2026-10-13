const db     = require('../db');
const logger = require('../utils/logger');

// ── LIST ROOMS (any logged-in user) ──────────────────────────────────
// Returns rooms plus a derived live status for "now":
//   open | booked | ending | grace   (computed, never stored)
exports.list = async (req, res) => {
  try {
    const includeInactive = req.query.all === '1' && req.admin.role === 'superadmin';
    const rooms = await db.query(
      `SELECT id, name, capacity, min_attendees, purpose_tag, grace_minutes, is_active
         FROM rooms
        ${includeInactive ? '' : 'WHERE is_active = true'}
        ORDER BY name ASC`
    );

    // Pull today's confirmed bookings for these rooms in one query.
    const bookings = await db.query(
      `SELECT room_id, purpose, start_time, end_time, booked_by, ended_at
         FROM bookings
        WHERE state = 'confirmed'
          AND start_time >= CURRENT_DATE
          AND start_time <  CURRENT_DATE + INTERVAL '1 day'
        ORDER BY start_time ASC`
    );

    const now = Date.now();
    const byRoom = {};
    bookings.rows.forEach(b => { (byRoom[b.room_id] ||= []).push(b); });

    const withStatus = rooms.rows.map(r => {
      const list = byRoom[r.id] || [];
      const graceMs = r.grace_minutes * 60000;
      let status = 'open', current = null, nextFree = null;

      for (const b of list) {
        const s = new Date(b.start_time).getTime();
        const e = new Date(b.ended_at || b.end_time).getTime();
        if (now >= s && now < e) {
          const minsLeft = Math.round((e - now) / 60000);
          status  = minsLeft <= 10 ? 'ending' : 'booked';
          current = { purpose: b.purpose, end_time: b.end_time, minsLeft };
          break;
        }
        if (now >= e && now < e + graceMs) {
          status   = 'grace';
          nextFree = new Date(e + graceMs).toISOString();
          break;
        }
      }
      return { ...r, status, current, nextFree };
    });

    res.set('Cache-Control', 'no-store');
    res.json(withStatus);
  } catch (e) {
    logger.error({ event: 'rooms_list_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch rooms.' });
  }
};

// ── CREATE (superadmin) ──────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const { name, capacity, min_attendees = 1, purpose_tag, grace_minutes = 30 } = req.body;
    if (!name || !capacity)
      return res.status(400).json({ error: 'Room name and capacity are required.' });

    const result = await db.query(
      `INSERT INTO rooms (name, capacity, min_attendees, purpose_tag, grace_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, capacity, min_attendees, purpose_tag, grace_minutes]
    );
    logger.info({ event: 'room_created', name, by: req.admin.email });
    res.json({ success: true, room: result.rows[0] });
  } catch (e) {
    logger.error({ event: 'room_create_failed', error: e.message });
    res.status(500).json({ error: 'Could not create room.' });
  }
};

// ── UPDATE (superadmin) ──────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, capacity, min_attendees, purpose_tag, grace_minutes, is_active } = req.body;
    await db.query(
      `UPDATE rooms SET name=$1, capacity=$2, min_attendees=$3,
              purpose_tag=$4, grace_minutes=$5, is_active=$6 WHERE id=$7`,
      [name, capacity, min_attendees, purpose_tag, grace_minutes, is_active, id]
    );
    logger.info({ event: 'room_updated', id, by: req.admin.email });
    res.json({ success: true });
  } catch (e) {
    logger.error({ event: 'room_update_failed', error: e.message });
    res.status(500).json({ error: 'Could not update room.' });
  }
};

// ── DELETE (superadmin) — soft delete if it has bookings ─────────────
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const used = await db.query(`SELECT 1 FROM bookings WHERE room_id=$1 LIMIT 1`, [id]);
    if (used.rows.length) {
      await db.query(`UPDATE rooms SET is_active=false WHERE id=$1`, [id]);
      logger.info({ event: 'room_deactivated', id, by: req.admin.email });
      return res.json({ success: true, softDeleted: true });
    }
    await db.query(`DELETE FROM rooms WHERE id=$1`, [id]);
    logger.info({ event: 'room_deleted', id, by: req.admin.email });
    res.json({ success: true, softDeleted: false });
  } catch (e) {
    logger.error({ event: 'room_delete_failed', error: e.message });
    res.status(500).json({ error: 'Could not delete room.' });
  }
};

// ── ROOM SCHEDULE (any logged-in user) ───────────────────────────────
// Returns a room + its confirmed bookings for one day, plus the derived
// live status (open/booked/ending/grace) for "now". Powers the room
// detail screen: the timeline strip, the "later today" list, and the
// grace countdown.
exports.schedule = async (req, res) => {
  try {
    const { id } = req.params;
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '');
    const dayStart = dateOk ? `'${req.query.date}'::date` : 'CURRENT_DATE';

    const rr = await db.query(`SELECT * FROM rooms WHERE id=$1`, [id]);
    if (!rr.rows.length) return res.status(404).json({ error: 'Room not found.' });
    const room = rr.rows[0];

    const b = await db.query(
      `SELECT b.id, b.purpose, b.start_time, b.end_time, b.ended_at,
              b.attendee_count, b.booked_by, u.name AS booked_by_name
         FROM bookings b JOIN admin_users u ON u.id = b.booked_by
        WHERE b.room_id = $1 AND b.state = 'confirmed'
          AND b.start_time >= ${dayStart}
          AND b.start_time <  ${dayStart} + INTERVAL '1 day'
        ORDER BY b.start_time ASC`,
      [id]
    );

    // Derive status for "now" (meaningful when viewing today).
    const now = Date.now();
    const graceMs = room.grace_minutes * 60000;
    let status = 'open', current = null, nextFree = null;
    for (const bk of b.rows) {
      const s = new Date(bk.start_time).getTime();
      const e = new Date(bk.ended_at || bk.end_time).getTime();
      if (now >= s && now < e) {
        const minsLeft = Math.round((e - now) / 60000);
        status = minsLeft <= 10 ? 'ending' : 'booked';
        current = { id: bk.id, purpose: bk.purpose, end_time: bk.end_time, minsLeft };
        break;
      }
      if (now >= e && now < e + graceMs) {
        status = 'grace';
        nextFree = new Date(e + graceMs).toISOString();
        break;
      }
    }

    res.set('Cache-Control', 'no-store');
    res.json({ room, bookings: b.rows, status, current, nextFree });
  } catch (e) {
    logger.error({ event: 'room_schedule_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch room schedule.' });
  }
};
