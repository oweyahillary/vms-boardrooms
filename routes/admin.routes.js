const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

// ── Public ────────────────────────────────────────────
router.post('/login', ctrl.login);

// Invitation accept flow (public — the invitee has no account yet)
router.get('/invite',        ctrl.getInvite);      // ?token=...
router.post('/accept-invite', ctrl.acceptInvite);

// ── Authenticated ─────────────────────────────────────
router.get('/me', requireAuth, ctrl.me);

// ── Dashboard (superadmin + manager + security) ───────
// These endpoints expose aggregate stats, the full visitor log and a CSV
// export of visitor PII, so they are restricted to admin-console roles.
// security is included so guards can use the Visitor Log to check people
// out; staff / readonly stay out (they use the kiosk or the boardrooms app).
const dashboard = requireRole('superadmin', 'manager', 'security');
router.get('/stats',     requireAuth, dashboard, ctrl.stats);
router.get('/hourly',    requireAuth, dashboard, ctrl.hourly);
router.get('/by-type',   requireAuth, dashboard, ctrl.byType);
router.get('/trend',     requireAuth, dashboard, ctrl.trend);
router.get('/top-hosts', requireAuth, dashboard, ctrl.topHosts);
router.get('/visitors',  requireAuth, dashboard, ctrl.visitorLog);
router.get('/export',    requireAuth, dashboard, ctrl.exportCSV);

// ── User management (superadmin only) ─────────────────
router.get('/users',                requireAuth, requireRole('superadmin'), ctrl.getUsers);
router.post('/users',               requireAuth, requireRole('superadmin'), ctrl.createUser);
router.put('/users/:id',            requireAuth, requireRole('superadmin'), ctrl.updateUser);
router.post('/users/:id/password',  requireAuth, requireRole('superadmin'), ctrl.resetPassword);

// Invitations (superadmin only)
router.post('/users/invite',        requireAuth, requireRole('superadmin'), ctrl.inviteUser);
router.post('/users/:id/resend',    requireAuth, requireRole('superadmin'), ctrl.resendInvite);

module.exports = router;
