const express = require('express');
const router  = express.Router();
const rooms    = require('../controllers/room.controller');
const bookings = require('../controllers/booking.controller');
const series   = require('../controllers/series.controller');
const notifs   = require('../controllers/notification.controller');
const reports  = require('../controllers/report.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

// Everything here requires a logged-in (invited) user.
router.use(requireAuth);

// ── Notifications ──────────────────────────────────────
router.get('/notifications', notifs.list);
router.post('/notifications/read', notifs.markAllRead);

// ── Reports (management) ───────────────────────────────
router.get('/reports/utilisation', requireRole('superadmin', 'manager'), reports.utilisation);

// ── Rooms ──────────────────────────────────────────────
router.get('/rooms', rooms.list);
router.get('/rooms/:id/schedule', rooms.schedule);
router.post('/rooms',       requireRole('superadmin'), rooms.create);
router.put('/rooms/:id',    requireRole('superadmin'), rooms.update);
router.delete('/rooms/:id', requireRole('superadmin'), rooms.remove);

// ── Recurring series ───────────────────────────────────
router.get('/series',            series.listMine);
router.post('/series',           series.create);
router.patch('/series/:id/cancel', series.cancel);

// ── Bookings ───────────────────────────────────────────
router.get('/bookings',           bookings.list);
router.get('/bookings/:id',       bookings.getOne);
router.post('/bookings',          bookings.create);
router.patch('/bookings/:id/cancel',     bookings.cancel);
router.patch('/bookings/:id/end-early',  bookings.endEarly);
router.patch('/bookings/:id/reschedule', bookings.reschedule);

module.exports = router;
