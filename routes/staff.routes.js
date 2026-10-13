const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/staff.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Public — kiosk host picker (visitor selects who they're seeing)
router.get('/directory', ctrl.directory);

// Authenticated — the logged-in employee's own visitors
router.get('/my-visitors', requireAuth, ctrl.myVisitors);

module.exports = router;
