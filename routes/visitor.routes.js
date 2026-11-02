const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/visitor.controller');
const { requireKiosk } = require('../middleware/auth.middleware');

// Check-in stays fully public; the visitor list and checkout need the
// kiosk passcode (or a logged-in user).
router.post('/',                ctrl.checkIn);
router.get('/today',            requireKiosk, ctrl.getToday);
router.patch('/:id/checkout',   requireKiosk, ctrl.checkOut);

module.exports = router;
