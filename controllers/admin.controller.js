const db     = require('../db');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ── AUTH ──────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const result = await db.query(
      `SELECT * FROM admin_users
        WHERE email = $1 AND is_active = true AND status = 'active'`, [email]
    );
    const user = result.rows[0];
    if (!user || !user.password) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    // Update last login
    await db.query(`UPDATE admin_users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    logger.info({ event: 'admin_login', email: user.email, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    logger.error({ event: 'login_failed', error: e.message });
    res.status(500).json({ error: 'Login failed.' });
  }
};

exports.me = (req, res) => res.json({ user: req.admin });

// ── DASHBOARD STATS ───────────────────────────────────

exports.stats = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const interval = range === 'week' ? '7 days' : range === 'month' ? '30 days' : '1 day';
    const since    = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${interval}'`;

    const [total, active, avgDuration, peakHour, unsigned, noPhoto] = await Promise.all([
      // Total visits
      db.query(`SELECT COUNT(*) FROM visits WHERE check_in >= ${since}`),
      // Currently inside
      db.query(`SELECT COUNT(*) FROM visits WHERE check_in >= CURRENT_DATE AND check_out IS NULL`),
      // Average duration (checked out only)
      db.query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (check_out - check_in))/60)) AS avg_mins
                FROM visits WHERE check_in >= ${since} AND check_out IS NOT NULL`),
      // Peak hour
      db.query(`SELECT EXTRACT(HOUR FROM check_in) AS hour, COUNT(*) AS cnt
                FROM visits WHERE check_in >= ${since}
                GROUP BY hour ORDER BY cnt DESC LIMIT 1`),
      // Unsigned visitors
      db.query(`SELECT COUNT(*) FROM visits WHERE check_in >= ${since} AND signature_url IS NULL`),
      // No photo
      db.query(`SELECT COUNT(*) FROM visits WHERE check_in >= ${since} AND photo_url IS NULL`),
    ]);

    const peak = peakHour.rows[0];
    res.json({
      total:       parseInt(total.rows[0].count),
      active:      parseInt(active.rows[0].count),
      avgDuration: parseInt(avgDuration.rows[0].avg_mins) || 0,
      peakHour:    peak ? `${String(parseInt(peak.hour)).padStart(2,'0')}:00` : '—',
      peakCount:   peak ? parseInt(peak.cnt) : 0,
      unsigned:    parseInt(unsigned.rows[0].count),
      noPhoto:     parseInt(noPhoto.rows[0].count),
    });
  } catch (e) {
    logger.error({ event: 'stats_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
};

// ── HOURLY CHART ──────────────────────────────────────

exports.hourly = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const since = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;

    const result = await db.query(
      `SELECT EXTRACT(HOUR FROM check_in) AS hour, COUNT(*) AS count
       FROM visits WHERE check_in >= ${since}
       GROUP BY hour ORDER BY hour`
    );

    // Fill all hours 0–23 with 0 by default
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    result.rows.forEach(r => { hours[parseInt(r.hour)].count = parseInt(r.count); });
    res.json(hours);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch hourly data.' });
  }
};

// ── VISIT TYPE BREAKDOWN ──────────────────────────────

exports.byType = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const since = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;

    const result = await db.query(
      `SELECT visit_type, COUNT(*) AS count
       FROM visits WHERE check_in >= ${since}
       GROUP BY visit_type ORDER BY count DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch type breakdown.' });
  }
};

// ── WEEKLY / MONTHLY TREND ────────────────────────────

exports.trend = async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    const days = range === 'month' ? 30 : 7;

    const result = await db.query(
      `SELECT DATE(check_in) AS date, COUNT(*) AS count
       FROM visits
       WHERE check_in >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(check_in) ORDER BY date`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch trend data.' });
  }
};

// ── TOP HOSTS ─────────────────────────────────────────

exports.topHosts = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const since = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;

    const result = await db.query(
      `SELECT host_name, host_dept, COUNT(*) AS visits
       FROM visits WHERE check_in >= ${since} AND host_name IS NOT NULL
       GROUP BY host_name, host_dept ORDER BY visits DESC LIMIT 10`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch top hosts.' });
  }
};

// ── VISITOR LOG (filtered, paginated) ─────────────────

exports.visitorLog = async (req, res) => {
  try {
    const { range = 'today', page = 1, limit = 50 } = req.query;
    const since  = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT vi.id AS visit_id, v.full_name AS name, v.phone, v.company,
                vi.visit_type, vi.purpose, vi.host_name, vi.host_dept,
                vi.check_in, vi.check_out, vi.photo_url, vi.signature_url,
                CASE WHEN vi.check_out IS NOT NULL
                     THEN ROUND(EXTRACT(EPOCH FROM (vi.check_out - vi.check_in))/60)
                     ELSE NULL END AS duration_mins
         FROM visits vi JOIN visitors v ON v.id = vi.visitor_id
         WHERE vi.check_in >= ${since}
         ORDER BY vi.check_in DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), offset]
      ),
      db.query(`SELECT COUNT(*) FROM visits WHERE check_in >= ${since}`),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({ rows: rows.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page) });
  } catch (e) {
    logger.error({ event: 'visitorlog_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch visitor log.' });
  }
};

// ── EXPORT CSV ────────────────────────────────────────

