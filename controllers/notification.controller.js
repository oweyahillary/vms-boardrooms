const db     = require('../db');
const logger = require('../utils/logger');

// GET /boardrooms/notifications
// Merges stored event notifications with live, time-based alerts derived
// from the user's own upcoming bookings.
exports.list = async (req, res) => {
  try {
    const uid = req.admin.id;

    const stored = await db.query(
      `SELECT id, type, title, body, link, read, created_at
         FROM notifications WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 50`, [uid]);

    // Derived: meetings starting within 15 min, or ending within 10 min.
    const soon = await db.query(
      `SELECT b.id, b.start_time, b.end_time, r.name AS room_name
         FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE b.booked_by = $1 AND b.state = 'confirmed'
          AND b.end_time > NOW() AND b.start_time < NOW() + INTERVAL '15 min'
        ORDER BY b.start_time ASC`, [uid]);

    const now = Date.now();
    const derived = [];
    for (const b of soon.rows) {
      const s = new Date(b.start_time).getTime();
      const e = new Date(b.end_time).getTime();
      if (s > now) {
        derived.push({ id: `d-start-${b.id}`, type: 'starting_soon', read: true,
          title: `Meeting starting soon`, body: `${b.room_name} in ${Math.round((s - now) / 60000)} min`,
          link: 'bookings', created_at: new Date().toISOString() });
      } else if (e - now <= 10 * 60000) {
        derived.push({ id: `d-end-${b.id}`, type: 'ending_soon', read: true,
          title: `Meeting ending soon`, body: `${b.room_name} ends in ${Math.round((e - now) / 60000)} min`,
          link: 'bookings', created_at: new Date().toISOString() });
      }
    }

    const items = [...derived, ...stored.rows];
    const unread = stored.rows.filter((n) => !n.read).length;
    res.set('Cache-Control', 'no-store');
    res.json({ items, unread });
  } catch (e) {
    logger.error({ event: 'notifications_list_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch notifications.' });
  }
};

// POST /boardrooms/notifications/read  → mark all stored as read
exports.markAllRead = async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`, [req.admin.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not update notifications.' });
  }
};
