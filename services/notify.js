const db     = require('../db');
const logger = require('../utils/logger');

// Central place to raise a notification. Best-effort: never throws into
// the caller (a failed notification must not break a check-in or booking).
async function createNotification(userId, { type, title, body = null, link = null, meta = null }) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, type, title, body, link, meta ? JSON.stringify(meta) : null]
    );
    maybeEmail(userId, { type, title, body }).catch(() => {});
  } catch (e) {
    logger.warn({ event: 'notification_create_failed', error: e.message });
  }
}

// ── Email hook (placeholder) ─────────────────────────────────────────
// This is where the "a visitor is waiting" email to the host will go once
// an email provider is wired in. For now it's a no-op that just logs, so
// the notification still lands in-app. To enable: look up the user's email
// and send via your provider (e.g. Resend/SendGrid) here.
async function maybeEmail(userId, payload) {
  if (!process.env.EMAIL_ENABLED) return; // off until a provider is configured
  logger.info({ event: 'email_hook', userId, type: payload.type });
  // const { rows } = await db.query('SELECT email, name FROM admin_users WHERE id=$1', [userId]);
  // await sendViaProvider(rows[0].email, payload.title, payload.body);
}

module.exports = { createNotification, maybeEmail };