exports.exportCSV = async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    const since = range === 'today' ? 'CURRENT_DATE' : `NOW() - INTERVAL '${range === 'week' ? '7 days' : '30 days'}'`;

    const result = await db.query(
      `SELECT v.full_name, v.phone, v.id_number, v.email, v.company, v.vehicle,
              vi.visit_type, vi.purpose, vi.host_name, vi.host_dept, vi.host_phone,
              vi.check_in, vi.check_out,
              CASE WHEN vi.signature_url IS NOT NULL THEN 'Yes' ELSE 'No' END AS signed,
              CASE WHEN vi.photo_url IS NOT NULL THEN 'Yes' ELSE 'No' END AS photo_taken,
              CASE WHEN vi.check_out IS NOT NULL
                   THEN ROUND(EXTRACT(EPOCH FROM (vi.check_out - vi.check_in))/60)
                   ELSE NULL END AS duration_mins
       FROM visits vi JOIN visitors v ON v.id = vi.visitor_id
       WHERE vi.check_in >= ${since}
       ORDER BY vi.check_in DESC`
    );

    const header = ['Name','Phone','ID Number','Email','Company','Vehicle',
                    'Visit Type','Purpose','Host','Department','Host Phone',
                    'Check In','Check Out','Signed','Photo Taken','Duration (mins)'];
    const lines  = [header.join(',')];
    result.rows.forEach(r => {
      lines.push([
        `"${r.full_name||''}"`, `"${r.phone||''}"`, `"${r.id_number||''}"`,
        `"${r.email||''}"`,     `"${r.company||''}"`, `"${r.vehicle||''}"`,
        `"${r.visit_type||''}"`,`"${r.purpose||''}"`, `"${r.host_name||''}"`,
        `"${r.host_dept||''}"`, `"${r.host_phone||''}"`,
        `"${r.check_in ? new Date(r.check_in).toLocaleString('en-KE') : ''}"`,
        `"${r.check_out ? new Date(r.check_out).toLocaleString('en-KE') : 'Active'}"`,
        `"${r.signed}"`,`"${r.photo_taken}"`,`"${r.duration_mins||''}"`
      ].join(','));
    });

    const filename = `vivo_visitors_${range}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) {
    logger.error({ event: 'export_failed', error: e.message });
    res.status(500).json({ error: 'Export failed.' });
  }
};

// ── USER MANAGEMENT (superadmin only) ─────────────────

exports.getUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, department, status, is_active, created_at, last_login
       FROM admin_users ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch users.' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: 'All fields are required.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO admin_users (name, email, password, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, is_active, created_at`,
      [name, email, hash, role]
    );
    logger.info({ event: 'user_created', email, role, by: req.admin.email });
    res.json({ success: true, user: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists.' });
    res.status(500).json({ error: 'Could not create user.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, is_active } = req.body;
    await db.query(
      `UPDATE admin_users SET name=$1, role=$2, is_active=$3 WHERE id=$4`,
      [name, role, is_active, id]
    );
    logger.info({ event: 'user_updated', id, by: req.admin.email });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not update user.' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required.' });
    const hash = await bcrypt.hash(password, 10);
    await db.query(`UPDATE admin_users SET password=$1 WHERE id=$2`, [hash, id]);
    logger.info({ event: 'password_reset', id, by: req.admin.email });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not reset password.' });
  }
};

// ── INVITATIONS ───────────────────────────────────────
// Superadmin invites an employee. Creates a pending account with a token
// but NO password. The invitee accepts and sets their own password.
// Email delivery is a future add — for now we return the invite link so
// it can be copied/sent manually.

exports.inviteUser = async (req, res) => {
  try {
    const { name, email, role = 'staff', department } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await db.query(
      `INSERT INTO admin_users (name, email, role, department, status,
                                invite_token, invite_expires, invited_by, invited_at)
       VALUES ($1,$2,$3,$4,'invited',$5,$6,$7,NOW())
       RETURNING id, name, email, role, department, status`,
      [name, email, role, department, token, expires, req.admin.id]
    );

    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${base}/accept-invite.html?token=${token}`;

    logger.info({ event: 'user_invited', email, role, by: req.admin.email });
    res.json({ success: true, user: result.rows[0], inviteLink });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists.' });
    logger.error({ event: 'invite_failed', error: e.message });
    res.status(500).json({ error: 'Could not send invite.' });
  }
};

// Re-issue a fresh token for a still-pending invite.
exports.resendInvite = async (req, res) => {
  try {
    const { id } = req.params;
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const r = await db.query(
      `UPDATE admin_users SET invite_token=$1, invite_expires=$2, invited_at=NOW()
        WHERE id=$3 AND status='invited'
        RETURNING email`, [token, expires, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'No pending invite for this user.' });

    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, inviteLink: `${base}/accept-invite.html?token=${token}` });
  } catch (e) {
    res.status(500).json({ error: 'Could not resend invite.' });
  }
};

// PUBLIC: look up a pending invite by token (so the accept page can greet them).
exports.getInvite = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    const r = await db.query(
      `SELECT name, email FROM admin_users
        WHERE invite_token=$1 AND status='invited' AND invite_expires > NOW()`, [token]);
    if (!r.rows.length) return res.status(404).json({ error: 'Invite is invalid or has expired.' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Could not load invite.' });
  }
};

// PUBLIC: accept invite → set password, activate account.
exports.acceptInvite = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
    if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const found = await db.query(
      `SELECT id FROM admin_users
        WHERE invite_token=$1 AND status='invited' AND invite_expires > NOW()`, [token]);
    if (!found.rows.length) return res.status(400).json({ error: 'Invite is invalid or has expired.' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `UPDATE admin_users
          SET password=$1, status='active', invite_token=NULL, invite_expires=NULL
        WHERE id=$2`, [hash, found.rows[0].id]);

    logger.info({ event: 'invite_accepted', id: found.rows[0].id });
    res.json({ success: true });
  } catch (e) {
    logger.error({ event: 'accept_invite_failed', error: e.message });
    res.status(500).json({ error: 'Could not accept invite.' });
  }
};
