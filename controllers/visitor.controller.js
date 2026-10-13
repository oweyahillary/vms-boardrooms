const db = require('../db');
const { uploadBase64 } = require('../services/storage.service');
const logger = require('../utils/logger');

// ── CHECK IN ─────────────────────────────────────────
exports.checkIn = async (req, res) => {
  try {
    const d = req.body;
    logger.info({ event: 'checkin_received', visitor: d.fullName });

    let photo_url = null;
    let signature_url = null;

    if (d.photoData) {
      try {
        photo_url = await uploadBase64(d.photoData, `photos/${Date.now()}.png`);
        logger.info({ event: 'photo_uploaded' });
      } catch (uploadErr) {
        logger.warn({ event: 'photo_upload_failed', reason: uploadErr.message });
      }
    }

    if (d.sigData) {
      try {
        signature_url = await uploadBase64(d.sigData, `signatures/${Date.now()}.png`);
        logger.info({ event: 'signature_uploaded' });
      } catch (uploadErr) {
        logger.warn({ event: 'signature_upload_failed', reason: uploadErr.message });
      }
    }

    const v = await db.query(
      `INSERT INTO visitors (full_name, phone, id_number, email, company, vehicle)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [d.fullName, d.phone, d.idNumber, d.email, d.company, d.vehicle]
    );

    const visitor_id = v.rows[0].id;

    await db.query(
      `INSERT INTO visits (visitor_id, visit_type, purpose, host_name, host_dept, host_phone, host_user_id, photo_url, signature_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [visitor_id, d.visitType, d.purposeDetail, d.hostName, d.hostDept, d.hostPhone, d.hostUserId || null, photo_url, signature_url]
    );

    // Notify the host that their visitor has arrived (in-app now; email later).
    if (d.hostUserId) {
      require('../services/notify').createNotification(d.hostUserId, {
        type: 'visitor_waiting',
        title: `${d.fullName} is here to see you`,
        body: [d.company, d.purposeDetail].filter(Boolean).join(' · ') || 'A visitor has checked in',
        link: 'visitors',
      });
    }

    logger.info({ event: 'checkin_saved', visitor_id });
    res.json({ success: true, visitor_id });

  } catch (e) {
    logger.error({ event: 'checkin_failed', error: e.message });
    res.status(500).json({ error: 'Check-in failed. Please try again.' });
  }
};

// ── CHECK OUT ─────────────────────────────────────────
exports.checkOut = async (req, res) => {
  try {
    const { id } = req.params; // visit id

    // Confirm the visit exists and isn't already checked out
    const existing = await db.query(
      `SELECT id, check_out FROM visits WHERE id = $1`,
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Visit not found.' });
    }

    if (existing.rows[0].check_out) {
      return res.status(400).json({ error: 'Visitor has already checked out.' });
    }

    // Set check_out to now and return the updated timestamp
    const result = await db.query(
      `UPDATE visits SET check_out = NOW()
       WHERE id = $1
       RETURNING id, check_out`,
      [id]
    );

    logger.info({ event: 'checkout_saved', visit_id: id });
    res.json({ success: true, check_out: result.rows[0].check_out });

  } catch (e) {
    logger.error({ event: 'checkout_failed', error: e.message });
    res.status(500).json({ error: 'Check-out failed. Please try again.' });
  }
};

// ── TODAY'S VISITORS (real-time, no cache) ────────────
exports.getToday = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         vi.id          AS visit_id,
         v.full_name    AS name,
         v.company,
         vi.visit_type,
         vi.purpose,
         vi.host_name,
         vi.check_in,
         vi.check_out,
         vi.photo_url
       FROM visits vi
       JOIN visitors v ON v.id = vi.visitor_id
       WHERE vi.check_in >= CURRENT_DATE
         AND vi.check_in <  CURRENT_DATE + INTERVAL '1 day'
       ORDER BY vi.check_in DESC`
    );

    res.set('Cache-Control', 'no-store');
    res.json(result.rows);

  } catch (e) {
    logger.error({ event: 'gettoday_failed', error: e.message });
    res.status(500).json({ error: 'Could not fetch visitors.' });
  }
};
