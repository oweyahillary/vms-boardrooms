const db     = require('../db');
const logger = require('../utils/logger');
const rec    = require('../services/recurrence');

// ── CREATE A RECURRING SERIES ────────────────────────────────────────
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    if (req.admin.role === 'readonly')
      return res.status(403).json({ error: 'Read-only accounts cannot book boardrooms.' });

    const {
      roomId, purpose, startHm, endHm, attendeeCount = 1,
      daysOfWeek, endType, endCount, endDate, firstDate,
      meetingType = 'internal',
    } = req.body;

    if (!['internal', 'visitor'].includes(meetingType))
      return res.status(400).json({ error: 'Meeting type must be internal or visitor.' });

    // ── Validation ──
    if (!roomId || !startHm || !endHm || !firstDate)
      return res.status(400).json({ error: 'Boardroom, first date, start and end time are required.' });
    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0)
      return res.status(400).json({ error: 'Pick at least one day to repeat on.' });
    if (endHm <= startHm)
      return res.status(400).json({ error: 'End time must be after the start time.' });
    if (!['count', 'date', 'never'].includes(endType))
      return res.status(400).json({ error: 'Invalid end condition.' });
    if (endType === 'count' && !(endCount > 0))
      return res.status(400).json({ error: 'Enter how many occurrences.' });
    if (endType === 'date' && (!endDate || endDate < firstDate))
      return res.status(400).json({ error: 'End date must be on or after the first date.' });

    const roomRes = await client.query(`SELECT * FROM rooms WHERE id=$1 AND is_active=true`, [roomId]);
    const room = roomRes.rows[0];
    if (!room) return res.status(404).json({ error: 'Boardroom not found or inactive.' });
    if (Number(attendeeCount) > room.capacity)
      return res.status(400).json({ error: `Exceeds boardroom capacity of ${room.capacity}.` });

    const days = [...new Set(daysOfWeek.map(Number))].filter((d) => d >= 0 && d <= 6);

    await client.query('BEGIN');
    const seriesRow = await client.query(
      `INSERT INTO booking_series
         (room_id, booked_by, purpose, attendee_count, start_hm, end_hm,
          days_of_week, first_date, end_type, end_count, end_date, last_generated, meeting_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [roomId, req.admin.id, purpose, attendeeCount, startHm, endHm,
       days, firstDate, endType, endType === 'count' ? endCount : null,
       endType === 'date' ? endDate : null,
       endType === 'never' ? rec.horizonDate() : null, meetingType]
    );
    const series = seriesRow.rows[0];

    const dates = rec.computeDates(
      { firstDate, days, endType, endCount: Number(endCount), endDate },
      rec.horizonDate()
    );
    if (dates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That rule produces no dates. Check the days and end condition.' });
    }

    const { created, skipped } = await rec.insertOccurrences(client, {
      seriesId: series.id, roomId, bookedBy: req.admin.id, purpose,
      attendeeCount, startHm, endHm, graceMinutes: room.grace_minutes, meetingType,
    }, dates);

    // For 'never', last_generated is the horizon we just filled.
    if (endType !== 'never') {
      await client.query(`UPDATE booking_series SET last_generated=$1 WHERE id=$2`,
        [dates[dates.length - 1], series.id]);
    }

    await client.query('COMMIT');
    logger.info({ event: 'series_created', id: series.id, created, skipped: skipped.length, by: req.admin.email });
    if (skipped.length) {
      require('../services/notify').createNotification(req.admin.id, {
        type: 'occurrence_skipped',
        title: `${skipped.length} recurring occurrence${skipped.length === 1 ? '' : 's'} skipped`,
        body: `Clashes on: ${skipped.join(', ')}`,
        link: 'bookings',
      });
    }
    res.json({ success: true, series, created, skipped, belowMinimum: Number(attendeeCount) < room.min_attendees });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ event: 'series_create_failed', error: e.message });
    res.status(500).json({ error: 'Could not create the recurring booking.' });
  } finally {
    client.release();
  }
};

// ── LIST MY SERIES ───────────────────────────────────────────────────
exports.listMine = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, r.name AS room_name,
              (SELECT COUNT(*) FROM bookings b
                WHERE b.recurrence_id = s.id AND b.state='confirmed' AND b.start_time > NOW()) AS upcoming
         FROM booking_series s JOIN rooms r ON r.id = s.room_id
        WHERE s.booked_by = $1 AND s.cancelled_at IS NULL
        ORDER BY s.created_at DESC`,
      [req.admin.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch recurring bookings.' });
  }
};

// ── CANCEL A SERIES (future occurrences) ─────────────────────────────
exports.cancel = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await db.query(`SELECT booked_by FROM booking_series WHERE id=$1`, [id]);
    if (!s.rows.length) return res.status(404).json({ error: 'Series not found.' });
    if (s.rows[0].booked_by !== req.admin.id && req.admin.role !== 'superadmin')
      return res.status(403).json({ error: 'You can only cancel your own recurring bookings.' });

    const upd = await db.query(
      `UPDATE bookings SET state='cancelled', cancelled_at=NOW()
        WHERE recurrence_id=$1 AND state='confirmed' AND start_time > NOW()`, [id]);
    await db.query(`UPDATE booking_series SET cancelled_at=NOW() WHERE id=$1`, [id]);

    logger.info({ event: 'series_cancelled', id, cancelled: upd.rowCount, by: req.admin.email });
    res.json({ success: true, cancelledOccurrences: upd.rowCount });
  } catch (e) {
    logger.error({ event: 'series_cancel_failed', error: e.message });
    res.status(500).json({ error: 'Could not cancel the recurring booking.' });
  }
};

// ── LAZY TOP-UP for 'never' series (called from bookings list) ────────
// Best-effort: extends open-ended series toward the horizon so they keep
// rolling without a cron job. Never throws into the caller.
exports.topUpForUser = async (userId) => {
  try {
    const horizon = rec.horizonDate();
    const threshold = new Date(Date.now() + rec.EXTEND_THRESHOLD_WEEKS * 7 * 86400000)
      .toISOString().slice(0, 10);
    const series = await db.query(
      `SELECT s.*, r.grace_minutes FROM booking_series s JOIN rooms r ON r.id=s.room_id
        WHERE s.booked_by=$1 AND s.end_type='never' AND s.cancelled_at IS NULL
          AND (s.last_generated IS NULL OR s.last_generated < $2)`,
      [userId, threshold]
    );
    for (const s of series.rows) {
      const from = s.last_generated ? rec.addDays(s.last_generated, 1) : s.first_date;
      const dates = rec.computeDates(
        { firstDate: from, days: s.days_of_week, endType: 'never' }, horizon
      );
      if (dates.length) {
        await rec.insertOccurrences(db, {
          seriesId: s.id, roomId: s.room_id, bookedBy: s.booked_by, purpose: s.purpose,
          attendeeCount: s.attendee_count, startHm: s.start_hm, endHm: s.end_hm,
          graceMinutes: s.grace_minutes, meetingType: s.meeting_type,
        }, dates);
      }
      await db.query(`UPDATE booking_series SET last_generated=$1 WHERE id=$2`, [horizon, s.id]);
    }
  } catch (e) {
    logger.warn({ event: 'series_topup_failed', error: e.message });
  }
};
