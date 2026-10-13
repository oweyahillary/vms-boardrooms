const db     = require('../db');
const logger = require('../utils/logger');

// ── PUBLIC: employee directory for the kiosk host picker ──────────────
// Returns ONLY the minimal fields the kiosk needs to let a visitor pick
// who they're here to see. No emails/phones exposed. Active accounts only.
// (Any logged-in employee is a valid host — not just 'staff' role.)
exports.directory = async (req, res) => {
  try {
    const { q } = req.query;
    const params = [];
    let where = `status = 'active' AND is_active = true`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (name ILIKE $1 OR department ILIKE $1)`;
    }
    const result = await db.query(
      `SELECT id, name, department FROM admin_users
       WHERE ${where} ORDER BY name ASC LIMIT 200`,
      params
    );
    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (e) {
    logger.error({ event: 'staff_directory_failed', error: e.message });
    res.status(500).json({ error: 'Could not load employee list.' });
  }
};

// ── AUTH: the logged-in employee's own visitors ──────────────────────
// "Steve logs in and sees his visitors." Defaults to today; ?range=week|month.
exports.myVisitors = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const since = range === 'today'
      ? 'CURRENT_DATE'
      : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;

    const result = await db.query(
      `SELECT vi.id AS visit_id, v.full_name AS name, v.company, v.phone,
              vi.visit_type, vi.purpose, vi.check_in, vi.check_out, vi.photo_url
         FROM visits vi
         JOIN visitors v ON v.id = vi.visitor_id
        WHERE vi.host_user_id = $1
          AND vi.check_in >= ${since}
        ORDER BY vi.check_in DESC`,
      [req.admin.id]
    );
    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (e) {
    logger.error({ event: 'my_visitors_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch your visitors.' });
  }
};
