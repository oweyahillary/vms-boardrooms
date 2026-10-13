const db     = require('../db');
const logger = require('../utils/logger');

const BUSINESS_HOURS_PER_DAY = 11; // 08:00–19:00

// Count weekdays (Mon–Fri) in the last N days including today.
function weekdaysInLastNDays(n) {
  let count = 0;
  const day = new Date();
  for (let i = 0; i < n; i++) {
    const d = day.getDay();
    if (d >= 1 && d <= 5) count++;
    day.setDate(day.getDate() - 1);
  }
  return count || 1;
}

// GET /boardrooms/reports/utilisation?range=week|month
exports.utilisation = async (req, res) => {
  try {
    const days = req.query.range === 'month' ? 30 : 7;

    const result = await db.query(
      `SELECT r.id, r.name, r.capacity,
              COUNT(b.id) AS bookings,
              COALESCE(SUM(CASE WHEN b.id IS NULL THEN 0 ELSE EXTRACT(EPOCH FROM (
                LEAST(b.end_time, NOW()) - GREATEST(b.start_time, NOW() - INTERVAL '${days} days')
              )) END), 0) AS seconds
         FROM rooms r
         LEFT JOIN bookings b
           ON b.room_id = r.id AND b.state = 'confirmed'
          AND b.start_time < NOW()
          AND b.end_time   > NOW() - INTERVAL '${days} days'
        WHERE r.is_active = true
        GROUP BY r.id, r.name, r.capacity
        ORDER BY seconds DESC`
    );

    const capacityHours = weekdaysInLastNDays(days) * BUSINESS_HOURS_PER_DAY;
    const rooms = result.rows.map((r) => {
      const hours = Math.max(0, Number(r.seconds) / 3600);
      return {
        id: r.id, name: r.name, capacity: r.capacity,
        bookings: Number(r.bookings),
        hours: Math.round(hours * 10) / 10,
        utilisation: Math.min(100, Math.round((hours / capacityHours) * 100)),
      };
    });

    const totals = {
      bookings: rooms.reduce((a, r) => a + r.bookings, 0),
      hours: Math.round(rooms.reduce((a, r) => a + r.hours, 0) * 10) / 10,
      rooms: rooms.length,
      capacityHours,
      days,
    };

    res.set('Cache-Control', 'no-store');
    res.json({ rooms, totals });
  } catch (e) {
    logger.error({ event: 'utilisation_failed', error: e.message });
    res.status(500).json({ error: 'Could not build the report.' });
  }
};
